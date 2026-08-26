"""Event ingestion endpoints — AXIOM ka entry point."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import SessionDep, WorkspaceDep
from app.core.config import get_settings
from app.schemas.events import EventBatchIn, EventIngestResponse, EventStats
from app.services.event_service import get_event_stats, ingest_events

router = APIRouter(prefix="/workspaces/{workspace_id}/events", tags=["events"])
settings = get_settings()


@router.post(
    "",
    response_model=EventIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest a batch of product or revenue events",
)
async def ingest(
    workspace: WorkspaceDep,
    session: SessionDep,
    payload: EventBatchIn,
) -> EventIngestResponse:
    """Events store karo, duplicates dedupe karke.

    **202 Accepted, 201 Created nahi.** Kyunki response poora "created"
    guarantee nahi karta — kuch events duplicate ho sakte hain aur skip ho
    sakte hain. 202 semantically sahi hai: batch accept ho gaya, aur breakdown
    response body mein hai.
    """
    if len(payload.events) > settings.max_events_per_request:
        raise HTTPException(
            # `HTTP_413_CONTENT_TOO_LARGE` — purana naam
            # `HTTP_413_REQUEST_ENTITY_TOO_LARGE` Starlette mein deprecated hai.
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=(
                f"Batch mein maximum {settings.max_events_per_request} events allowed hain, "
                f"{len(payload.events)} mile. Batch ko chhota karke bhejein."
            ),
        )

    return await ingest_events(session, workspace, payload)


@router.get(
    "/stats",
    response_model=EventStats,
    summary="Ingestion summary for this workspace",
)
async def stats(workspace: WorkspaceDep, session: SessionDep) -> EventStats:
    """Verify karo ki events actually pahunch rahe hain.

    SDK integrate karte waqt yeh sabse zaroori endpoint hai — iske bina
    developer ko yeh guess karna padta hai ki uska data store hua ya nahi.
    """
    return await get_event_stats(session, workspace)
