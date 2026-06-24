import os
import httpx
from urllib.parse import urlencode
from typing import Optional

API_BASE = "https://api.linkedin.com/rest"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
SCOPES = "w_organization_social"
# LinkedIn versions the Posts/Images/Organizations APIs monthly (YYYYMM), supported ~1 year then
# sunset — bump via env, not code. Confirmed current as of 2026-06-23: https://learn.microsoft.com/en-us/linkedin/marketing/versioning
API_VERSION = os.getenv("LINKEDIN_API_VERSION", "202606")


def _headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Linkedin-Version": API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }


def get_auth_url(client_id: str, redirect_uri: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": SCOPES,
        "state": "li_oauth",
        "response_type": "code",
    })


def exchange_code_for_token(
    code: str, client_id: str, client_secret: str, redirect_uri: str
) -> str:
    with httpx.Client(timeout=15) as c:
        r = c.post(TOKEN_URL, data={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        })
        if r.status_code != 200:
            print(f"LinkedIn error: {r.json()}")
        r.raise_for_status()
        return r.json()["access_token"]


def get_organizations(access_token: str) -> list:
    """Organizations the authenticated member administers. Requires the
    r_organization_admin scope (gated behind LinkedIn's Community Management API
    review) — not currently requested in SCOPES, so this is unused until approved.
    LinkedIn has no per-page token like Facebook — every org is posted to with the
    same user token."""
    with httpx.Client(timeout=15) as c:
        r = c.get(f"{API_BASE}/organizationAcls", headers=_headers(access_token), params={
            "q": "roleAssignee",
            "role": "ADMINISTRATOR",
            "state": "APPROVED",
        })
        r.raise_for_status()
        urns = [
            e.get("organization") or e.get("organizationTarget")
            for e in r.json().get("elements", [])
        ]
        urns = [u for u in urns if u]
        if not urns:
            return []

        ids = [u.split(":")[-1] for u in urns]
        r = c.get(f"{API_BASE}/organizations", headers=_headers(access_token), params={
            "ids": "List(" + ",".join(ids) + ")",
        })
        r.raise_for_status()
        results = r.json().get("results", {})
        return [
            {"id": urn, "name": results[oid]["localizedName"]}
            for urn, oid in zip(urns, ids)
            if oid in results
        ]


def _upload_image(org_urn: str, access_token: str, image_bytes: bytes) -> str:
    with httpx.Client(timeout=30) as c:
        r = c.post(
            f"{API_BASE}/images",
            headers=_headers(access_token),
            params={"action": "initializeUpload"},
            json={"initializeUploadRequest": {"owner": org_urn}},
        )
        r.raise_for_status()
        value = r.json()["value"]
        upload_url, image_urn = value["uploadUrl"], value["image"]

        r = c.put(upload_url, headers={"Authorization": f"Bearer {access_token}"}, content=image_bytes)
        if not r.is_success:
            raise Exception(f"LinkedIn image upload {r.status_code}: {r.text}")
        return image_urn


def post_to_organization(
    org_urn: str,
    access_token: str,
    message: str,
    image_bytes: Optional[bytes] = None,
) -> str:
    """Post to a LinkedIn organization page. Returns the created post URN."""
    body = {
        "author": org_urn,
        "commentary": message,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if image_bytes:
        image_urn = _upload_image(org_urn, access_token, image_bytes)
        body["content"] = {"media": {"id": image_urn}}

    with httpx.Client(timeout=30) as c:
        r = c.post(f"{API_BASE}/posts", headers=_headers(access_token), json=body)
        if not r.is_success:
            try:
                detail = r.json()
            except Exception:
                detail = r.text
            raise Exception(f"LinkedIn {r.status_code}: {detail}")
        return r.headers.get("x-restli-id", "")
