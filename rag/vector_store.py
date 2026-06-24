"""
Vector store abstraction — FAISS in-memory for Phase 1.

VectorStoreProvider is the stable interface. FAISSVectorStoreProvider is
the Phase-1 implementation. Swap it for PGVectorStoreProvider in Phase 2
without changing any call sites.

Each (collection, org_id) pair gets its own FAISS index so retrieval
always filters to the right org — mirroring the WHERE org_id = $1 query
in the pgvector production schema.
"""

import hashlib
import os
import pickle
import shutil
from abc import ABC, abstractmethod
from pathlib import Path

from langchain_core.documents import Document


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Abstract interface — implement this for pgvector migration
# ---------------------------------------------------------------------------

class VectorStoreProvider(ABC):

    @abstractmethod
    def add_documents(
        self,
        collection: str,
        org_id: str,
        documents: list[Document],
    ) -> int:
        """Add documents. Returns count of new docs added (deduped by content hash)."""
        ...

    @abstractmethod
    def similarity_search(
        self,
        collection: str,
        org_id: str,
        query: str,
        k: int = 5,
        score_threshold: float = 0.0,
    ) -> list[tuple[Document, float]]:
        """Return top-k (Document, score) pairs, filtered to org_id."""
        ...

    @abstractmethod
    def collection_has_docs(self, collection: str, org_id: str) -> bool:
        ...

    @abstractmethod
    def delete_collection(self, collection: str, org_id: str) -> None:
        ...

    @abstractmethod
    def rebuild_index(self, collection: str, org_id: str) -> None:
        ...


# ---------------------------------------------------------------------------
# FAISS implementation
# ---------------------------------------------------------------------------

class FAISSVectorStoreProvider(VectorStoreProvider):
    """
    Phase-1 in-memory vector store backed by FAISS.
    Persists indexes to disk so knowledge survives app restarts.

    Migration path: replace this class with PGVectorStoreProvider,
    keeping VectorStoreProvider interface identical.
    """

    def __init__(self, persist_dir: str | None = None) -> None:
        self._dir = Path(
            persist_dir or os.getenv("VECTOR_STORE_PATH", "./data/faiss")
        )
        self._dir.mkdir(parents=True, exist_ok=True)
        self._indexes: dict[tuple[str, str], object] = {}
        self._hashes: dict[tuple[str, str], set[str]] = {}

    # ---- private helpers ----

    def _key(self, collection: str, org_id: str) -> tuple[str, str]:
        return (collection, org_id)

    def _index_dir(self, collection: str, org_id: str) -> Path:
        safe = org_id.replace("/", "_").replace(":", "_").replace(".", "_")
        return self._dir / f"{collection}__{safe}"

    def _get_index(self, collection: str, org_id: str):
        """Return cached FAISS index, loading from disk if needed."""
        from langchain_community.vectorstores import FAISS
        from rag.embeddings import get_embeddings

        key = self._key(collection, org_id)
        if key in self._indexes:
            return self._indexes[key]

        path = self._index_dir(collection, org_id)
        if path.exists() and any(path.iterdir()):
            try:
                index = FAISS.load_local(
                    str(path),
                    get_embeddings(),
                    allow_dangerous_deserialization=True,
                )
                self._indexes[key] = index
                hash_file = path / "_hashes.pkl"
                if hash_file.exists():
                    with open(hash_file, "rb") as f:
                        self._hashes[key] = pickle.load(f)
                return index
            except Exception as exc:
                print(f"[vector_store] Failed to load {path}: {exc}")
        return None

    def _save(self, collection: str, org_id: str) -> None:
        key = self._key(collection, org_id)
        if key not in self._indexes:
            return
        path = self._index_dir(collection, org_id)
        path.mkdir(parents=True, exist_ok=True)
        try:
            self._indexes[key].save_local(str(path))
            with open(path / "_hashes.pkl", "wb") as f:
                pickle.dump(self._hashes.get(key, set()), f)
        except Exception as exc:
            print(f"[vector_store] Failed to save {path}: {exc}")

    # ---- VectorStoreProvider interface ----

    def add_documents(
        self,
        collection: str,
        org_id: str,
        documents: list[Document],
    ) -> int:
        from langchain_community.vectorstores import FAISS
        from rag.embeddings import get_embeddings

        if not documents:
            return 0

        key = self._key(collection, org_id)
        known_hashes = self._hashes.get(key, set())

        new_docs: list[Document] = []
        for doc in documents:
            h = doc.metadata.get("content_hash") or content_hash(doc.page_content)
            doc.metadata["content_hash"] = h
            doc.metadata["org_id"] = org_id
            if h not in known_hashes:
                new_docs.append(doc)
                known_hashes.add(h)

        if not new_docs:
            return 0

        self._hashes[key] = known_hashes
        existing = self._get_index(collection, org_id)
        if existing is not None:
            existing.add_documents(new_docs)
            self._indexes[key] = existing
        else:
            self._indexes[key] = FAISS.from_documents(new_docs, get_embeddings())

        self._save(collection, org_id)
        return len(new_docs)

    def similarity_search(
        self,
        collection: str,
        org_id: str,
        query: str,
        k: int = 5,
        score_threshold: float = 0.0,
    ) -> list[tuple[Document, float]]:
        index = self._get_index(collection, org_id)
        if index is None:
            return []
        try:
            # Over-fetch then threshold so we always return up to k useful results
            raw = index.similarity_search_with_relevance_scores(query, k=k * 3)
            results = [
                (doc, float(score))
                for doc, score in raw
                if float(score) >= score_threshold
            ]
            results.sort(key=lambda x: x[1], reverse=True)
            return results[:k]
        except Exception as exc:
            print(f"[vector_store] Search error {collection}/{org_id}: {exc}")
            return []

    def collection_has_docs(self, collection: str, org_id: str) -> bool:
        key = self._key(collection, org_id)
        if self._hashes.get(key):
            return True
        path = self._index_dir(collection, org_id)
        return path.exists() and any(path.iterdir())

    def delete_collection(self, collection: str, org_id: str) -> None:
        key = self._key(collection, org_id)
        self._indexes.pop(key, None)
        self._hashes.pop(key, None)
        path = self._index_dir(collection, org_id)
        if path.exists():
            shutil.rmtree(path)

    def rebuild_index(self, collection: str, org_id: str) -> None:
        key = self._key(collection, org_id)
        self._indexes.pop(key, None)
        self._get_index(collection, org_id)


# ---------------------------------------------------------------------------
# Module-level singleton — auto-selects PG when SQL_DB_* env vars are set
# ---------------------------------------------------------------------------

_provider: VectorStoreProvider | None = None


def get_vector_store() -> VectorStoreProvider:
    global _provider
    if _provider is None:
        from db.pg_connection import is_pg_configured
        if is_pg_configured():
            from rag.pg_vector_store import PGVectorStoreProvider
            _provider = PGVectorStoreProvider()
            print("[vector_store] Using PGVectorStoreProvider (nekidb)")
        else:
            _provider = FAISSVectorStoreProvider()
    return _provider
