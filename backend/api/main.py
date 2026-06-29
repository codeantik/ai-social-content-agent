"""FastAPI serving layer — thin: assembles payloads, streams, no business logic."""

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(override=True)

from api.routes import chat, content, facebook, knowledge, linkedin, profile, transcribe, usage  # noqa: E402
from api.settings import get_settings  # noqa: E402

app = FastAPI(title="Content Creator AI Agent API")

_settings = get_settings()
_origins = list({
    "http://localhost:3000",
    _settings.WEB_BASE_URL,
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(content.router)
app.include_router(transcribe.router)
app.include_router(facebook.router)
app.include_router(linkedin.router)
app.include_router(knowledge.router)
app.include_router(profile.router)
app.include_router(usage.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}
