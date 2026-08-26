"""Shared FastAPI dependencies.

**Yahan tenant isolation enforce hoti hai.** Row-level multi-tenancy ka sabse
bada risk hai ki koi route handler `WHERE organization_id = ...` bhoolta hai.
Isse bachne ka tareeka: workspace lookup ko ek hi dependency mein rakho, aur
routes ko kabhi raw id se query karne hi na do.

Day 4 (auth milestone) pe `get_current_user` real JWT/session verification
karega. Abhi woh explicit header se aata hai aur clearly TODO marked hai —
production mein yeh authentication **nahi** hai.
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
        Header(description="TEMPORARY: operator email. Day 4 pe real auth se replace hoga."),
    ] = None,
) -> User | None:
    """Current operator.

    !!! WARNING — YEH AUTHENTICATION NAHI HAI !!!
    Ek header se email padhna trivially spoofable hai. Yeh sirf Day 2 ka
    placeholder hai taaki dashboard "Good morning, <naam>" dikha sake jab tak
    Day 4 ka auth milestone nahi aata.

    Isse production mein kabhi deploy nahi karna hai. Day 4 pe yeh function
    signed session/JWT verify karega.
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
