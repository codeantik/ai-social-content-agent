"""LangGraph workflow — simplified linear pipeline, no eval-retry loop."""

from langgraph.graph import StateGraph, END
from agent.state import AgentState
from agent.nodes import (
    gather_context,
    generate_content,
    generate_image_prompt,
    generate_image,
    optimize_image,
    finalize,
)


def _route_image(state: AgentState) -> str:
    if state.uploaded_image_bytes:
        return "optimize_image"
    if state.generate_image:
        return "generate_image_prompt"
    return "finalize"


def build_graph() -> StateGraph:
    g = StateGraph(AgentState)

    g.add_node("gather_context", gather_context)
    g.add_node("generate_content", generate_content)
    g.add_node("generate_image_prompt", generate_image_prompt)
    g.add_node("generate_image", generate_image)
    g.add_node("optimize_image", optimize_image)
    g.add_node("finalize", finalize)

    g.set_entry_point("gather_context")
    g.add_edge("gather_context", "generate_content")
    g.add_conditional_edges(
        "generate_content",
        _route_image,
        {
            "generate_image_prompt": "generate_image_prompt",
            "optimize_image": "optimize_image",
            "finalize": "finalize",
        },
    )
    g.add_edge("generate_image_prompt", "generate_image")
    g.add_edge("generate_image", "optimize_image")
    g.add_edge("optimize_image", "finalize")
    g.add_edge("finalize", END)

    return g.compile()


compiled_graph = build_graph()
