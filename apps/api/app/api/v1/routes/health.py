"""Health / readiness endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.config import get_settings
from app.db.session import check_database_connection, engine
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health", response_model=HealthResponse, summary="Service health")
async def health() -> HealthResponse:
    """Liveness + readiness.

    `status` always "ok" hai agar yeh handler chala — matlab process zinda hai.
    `database_connected` alag field hai. Inko mila dena galti hoti: agar
    database down hone pe hum 503 dete, to orchestrator container ko restart
    karta rehta, jabki process bilkul theek hai aur problem database mein hai.
    """
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        database_connected=await check_database_connection(),
        database_dialect=engine.dialect.name,
        timestamp=datetime.now(timezone.utc),
    )
