import io
import httpx
from PIL import Image
from urllib.parse import urlencode
from typing import Optional

GRAPH_API = "https://graph.facebook.com/v21.0"
SCOPES = "pages_manage_posts,pages_read_engagement"


def get_auth_url(app_id: str, redirect_uri: str) -> str:
    return "https://www.facebook.com/v21.0/dialog/oauth?" + urlencode({
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "scope": SCOPES,
        "state": "fb_oauth",
        "response_type": "code",
    })


def exchange_code_for_token(
    code: str, app_id: str, app_secret: str, redirect_uri: str
) -> str:
    print(f"DEBUG redirect_uri: '{redirect_uri}'")  # add this
    with httpx.Client(timeout=15) as c:
        r = c.get(f"{GRAPH_API}/oauth/access_token", params={
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        })
        if r.status_code != 200:
            print(f"Facebook error: {r.json()}")
        r.raise_for_status()
        return r.json()["access_token"]


def get_long_lived_token(short_token: str, app_id: str, app_secret: str) -> Optional[str]:
    with httpx.Client(timeout=15) as c:
        r = c.get(f"{GRAPH_API}/oauth/access_token", params={
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "fb_exchange_token": short_token,
        })
        r.raise_for_status()
        return r.json().get("access_token")


def get_pages(user_access_token: str) -> list:
    with httpx.Client(timeout=15) as c:
        r = c.get(f"{GRAPH_API}/me/accounts", params={
            "access_token": user_access_token,
            "fields": "id,name,access_token",
        })
        r.raise_for_status()
        return r.json().get("data", [])


def post_to_page(
    page_id: str,
    page_access_token: str,
    message: str,
    image_bytes: Optional[bytes] = None,
) -> str:
    """Post to a Facebook Page. Returns the created object ID."""
    with httpx.Client(timeout=30) as c:
        if image_bytes:
            # Convert to JPEG — smaller and more reliably accepted by the Photos API
            buf = io.BytesIO()
            Image.open(io.BytesIO(image_bytes)).convert("RGB").save(buf, format="JPEG", quality=85)
            r = c.post(
                f"{GRAPH_API}/{page_id}/photos",
                params={"access_token": page_access_token},
                data={"caption": message, "published": "true"},
                files={"source": ("image.jpg", buf.getvalue(), "image/jpeg")},
            )
            if not r.is_success:
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text
                raise Exception(f"Facebook {r.status_code}: {detail}")
            # Photos API returns {"id": photo_id, "post_id": "page_id_post_id"}.
            # We want post_id so the frontend can build a permalink.
            data = r.json()
            return data.get("post_id") or data.get("id", "")
        else:
            r = c.post(
                f"{GRAPH_API}/{page_id}/feed",
                params={"access_token": page_access_token},
                data={"message": message},
            )
            if not r.is_success:
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text
                raise Exception(f"Facebook {r.status_code}: {detail}")
            # Feed API returns {"id": "page_id_post_id"}
            return r.json().get("id", "")
