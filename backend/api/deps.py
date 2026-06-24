"""Identity / org_id resolution + request-layer dependencies for the FastAPI app."""

import hashlib
import os

from fastapi import HTTPException, Request

from agent.state import AgentState
from agent.usage import is_limit_reached, reset_time_str
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


def get_client_ip(request: Request) -> str:
    """
    Mirrors app.py's _get_client_ip: resolve the real client IP from proxy
    headers, falling back to "local" for dev environments with no proxy.
    """
    xff = request.headers.get("x-forwarded-for", "").strip()
    if xff:
        return xff.split(",")[0].strip()
    for h in ("x-real-ip", "x-client-ip", "cf-connecting-ip"):
        ip = request.headers.get(h, "").strip()
        if ip:
            return ip
    return "local"


# Gate is disabled by default to match current Streamlit behavior — flip via env.
_RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "false").lower() == "true"


def enforce_rate_limit(request: Request) -> str:
    """Dependency: raises 429 once the daily limit is reached, if the gate is enabled."""
    ip = get_client_ip(request)
    if _RATE_LIMIT_ENABLED and is_limit_reached(ip):
        raise HTTPException(
            status_code=429,
            detail=f"Daily generation limit reached. Resets {reset_time_str()}.",
        )
    return ip
