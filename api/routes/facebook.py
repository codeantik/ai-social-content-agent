"""Facebook OAuth + publish routes — thin wrappers over agent.facebook."""

import base64
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from agent.facebook import (
    exchange_code_for_token,
    get_auth_url,
    get_long_lived_token,
    get_pages,
    post_to_page,
)

router = APIRouter()

_APP_ID = os.getenv("FACEBOOK_APP_ID", "")
_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")
_REDIRECT_URI = os.getenv("FACEBOOK_REDIRECT_URI", "http://localhost:8501")


@router.get("/auth/facebook/login")
def facebook_login() -> RedirectResponse:
    return RedirectResponse(get_auth_url(_APP_ID, _REDIRECT_URI))


class FacebookCallbackResponse(BaseModel):
    token: str
    pages: list[dict]


@router.get("/auth/facebook/callback", response_model=FacebookCallbackResponse)
def facebook_callback(code: str, state: str = "") -> FacebookCallbackResponse:
    try:
        short = exchange_code_for_token(code, _APP_ID, _APP_SECRET, _REDIRECT_URI)
        long_lived = get_long_lived_token(short, _APP_ID, _APP_SECRET)
        token = long_lived or short
        pages = get_pages(token)
        return FacebookCallbackResponse(token=token, pages=pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/facebook/pages", response_model=list[dict])
def facebook_pages(token: str) -> list[dict]:
    try:
        return get_pages(token)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class FacebookPublishRequest(BaseModel):
    page_id: str
    page_access_token: str
    content: str
    image_base64: str | None = None


class FacebookPublishResponse(BaseModel):
    post_id: str


@router.post("/facebook/publish", response_model=FacebookPublishResponse)
def facebook_publish(req: FacebookPublishRequest) -> FacebookPublishResponse:
    image_bytes = base64.b64decode(req.image_base64) if req.image_base64 else None
    try:
        post_id = post_to_page(req.page_id, req.page_access_token, req.content, image_bytes)
        return FacebookPublishResponse(post_id=post_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
