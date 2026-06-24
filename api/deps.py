"""Identity / org_id resolution — transport-agnostic (no Streamlit, no FastAPI imports)."""

import hashlib

from agent.state import AgentState
from db.pg_connection import is_pg_configured


def effective_org_id(org_url: str, community_id: str = "") -> str:
    """
    When the PG backend is active, returns the (validated) community ID.
    Falls back to the md5 hash used by the local FAISS store.
    """
    if is_pg_configured():
        cid = community_id.strip()
        if cid and cid.isdigit():
            return cid
    return hashlib.md5(org_url.encode()).hexdigest()[:12] if org_url else ""


def make_state(
    *,
    original_query: str,
    clarification_context: str,
    org_url: str,
    community_id: str,
    session_id: str,
    user_id: str,
    nonprofit_profile: dict,
) -> AgentState:
    org_id = effective_org_id(org_url, community_id)
    return AgentState(
        original_query=original_query,
        org_website=org_url or None,
        generate_image=False,
        clarification_context=clarification_context,
        session_id=session_id,
        user_id=user_id,
        org_id=org_id,
        nonprofit_profile=nonprofit_profile,
        uploaded_image_bytes=None,
    )
