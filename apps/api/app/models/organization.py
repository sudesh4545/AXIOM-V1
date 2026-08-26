"""Organization — tenant ki root entity.

Multi-tenancy ka model: har row jo customer data rakhti hai, usme
`organization_id` hota hai. Isse "shared database, shared schema, row-level
tenant column" pattern banta hai.

Kyun yeh pattern (interview answer):
- **Database-per-tenant**: sabse strong isolation, par 200 customers pe 200
  migrations chalani padengi. V1 ke liye operational overhead bahut zyada.
- **Schema-per-tenant**: beech ka raasta, par Postgres connection pooling aur
  Alembic ke saath messy ho jaata hai.
- **Row-level tenant column** (yeh): sabse simple aur scalable, par discipline
  chahiye — har query mein tenant filter lagana **mandatory** hai. Ek bhi
  missing `WHERE organization_id = ...` cross-tenant data leak hai.

Isliye tenant filter ko hum repository/dependency layer mein enforce karte
hain, individual route handlers pe nahi chhodte.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, enum_column
from app.models.enums import OrganizationPlan

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.workspace import Workspace


class Organization(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)

    # Slug URL-safe identifier hai (`/orgs/acme-cloud`). Globally unique.
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)

    plan: Mapped[OrganizationPlan] = mapped_column(
        enum_column(OrganizationPlan),
        nullable=False,
        default=OrganizationPlan.PILOT,
    )

    # Kis industry ka customer hai — V1 B2B SaaS pe focused hai, par yeh field
    # baad mein benchmark comparison ke liye kaam aayegi.
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)

    workspaces: Mapped[list["Workspace"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    users: Mapped[list["User"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Organization {self.slug}>"
