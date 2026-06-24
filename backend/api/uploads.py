"""Upload-parsing helpers for knowledge-base document ingestion."""

import io

import pypdf


def extract_pdf_text(data: bytes) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    except Exception:
        return ""
