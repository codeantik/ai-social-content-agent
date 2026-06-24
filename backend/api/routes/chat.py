"""POST /chat/clarify — thin wrapper over agent.chat.clarify()."""

from fastapi import APIRouter
from pydantic import BaseModel

from agent.chat import clarify

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ClarifyRequest(BaseModel):
    messages: list[ChatMessage]
    nonprofit_profile: dict = {}


class ClarifyResponse(BaseModel):
    ready: bool
    response: str
    summary: str = ""


@router.post("/chat/clarify", response_model=ClarifyResponse)
def chat_clarify(req: ClarifyRequest) -> ClarifyResponse:
    history = [m.model_dump() for m in req.messages[:-1]]
    user_message = req.messages[-1].content if req.messages else ""
    result = clarify(user_message, history, req.nonprofit_profile)
    return ClarifyResponse(**result)
