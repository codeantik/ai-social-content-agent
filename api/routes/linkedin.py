"""LinkedIn OAuth + publish routes — thin wrappers over agent.linkedin."""

import base64
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from agent.linkedin import exchange_code_for_token, get_auth_url, post_to_organization

router = APIRouter()

_CLIENT_ID = os.getenv("LINKEDIN_CLIENT_ID", "")
_CLIENT_SECRET = os.getenv("LINKEDIN_CLIENT_SECRET", "")
_REDIRECT_URI = os.getenv("LINKEDIN_REDIRECT_URI", "http://localhost:8501")


@router.get("/auth/linkedin/login")
def linkedin_login() -> RedirectResponse:
    return RedirectResponse(get_auth_url(_CLIENT_ID, _REDIRECT_URI))


class LinkedInCallbackResponse(BaseModel):
    token: str


@router.get("/auth/linkedin/callback", response_model=LinkedInCallbackResponse)
def linkedin_callback(code: str, state: str = "") -> LinkedInCallbackResponse:
    try:
        token = exchange_code_for_token(code, _CLIENT_ID, _CLIENT_SECRET, _REDIRECT_URI)
        return LinkedInCallbackResponse(token=token)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class LinkedInPublishRequest(BaseModel):
    org_urn: str
    access_token: str
    content: str
    image_base64: str | None = None


class LinkedInPublishResponse(BaseModel):
    post_urn: str


@router.post("/linkedin/publish", response_model=LinkedInPublishResponse)
def linkedin_publish(req: LinkedInPublishRequest) -> LinkedInPublishResponse:
    image_bytes = base64.b64decode(req.image_base64) if req.image_base64 else None
    try:
        urn = post_to_organization(req.org_urn, req.access_token, req.content, image_bytes)
        return LinkedInPublishResponse(post_urn=urn)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
