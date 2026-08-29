"""Shared FastAPI dependencies.

**Yahan tenant isolation enforce hoti hai.** Row-level multi-tenancy ka sabse
bada risk hai ki koi route handler `WHERE organization_id = ...` bhoolta hai.
Isse bachne ka tareeka: workspace lookup ko ek hi dependency mein rakho, aur
routes ko kabhi raw id se query karne hi na do.

This module belongs to the optional local-only FastAPI compatibility service.
Its email header personalises local demo responses; it is not authentication.
`app.main` disables all legacy workspace data routes outside the local environment,
so this compatibility path cannot be mistaken for the authenticated Sites API.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.models.user import User
from app.models.workspace import Workspace

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_workspace(
    workspace_id: Annotated[uuid.UUID, Path(description="Workspace UUID")],
    session: SessionDep,
) -> Workspace:
    """Workspace load karo ya 404 do.

    `selectinload(Workspace.organization)` deliberate hai. Bina iske
    `workspace.organization.name` padhne pe async context mein lazy load
    trigger hoga, jo SQLAlchemy async mein `MissingGreenlet` error deta hai.
    Async ORM ka yeh sabse common trap hai — relationships eagerly load karo.
    """
    result = await session.execute(
        select(Workspace)
        .options(selectinload(Workspace.organization))
        .where(Workspace.id == workspace_id)
    )
    workspace = result.scalar_one_or_none()

    if workspace is None:
        # 404 dete hain, 403 nahi — chahe workspace exist karta ho par kisi
        # aur tenant ka ho. 403 dena hi bata deta hai ki woh id valid hai,
        # jo enumeration attack ko madad karta hai.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    return workspace


WorkspaceDep = Annotated[Workspace, Depends(get_workspace)]


async def get_current_user(
    session: SessionDep,
    x_axiom_user_email: Annotated[
        str | None,
        Header(description="Local compatibility-service personalisation email; not authentication."),
    ] = None,
) -> User | None:
    """Current operator.

    !!! WARNING — YEH AUTHENTICATION NAHI HAI !!!
    Ek header se email padhna trivially spoofable hai. Isliye yeh sirf local
    compatibility service mein personalisation deta hai. Non-local workspace
    routes application middleware se disabled hain; working Sites API apni
    trusted hosted identity aur server-side membership checks use karti hai.
    """
    if not x_axiom_user_email:
        return None

    result = await session.execute(
        select(User).where(
            User.email == x_axiom_user_email.strip().lower(),
            User.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()


CurrentUserDep = Annotated[User | None, Depends(get_current_user)]
