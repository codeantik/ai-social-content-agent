"""Per-user daily generation limit tracker backed by a local JSON file."""

import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path

DATA_DIR = Path("data")
USAGE_FILE = DATA_DIR / "usage.json"
DAILY_LIMIT = int(os.getenv("DAILY_GENERATION_LIMIT", "3"))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load() -> dict:
    if not USAGE_FILE.exists():
        return {}
    with open(USAGE_FILE, encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(USAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_usage_today(uid: str) -> int:
    """Return how many generations this uid has used today."""
    today = date.today().isoformat()
    data = _load()
    return data.get(uid, {}).get(today, 0)


def is_limit_reached(uid: str) -> bool:
    return get_usage_today(uid) >= DAILY_LIMIT


def record_generation(uid: str) -> None:
    """Increment today's count for the given uid."""
    today = date.today().isoformat()
    data = _load()
    user = data.setdefault(uid, {})
    user[today] = user.get(today, 0) + 1
    _save(data)


def reset_time_str() -> str:
    """Human-readable string for when the daily limit resets (next midnight)."""
    tomorrow_midnight = datetime.combine(
        date.today() + timedelta(days=1), datetime.min.time()
    )
    return tomorrow_midnight.strftime("%B %d at 12:00 AM")


def remaining(uid: str) -> int:
    """Generations left today for this uid."""
    return max(0, DAILY_LIMIT - get_usage_today(uid))
