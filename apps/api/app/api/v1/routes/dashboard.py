"""Dashboard endpoint — Day 1 UI ka data source."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.api.deps import CurrentUserDep, SessionDep, WorkspaceDep
from app.schemas.dashboard import DashboardResponse
from app.services.demo_dashboard import build_dashboard

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse, summary="Overview dashboard")
async def get_dashboard(
    workspace: WorkspaceDep,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> DashboardResponse:
    """Poora overview screen ek consistent snapshot mein.

    Ek endpoint jaan-boojh kar rakha hai (6 chhote endpoints nahi): dashboard
    ke saare numbers ek hi `generated_at` moment ke hone chahiye. Alag-alag
    calls se metrics aur funnel do different instants ka data dikhate, aur
    user ko samajh nahi aata ki woh match kyun nahi kar rahe.

    Abhi values demo seed data hain — response ka `dataSource` aur
    `dataSourceNote` yeh saaf batate hain.
    """
    return await build_dashboard(
        session,
        workspace,
        current_user,
        now=datetime.now(timezone.utc),
    )
