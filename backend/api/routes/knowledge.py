"""Knowledge-base status / re-index / document-upload routes."""

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

from agent.nodes import _scrape_threads
from api.uploads import extract_pdf_text
from db.store import get_db_store
from rag.ingestion import ingest_plain_text
from rag.vector_store import get_vector_store

router = APIRouter()


class KnowledgeStatusResponse(BaseModel):
    indexed: bool
    source_count: int
    indexing_in_progress: bool


@router.get("/knowledge/status", response_model=KnowledgeStatusResponse)
def knowledge_status(org_id: str) -> KnowledgeStatusResponse:
    count = get_db_store().get_knowledge_source_count(org_id)
    return KnowledgeStatusResponse(
        indexed=count > 0,
        source_count=count,
        indexing_in_progress=org_id in _scrape_threads,
    )


class ReindexRequest(BaseModel):
    org_id: str


@router.post("/knowledge/reindex")
def knowledge_reindex(req: ReindexRequest) -> dict:
    get_vector_store().delete_collection("website", req.org_id)
    get_db_store().clear_knowledge_sources(req.org_id)
    return {"ok": True}


class UploadResponse(BaseModel):
    chunks_added: int


@router.post("/knowledge/upload", response_model=UploadResponse)
async def knowledge_upload(
    org_id: str = Form(...),
    file: UploadFile = File(...),
) -> UploadResponse:
    data = await file.read()
    if file.content_type == "application/pdf":
        text = extract_pdf_text(data)
    else:
        text = data.decode("utf-8", errors="replace")

    added = 0
    if text:
        added = ingest_plain_text(
            text,
            org_id,
            source_type="document",
            metadata={"title": file.filename},
            db_store=get_db_store(),
        )
    return UploadResponse(chunks_added=added)
