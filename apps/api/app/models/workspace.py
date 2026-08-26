"""Workspace — ek organization ke andar ka isolated data boundary.

Ek B2B SaaS startup ke paas ho sakta hai:
- "Acme Cloud – Production" (real users, real revenue)
- "Acme Cloud – Sandbox" (experiment testing)

Events, funnels, experiments aur decision receipts sab workspace level pe
scoped hote hain. Isse ek team production ko chhue bina AXIOM try kar sakti
hai — jo naye customer ke trust ke liye bahut important hai.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, enum_column
from app.models.enums import WorkspaceEnvironment

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.organization import Organization


class Workspace(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        # Slug sirf organization ke andar unique hai, globally nahi. Do
        # different companies dono "production" naam rakh sakti hain.
        UniqueConstraint("organization_id", "slug", name="uq_workspace_org_slug"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        # `ondelete="CASCADE"` database level pe hai, sirf ORM level pe nahi.
        # Agar koi direct SQL se organization delete kare to orphan workspaces
        # peeche nahi chhootni chahiye.
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)

    environment: Mapped[WorkspaceEnvironment] = mapped_column(
        enum_column(WorkspaceEnvironment),
        nullable=False,
        default=WorkspaceEnvironment.PRODUCTION,
    )

    # Customer ka business objective, AXIOM ka core input.
    # Example: "Increase paid conversion from 14% to 20% in 60 days."
    # Day 12+ mein hypothesis engine isko structured objective banayega.
    objective: Mapped[str | None] = mapped_column(String(500), nullable=True)

    organization: Mapped["Organization"] = relationship(back_populates="workspaces")
    events: Mapped[list["Event"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        # `lazy="raise"` deliberate hai: events crore mein ho sakte hain.
        # Accidentally `workspace.events` likhne se poori table memory mein
        # load ho jaayegi. Isliye SQLAlchemy ko error throw karne ko kaha hai —
        # events ko always explicit paginated query se padho.
        lazy="raise",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Workspace {self.slug} ({self.environment})>"
