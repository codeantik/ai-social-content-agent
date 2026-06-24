"""Fetch nonprofit profile from the nekidb nonprofits table by company_id."""
import psycopg2
import psycopg2.extras

from db.pg_connection import get_psycopg_dsn, is_pg_configured

_FIELDS = (
    "name", "description", "keywords", "slogan",
    "website_url", "logo_url", "address", "city", "state",
    "zipcode", "country", "banner_url", "donation_url",
    "rating", "latitude", "longitude", "location",
)

_SELECT = f"SELECT {', '.join(_FIELDS)} FROM non_profits WHERE company_id = %s LIMIT 1"


def fetch_nonprofit_profile(community_id: int) -> dict:
    """
    Return a dict of nonprofit fields for the given community_id (company_id FK).
    Returns an empty dict if PG is not configured, the record is not found, or any error occurs.
    """
    if not is_pg_configured():
        return {}
    try:
        with psycopg2.connect(get_psycopg_dsn()) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(_SELECT, (community_id,))
                row = cur.fetchone()
        if not row:
            return {}
        return {k: v for k, v in dict(row).items() if v is not None and v != ""}
    except Exception as exc:
        print(f"[nonprofit_profile] Failed to fetch community_id={community_id}: {exc}")
        return {}


def format_profile_block(profile: dict) -> str:
    """
    Render the profile dict as a concise labelled block for injection into LLM prompts.
    Returns an empty string when the profile is empty.
    """
    if not profile:
        return ""

    lines = ["NONPROFIT PROFILE:"]
    _label = {
        "name": "Name",
        "slogan": "Slogan",
        "description": "Description",
        "keywords": "Keywords",
        "address": "Address",
        "city": "City",
        "state": "State",
        "zipcode": "ZIP",
        "country": "Country",
        "location": "Location",
        "website_url": "Website",
        "donation_url": "Donation page",
        "logo_url": "Logo",
        "banner_url": "Banner image",
        "rating": "Rating",
        "latitude": "Latitude",
        "longitude": "Longitude",
    }
    for key in _FIELDS:
        if key == "location":
            continue  # PostGIS geometry — lat/longitude fields already cover coordinates
        val = profile.get(key)
        if val is None or val == "":
            continue
        # rating is JSONB — render as string only if it's a simple scalar-like value
        if key == "rating" and isinstance(val, dict):
            continue
        label = _label.get(key, key)
        lines.append(f"  {label}: {val}")

    return "\n".join(lines)
