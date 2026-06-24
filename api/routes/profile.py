"""GET /profile — thin wrapper over db.nonprofit_profile.fetch_nonprofit_profile."""

from fastapi import APIRouter

from db.nonprofit_profile import fetch_nonprofit_profile

router = APIRouter()


@router.get("/profile")
def profile(community_id: int) -> dict:
    return fetch_nonprofit_profile(community_id)
