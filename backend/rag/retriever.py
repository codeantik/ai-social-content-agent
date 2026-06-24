"""
Retrieve relevant context from the vector store across all four knowledge collections.

Retrieval strategy:
  website           — top 5 chunks (primary org knowledge)
  web_search        — top 3 chunks (fresh external context)
  conversations     — top 3 chunks (prior session context)
  generated_content — top 3 chunks (style/voice examples)

Results are threshold-filtered, deduplicated, then assembled into a
structured context block that gets injected into the generation prompt.
The section labels (=== WEBSITE KNOWLEDGE ===, etc.) mirror the
production pgvector implementation so the prompt stays unchanged on migration.
"""

from langchain_core.documents import Document
from rag.vector_store import get_vector_store

# FAISS relevance scores are cosine-similarity mapped to [0, 1].
# 0.45 is conservative — increase if you observe irrelevant chunks.
_SCORE_THRESHOLD = 0.45

_TOP_WEBSITE = 5
_TOP_WEB_SEARCH = 3
_TOP_CONVERSATIONS = 3
_TOP_GENERATED = 3


def retrieve_all_context(
    query: str,
    org_id: str,
    score_threshold: float = _SCORE_THRESHOLD,
) -> tuple[str, list[str]]:
    """
    Query all four collections and build a structured context block.
    Returns (context_block: str, sources: list[str]).
    Gracefully returns ("", []) if the vector store is empty.
    """
    vs = get_vector_store()

    website = _search(vs, "website", org_id, query, _TOP_WEBSITE, score_threshold)
    web_search = _search(vs, "web_search", org_id, query, _TOP_WEB_SEARCH, score_threshold)
    conversations = _search(vs, "conversations", org_id, query, _TOP_CONVERSATIONS, score_threshold)
    generated = _search(vs, "generated_content", org_id, query, _TOP_GENERATED, score_threshold)

    sections: list[str] = []
    sources: list[str] = []

    if website:
        sections.append("=== WEBSITE KNOWLEDGE ===\n" + _fmt(website))
        sources += _sources(website)

    if conversations:
        sections.append("=== PREVIOUS CONVERSATIONS ===\n" + _fmt(conversations))

    if generated:
        sections.append("=== PREVIOUS CONTENT (style / voice reference) ===\n" + _fmt(generated))

    if web_search:
        sections.append("=== WEB RESEARCH ===\n" + _fmt(web_search))
        sources += _sources(web_search)

    return "\n\n".join(sections), list(dict.fromkeys(sources))


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _search(
    vs,
    collection: str,
    org_id: str,
    query: str,
    k: int,
    threshold: float,
) -> list[tuple[Document, float]]:
    try:
        return vs.similarity_search(collection, org_id, query, k=k, score_threshold=threshold)
    except Exception as exc:
        print(f"[retriever] {collection}/{org_id} failed: {exc}")
        return []


def _fmt(results: list[tuple[Document, float]]) -> str:
    seen: set[str] = set()
    parts: list[str] = []
    for doc, _ in results:
        key = doc.page_content[:80]
        if key not in seen:
            seen.add(key)
            parts.append(doc.page_content.strip())
    return "\n---\n".join(parts)


def _sources(results: list[tuple[Document, float]]) -> list[str]:
    out: list[str] = []
    for doc, _ in results:
        src = doc.metadata.get("source_url") or doc.metadata.get("title") or ""
        if src and src not in out:
            out.append(src)
    return out
