# Claude Code Prompt — Migrate Streamlit content-agent → Next.js + FastAPI (LangGraph)

> Paste this into Claude Code at the repo root. The existing `CLAUDE.md` stays authoritative — its Behavioral Guidelines (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution) apply to every step below.

---

## Role & Goal

You are migrating an existing **Streamlit** AI social-content agent to a **decoupled** architecture. The agent *behavior* must be preserved exactly — you are only changing the **serving layer** and the **UI layer**. Do not redesign the pipeline, prompts, or model choices. This is a re-platform, not a rewrite.

## What exists today (source of truth: `CLAUDE.md`, verified against the actual code)

- `app.py` — Streamlit monolith: chat-first UI (`mode` = `chat` | `result`), Whisper voice input, org Neki-page URL input + Community ID input, image upload/generate toggle, Facebook OAuth + publish, LinkedIn OAuth + publish, Knowledge Base panel (index status / re-index / doc upload), rate-limit gate (currently disabled), RAG pipeline.
- `agent/` — `state.py` (single `AgentState` Pydantic model, now including identity + RAG fields), `graph.py` (**currently stale — `compiled_graph` is dead code, not imported by `app.py`**), `nodes.py` (lazy `_fast`/`_main`/`_img_client` singletons, plus RAG nodes), `chat.py` (`clarify()` + `apply_edit()`), `facebook.py`, `linkedin.py`, `tools.py`, `usage.py`.
- `db/` — `store.py` (`DBStore`: SQLite-backed conversation history, generated-content log, knowledge-source dedup — schema is a deliberate 1:1 mirror of the production Postgres tables in `PLAN.md` so swapping to asyncpg is mechanical), `pg_connection.py` (`is_pg_configured()` / `get_psycopg_dsn()`, gated on `SQL_DB_HOST/PORT/NAME/USER/PASSWORD`), `nonprofit_profile.py` (`fetch_nonprofit_profile(community_id)` from the `non_profits` table, `format_profile_block()` for prompt injection).
- `rag/` — `vector_store.py` (`VectorStoreProvider` interface; auto-selects `FAISSVectorStoreProvider` (`data/faiss/`) or `PGVectorStoreProvider` (`pg_vector_store.py`) based on `is_pg_configured()`), `retriever.py` (`retrieve_all_context()` — queries 4 collections: `website`, `web_search`, `conversations`, `generated_content`), `ingestion.py`, `embeddings.py`.
- `scraper/scraper.py` — multi-page breadth-first website crawler (used for full-site knowledge-base indexing, distinct from `agent/tools.py`'s single-page `scrape_org_website` fast-fallback).
- **Actual `app.py:_run_generation()` node sequence** (not what `graph.py` encodes):
  `load_session_data → trigger_background_website_indexing (fire-and-forget daemon thread) → ingest_web_search_for_query → retrieve_rag_context → gather_context → stream_content → save_session_data`, then — only in result mode, lazily — `generate_image_prompt → generate_image → optimize_image` (AI image) or just `optimize_image` (uploaded image).
- **Streamlit coupling is narrow**: only `app.py` and `agent/usage.py` (`st.context.headers` for IP resolution) actually import Streamlit. `agent/nodes.py`, `chat.py`, `facebook.py`, `linkedin.py`, `tools.py`, all of `db/`, `rag/`, `scraper/` are already framework-agnostic.

## Target architecture (monorepo)

```
.
├── agent/            # Python — LangChain + LangGraph, framework-agnostic (NO streamlit imports)
│   ├── state.py      # AgentState unchanged (stays the single Pydantic model that flows through)
│   ├── graph.py      # REBUILT to match the real node sequence (see "Rebuilt graph.py" below) — compiled_graph becomes the real source of truth again
│   ├── nodes.py      # nodes stay pure; lazy LLM singletons + RAG nodes unchanged
│   ├── chat.py       # clarify() / apply_edit() unchanged
│   ├── facebook.py   # OAuth + Graph API helpers unchanged
│   ├── linkedin.py   # OAuth + Posts API helpers unchanged
│   ├── tools.py      # tavily_search / scrape_org_website unchanged
│   └── usage.py      # rate-limit logic kept; transport-agnostic (no st.context)
├── db/               # DBStore (SQLite phase-1, Postgres-shaped) — unchanged, already transport-agnostic
│   ├── store.py
│   ├── pg_connection.py
│   └── nonprofit_profile.py
├── rag/              # VectorStoreProvider (FAISS / pgvector), retriever, ingestion — unchanged
│   ├── vector_store.py
│   ├── pg_vector_store.py
│   ├── retriever.py
│   ├── ingestion.py
│   └── embeddings.py
├── scraper/          # multi-page breadth-first crawler — unchanged
│   └── scraper.py
├── api/              # FastAPI serving layer (thin — assembles payloads, streams, no business logic)
│   ├── main.py
│   ├── settings.py   # pydantic-settings; replaces the st.secrets→os.environ bridge
│   ├── deps.py        # rate-limit dependency, IP resolution, org_id resolution (md5(url) vs community_id), identity helpers
│   └── routes/       # chat, content, transcribe, facebook, linkedin, knowledge, profile, usage
├── web/              # Next.js (App Router) + TanStack Query + Tailwind
│   ├── app/
│   ├── components/
│   └── lib/api.ts    # typed client; owns transient UI state only (see "State ownership")
└── chainlit_app/     # OPTIONAL dev/debug UI over the SAME agent (see Phase 5)
```

**Decision point (flip if you disagree):** Next.js is the product UI; Chainlit is an *optional* lightweight dev harness that imports `agent/` directly for fast local iteration. They are not both "the app." If you want Chainlit as the only UI, skip Phase 3; if you don't want it at all, skip Phase 5.

## State ownership (corrected — the server already owns session/knowledge memory)

`st.session_state` is going away, but the underlying memory it pointed at is **not** going to the client — it already lives server-side. The **server owns session and knowledge memory**, exactly as today: `DBStore` (SQLite now, Postgres-shaped for later) persists conversation turns and generated-content history keyed by `session_id`/`org_id`; the vector store (FAISS or pgvector, auto-selected via `SQL_DB_*` env vars) persists the indexed knowledge base (`website`, `web_search`, `conversations`, `generated_content` collections). FastAPI introduces **no new state** — it's the same `DBStore`/vector-store calls `app.py` makes today, just invoked from route handlers instead of Streamlit callbacks.

The **Next.js client owns only transient UI state**: chat-vs-result mode, the in-progress draft text, which image/source panel is expanded, the upload-vs-generate-image toggle. `session_id` is still a client-generated UUID (mirrors `st.session_state["session_id"]`) sent on every request so the server can look up the right history/knowledge for that browser session.

## Hard invariants — do not break any of these

1. **Graph flow preserved exactly** as `app.py` actually runs it today (see rebuilt `graph.py` below), including `_route_image`: a user **upload always wins** over generation (`uploaded_image_bytes` checked before `generate_image`).
2. **State immutability**: every node uses `state.model_copy(update={...})`. `AgentState` remains the single model that flows through. No direct mutation.
3. **Nodes stay UI-framework-free.** Zero `streamlit` imports anywhere under `agent/`, `db/`, `rag/`, `scraper/` after migration (already true today except `agent/usage.py`).
4. **Lazy LLM singletons** (`_fast`, `_main`, `_img_client`, and `chat.py`'s own singleton) preserved. Same models as currently configured in `nodes.py`/`chat.py` (`gpt-5.4-mini` fast/clarify/edit/image-prompt, `gpt-5.4` main content, `gpt-image-2` quality=`low` 1024×1024, `whisper-1` transcription) — do not change model names, temperatures, or token caps during the port.
5. **Image pipeline unchanged**: both paths funnel through `optimize_image` → RGB, longest side capped at `_MAX_IMAGE_SIDE = 1080`px, re-encoded PNG. Output stays consistent regardless of source.
6. **Rate-limit semantics preserved**: per-IP daily limit (`DAILY_GENERATION_LIMIT`, default 3), file-backed `data/usage.json`, `record_generation()` still logs even when the gate is off. Keep the gate **commented/disabled by default** to match current behavior; make it a one-flag enable.
7. **Background indexing stays in-process and best-effort.** `trigger_background_website_indexing`'s daemon-thread + module-level `_scrape_threads` dict (in `agent/nodes.py`) is preserved as-is for the FastAPI single-process deployment — no new task queue or worker infra. This is a known single-instance limitation, matching the non-goal "no new features."
8. **DBStore / vector-store backend selection preserved.** `db.pg_connection.is_pg_configured()` (checks `SQL_DB_HOST/PORT/NAME/USER/PASSWORD`) continues to gate FAISS vs. Postgres+pgvector, and `nonprofit_profile.fetch_nonprofit_profile()` (`non_profits` table, keyed by `company_id`) stays the lookup behind the Community-ID input.
9. **LinkedIn publish keeps its own shape** — one org-scoped, no-per-page-token model (`post_to_organization(org_urn, access_token, ...)`), and the versioned API env knob (`LINKEDIN_API_VERSION`, currently `202606`) stays an env var, not a hardcoded constant.

### Rebuilt `agent/graph.py`

Replace the stale 6-node graph with one that mirrors `app.py`'s actual sequence. `load_session_data` and `save_session_data` need a bound `db_store` — wrap with a small factory (`build_graph(db_store)`) rather than threading it through `AgentState`, since the DB handle is an infra concern, not agent state:

```
load_session_data → trigger_background_website_indexing (side-effect node, passes state through unchanged)
                   → ingest_web_search_for_query (side-effect node, passes state through unchanged)
                   → retrieve_rag_context → gather_context
                   → generate_content (or stream_content for the SSE path)
                   → save_session_data
                   → _route_image:
                        uploaded_image_bytes → optimize_image → finalize
                        generate_image       → generate_image_prompt → generate_image → optimize_image → finalize
                        neither               → finalize
```
`_route_image`'s upload-wins precedence is unchanged — it's the one piece of the old `graph.py` that already matched reality. `trigger_background_website_indexing` and `ingest_web_search_for_query` are currently side-effecting helper functions (no `state.model_copy`) — wrap each in a thin node function that calls the existing helper and returns `state` unchanged, so the graph is honest about call order without rewriting their internals.

## Phased plan — each phase ends with an explicit verify step

### Phase 0 — Scaffold & isolate the agent
- Create the monorepo layout above. Move `agent/`, `db/`, `rag/`, `scraper/` as-is (pure relocation, no code changes).
- **Verify:** `python -c "import agent.graph, db.store, rag.vector_store, scraper.scraper"` succeeds with **no** `streamlit` in the dependency chain. `grep -r "import streamlit" agent/ db/ rag/ scraper/` returns nothing.

### Phase 1 — Make the agent transport-agnostic
- Remove any Streamlit coupling that leaked into `agent/` (e.g. IP resolution in `usage.py` reading `st.context.headers`). `usage.py` should accept an `ip: str` argument; the caller resolves it.
- Extract `_effective_org_id`, `_make_state`, and `_ingest_pdf_bytes` out of `app.py` — these are API-layer concerns with no other home; they move into `api/deps.py` (org_id/identity resolution) and a small upload-parsing helper respectively, not into `agent/`.
- **Verify:** unit-call `clarify()`, `apply_edit()`, and a full `compiled_graph` run (now using the rebuilt graph from the Hard Invariants section) from a plain Python script (no Streamlit, no FastAPI), passing a `DBStore` instance and a fake `uploaded_image_bytes`. Confirm the image-precedence branch and that RAG nodes run in the right order.

### Phase 2 — FastAPI serving layer
- `settings.py`: pydantic-settings replacing the `st.secrets → os.environ` bridge. Same env vars (`OPENAI_API_KEY`, `TAVILY_API_KEY`, `DAILY_GENERATION_LIMIT`, `LANGCHAIN_*`, `FACEBOOK_*`, `LINKEDIN_*`, `SQL_DB_*`). `FACEBOOK_REDIRECT_URI`/`LINKEDIN_REDIRECT_URI` now point at the new OAuth callbacks (see Phase 4).
- Endpoints (assemble payload → call agent → stream/return; no logic duplication):
  - `POST /chat/clarify` → wraps `clarify()`; returns `{question}` or `{ready, summary}`. Client sends full message history + nonprofit profile.
  - `POST /content/generate` (multipart: text fields + optional image file + `org_website`/`community_id`/`session_id`) → **SSE stream** of `compiled_graph`, mirroring `app.py`'s manual sequence. Stream node/token events; final event carries content + image bytes (base64) + `retrieval_sources`.
  - `POST /content/edit` → wraps `apply_edit()` (covers the quick actions Shorter/Hashtags/More formal/More casual + freeform edit — all already route through `apply_edit()`).
  - `POST /transcribe` (audio blob) → Whisper → `{text}`.
  - `GET /auth/facebook/login`, `GET /auth/facebook/callback`, `GET /facebook/pages`, `POST /facebook/publish` → wrap `facebook.py`. Publish uses `/{page_id}/photos` with image, `/{page_id}/feed` text-only.
  - `GET /auth/linkedin/login`, `GET /auth/linkedin/callback`, `POST /linkedin/publish` → wrap `linkedin.py`. Publish takes `org_urn` (no per-page token — single user token posts to any org the user administers).
  - `GET /knowledge/status?org_id=` → `{indexed, source_count, indexing_in_progress}` reading `DBStore.get_knowledge_source_count` + `_scrape_threads`. `POST /knowledge/reindex` → clears the vector-store collection + `DBStore` rows, same as the sidebar's "Re-index" button. `POST /knowledge/upload` (multipart doc) → wraps the PDF/TXT/MD ingestion path (`ingest_plain_text`).
  - `GET /profile?community_id=` → wraps `fetch_nonprofit_profile()`.
  - `GET /usage` → remaining-today for the sidebar progress bar.
- Rate limit as a FastAPI **dependency** in `deps.py`; resolve IP from `X-Forwarded-For` / proxy headers, fall back to `"local"`. Keep gate disabled by default.
- **Verify:** `curl` each endpoint. Confirm `/content/generate` streams incrementally (not buffered). Confirm upload-wins path end-to-end. Confirm `/knowledge/status` reflects an in-progress background scrape thread.

### Phase 3 — Next.js + TanStack Query + Tailwind frontend
- App Router. TanStack Query for all server calls; a streaming hook (fetch + `ReadableStream`) for the SSE generate endpoint. Tailwind for styling — match the two-mode UX:
  - **chat mode:** message thread; each user turn hits `/chat/clarify`; "Generate Now" button triggers the stream.
  - **result mode:** editable content textarea, quick-action buttons, freeform edit box (all → `/content/edit`); image preview; retrieval-sources expander; org Neki-page URL field + Community ID field (profile lookup); image upload + "generate image" toggle; voice button (MediaRecorder → `/transcribe`); FB connect + page selector + Publish button; LinkedIn connect + org-ID input + Publish button; Knowledge Base panel (status/re-index/doc upload); sidebar usage bar.
- **Client owns only transient UI state** (mode, draft text, which panel is open, upload-vs-generate toggle) — see corrected "State ownership" section. `session_id` is a client-generated UUID sent on every request; conversation history and knowledge state live server-side and are looked up by it.
- **Verify:** full happy path in the browser — clarify → generate (streaming visible, RAG sources shown) → edit → upload-image regenerate → FB connect → publish → LinkedIn connect → publish → knowledge-base re-index. No console errors. (Note: if you hit `ChunkLoadError` on Next 14, the known fix is `experimental.swrDelta: 0`, not a code change.)

### Phase 4 — Cross-cutting migrations
| Streamlit thing | New home |
|---|---|
| `st.session_state` (chat/result mode, draft text) | Client state in `web/` (transient UI only) |
| `st.session_state["session_id"]` | Client-generated UUID, sent per-request; server looks up history/knowledge by it |
| manual node sequence in `_run_generation()` | `compiled_graph` (rebuilt) streamed via `/content/generate` SSE |
| `clarify()` / `apply_edit()` | `/chat/clarify` / `/content/edit` |
| Whisper via `streamlit-mic-recorder` | Browser MediaRecorder → `/transcribe` (Whisper) |
| image upload | `<input type=file>` → multipart → `/content/generate` |
| FB OAuth via `st.query_params` `state=fb_oauth` | real `/auth/facebook/callback` route |
| LinkedIn OAuth via `st.query_params` `state=li_oauth` | real `/auth/linkedin/callback` route |
| `usage.json` IP limiter + `st.context.headers` | `deps.py` dependency + `X-Forwarded-For` |
| `_effective_org_id` (md5(url) vs. community_id) | `api/deps.py` |
| Sidebar Knowledge Base panel (status/re-index/upload) | Next.js panel + `/knowledge/*` routes |
| `_scrape_threads` background-thread tracking | unchanged in `agent/nodes.py`; FastAPI reads it via `/knowledge/status` |
| `st.secrets` → `os.environ` bridge | `settings.py` (pydantic-settings) + `.env`; `NEXT_PUBLIC_*` for web |
| `bootstrap.min.css.map` hotfix, mic hotfix | **Delete** — Streamlit-only, no longer needed |

- **Verify:** `grep -r "streamlit" .` returns only `chainlit_app/` false-positives (if any) and docs — nothing in `agent/`, `db/`, `rag/`, `scraper/`, `api/`, `web/`.

### Phase 5 — Chainlit dev UI (optional)
- `chainlit_app/` imports `agent/` **directly** (not via the API) for fast local iteration: a thin `@cl.on_message` that runs `clarify()` then streams `compiled_graph`. This is a debug harness, not the product.
- **Verify:** `chainlit run chainlit_app/main.py` drives a full generation locally.

### Phase 6 — Parity check
- Walk the original `CLAUDE.md` feature list and confirm each survived: chat-first clarify loop, streaming generation, edit paths (textarea / quick actions / chat edit), upload-wins image precedence, image optimization to 1080/PNG, FB OAuth + photo/feed publish, LinkedIn OAuth + publish, knowledge-base indexing/reindex/upload, RAG-grounded generation (4 collections), nonprofit profile grounding, per-IP usage logging + sidebar bar, voice input.
- **Verify:** produce a short parity table (feature → preserved? → where it now lives).

## API surface (summary)

```
POST /chat/clarify        body: {messages[], nonprofit_profile?}                       -> {question} | {ready, summary}
POST /content/generate    multipart: {brief, org_website?, community_id?, session_id, generate_image, summary, image?}  -> SSE stream
POST /content/edit        body: {content, instruction, original_query?}                -> {content}
POST /transcribe          multipart: {audio}                                            -> {text}
GET  /auth/facebook/login                                                               -> 302 to FB
GET  /auth/facebook/callback   ?code&state                                              -> {token, pages[]}
GET  /facebook/pages                                                                     -> {pages[]}
POST /facebook/publish    body: {page_id, content, image?}                              -> {post_id}
GET  /auth/linkedin/login                                                                -> 302 to LinkedIn
GET  /auth/linkedin/callback  ?code&state                                               -> {token}
POST /linkedin/publish    body: {org_urn, content, image?}                              -> {post_urn}
GET  /knowledge/status     ?org_id                                                       -> {indexed, source_count, indexing_in_progress}
POST /knowledge/reindex     body: {org_id}                                               -> {ok}
POST /knowledge/upload      multipart: {org_id, file}                                    -> {chunks_added}
GET  /profile               ?community_id                                                -> nonprofit profile dict (or {})
GET  /usage                                                                              -> {used, limit, remaining}
```

## Non-goals (do not do these)

- **No new features.** No new DB beyond the existing `DBStore`/vector-store. No auth system beyond the existing FB/LinkedIn OAuth.
- **No prompt or model-param changes.** Don't "improve" the generation prompt, temperatures, or `quality="low"`.
- **No new abstractions** for single use. If the FastAPI route is 10 lines wrapping an agent function, leave it at 10 lines.
- **No refactor of `agent/`, `db/`, `rag/`, `scraper/` internals** beyond removing UI coupling (Phase 1) and the `graph.py` rebuild (which only re-wires existing nodes — no node's internals change). Nothing here is yours to redesign beyond that.
- **No new task-queue/worker infra** for background indexing — the in-process daemon-thread pattern stays for this migration.

## Deliverable

A working monorepo where `web/` (Next.js) talks to `api/` (FastAPI) which serves the unchanged `agent/`. Start by stating a brief plan with the verify-step for each phase, then execute phase by phase, confirming the verify step before moving on.