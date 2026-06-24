"""
PGVectorStoreProvider — reads/writes community_knowledge + community_knowledge_embeddings.

Tables (from Neki backend, already exist in nekidb):
  community_knowledge           — parent source records (one per URL/document)
  community_knowledge_embeddings — text chunks with pgvector embeddings

Column names are camelCase (Sequelize underscored: false).
Cosine distance via the <=> operator; score = 1 - distance.

org_id resolution:
  The content-creation app uses md5(org_url)[:12] as org_id for FAISS namespacing.
  For the PG backend org_id must be the integer communityId.
  Set SQL_COMMUNITY_ID=<int> in env to map any org_id string to that community.
  Or pass a numeric string directly as org_id.
"""

import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from langchain_core.documents import Document

from db.pg_connection import get_psycopg_dsn
from rag.embeddings import embed_query, embed_texts
from rag.vector_store import VectorStoreProvider, content_hash


def _vec_str(embedding: list[float]) -> str:
    """Format a float list as a pgvector literal '[1.1,2.2,...]'."""
    return "[" + ",".join(str(v) for v in embedding) + "]"


class PGVectorStoreProvider(VectorStoreProvider):

    def __init__(self) -> None:
        self._dsn = get_psycopg_dsn()

    @contextmanager
    def _conn(self):
        conn = psycopg2.connect(self._dsn)
        conn.autocommit = False
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _resolve_community_id(self, org_id: str) -> int:
        """Convert org_id (md5 hash or numeric string) to an integer communityId."""
        try:
            return int(org_id)
        except (ValueError, TypeError):
            cid = os.getenv("SQL_COMMUNITY_ID")
            if cid:
                return int(cid)
            raise ValueError(
                f"PG backend requires SQL_COMMUNITY_ID env var when org_id is not numeric "
                f"(got {org_id!r}). Set SQL_COMMUNITY_ID=<your community integer id>."
            )

    # -------------------------------------------------------------------------
    # VectorStoreProvider interface
    # -------------------------------------------------------------------------

    def add_documents(
        self,
        collection: str,
        org_id: str,
        documents: list[Document],
    ) -> int:
        if not documents:
            return 0

        community_id = self._resolve_community_id(org_id)
        texts = [doc.page_content for doc in documents]
        embeddings = embed_texts(texts)

        added = 0
        with self._conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            # Track knowledge_id and next chunk index per (source_url, source_type)
            knowledge_cache: dict[str, tuple[int, int]] = {}  # key -> (knowledge_id, next_chunk_idx)

            for doc, embedding in zip(documents, embeddings):
                meta = doc.metadata
                source_type = meta.get("source_type", collection)
                source_url = meta.get("source_url") or None
                title = meta.get("title") or None
                chunk_hash = meta.get("content_hash") or content_hash(doc.page_content)

                # Skip duplicate chunks
                cur.execute(
                    'SELECT id FROM community_knowledge_embeddings'
                    ' WHERE "communityId" = %s AND "contentHash" = %s LIMIT 1',
                    (community_id, chunk_hash),
                )
                if cur.fetchone():
                    continue

                # Upsert parent community_knowledge record
                parent_key = f"{community_id}:{source_type}:{source_url or chunk_hash}"
                parent_hash = content_hash(parent_key)

                if parent_key in knowledge_cache:
                    knowledge_id, chunk_idx = knowledge_cache[parent_key]
                else:
                    cur.execute(
                        'SELECT id FROM community_knowledge'
                        ' WHERE "communityId" = %s AND "contentHash" = %s AND "deletedAt" IS NULL LIMIT 1',
                        (community_id, parent_hash),
                    )
                    row = cur.fetchone()
                    if row:
                        knowledge_id = row["id"]
                    else:
                        cur.execute(
                            '''INSERT INTO community_knowledge
                               ("communityId", "sourceType", "sourceUrl", "title",
                                "content", "contentHash", metadata, "createdAt", "updatedAt")
                               VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                               RETURNING id''',
                            (
                                community_id, source_type, source_url, title,
                                doc.page_content[:2000], parent_hash,
                                psycopg2.extras.Json({}),
                            ),
                        )
                        knowledge_id = cur.fetchone()["id"]
                    chunk_idx = 0
                    knowledge_cache[parent_key] = (knowledge_id, chunk_idx)

                # Insert chunk + embedding
                vec = _vec_str(embedding)
                cur.execute(
                    '''INSERT INTO community_knowledge_embeddings
                       ("knowledgeId", "communityId", "sourceType", title,
                        "chunkIndex", "chunkText", "contentHash",
                        "embeddingModel", "embeddingVersion", metadata, embedding, "createdAt")
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1, %s, %s::vector, NOW())''',
                    (
                        knowledge_id, community_id, source_type, title,
                        chunk_idx, doc.page_content, chunk_hash,
                        "text-embedding-3-small",
                        psycopg2.extras.Json({
                            k: v for k, v in meta.items()
                            if k not in ("content_hash", "org_id")
                        }),
                        vec,
                    ),
                )
                knowledge_cache[parent_key] = (knowledge_id, chunk_idx + 1)
                added += 1

            cur.close()

        return added

    def similarity_search(
        self,
        collection: str,
        org_id: str,
        query: str,
        k: int = 5,
        score_threshold: float = 0.0,
    ) -> list[tuple[Document, float]]:
        community_id = self._resolve_community_id(org_id)
        vec = _vec_str(embed_query(query))

        with self._conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                '''SELECT
                       e."chunkText",
                       e."sourceType",
                       e.title,
                       e.metadata,
                       k."sourceUrl",
                       1 - (e.embedding <=> %s::vector) AS score
                   FROM community_knowledge_embeddings e
                   JOIN community_knowledge k ON e."knowledgeId" = k.id
                   WHERE e."communityId" = %s
                     AND e."sourceType" = %s
                     AND k."deletedAt" IS NULL
                   ORDER BY e.embedding <=> %s::vector
                   LIMIT %s''',
                (vec, community_id, collection, vec, k * 3),
            )
            rows = cur.fetchall()
            cur.close()

        results: list[tuple[Document, float]] = []
        for row in rows:
            score = float(row["score"])
            if score < score_threshold:
                continue
            doc = Document(
                page_content=row["chunkText"],
                metadata={
                    "source_type": row["sourceType"],
                    "title": row.get("title") or "",
                    "source_url": row.get("sourceUrl") or "",
                    **(row.get("metadata") or {}),
                },
            )
            results.append((doc, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:k]

    def collection_has_docs(self, collection: str, org_id: str) -> bool:
        try:
            community_id = self._resolve_community_id(org_id)
            with self._conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    'SELECT 1 FROM community_knowledge_embeddings'
                    ' WHERE "communityId" = %s AND "sourceType" = %s LIMIT 1',
                    (community_id, collection),
                )
                return cur.fetchone() is not None
        except Exception as exc:
            print(f"[pg_vector_store] collection_has_docs error: {exc}")
            return False

    def delete_collection(self, collection: str, org_id: str) -> None:
        community_id = self._resolve_community_id(org_id)
        with self._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                'DELETE FROM community_knowledge_embeddings'
                ' WHERE "communityId" = %s AND "sourceType" = %s',
                (community_id, collection),
            )
            cur.close()

    def rebuild_index(self, collection: str, org_id: str) -> None:
        pass  # DB indexes are maintained server-side
