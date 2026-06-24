"""
Ingest documents from all knowledge sources into the vector store.

Knowledge sources:
  website         — scraped org pages (chunked 600/60)
  web_search      — Tavily search result snippets (one doc each)
  conversations   — user/assistant turn pairs (one doc each)
  generated_content — finalized posts (one doc each)

Each source maps to a named FAISS collection so retrieval can be scoped
to specific knowledge types. The same collection names will map to
source_type filter values in the pgvector migration.
"""

import hashlib
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from rag.vector_store import get_vector_store, content_hash

if TYPE_CHECKING:
    from db.store import DBStore

_WEBSITE_CHUNK_SIZE = 600
_WEBSITE_CHUNK_OVERLAP = 60
_DEFAULT_CHUNK_SIZE = 800
_DEFAULT_CHUNK_OVERLAP = 80


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _chunk(
    text: str,
    metadata: dict,
    chunk_size: int = _DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = _DEFAULT_CHUNK_OVERLAP,
) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.create_documents([text], metadatas=[metadata])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Public ingestion functions
# ---------------------------------------------------------------------------

def ingest_website_pages(
    pages: list[dict],
    org_id: str,
    db_store: "DBStore | None" = None,
) -> int:
    """
    Chunk and embed website pages into the 'website' collection.
    pages: list of {"url": str, "title": str, "content": str}
    Returns total new chunks added.
    """
    vs = get_vector_store()
    total = 0

    for page in pages:
        content = page.get("content", "").strip()
        if not content:
            continue

        meta = {
            "org_id": org_id,
            "source_url": page.get("url", ""),
            "title": page.get("title", ""),
            "source_type": "website",
            "indexed_at": _now(),
        }
        chunks = _chunk(
            content, meta,
            chunk_size=_WEBSITE_CHUNK_SIZE,
            chunk_overlap=_WEBSITE_CHUNK_OVERLAP,
        )
        added = vs.add_documents("website", org_id, chunks)
        total += added

        if db_store and added > 0:
            db_store.upsert_knowledge_source(
                org_id=org_id,
                source_type="website",
                source_url=page.get("url"),
                title=page.get("title", ""),
                content=content,
                content_hash=content_hash(content),
            )

    return total


def ingest_web_search_results(
    results: list[dict],
    org_id: str,
    query: str = "",
) -> int:
    """
    Embed web search result snippets into the 'web_search' collection.
    results: list of {"title": str, "url": str, "snippet": str | "content": str}
    """
    vs = get_vector_store()
    docs: list[Document] = []

    for r in results:
        text = f"{r.get('title', '')}\n{r.get('snippet') or r.get('content', '')}".strip()
        if not text:
            continue
        docs.append(Document(
            page_content=text,
            metadata={
                "org_id": org_id,
                "source_url": r.get("url", ""),
                "title": r.get("title", ""),
                "source_type": "web_search",
                "query": query,
                "indexed_at": _now(),
            },
        ))

    return vs.add_documents("web_search", org_id, docs)


def ingest_conversation_turn(
    session_id: str,
    org_id: str,
    user_message: str,
    assistant_response: str,
) -> int:
    """
    Embed a single conversation turn (user + assistant) into 'conversations'.
    These are retrieved to surface relevant prior context in future sessions.
    """
    vs = get_vector_store()
    ts = _now()
    docs = [
        Document(
            page_content=f"User: {user_message}",
            metadata={
                "org_id": org_id,
                "session_id": session_id,
                "role": "user",
                "source_type": "conversation",
                "indexed_at": ts,
            },
        ),
        Document(
            page_content=f"Assistant: {assistant_response[:800]}",
            metadata={
                "org_id": org_id,
                "session_id": session_id,
                "role": "assistant",
                "source_type": "conversation",
                "indexed_at": ts,
            },
        ),
    ]
    return vs.add_documents("conversations", org_id, docs)


def ingest_generated_content(
    content_id: str,
    org_id: str,
    platform: str,
    content: str,
) -> int:
    """
    Embed a finalized post into 'generated_content'.
    Retrieved as style/voice examples for future generations.
    """
    vs = get_vector_store()
    doc = Document(
        page_content=content,
        metadata={
            "org_id": org_id,
            "content_id": content_id,
            "platform": platform,
            "source_type": "generated_content",
            "indexed_at": _now(),
        },
    )
    return vs.add_documents("generated_content", org_id, [doc])


def ingest_plain_text(
    text: str,
    org_id: str,
    source_type: str = "document",
    metadata: dict | None = None,
    db_store: "DBStore | None" = None,
) -> int:
    """
    Chunk and embed arbitrary plain text (DOCX, TXT, Markdown, etc.).
    Used for brand guidelines, reports, or any uploaded document.
    """
    vs = get_vector_store()
    base_meta = {
        "org_id": org_id,
        "source_type": source_type,
        "indexed_at": _now(),
    }
    if metadata:
        base_meta.update(metadata)

    docs = _chunk(text, base_meta)
    added = vs.add_documents("website", org_id, docs)

    if db_store and added > 0:
        db_store.upsert_knowledge_source(
            org_id=org_id,
            source_type=source_type,
            source_url=metadata.get("source_url") if metadata else None,
            title=metadata.get("title", "") if metadata else "",
            content=text,
            content_hash=content_hash(text),
        )
    return added
