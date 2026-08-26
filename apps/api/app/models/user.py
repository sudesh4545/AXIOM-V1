"""User — AXIOM ka operator (customer ka team member).

Dhyan do: yeh AXIOM **console** ka user hai, customer ke product ka end-user
nahi. End-users events mein `distinct_id` string ke roop mein aate hain, unki
apni table nahi hai — kyunki AXIOM unka PII store nahi karna chahta.

Yeh privacy decision hai jo Reality Gate ke "privacy/security impact" check ko
support karta hai.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, enum_column
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.organization import Organization


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_user_org_email"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Email organization ke andar unique hai. Globally unique **nahi** rakha
    # kyunki ek consultant do different startups ke saath kaam kar sakta hai
    # aur dono orgs mein wahi email use karega.
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)

    role: Mapped[UserRole] = mapped_column(
        enum_column(UserRole),
        nullable=False,
        default=UserRole.VIEWER,
    )

    # Password hash Day 4 (auth milestone) mein add hoga. Column abhi nullable
    # rakha hai taaki seed/demo users bina credentials ke ban sakein aur baad
    # mein migration simple rahe.
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    organization: Mapped["Organization"] = relationship(back_populates="users")

    @property
    def can_approve_experiments(self) -> bool:
        """Experiment approval gate.

        AXIOM ka non-negotiable rule: live experiment se pehle human approval.
        Yeh property us rule ka code-level enforcement point hai.
        """
        return self.is_active and self.role.can_approve_experiments

    @property
    def first_name(self) -> str:
        return self.full_name.split(" ")[0] if self.full_name else ""

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<User {self.email} ({self.role})>"
