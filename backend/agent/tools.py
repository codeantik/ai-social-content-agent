"""Web scraping and search helpers used by the agent nodes."""

import os

import httpx
from bs4 import BeautifulSoup
from tavily import TavilyClient


def scrape_org_website(url: str, max_chars: int = 1500) -> str:
    """Scrape plain text from a single page — fast fallback used in gather_context."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; ContentAgent/1.0)"}
        resp = httpx.get(url, headers=headers, follow_redirects=True, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator=" ", strip=True)
        text = " ".join(text.split())
        return text[:max_chars]
    except Exception as exc:
        return f"[Could not scrape website: {exc}]"


def tavily_search(query: str, max_results: int = 3) -> str:
    """Search the web and return a formatted string of results."""
    results = tavily_search_structured(query, max_results)
    if not results:
        return "[No results found]"
    snippets = [f"- {r['title']}: {r['snippet'][:200]}" for r in results]
    return "\n".join(snippets)


def tavily_search_structured(query: str, max_results: int = 5) -> list[dict]:
    """
    Search the web and return structured results for ingestion.
    Returns list of {"title": str, "url": str, "snippet": str}.
    """
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        return []
    try:
        client = TavilyClient(api_key=api_key)
        resp = client.search(query=query, max_results=max_results)
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", "")[:300],
            }
            for r in resp.get("results", [])
        ]
    except Exception as exc:
        print(f"[tavily] {exc}")
        return []
