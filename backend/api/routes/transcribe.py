"""POST /transcribe — Whisper transcription, multipart audio upload."""

import tempfile

from fastapi import APIRouter, File, UploadFile
from openai import OpenAI
from pydantic import BaseModel

router = APIRouter()

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


class TranscribeResponse(BaseModel):
    text: str


_MIME_TO_EXT = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
}


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile = File(...)) -> TranscribeResponse:
    data = await audio.read()
    suffix = _MIME_TO_EXT.get(audio.content_type or "", ".webm")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    with open(tmp_path, "rb") as f:
        text = _get_client().audio.transcriptions.create(model="whisper-1", file=f).text.strip()
    return TranscribeResponse(text=text)
