"""LangGraph workflow — mirrors the real node sequence app.py's _run_generation() runs today."""

from typing import TYPE_CHECKING

from langgraph.graph import StateGraph, END
from agent.state import AgentState
from agent.nodes import (
    load_session_data,
    trigger_background_website_indexing,
    ingest_web_search_for_query,
    retrieve_rag_context,
    gather_context,
    generate_content,
    save_session_data,
    generate_image_prompt,
    generate_image,
    optimize_image,
    finalize,
)

if TYPE_CHECKING:
    from db.store import DBStore


def _route_image(state: AgentState) -> str:
    if state.uploaded_image_bytes:
        return "optimize_image"
    if state.generate_image:
        return "generate_image_prompt"
    return "finalize"


def build_graph(db_store: "DBStore") -> StateGraph:
    """
    Bind db_store via closure rather than threading it through AgentState —
    the DB handle is an infra concern, not agent state.
    """

    def _load_session_data(state: AgentState) -> AgentState:
        return load_session_data(state, db_store)

    def _trigger_background_website_indexing(state: AgentState) -> AgentState:
        trigger_background_website_indexing(state, db_store)
        return state

    def _ingest_web_search_for_query(state: AgentState) -> AgentState:
        ingest_web_search_for_query(state)
        return state

    def _save_session_data(state: AgentState) -> AgentState:
        return save_session_data(state, db_store)

    g = StateGraph(AgentState)

    g.add_node("load_session_data", _load_session_data)
    g.add_node("trigger_background_website_indexing", _trigger_background_website_indexing)
    g.add_node("ingest_web_search_for_query", _ingest_web_search_for_query)
    g.add_node("retrieve_rag_context", retrieve_rag_context)
    g.add_node("gather_context", gather_context)
    g.add_node("generate_content", generate_content)
    g.add_node("save_session_data", _save_session_data)
    g.add_node("generate_image_prompt", generate_image_prompt)
    g.add_node("gen_image", generate_image)  # node id != state key "generate_image"
    g.add_node("optimize_image", optimize_image)
    g.add_node("finalize", finalize)

    g.set_entry_point("load_session_data")
    g.add_edge("load_session_data", "trigger_background_website_indexing")
    g.add_edge("trigger_background_website_indexing", "ingest_web_search_for_query")
    g.add_edge("ingest_web_search_for_query", "retrieve_rag_context")
    g.add_edge("retrieve_rag_context", "gather_context")
    g.add_edge("gather_context", "generate_content")
    g.add_edge("generate_content", "save_session_data")
    g.add_conditional_edges(
        "save_session_data",
        _route_image,
        {
            "optimize_image": "optimize_image",
            "generate_image_prompt": "generate_image_prompt",
            "finalize": "finalize",
        },
    )
    g.add_edge("generate_image_prompt", "gen_image")
    g.add_edge("gen_image", "optimize_image")
    g.add_edge("optimize_image", "finalize")
    g.add_edge("finalize", END)

    return g.compile()
