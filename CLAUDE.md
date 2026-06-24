# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

- `backend/` — Python: the Streamlit app (`app.py`), the agent pipeline, FastAPI serving layer, DB, RAG, scraper. See `backend/CLAUDE.md` if present, otherwise the Architecture section below (paths are relative to `backend/`).
- `frontend/` — Next.js frontend (App Router + TanStack Query + Tailwind). See `frontend/CLAUDE.md`.

## Commands

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the Streamlit app
streamlit run app.py
# Opens at http://localhost:8501

# Run the FastAPI serving layer (used by frontend/)
uvicorn api.main:app --reload
# Opens at http://localhost:8000

# Environment setup
cp .env.example .env   # then fill in API keys
```

## Required Environment Variables

```env
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...

# Optional
DAILY_GENERATION_LIMIT=3        # default: 3 per IP per day
LANGCHAIN_TRACING_V2=true       # LangSmith observability
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=content-creator-ai-agent

# Optional — Facebook Pages publishing (sidebar feature is hidden if unset)
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_REDIRECT_URI=http://localhost:8501   # must match the app's OAuth redirect URI
```

On Streamlit Cloud, secrets go in the Streamlit secrets UI (not `.env`). `app.py` bridges `st.secrets` into `os.environ` at startup so all libraries use `os.getenv()` without changes.

## Architecture

**Entry point:** `app.py` — chat-first Streamlit UI with two modes (`st.session_state.mode`: `"chat"` | `"result"`). Handles voice input (Whisper via `streamlit-mic-recorder`), org Neki-page URL input, image upload/generation toggle, Facebook OAuth + publishing, rate-limit gating, and streams the compiled LangGraph graph.

**Agent pipeline** (`agent/`):

| File | Role |
|---|---|
| `state.py` | `AgentState` — single Pydantic model that flows through every node |
| `graph.py` | LangGraph `StateGraph` — wires nodes and conditional edges into `compiled_graph` |
| `nodes.py` | One function per agent step; lazy-initialised `ChatOpenAI`/`OpenAI` singletons (`_fast`, `_main`, `_img_client`) |
| `chat.py` | `clarify()` — pre-generation clarification chat; `apply_edit()` — post-generation edit assistant. Both backed by their own lazy `gpt-4o-mini` singleton |
| `facebook.py` | Facebook OAuth flow + Graph API helpers (`get_auth_url`, `exchange_code_for_token`, `get_long_lived_token`, `get_pages`, `post_to_page`) |
| `tools.py` | `tavily_search()` and `scrape_org_website()` — called only from `gather_context` node |
| `usage.py` | IP-based rate limiter; reads/writes `data/usage.json`; limit set by `DAILY_GENERATION_LIMIT` |

**Graph flow** (linear — no eval/retry loop):
```
gather_context → generate_content → _route_image
                                       ├─ uploaded image  → optimize_image ───────┐
                                       ├─ generate_image  → generate_image_prompt │
                                       │                    → generate_image      │
                                       │                    → optimize_image ─────┤
                                       └─ neither           ─────────────────────→ finalize
```
`_route_image` (in `graph.py`) checks `state.uploaded_image_bytes` first — a user upload always wins over generation — then falls back to `state.generate_image`. `generate_content` is self-contained: it builds its own system prompt inline rather than via a separate prompt-building node.

**LLM usage pattern:**
- `gpt-4o-mini` — `_fast` in `nodes.py` (image-prompt generation) and a separate singleton in `chat.py` (pre-generation clarification + post-generation edits)
- `gpt-4o` (`_main`) — content generation only
- `gpt-image-2` (raw OpenAI SDK via `_img_client`) — image generation with `quality="medium"`; response is base64-decoded to bytes stored in `AgentState.image_bytes`

**State immutability:** All nodes use `state.model_copy(update={...})` — never mutate the state object directly.

**Image pipeline:** `AgentState.uploaded_image_bytes` (user upload) always takes precedence over `image_bytes` (AI-generated). Either path funnels through `optimize_image`, which converts to RGB, caps the longest side at `_MAX_IMAGE_SIDE = 1080`px, and re-encodes as PNG — so every posted image is a consistent, social-media-ready size regardless of source.

**Chat-first UI:** In `"chat"` mode, user messages go through `chat.clarify()`, which either asks one clarifying question or returns `ready=True` with a one-line `summary` (stored as `clarification_context` and folded into `generate_content`'s prompt); clicking **Generate Now** runs `_run_generation()`. In `"result"` mode, the generated content can be edited directly in the text area, via quick-action buttons (Shorter / Hashtags / More formal / More casual), or via a chat-input edit box — all three paths call `chat.apply_edit()`.

**Facebook publishing:** `agent/facebook.py` implements the OAuth code exchange (plus long-lived token upgrade) and Graph API page listing/posting. `app.py` handles the OAuth redirect via `st.query_params` (`state=fb_oauth`), stores the connection in session state, and — once connected — shows a page selector and **Publish to Facebook** button in result mode (posts with an image via `/{page_id}/photos`, text-only via `/{page_id}/feed`).

**Rate limiting:** `usage.py` uses `data/usage.json` (file-backed, not a DB). On Streamlit Cloud the file system is ephemeral — rate limits reset on redeploy. IP is resolved from `X-Forwarded-For` / other proxy headers via `st.context.headers`; falls back to `"local"` in dev. **The gate is currently commented out in `app.py`** — generation is unmetered, though `record_generation()` still logs usage and the sidebar still shows the remaining-today progress bar.

**Streamlit mic hotfix:** `app.py` creates an empty `bootstrap.min.css.map` on import to silence a `FileNotFoundError` in `streamlit-mic-recorder`. On Streamlit Cloud where site-packages is read-only, the `PermissionError` is silently swallowed.

## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. These bias toward caution over speed — for trivial tasks, use judgment.

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what's confusing, ask.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked. No single-use abstractions.
- No unrequested 'flexibility'. No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Don't 'improve' adjacent code, comments, or formatting.
- Don't refactor things that aren't broken. Match existing style.
- Remove only imports/vars/functions YOUR change orphaned — mention pre-existing dead code, don't delete it.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- For multi-step tasks, state a brief plan with a verify-step for each item.
