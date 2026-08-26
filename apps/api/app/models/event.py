"""Event — AXIOM ka raw input. Poora system inhi rows pe khada hai.

Yeh table append-only hai: events kabhi update ya delete nahi hote. Kyun?
Kyunki AXIOM ka core claim "auditable Decision Receipt" hai. Agar underlying
events mutate ho sakte hain, to koi bhi purana receipt reproduce nahi kiya
ja sakta aur audit trail bekaar hai.

Isse "event sourcing" ka fayda milta hai: koi bhi metric kisi bhi past date
pe dobara compute kiya ja sakta hai.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONColumn, UUIDPrimaryKeyMixin, enum_column
from app.models.enums import EventType

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class Event(UUIDPrimaryKeyMixin, Base):
    """Ek product ya revenue event.

    `TimestampMixin` deliberately use **nahi** kiya — events immutable hain,
    unka `updated_at` hona hi logical galti hai. Iski jagah `occurred_at` aur
    `ingested_at` hain.
    """

    __tablename__ = "events"
    __table_args__ = (
        # --- Idempotency ---
        # Network retries duplicate events bhejti hain. Ek retry se activation
        # rate galat ho jaayega. Client ek `idempotency_key` bhejta hai; hum
        # duplicate ko silently drop kar dete hain.
        # Workspace ke andar scoped hai, globally nahi — do customers ka
        # counter collide nahi hona chahiye.
        UniqueConstraint("workspace_id", "idempotency_key", name="uq_event_workspace_idempotency"),
        # --- Query patterns ke liye indexes ---
        # 1. Time-range scans: "last 30 days ka MRR chart"
        Index("ix_event_workspace_occurred", "workspace_id", "occurred_at"),
        # 2. Funnel step counts: "kitne users ne 'trial_started' kiya"
        #    Composite index isliye ki funnel ka har step ek aisi hi query hai.
        Index("ix_event_workspace_name_occurred", "workspace_id", "name", "occurred_at"),
        # 3. Single-user journey: "is user ne activate kyun nahi kiya"
        Index("ix_event_workspace_distinct", "workspace_id", "distinct_id"),
    )

    # --- Tenant scoping ---
    # `organization_id` yahan denormalized hai (workspace se join karke bhi
    # mil sakta tha). Deliberate trade-off: har analytics query ko tenant
    # filter ke liye join karna padta, aur crore rows pe woh join mehnga hai.
    # Ek extra column ki cost isse kam hai.
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    # --- Event identity ---
    # snake_case convention: "signup_completed", "trial_started", "invoice_paid"
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    event_type: Mapped[EventType] = mapped_column(
        enum_column(EventType),
        nullable=False,
        default=EventType.PRODUCT,
    )

    # Customer ke end-user ka pseudonymous id. AXIOM jaan-boojh kar email/naam
    # store nahi karta — privacy surface chhota rakhta hai.
    distinct_id: Mapped[str] = mapped_column(String(200), nullable=False)

    # --- Timing ---
    # Do alag timestamps kyun? Kyunki client offline ho sakta hai, ya batch
    # backfill ho sakta hai. Agar sirf ek timestamp hota to hum "kal ka event
    # aaj mila" wali situation ko detect hi nahi kar paate — aur woh
    # experiment analysis ko chupke se corrupt kar deta.
    #   occurred_at = customer ke system mein kab hua
    #   ingested_at = AXIOM ne kab receive kiya
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # --- Payload ---
    # Har SaaS product ke events ka shape alag hota hai. Rigid columns forcing
    # se integration painful ho jaata. Postgres pe yeh JSONB hai, to bad mein
    # in properties pe GIN index bhi lag sakta hai.
    properties: Mapped[dict[str, Any]] = mapped_column(
        JSONColumn,
        nullable=False,
        default=dict,
    )

    # --- Money ---
    # `Numeric`, **float nahi**. Float binary floating point hai: 0.1 + 0.2 !=
    # 0.3. Paise ke saath yeh silently galat MRR aur galat churn deta hai.
    # `Numeric` exact decimal arithmetic karta hai.
    revenue_amount_inr: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2),
        nullable=True,
    )

    # Client-supplied dedup token. Nullable hai kyunki simple integrations ise
    # nahi bhejenge; tab hum dedup nahi kar sakte aur yeh honest limitation hai.
    idempotency_key: Mapped[str | None] = mapped_column(String(200), nullable=True)

    workspace: Mapped["Workspace"] = relationship(back_populates="events")

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Event {self.name} {self.distinct_id} @ {self.occurred_at.isoformat()}>"
