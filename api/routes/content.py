"""POST /content/generate (SSE) and POST /content/edit.

/content/generate streams the same node sequence app.py's _run_generation()
drives manually, via the rebuilt agent.graph.build_graph(db_store). LangGraph
node calls are blocking (sync LLM/HTTP calls), so the graph is driven in a
background thread that pushes progress events onto a queue consumed by the
async SSE generator.
"""

import base64
import json
import queue
import threading

import anyio
from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agent.chat import apply_edit
from agent.graph import build_graph
from agent.state import AgentState
from agent.usage import record_generation
from api.deps import enforce_rate_limit, make_state
from db.nonprofit_profile import fetch_nonprofit_profile
from db.pg_connection import is_pg_configured
from db.store import get_db_store

router = APIRouter()

_STEP_LABELS = {
    "load_session_data": "Loading history…",
    "trigger_background_website_indexing": "Building knowledge base…",
    "ingest_web_search_for_query": "Searching web…",
    "retrieve_rag_context": "Retrieving relevant context…",
    "gather_context": "Gathering context…",
    "generate_content": "Generating content…",
    "save_session_data": "Saving…",
    "generate_image_prompt": "Writing image prompt…",
    "gen_image": "Generating image…",
    "optimize_image": "Optimizing image…",
    "finalize": "Finalizing…",
}

_SENTINEL = object()


@router.post("/content/generate")
async def content_generate(
    brief: str = Form(...),
    session_id: str = Form(...),
    org_website: str = Form(""),
    community_id: str = Form(""),
    generate_image: bool = Form(False),
    summary: str = Form(""),
    image: UploadFile | None = File(None),
    user_id: str = Depends(enforce_rate_limit),
):
    nonprofit_profile = {}
    if is_pg_configured() and community_id.strip().isdigit():
        nonprofit_profile = fetch_nonprofit_profile(int(community_id.strip()))

    uploaded_bytes = await image.read() if image is not None else None

    state = make_state(
        original_query=brief,
        clarification_context=summary,
        org_url=org_website.strip(),
        community_id=community_id,
        session_id=session_id,
        user_id=user_id,
        nonprofit_profile=nonprofit_profile,
    ).model_copy(update={"generate_image": generate_image, "uploaded_image_bytes": uploaded_bytes})

    db_store = get_db_store()
    graph = build_graph(db_store)
    record_generation(user_id)

    q: "queue.Queue" = queue.Queue()

    def worker() -> None:
        try:
            final_state = state
            for update in graph.stream(state, stream_mode="updates"):
                for node_name, new_state in update.items():
                    final_state = new_state
                    q.put(("progress", node_name))
            q.put(("final", final_state))
        except Exception as exc:
            q.put(("error", str(exc)))
        finally:
            q.put(_SENTINEL)

    threading.Thread(target=worker, daemon=True).start()

    async def event_gen():
        while True:
            item = await anyio.to_thread.run_sync(q.get)
            if item is _SENTINEL:
                break
            kind, payload = item
            if kind == "progress":
                yield {
                    "event": "progress",
                    "data": json.dumps({"node": payload, "label": _STEP_LABELS.get(payload, payload)}),
                }
            elif kind == "error":
                yield {"event": "error", "data": json.dumps({"error": payload})}
            elif kind == "final":
                final_state = payload if isinstance(payload, AgentState) else AgentState.model_validate(payload)
                image_b64 = base64.b64encode(final_state.image_bytes).decode() if final_state.image_bytes else None
                yield {
                    "event": "final",
                    "data": json.dumps({
                        "content": final_state.final_content or final_state.generated_content,
                        "retrieval_sources": final_state.retrieval_sources,
                        "image_base64": image_b64,
                        "image_error": final_state.error,
                    }),
                }

    return EventSourceResponse(event_gen())


class EditRequest(BaseModel):
    content: str
    instruction: str
    original_query: str = ""


class EditResponse(BaseModel):
    content: str


@router.post("/content/edit", response_model=EditResponse)
def content_edit(req: EditRequest) -> EditResponse:
    updated = apply_edit(req.content, req.instruction, req.original_query)
    return EditResponse(content=updated)
