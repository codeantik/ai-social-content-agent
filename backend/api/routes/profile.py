"""GET /profile — thin wrapper over db.nonprofit_profile.fetch_nonprofit_profile.
GET /org-id — thin wrapper over api.deps.effective_org_id (the PG-configured check
is server-only env vars, so the client can't compute this itself)."""

from fastapi import APIRouter

from api.deps import effective_org_id
from db.nonprofit_profile import fetch_nonprofit_profile

router = APIRouter()


@router.get("/profile")
def profile(community_id: int) -> dict:
    return fetch_nonprofit_profile(community_id)


@router.get("/org-id")
def org_id(org_website: str = "", community_id: str = "") -> dict:
    return {"org_id": effective_org_id(org_website, community_id)}
