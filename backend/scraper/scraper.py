"""
Multi-page website scraper using httpx + BeautifulSoup.

Starts at the given URL, follows internal links breadth-first, and collects
up to max_pages pages of clean text. Each URL is fetched exactly once —
the same response is used to extract both the page content and its links.
"""

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

_INJECTION_RE = re.compile(
    r"(?i)(ignore\s+previous\s+instructions?|disregard\s+all|system:\s*|<\|im_start\|>)",
)
_SKIP_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg",
    ".css", ".js", ".xml", ".zip", ".woff", ".ttf",
}
_TIMEOUT = 10.0
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ContentAgent/1.0)"}
_MAX_PAGES_DEFAULT = 20


@dataclass
class ScrapedPage:
    url: str
    title: str
    content: str
    links: list[str] = field(default_factory=list)  # internal links found on this page
    source_type: str = "website"


def scrape_website(url: str, max_pages: int = _MAX_PAGES_DEFAULT) -> list[ScrapedPage]:
    """
    Crawl a website starting from url, following internal links breadth-first.
    Each URL is fetched exactly once. Returns up to max_pages of cleaned text.
    """
    base_domain = urlparse(url).netloc
    visited: set[str] = set()
    queue: list[str] = [_normalize(url)]
    pages: list[ScrapedPage] = []

    with httpx.Client(
        headers=_HEADERS,
        follow_redirects=True,
        timeout=_TIMEOUT,
    ) as client:
        while queue and len(pages) < max_pages:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)

            # Single fetch — extracts both content and links from the same response
            page = _fetch_parse_and_discover(client, current, base_domain)
            if page is None:
                continue

            pages.append(page)

            for link in page.links:
                if link not in visited and link not in queue:
                    queue.append(link)

    return pages


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _fetch_parse_and_discover(
    client: httpx.Client, url: str, base_domain: str
) -> ScrapedPage | None:
    """
    Fetch url once, return a ScrapedPage with both the cleaned text content
    and the list of internal links discovered on the page.
    """
    try:
        resp = client.get(url)
        resp.raise_for_status()
        if "text/html" not in resp.headers.get("content-type", ""):
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        title = _extract_title(soup, url)

        # Collect internal links before stripping nav/footer tags
        links = _extract_links(soup, url, base_domain)

        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "noscript"]):
            tag.decompose()

        text = soup.get_text(separator=" ", strip=True)
        text = " ".join(text.split())
        text = _sanitize(text)

        if len(text) < 80:
            return None

        return ScrapedPage(url=url, title=title, content=text, links=links)
    except Exception as exc:
        print(f"[scraper] {url}: {exc}")
        return None


def _extract_links(soup: BeautifulSoup, base_url: str, base_domain: str) -> list[str]:
    links: set[str] = set()
    for a in soup.find_all("a", href=True):
        full = _normalize(urljoin(base_url, a["href"]))
        parsed = urlparse(full)
        if (
            parsed.netloc == base_domain
            and parsed.scheme in ("http", "https")
            and not _is_resource(full)
        ):
            links.add(full)
    return list(links)


def _extract_title(soup: BeautifulSoup, fallback: str) -> str:
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(strip=True)
    return fallback


def _normalize(url: str) -> str:
    return url.split("#")[0].rstrip("/")


def _is_resource(url: str) -> bool:
    return any(urlparse(url).path.lower().endswith(ext) for ext in _SKIP_EXTENSIONS)


def _sanitize(text: str) -> str:
    return _INJECTION_RE.sub("", text)
