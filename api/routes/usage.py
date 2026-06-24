"""GET /usage — remaining-today for the sidebar progress bar."""

from fastapi import APIRouter, Depends

from agent.usage import DAILY_LIMIT, get_usage_today, remaining
from api.deps import get_client_ip

router = APIRouter()


@router.get("/usage")
def usage(ip: str = Depends(get_client_ip)) -> dict:
    return {
        "used": get_usage_today(ip),
        "limit": DAILY_LIMIT,
        "remaining": remaining(ip),
    }
