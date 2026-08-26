"""Workspace discovery endpoints.

Frontend ko koi UUID hardcode nahi karni chahiye. Woh pehle workspaces list
karta hai, phir pehla (ya user-selected) workspace use karta hai. Day 1 ka
"Acme Cloud" workspace switcher isi endpoint se real ban jaayega.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import SessionDep, WorkspaceDep
from app.models.workspace import Workspace
from app.schemas.dashboard import WorkspaceSummary

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceSummary], summary="List workspaces")
async def list_workspaces(session: SessionDep) -> list[WorkspaceSummary]:
    """Sab accessible workspaces.

    Day 4 pe yeh current user ke organization se filter hoga. Abhi auth nahi
    hai, isliye yeh seeded demo workspaces return karta hai — aur yeh
    limitation deliberately documented hai, chhupayi nahi gayi.
    """
    result = await session.execute(
        select(Workspace)
        .options(selectinload(Workspace.organization))
        .order_by(Workspace.created_at)
    )
    workspaces = result.scalars().all()

    return [
        WorkspaceSummary(
            id=workspace.id,
            name=workspace.name,
            slug=workspace.slug,
            environment=workspace.environment,
            organization_name=workspace.organization.name,
            objective=workspace.objective,
        )
        for workspace in workspaces
    ]


@router.get("/{workspace_id}", response_model=WorkspaceSummary, summary="Get one workspace")
async def get_workspace_detail(workspace: WorkspaceDep) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        name=workspace.name,
        slug=workspace.slug,
        environment=workspace.environment,
        organization_name=workspace.organization.name,
        objective=workspace.objective,
    )
