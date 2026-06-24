from typing import Optional
from pydantic import BaseModel, Field


class AgentState(BaseModel):
    # ── User request ──────────────────────────────────────────────────────────
    original_query: str = ""
    org_website: Optional[str] = None
    generate_image: bool = False
    clarification_context: str = ""

    # ── Identity (set in app.py before any node runs) ─────────────────────────
    session_id: str = ""
    user_id: str = ""
    org_id: str = ""  # md5(org_website)[:12] or communityId when PG backend is active
    nonprofit_profile: dict = Field(default_factory=dict)  # fetched from nonprofits table

    # ── RAG context (populated by RAG nodes) ──────────────────────────────────
    retrieved_context: str = ""
    retrieval_sources: list[str] = Field(default_factory=list)
    conversation_history: list[dict] = Field(default_factory=list)
    knowledge_built: bool = False  # True once website indexed for this org

    # ── Legacy context (populated by gather_context) ──────────────────────────
    web_context: str = ""
    org_context: str = ""

    # ── Generation ────────────────────────────────────────────────────────────
    generated_content: str = ""

    # ── Image pipeline ────────────────────────────────────────────────────────
    uploaded_image_bytes: Optional[bytes] = None
    image_prompt: str = ""
    image_bytes: Optional[bytes] = None
    image_url: Optional[str] = None

    # ── Output ────────────────────────────────────────────────────────────────
    final_content: str = ""
    content_id: str = ""  # DB id of the saved generated content row
    error: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True
