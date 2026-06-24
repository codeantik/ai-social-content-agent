"""Singleton OpenAI embedding client — shared across all RAG components."""
from langchain_openai import OpenAIEmbeddings

_client: OpenAIEmbeddings | None = None


def get_embeddings() -> OpenAIEmbeddings:
    global _client
    if _client is None:
        _client = OpenAIEmbeddings(model="text-embedding-3-small")
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    return get_embeddings().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    return get_embeddings().embed_query(text)
