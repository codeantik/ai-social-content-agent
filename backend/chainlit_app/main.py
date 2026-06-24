"""Chainlit dev harness — imports agent/ directly for fast local iteration.

This is a debug UI, not the product (that's web/ + api/). It skips the
FastAPI/SSE layer entirely: clarify() then stream the same compiled_graph
the API streams, so changes to agent/ nodes are visible without curl or
a browser dev-tools network tab.
"""

import sys
import uuid
from pathlib import Path

import chainlit as cl
from dotenv import load_dotenv

# chainlit only puts this file's own directory on sys.path; add backend/ (the
# parent) so `agent`/`db` — siblings of chainlit_app/ — are importable, same
# as when api/main.py is run with backend/ as the working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

load_dotenv()

from agent.chat import clarify
from agent.graph import build_graph
from agent.state import AgentState
from db.store import get_db_store

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


@cl.on_chat_start
async def start() -> None:
    cl.user_session.set("session_id", str(uuid.uuid4()))
    cl.user_session.set("history", [])


@cl.on_message
async def on_message(message: cl.Message) -> None:
    history: list[dict] = cl.user_session.get("history")
    result = clarify(message.content, history)
    history.append({"role": "user", "content": message.content})
    history.append({"role": "assistant", "content": result["response"]})

    if not result["ready"]:
        await cl.Message(content=result["response"]).send()
        return

    await cl.Message(content=result["response"]).send()

    session_id = cl.user_session.get("session_id")
    state = AgentState(
        original_query=message.content,
        clarification_context=result["summary"],
        session_id=session_id,
        user_id=session_id,
    )

    graph = build_graph(get_db_store())
    progress = cl.Message(content=_STEP_LABELS["load_session_data"])
    await progress.send()

    final_state = state
    for update in graph.stream(state, stream_mode="updates"):
        for node_name, new_state in update.items():
            final_state = new_state
            progress.content = _STEP_LABELS.get(node_name, node_name)
            await progress.update()

    await progress.remove()

    elements = []
    if final_state.image_bytes:
        elements.append(cl.Image(content=final_state.image_bytes, name="generated.png", display="inline"))

    await cl.Message(
        content=final_state.final_content or final_state.generated_content,
        elements=elements,
    ).send()
