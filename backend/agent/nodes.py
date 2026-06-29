"""LangGraph node functions — one per agent step."""

import base64
import io
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from openai import OpenAI
from PIL import Image

from agent.state import AgentState
from agent.tools import scrape_org_website, tavily_search, tavily_search_structured
from db.nonprofit_profile import format_profile_block

if TYPE_CHECKING:
    from db.store import DBStore

_MAX_IMAGE_SIDE = 1080


def _strip_markdown(text: str) -> str:
    """Remove markdown formatting artifacts that make content look AI-generated."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"\*(.+?)\*", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"__(.+?)__", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"_(.+?)_", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*•]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

_llm_fast: ChatOpenAI | None = None
_llm_main: ChatOpenAI | None = None
_image_client: OpenAI | None = None


def _fast() -> ChatOpenAI:
    global _llm_fast
    if _llm_fast is None:
        _llm_fast = ChatOpenAI(model="gpt-5.4-mini", temperature=0.4, max_tokens=300)
    return _llm_fast


def _main() -> ChatOpenAI:
    global _llm_main
    if _llm_main is None:
        _llm_main = ChatOpenAI(model="gpt-5.4", temperature=0.7, max_tokens=600)
    return _llm_main


def _img_client() -> OpenAI:
    global _image_client
    if _image_client is None:
        _image_client = OpenAI()
    return _image_client


# ---------------------------------------------------------------------------
# RAG node 1 — load conversation history from DB
# ---------------------------------------------------------------------------

def load_session_data(state: AgentState, db_store: "DBStore") -> AgentState:
    """Load the last 10 conversation turns from SQLite into state."""
    if not state.session_id:
        return state
    try:
        history = db_store.get_conversation_history(state.session_id, limit=10)
        return state.model_copy(update={"conversation_history": history})
    except Exception as exc:
        print(f"[load_session_data] {exc}")
        return state


# ---------------------------------------------------------------------------
# RAG node 2 — build / refresh the knowledge base for this org
# ---------------------------------------------------------------------------

# Tracks in-progress background scrape threads: org_id -> Thread
_scrape_threads: dict[str, "threading.Thread"] = {}


def _scrape_and_index(
    org_website: str,
    org_id: str,
    db_store: "DBStore",
) -> None:
    """Background thread: scrape all pages and index into the vector store."""
    import threading
    from rag.ingestion import ingest_website_pages
    from scraper.scraper import scrape_website

    try:
        pages = scrape_website(org_website, max_pages=20)
        dicts = [{"url": p.url, "title": p.title, "content": p.content} for p in pages]
        n = ingest_website_pages(dicts, org_id, db_store)
        print(f"[background_scrape] Indexed {n} chunks from {len(dicts)} pages for org {org_id}")
    except Exception as exc:
        print(f"[background_scrape] Failed for org {org_id}: {exc}")
    finally:
        _scrape_threads.pop(org_id, None)


def trigger_background_website_indexing(
    state: AgentState,
    db_store: "DBStore",
) -> None:
    """
    Fire website scraping in a daemon thread if not already indexed or running.
    Returns immediately — does NOT block generation.
    The indexed knowledge will be available on the next generation.
    """
    import threading
    from rag.vector_store import get_vector_store

    if not state.org_website or not state.org_id:
        return
    if state.org_id in _scrape_threads:
        return  # already running

    vs = get_vector_store()
    already = vs.collection_has_docs("website", state.org_id) or db_store.knowledge_exists(state.org_id)
    if already:
        return

    t = threading.Thread(
        target=_scrape_and_index,
        args=(state.org_website, state.org_id, db_store),
        daemon=True,
        name=f"scrape-{state.org_id}",
    )
    _scrape_threads[state.org_id] = t
    t.start()
    print(f"[background_scrape] Started indexing {state.org_website} in background")


def ingest_web_search_for_query(state: AgentState) -> None:
    """
    Run Tavily search and ingest results into the vector store.
    Fast (~1 s) — runs synchronously so results are available for the current retrieval.
    """
    from rag.ingestion import ingest_web_search_results

    if not state.original_query:
        return

    effective_org = state.org_id or "default"
    try:
        results = tavily_search_structured(
            f"{state.original_query} nonprofit", max_results=5
        )
        if results:
            ingest_web_search_results(results, effective_org, state.original_query)
    except Exception as exc:
        print(f"[ingest_web_search] Failed: {exc}")


# ---------------------------------------------------------------------------
# RAG node 3 — semantic retrieval from vector store
# ---------------------------------------------------------------------------

def retrieve_rag_context(state: AgentState) -> AgentState:
    """Query all four collections and build a structured context block."""
    from rag.retriever import retrieve_all_context

    effective_org = state.org_id or "default"
    try:
        context_block, sources = retrieve_all_context(
            query=state.original_query,
            org_id=effective_org,
        )
        return state.model_copy(update={
            "retrieved_context": context_block,
            "retrieval_sources": sources,
        })
    except Exception as exc:
        print(f"[retrieve_rag_context] {exc}")
        return state


# ---------------------------------------------------------------------------
# Node — gather_context (legacy + supplementary)
# ---------------------------------------------------------------------------

def gather_context(state: AgentState) -> AgentState:
    """
    Run live web search and (if knowledge_built is False) a quick org page scrape.
    When RAG has already populated retrieved_context, this supplements rather
    than replaces it — both run in parallel via ThreadPoolExecutor.
    """
    with ThreadPoolExecutor(max_workers=2) as exe:
        # Quick single-page scrape as live fallback (only when no RAG org context)
        org_fut = None
        if state.org_website and not state.knowledge_built and not state.retrieved_context:
            org_fut = exe.submit(scrape_org_website, state.org_website, 4000)

        # Web search always runs for fresh inspiration
        web_fut = exe.submit(
            tavily_search, f"content ideas for: {state.original_query}", 3
        )

    org_ctx = org_fut.result() if org_fut else ""
    web_ctx = web_fut.result() if web_fut else ""

    return state.model_copy(update={"org_context": org_ctx, "web_context": web_ctx})


# ---------------------------------------------------------------------------
# Node — generate_content
# ---------------------------------------------------------------------------

def _build_content_messages(state: AgentState) -> list:
    # Nonprofit profile block (highest-priority grounding — always injected when present)
    profile_block = ""
    profile_text = format_profile_block(state.nonprofit_profile)
    if profile_text:
        profile_block = (
            f"\n\n{profile_text}\n"
            "Ground ALL content strictly in this profile: use the organisation's real name, "
            "slogan, keywords, location, and mission. Never invent details not present above."
        )

    # RAG block (primary context — replaces live scrape when available)
    rag_block = ""
    if state.retrieved_context:
        rag_block = (
            "\n\nKNOWLEDGE BASE — retrieved from the organisation's indexed documents, "
            "prior conversations, and past posts. Use this as the authoritative source "
            "for brand voice, terminology, tone, and factual claims about the organisation. "
            "Match the style of any past posts included below:\n\n"
            f"{state.retrieved_context[:4000]}\n"
        )

    # Legacy org context (fallback when RAG has nothing yet)
    org_block = ""
    if state.org_context and not state.retrieved_context:
        org_block = (
            "\n\nORGANIZATION CONTEXT — scraped from the org's public page. "
            "Ground the new content in this context, matching the established "
            "tone, voice, sentence length, and any emoji/hashtag habits:\n"
            f"{state.org_context[:4000]}\n"
        )

    web_block = (
        f"\nFor extra inspiration only — do not treat as the org's voice:\n{state.web_context}"
        if state.web_context and not state.web_context.startswith("[") else ""
    )

    clarify_block = (
        f"\nUser clarifications:\n{state.clarification_context}"
        if state.clarification_context else ""
    )

    # Conversation history block (last few turns for context continuity)
    history_block = ""
    if state.conversation_history:
        turns = state.conversation_history[-6:]  # cap at last 6 messages
        history_lines = [f"{m['role'].capitalize()}: {m['content'][:200]}" for m in turns]
        history_block = "\n\nRECENT CONVERSATION:\n" + "\n".join(history_lines)

    system = (
        "You are an expert social media copywriter whose clients are EXCLUSIVELY: "
        "nonprofits/NGOs and charities, associations (including educational institutions), "
        "and corporates supporting nonprofit causes as part of their CSR (Corporate Social "
        "Responsibility) commitments. Always read ambiguous words through THIS lens — "
        "e.g. 'community' means a civic/volunteer/beneficiary community, 'members' means "
        "association or program members, 'drive'/'campaign' means a fundraising or awareness "
        "drive, 'partners' means corporate/CSR or institutional partners. NEVER reinterpret "
        "these as gaming, esports, tech-product, or other unrelated commercial communities.\n\n"
        "You specialize in LinkedIn, Facebook, and Instagram posts — and ONLY these "
        "three formats. NEVER write a newsletter, email, blog post, or press release, "
        "even if asked; instead adapt the request into a post for whichever of these "
        "three platforms fits best. Infer the target platform from the request (or pick "
        "the best fit if it's unstated) and match that platform's conventions — tone, "
        "length, line-break/paragraph style, and emoji/hashtag use "
        "(e.g., polished and professional for LinkedIn, conversational for Facebook, "
        "punchy with hashtags for Instagram). "
        "Be factual — do NOT fabricate statistics or quotes. "
        "Write in clear, flowing paragraphs separated by blank lines.\n\n"
        "CRITICAL — NEVER use markdown syntax of any kind: no **bold**, no *italic*, "
        "no # headers, no - or * bullet lists, no numbered lists (1. 2. 3.), no underscores. "
        "Write exactly as a real human social media manager would type a post directly into "
        "Facebook, LinkedIn, or Instagram — plain sentences and paragraphs, emojis where "
        "natural, no formatting symbols whatsoever."
        f"{profile_block}{rag_block}{org_block}{web_block}{clarify_block}{history_block}"
    )
    return [
        SystemMessage(content=system),
        HumanMessage(content=f"Create content for: {state.original_query}"),
    ]


def generate_content(state: AgentState) -> AgentState:
    content = _strip_markdown(_main().invoke(_build_content_messages(state)).content)
    return state.model_copy(update={"generated_content": content})


def stream_content(state: AgentState):
    """Yield LLM text chunks — consumed by st.write_stream() in app.py."""
    for chunk in _main().stream(_build_content_messages(state)):
        yield chunk.content


# ---------------------------------------------------------------------------
# RAG node 4 — persist conversation + generated content
# ---------------------------------------------------------------------------

def save_session_data(state: AgentState, db_store: "DBStore") -> AgentState:
    """
    After generation:
    1. Save conversation turn to SQLite.
    2. Save generated content to SQLite.
    3. Embed both into the vector store for future retrieval.
    """
    from rag.ingestion import ingest_conversation_turn, ingest_generated_content

    content = state.generated_content
    if not content:
        return state

    effective_org = state.org_id or "default"
    content_id = ""

    # Persist conversation turn
    if state.session_id and state.user_id and state.original_query:
        try:
            db_store.save_conversation_turn(
                session_id=state.session_id,
                user_id=state.user_id,
                org_id=state.org_id or None,
                user_message=state.original_query,
                assistant_message=content,
            )
        except Exception as exc:
            print(f"[save_session_data] Conversation DB save failed: {exc}")

    # Persist generated content
    try:
        content_id = db_store.save_generated_content(
            user_id=state.user_id or "anonymous",
            org_id=state.org_id or None,
            session_id=state.session_id or None,
            platform=None,
            content=content,
        )
    except Exception as exc:
        print(f"[save_session_data] Content DB save failed: {exc}")

    # Embed conversation turn into vector store
    if state.session_id and state.original_query:
        try:
            ingest_conversation_turn(
                session_id=state.session_id,
                org_id=effective_org,
                user_message=state.original_query,
                assistant_response=content,
            )
        except Exception as exc:
            print(f"[save_session_data] Conversation embedding failed: {exc}")

    # Embed generated content into vector store
    if content_id:
        try:
            ingest_generated_content(
                content_id=content_id,
                org_id=effective_org,
                platform="unknown",
                content=content,
            )
        except Exception as exc:
            print(f"[save_session_data] Content embedding failed: {exc}")

    return state.model_copy(update={"content_id": content_id})


# ---------------------------------------------------------------------------
# Image nodes (unchanged)
# ---------------------------------------------------------------------------

def generate_image_prompt(state: AgentState) -> AgentState:
    profile_hint = ""
    p = state.nonprofit_profile
    if p:
        parts = []
        if p.get("name"):
            parts.append(f"Organisation: {p['name']}")
        if p.get("city") or p.get("state") or p.get("country"):
            loc = ", ".join(filter(None, [p.get("city"), p.get("state"), p.get("country")]))
            parts.append(f"Location: {loc}")
        if p.get("keywords"):
            parts.append(f"Focus areas: {p['keywords']}")
        if p.get("description"):
            parts.append(f"Mission: {p['description'][:200]}")
        if parts:
            profile_hint = "\n\nOrganisation context (ground the image in their setting and mission):\n" + "\n".join(parts)

    messages = [
        SystemMessage(content=(
            "You write prompts for gpt-image-2 image generation for posts by nonprofits/NGOs, "
            "associations (including educational institutions), and corporates running CSR "
            "(Corporate Social Responsibility) programs. Read ambiguous words through THIS "
            "lens — e.g. a 'community' is a civic/volunteer/beneficiary community, never a "
            "gaming, esports, or tech-product community. "
            "Given a content topic, describe a specific, photorealistic scene that visually represents "
            "it — grounded in real-world civic/social-impact settings (e.g. volunteers at work, "
            "community outreach, classrooms, donation drives, CSR site visits). "
            "Reflect the organisation's actual location and focus area in the scene when relevant. "
            "Structure as: scene → subject → details. "
            "Include: concrete subjects (people, objects, place), setting, lighting, and mood. "
            "Do NOT use design/graphic terms like 'poster', 'graphic', 'infographic', 'banner', or 'social media post'. "
            f"Under 60 words. Return ONLY the prompt.{profile_hint}"
        )),
        HumanMessage(content=(
            f"Topic: {state.original_query}\n\n"
            f"Content excerpt:\n{state.generated_content[:500]}"
        )),
    ]
    img_prompt = _fast().invoke(messages).content.strip()
    return state.model_copy(update={"image_prompt": img_prompt})


def generate_image(state: AgentState) -> AgentState:
    prompt = state.image_prompt or ""
    try:
        resp = _img_client().images.generate(
            model="gpt-image-2",
            prompt=prompt[:1500],
            n=1,
            size="1024x1024",
            quality="low",
        )
        raw = resp.data[0].b64_json
        image_bytes = base64.b64decode(raw) if raw else None
        return state.model_copy(update={"image_bytes": image_bytes, "image_url": None, "error": None})
    except Exception as exc:
        print(f"[gpt-image-2 failed: {exc}]")
        return state.model_copy(update={"image_bytes": None, "image_url": None, "error": f"Image generation failed — {exc}"})


def optimize_image(state: AgentState) -> AgentState:
    raw = state.uploaded_image_bytes or state.image_bytes
    if not raw:
        return state
    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        img.thumbnail((_MAX_IMAGE_SIDE, _MAX_IMAGE_SIDE), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return state.model_copy(update={"image_bytes": buf.getvalue(), "error": None})
    except Exception as exc:
        print(f"[optimize_image failed: {exc}]")
        return state.model_copy(update={"image_bytes": raw, "error": f"Image optimization failed — {exc}"})


def finalize(state: AgentState) -> AgentState:
    return state.model_copy(update={"final_content": state.generated_content})
