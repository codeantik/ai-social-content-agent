"""Lightweight chat utilities — pre-generation clarification and post-generation edits."""

import json
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from db.nonprofit_profile import format_profile_block

_llm: ChatOpenAI | None = None


def _get_llm() -> ChatOpenAI:
    global _llm
    if _llm is None:
        _llm = ChatOpenAI(model="gpt-5.4-mini", temperature=0.5, max_tokens=700)
    return _llm


def clarify(
    user_message: str,
    history: list[dict],
    nonprofit_profile: dict | None = None,
) -> dict:
    """
    Decide if the request is clear enough to generate, or ask one clarifying question.

    Returns {"ready": bool, "response": str, "summary": str}
    """
    profile_block = format_profile_block(nonprofit_profile or {})
    profile_context = (
        f"\n\nYou are assisting this specific organisation — use their profile below to ask "
        f"targeted, relevant questions grounded in who they are and what they do:\n{profile_block}"
        if profile_block else ""
    )

    messages = [
        SystemMessage(content=(
            "You are a content creation assistant whose users are EXCLUSIVELY: nonprofits/NGOs "
            "and charities, associations (including educational institutions), and corporates "
            "supporting nonprofit causes as part of their CSR (Corporate Social Responsibility) "
            "commitments. Always read ambiguous words through THIS lens — e.g. 'community' means "
            "a civic/volunteer/beneficiary community, never a gaming, esports, or tech-product "
            "community; 'members' means association/program members; 'drive' or 'campaign' means "
            "a fundraising or awareness drive.\n"
            "You help them write social media posts for LinkedIn, Facebook, and Instagram — and "
            "ONLY these three platforms (never newsletters, emails, blog posts, or press releases). "
            "Analyze the user's request.\n"
            "If they ask for something outside these three platforms, gently steer them "
            "toward one of LinkedIn, Facebook, or Instagram — ask which one they'd like "
            "the content adapted for, as your one clarifying question.\n"
            "If it has a clear topic AND names one of LinkedIn/Facebook/Instagram, respond with:\n"
            '  {"ready": true, "summary": "<one sentence: what to create, naming the platform>"}\n'
            "If a genuinely important detail (such as the platform) is missing, ask ONE short "
            "question that references the organisation's specific work, location, or focus area "
            "where relevant — make it feel personal, not generic:\n"
            '  {"ready": false, "question": "<your single question>"}\n'
            "After 1 exchange, default to ready=true (pick the platform that best fits the "
            f"topic if the user never names one). Respond ONLY with valid JSON.{profile_context}"
        )),
    ]
    for msg in history[-6:]:  # cap history to last 6 messages
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))
    messages.append(HumanMessage(content=user_message))

    try:
        raw = _get_llm().invoke(messages).content.strip()
        if "```" in raw:
            raw = raw.split("```")[1].lstrip("json").strip()
        data = json.loads(raw)
        if data.get("ready"):
            summary = data.get("summary", "")
            return {
                "ready": True,
                "response": (
                    f"Got it! Ready to generate: *{summary}*\n\n"
                    "Click **Generate Now** when ready, or keep chatting to refine."
                ),
                "summary": summary,
            }
        return {
            "ready": False,
            "response": data.get("question", "Could you tell me more about what you need?"),
            "summary": "",
        }
    except Exception:
        return {
            "ready": True,
            "response": "Got it — click **Generate Now** to proceed.",
            "summary": user_message,
        }


def apply_edit(content: str, instruction: str, original_query: str = "") -> str:
    """Apply an edit instruction to existing content. Returns updated content."""
    ctx = f"\nOriginal request context: {original_query}" if original_query else ""
    messages = [
        SystemMessage(content=(
            f"You are a content editor.{ctx}\n"
            "Apply the requested changes to the content below.\n"
            "Keep the same format and structure unless the edit asks to change it.\n"
            "Return ONLY the updated content — no preamble or explanation."
        )),
        HumanMessage(content=f"Content:\n{content}\n\nEdit request: {instruction}"),
    ]
    try:
        result = _get_llm().invoke(messages).content.strip()
        return result or content
    except Exception:
        return content
