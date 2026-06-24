"""Streamlit front-end — chat-first content creation agent with RAG pipeline."""

import importlib.util
import os
import tempfile
import uuid
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv
from openai import OpenAI
from streamlit_mic_recorder import mic_recorder

# ---------------------------------------------------------------------------
# Hotfix: streamlit-mic-recorder missing bootstrap.min.css.map on some installs
# ---------------------------------------------------------------------------
_spec = importlib.util.find_spec("streamlit_mic_recorder")
if _spec:
    _map_file = Path(_spec.origin).parent / "frontend" / "build" / "bootstrap.min.css.map"
    if not _map_file.exists():
        try:
            _map_file.parent.mkdir(parents=True, exist_ok=True)
            _map_file.write_text("{}")
        except PermissionError:
            pass

from db.pg_connection import is_pg_configured as _is_pg_configured
from db.nonprofit_profile import fetch_nonprofit_profile as _fetch_nonprofit_profile
from agent.state import AgentState
from agent.chat import clarify, apply_edit
from api.deps import effective_org_id, make_state
from api.uploads import extract_pdf_text
from agent.nodes import (
    load_session_data as _node_load_session,
    trigger_background_website_indexing as _node_trigger_indexing,
    ingest_web_search_for_query as _node_ingest_web_search,
    retrieve_rag_context as _node_retrieve_rag,
    gather_context as _node_gather_ctx,
    stream_content as _node_stream_content,
    save_session_data as _node_save_session,
    generate_image_prompt as _node_img_prompt,
    generate_image as _node_gen_img,
    optimize_image as _node_optimize_img,
)
from agent.usage import (
    DAILY_LIMIT,
    is_limit_reached,
    record_generation,
    remaining,
    reset_time_str,
)
from agent.facebook import (
    get_auth_url,
    exchange_code_for_token,
    get_long_lived_token,
    get_pages,
    post_to_page,
)
from agent.linkedin import (
    get_auth_url as li_get_auth_url,
    exchange_code_for_token as li_exchange_code_for_token,
    post_to_organization,
)
from db.store import get_db_store

load_dotenv()

try:
    for _k, _v in st.secrets.items():
        os.environ.setdefault(_k, str(_v))
except Exception:
    pass


def _get_client_ip() -> str:
    """
    Resolve the real client IP from Streamlit request headers (v1.37+).
    Falls back to "local" for development environments with no proxy headers.
    """
    try:
        headers = st.context.headers
        # Behind a load balancer / reverse proxy the real IP is in X-Forwarded-For.
        # The header is a comma-separated list; the first entry is the original client.
        xff = headers.get("X-Forwarded-For", "").strip()
        if xff:
            return xff.split(",")[0].strip()
        # Other common proxy headers
        for h in ("X-Real-Ip", "X-Client-Ip", "Cf-Connecting-Ip"):
            ip = headers.get(h, "").strip()
            if ip:
                return ip
    except Exception:
        pass
    return "local"


USER_UID = _get_client_ip()
_db = get_db_store()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_GREETING = {
    "role": "assistant",
    "content": (
        "Hi! I'm your content creation assistant. Tell me what you'd like to post — "
        "a LinkedIn post, Facebook post, or Instagram caption for your organization. "
        "I'll ask a question if I need more details, or you can click "
        "**Generate Now** straight away."
    ),
}

_STEP_LABELS = {
    "build_knowledge": "📚 Building knowledge base…",
    "retrieve_context": "🔍 Retrieving relevant context…",
    "gather_context": "🌐 Gathering context…",
    "generate_content": "✍️ Generating content…",
    "generate_image_prompt": "🎨 Writing image prompt…",
    "generate_image": "🖼️ Generating image…",
    "optimize_image": "🛠️ Optimizing image…",
    "finalize": "✅ Finalizing…",
}

# ---------------------------------------------------------------------------
# Session state defaults
# ---------------------------------------------------------------------------
_DEFAULTS = {
    "mode": "chat",
    "messages": [_GREETING],
    "chat_ready": False,
    "result": None,
    "last_audio_id": None,
    "fb_connected": False,
    "fb_pages": [],
    "fb_user_token": None,
    "fb_error": None,
    "li_connected": False,
    "li_user_token": None,
    "li_error": None,
    "uploader_key": 0,
    "session_id": str(uuid.uuid4()),   # unique per browser session
    "last_indexed_url": None,           # track which org was last indexed
}
for _k, _v in _DEFAULTS.items():
    if _k not in st.session_state:
        st.session_state[_k] = _v

# ---------------------------------------------------------------------------
# Facebook env config
# ---------------------------------------------------------------------------
_fb_app_id = os.getenv("FACEBOOK_APP_ID", "")
_fb_app_secret = os.getenv("FACEBOOK_APP_SECRET", "")
_fb_redirect_uri = os.getenv("FACEBOOK_REDIRECT_URI", "http://localhost:8501")
_fb_enabled = bool(_fb_app_id and _fb_app_secret)

# ---------------------------------------------------------------------------
# LinkedIn env config
# ---------------------------------------------------------------------------
_li_client_id = os.getenv("LINKEDIN_CLIENT_ID", "")
_li_client_secret = os.getenv("LINKEDIN_CLIENT_SECRET", "")
_li_redirect_uri = os.getenv("LINKEDIN_REDIRECT_URI", "http://localhost:8501")
_li_enabled = bool(_li_client_id and _li_client_secret)

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Content Creator AI Agent",
    page_icon="✍️",
    layout="wide",
)

# ---------------------------------------------------------------------------
# Facebook OAuth callback handler
# ---------------------------------------------------------------------------
if _fb_enabled and "code" in st.query_params and st.query_params.get("state") == "fb_oauth":
    _code = st.query_params["code"]
    try:
        _short = exchange_code_for_token(_code, _fb_app_id, _fb_app_secret, _fb_redirect_uri)
        _long = get_long_lived_token(_short, _fb_app_id, _fb_app_secret)
        _token = _long or _short
        _pages = get_pages(_token)
        st.session_state.fb_user_token = _token
        st.session_state.fb_pages = _pages
        st.session_state.fb_connected = True
        st.session_state.fb_error = None
    except Exception as _exc:
        st.session_state.fb_error = str(_exc)
        st.session_state.fb_connected = False
    st.query_params.clear()
    st.rerun()

# ---------------------------------------------------------------------------
# LinkedIn OAuth callback handler
# ---------------------------------------------------------------------------
if _li_enabled and "code" in st.query_params and st.query_params.get("state") == "li_oauth":
    _code = st.query_params["code"]
    try:
        _token = li_exchange_code_for_token(_code, _li_client_id, _li_client_secret, _li_redirect_uri)
        st.session_state.li_user_token = _token
        st.session_state.li_connected = True
        st.session_state.li_error = None
    except Exception as _exc:
        st.session_state.li_error = str(_exc)
        st.session_state.li_connected = False
    st.query_params.clear()
    st.rerun()

# ---------------------------------------------------------------------------
# Title
# ---------------------------------------------------------------------------
st.title("✍️ Content Creator AI Agent")
st.caption("Chat to clarify your request, then generate professional content powered by OpenAI Models")

# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    st.header("⚙️ Options")
    st.text_input(
        "Your organization's Neki page (optional)",
        placeholder="https://my.neki.io/nonprofit/your-org",
        key="org_website_input",
        help=(
            "Link to your org's public Neki page. The full site will be indexed "
            "into a knowledge base on first use, so content is grounded in your "
            "real voice and mission — not just the homepage."
        ),
    )
    if _is_pg_configured():
        st.text_input(
            "Community ID",
            placeholder="e.g. 42",
            key="community_id_input",
            help="Your Neki community integer ID — used to query the knowledge base.",
        )
        _cid_raw = st.session_state.get("community_id_input", "").strip()
        if _cid_raw and _cid_raw.isdigit():
            _cid_int = int(_cid_raw)
            # Re-fetch only when the community_id changes
            if st.session_state.get("_loaded_profile_for") != _cid_int:
                _profile = _fetch_nonprofit_profile(_cid_int)
                st.session_state["nonprofit_profile"] = _profile
                st.session_state["_loaded_profile_for"] = _cid_int
            if st.session_state.get("nonprofit_profile", {}).get("name"):
                st.caption(f"📋 {st.session_state['nonprofit_profile']['name']}")
        else:
            st.session_state.setdefault("nonprofit_profile", {})

    st.divider()
    st.markdown("**🖼️ Post image**")
    st.toggle("Generate image with post", key="gen_img_flag")
    st.file_uploader(
        "...or upload your own image",
        type=["png", "jpg", "jpeg", "webp"],
        key=f"uploaded_image_{st.session_state.uploader_key}",
        help="An uploaded image takes priority over generation.",
    )

    # ---- Knowledge Base panel ----
    st.divider()
    st.header("📚 Knowledge Base")

    _org_url = st.session_state.get("org_website_input", "").strip()
    if _org_url:
        _org_id = effective_org_id(_org_url, st.session_state.get("community_id_input", ""))
        _src_count = _db.get_knowledge_source_count(_org_id)

        from agent.nodes import _scrape_threads as _active_scrapes
        _indexing_now = _org_id in _active_scrapes

        if _indexing_now:
            st.info("⏳ Indexing website in background…")
        elif _src_count > 0:
            st.success(f"✅ {_src_count} pages indexed")
            if st.button("🔄 Re-index website", key="reindex_btn"):
                from rag.vector_store import get_vector_store
                get_vector_store().delete_collection("website", _org_id)
                _db.clear_knowledge_sources(_org_id)
                st.session_state.last_indexed_url = None
                st.rerun()
        else:
            st.info("Website will be indexed automatically on first generation.")
    else:
        st.caption("Enter an org URL above to enable knowledge indexing.")

    # File upload for brand guidelines / documents
    st.markdown("**Upload brand guidelines or past content**")
    _kb_file = st.file_uploader(
        "PDF, TXT, or MD",
        type=["pdf", "txt", "md"],
        key="kb_upload",
        help="Uploaded documents are chunked and embedded for context retrieval.",
    )
    if _kb_file is not None and _org_url:
        _file_key = f"kb_ingested_{_kb_file.name}_{_org_url}"
        if _file_key not in st.session_state:
            _org_id = effective_org_id(_org_url, st.session_state.get("community_id_input", ""))
            with st.spinner(f"Indexing {_kb_file.name}…"):
                try:
                    if _kb_file.type == "application/pdf":
                        _text = extract_pdf_text(_kb_file.read())
                    else:
                        _text = _kb_file.read().decode("utf-8", errors="replace")

                    if _text:
                        from rag.ingestion import ingest_plain_text
                        _n = ingest_plain_text(
                            _text,
                            _org_id,
                            source_type="document",
                            metadata={"title": _kb_file.name},
                            db_store=_db,
                        )
                        st.session_state[_file_key] = True
                        st.success(f"Added {_n} chunks from {_kb_file.name}")
                except Exception as _exc:
                    st.error(f"Failed to index {_kb_file.name}: {_exc}")

    st.divider()
    st.header("🎙️ Voice Input")
    st.caption("Record a message — it will be sent to the chat automatically.")
    _audio = mic_recorder(
        start_prompt="🎙️ Start recording",
        stop_prompt="⏹️ Stop",
        just_once=True,
        key="mic_recorder",
    )

    st.divider()
    st.header("📘 Facebook")
    if not _fb_enabled:
        st.caption("Add `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` to enable.")
    elif st.session_state.fb_connected:
        _pages = st.session_state.fb_pages
        if _pages:
            st.selectbox(
                "Publish to page",
                options=_pages,
                format_func=lambda p: p["name"],
                key="fb_selected_page",
            )
            st.success("✅ Connected")
        else:
            st.warning("No pages found.")
        if st.button("Disconnect", key="fb_disconnect"):
            st.session_state.fb_connected = False
            st.session_state.fb_user_token = None
            st.session_state.fb_pages = []
            st.session_state.pop("fb_selected_page", None)
            st.rerun()
    else:
        _auth_url = get_auth_url(_fb_app_id, _fb_redirect_uri)
        st.link_button("📘 Connect to Facebook", _auth_url, use_container_width=True)
        if st.session_state.fb_error:
            st.error(f"Connection error: {st.session_state.fb_error}")

    st.divider()
    st.header("💼 LinkedIn")
    if not _li_enabled:
        st.caption("Add `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` to enable.")
    elif st.session_state.li_connected:
        st.text_input(
            "LinkedIn Organization ID",
            placeholder="e.g. 12345678",
            key="li_org_id_input",
            help=(
                "Find this in your Page admin view URL or via LinkedIn's API. "
                "Auto-discovery is disabled until the app's Community Management "
                "API access (r_organization_admin) is approved by LinkedIn."
            ),
        )
        if st.session_state.get("li_org_id_input", "").strip().isdigit():
            st.success("✅ Connected")
        else:
            st.caption("Enter the numeric Organization ID to enable publishing.")
        if st.button("Disconnect", key="li_disconnect"):
            st.session_state.li_connected = False
            st.session_state.li_user_token = None
            st.session_state.pop("li_org_id_input", None)
            st.rerun()
    else:
        _li_auth_url = li_get_auth_url(_li_client_id, _li_redirect_uri)
        st.link_button("💼 Connect to LinkedIn", _li_auth_url, use_container_width=True)
        if st.session_state.li_error:
            st.error(f"Connection error: {st.session_state.li_error}")


# ---------------------------------------------------------------------------
# Voice input — auto-submit transcript to chat when in chat mode
# ---------------------------------------------------------------------------
if _audio and _audio.get("id") != st.session_state.last_audio_id:
    st.session_state.last_audio_id = _audio["id"]
    with st.spinner("Transcribing…"):
        _oc = OpenAI()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as _tmp:
            _tmp.write(_audio["bytes"])
            _tmp_path = _tmp.name
        with open(_tmp_path, "rb") as _f:
            _transcript = _oc.audio.transcriptions.create(model="whisper-1", file=_f).text.strip()
    if _transcript and st.session_state.mode == "chat":
        st.session_state.messages.append({"role": "user", "content": _transcript})
        _resp = clarify(_transcript, st.session_state.messages[:-1], st.session_state.get("nonprofit_profile", {}))
        st.session_state.messages.append({"role": "assistant", "content": _resp["response"]})
        if _resp["ready"]:
            st.session_state.chat_ready = True
    st.rerun()


# ---------------------------------------------------------------------------
# Helper: chat message handler
# ---------------------------------------------------------------------------
def _handle_chat_message(text: str) -> None:
    st.session_state.messages.append({"role": "user", "content": text})
    response_data = clarify(text, st.session_state.messages[:-1], st.session_state.get("nonprofit_profile", {}))
    st.session_state.messages.append({"role": "assistant", "content": response_data["response"]})
    if response_data["ready"]:
        st.session_state.chat_ready = True



# ---------------------------------------------------------------------------
# Main generation pipeline
# ---------------------------------------------------------------------------
def _run_generation() -> None:
    messages = st.session_state.messages
    original_query = next((m["content"] for m in messages if m["role"] == "user"), "")
    user_followups = [m["content"] for m in messages[1:] if m["role"] == "user"]
    clarification_context = "\n".join(user_followups)

    gen_image = st.session_state.get("gen_img_flag", False)
    _uploaded_file = st.session_state.get(f"uploaded_image_{st.session_state.uploader_key}")
    uploaded_bytes = _uploaded_file.getvalue() if _uploaded_file else None

    state = make_state(
        original_query=original_query,
        clarification_context=clarification_context,
        org_url=st.session_state.get("org_website_input", "").strip(),
        community_id=st.session_state.get("community_id_input", ""),
        session_id=st.session_state["session_id"],
        user_id=USER_UID,
        nonprofit_profile=st.session_state.get("nonprofit_profile", {}),
    )

    bar_ph = st.empty()
    bar = bar_ph.progress(0, text="Starting…")
    record_generation(USER_UID)

    try:
        # Step 1 — load conversation history from DB
        bar.progress(5, text="Loading history…")
        state = _node_load_session(state, _db)

        # Step 2 — fire website indexing in background (non-blocking, enriches NEXT generation)
        _node_trigger_indexing(state, _db)

        # Step 3 — ingest fresh web search results synchronously (fast ~1 s, available NOW)
        bar.progress(15, text="Searching web…")
        _node_ingest_web_search(state)

        # Step 4 — retrieve relevant context from vector store (uses whatever is indexed so far)
        bar.progress(30, text=_STEP_LABELS["retrieve_context"])
        state = _node_retrieve_rag(state)

        # Step 5 — supplementary live context (Tavily string + single-page scrape fallback)
        bar.progress(45, text=_STEP_LABELS["gather_context"])
        state = _node_gather_ctx(state)

        # Step 6 — stream generated content
        bar.progress(55, text=_STEP_LABELS["generate_content"])
        content = st.write_stream(_node_stream_content(state))
        bar.progress(90, text="Saving…")

        # Step 7 — persist to DB + embed into vector store
        state = state.model_copy(update={"generated_content": content})
        state = _node_save_session(state, _db)

        bar.progress(100, text="Done!")

    except Exception as exc:
        bar_ph.error(f"❌ Agent error: {exc}")
        return

    st.session_state.result = {
        "content": content,
        "generated_content": content,
        "image_bytes": None,
        "image_url": None,
        "image_prompt": None,
        "image_error": None,
        "has_image": gen_image or bool(uploaded_bytes),
        "image_uploaded": bool(uploaded_bytes),
        "image_pending": gen_image or bool(uploaded_bytes),
        "gen_image": gen_image,
        "uploaded_bytes": uploaded_bytes,
        "original_query": original_query,
        "retrieval_sources": state.retrieval_sources,
    }
    st.session_state.editor_content = content
    st.session_state.mode = "result"
    st.rerun()


# ===========================================================================
# CHAT MODE
# ===========================================================================
if st.session_state.mode == "chat":

    with st.container(height=420):
        for msg in st.session_state.messages:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])

    _has_user_msg = any(m["role"] == "user" for m in st.session_state.messages)
    _gen_clicked = False
    if _has_user_msg:
        _btn_label = "✅ Generate Now" if st.session_state.chat_ready else "🚀 Generate Now"
        _gen_clicked = st.button(_btn_label, type="primary", use_container_width=True)

    _user_input = st.chat_input("Describe the content you want to create…")
    if _user_input:
        _handle_chat_message(_user_input)
        st.rerun()

    if _gen_clicked:
        _run_generation()


# ===========================================================================
# RESULT MODE
# ===========================================================================
elif st.session_state.mode == "result":
    result = st.session_state.result or {}

    if "editor_content" not in st.session_state:
        st.session_state.editor_content = result.get("content", "")

    if "_pending_editor_content" in st.session_state:
        st.session_state.editor_content = st.session_state.pop("_pending_editor_content")

    # ---- Header row ----
    _hdr_col, _new_col = st.columns([5, 1])
    with _hdr_col:
        st.subheader("📄 Generated Content")
    with _new_col:
        if st.button("🔄 Start Over", use_container_width=True):
            st.session_state.mode = "chat"
            st.session_state.messages = [_GREETING]
            st.session_state.chat_ready = False
            st.session_state.result = None
            st.session_state.uploader_key += 1
            st.session_state.pop("editor_content", None)
            st.rerun()

    # ---- Editable content area ----
    st.text_area(
        "Edit directly or use the quick tools below",
        key="editor_content",
        height=340,
        label_visibility="collapsed",
    )

    # ---- Quick-edit action buttons ----
    _q_cols = st.columns(4)
    _quick_actions = [
        ("✂️ Shorter", "Make it concisely shorter; remove filler words"),
        ("#️⃣ Hashtags", "Add 3–5 relevant hashtags at the end"),
        ("🎯 More formal", "Rewrite in a more professional, formal tone"),
        ("😊 More casual", "Rewrite in a friendlier, more casual tone"),
    ]
    for _i, (_label, _instruction) in enumerate(_quick_actions):
        with _q_cols[_i]:
            if st.button(_label, use_container_width=True):
                with st.spinner(f"{_label}…"):
                    _updated = apply_edit(
                        st.session_state.editor_content,
                        _instruction,
                        original_query=result.get("original_query", ""),
                    )
                st.session_state._pending_editor_content = _updated
                st.rerun()

    # ---- Retrieval sources (provenance) ----
    _sources = result.get("retrieval_sources", [])
    if _sources:
        with st.expander("🔍 Context sources used"):
            for _src in _sources:
                st.markdown(f"- {_src}")

    # ---- Copy as plain text ----
    with st.expander("📋 Copy as plain text"):
        st.code(st.session_state.editor_content, language=None)

    # ---- Image section ----
    if result.get("has_image"):
        _uploaded = result.get("image_uploaded")
        st.subheader("🖼️ Your Image" if _uploaded else "🖼️ Generated Image")

        if result.get("image_pending"):
            _spinner_label = "Optimizing image…" if _uploaded else "Generating image…"
            with st.spinner(_spinner_label):
                _img_state = AgentState(
                    original_query=result.get("original_query", ""),
                    generated_content=result.get("generated_content", ""),
                    uploaded_image_bytes=result.get("uploaded_bytes"),
                )
                if not _uploaded:
                    _img_state = _node_img_prompt(_img_state)
                    _img_state = _node_gen_img(_img_state)
                else:
                    _img_state = _node_optimize_img(_img_state)
            result["image_bytes"] = _img_state.image_bytes
            result["image_url"] = _img_state.image_url
            result["image_prompt"] = _img_state.image_prompt
            result["image_error"] = _img_state.error
            result["image_pending"] = False
            st.session_state.result = result

        img_err = result.get("image_error")
        if result.get("image_bytes"):
            st.image(result["image_bytes"], width="content", caption="Generated image")
            if img_err:
                st.caption(f"⚠️ Optimization fell back to original — {img_err}")
            elif _uploaded:
                st.caption("Optimized for posting (resized & compressed).")
            else:
                with st.expander("Image prompt used"):
                    st.write(result.get("image_prompt") or "—")
        elif img_err:
            st.error(f"Image processing failed.\n\n`{img_err}`")
        else:
            st.info("Image generation was not successful.")

    # ---- Facebook Publish ----
    if st.session_state.fb_connected and st.session_state.fb_pages:
        st.divider()
        st.subheader("📘 Publish to Facebook")
        _page = st.session_state.get("fb_selected_page") or st.session_state.fb_pages[0]
        st.caption(f"Publishing to: **{_page['name']}**")
        if st.button("📤 Publish to Facebook", type="primary", key="fb_publish_btn"):
            with st.spinner("Publishing…"):
                try:
                    _post_id = post_to_page(
                        page_id=_page["id"],
                        page_access_token=_page["access_token"],
                        message=st.session_state.editor_content,
                        image_bytes=result.get("image_bytes"),
                    )
                    _parts = _post_id.split("_")
                    _post_url = (
                        f"https://www.facebook.com/{_parts[0]}/posts/{_parts[1]}"
                        if len(_parts) == 2 else "https://www.facebook.com/"
                    )
                    st.success(f"✅ Published! [View post]({_post_url})")
                except Exception as _pub_exc:
                    st.error(f"❌ Failed to publish: {_pub_exc}")

    # ---- LinkedIn Publish ----
    _li_org_id = st.session_state.get("li_org_id_input", "").strip()
    if st.session_state.li_connected and _li_org_id.isdigit():
        st.divider()
        st.subheader("💼 Publish to LinkedIn")
        st.caption(f"Publishing to organization ID: **{_li_org_id}**")
        if st.button("📤 Publish to LinkedIn", type="primary", key="li_publish_btn"):
            with st.spinner("Publishing…"):
                try:
                    _post_urn = post_to_organization(
                        org_urn=f"urn:li:organization:{_li_org_id}",
                        access_token=st.session_state.li_user_token,
                        message=st.session_state.editor_content,
                        image_bytes=result.get("image_bytes"),
                    )
                    _post_url = f"https://www.linkedin.com/feed/update/{_post_urn}/"
                    st.success(f"✅ Published! [View post]({_post_url})")
                except Exception as _pub_exc:
                    st.error(f"❌ Failed to publish: {_pub_exc}")

    # ---- Edit via chat ----
    _edit_input = st.chat_input("Ask for changes…")
    if _edit_input:
        with st.spinner("Applying…"):
            _updated = apply_edit(
                st.session_state.editor_content,
                _edit_input,
                original_query=result.get("original_query", ""),
            )
        st.session_state._pending_editor_content = _updated
        st.rerun()
