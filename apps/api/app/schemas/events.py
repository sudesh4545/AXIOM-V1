"""Event ingestion contract.

Yeh AXIOM ka entry point hai. Sab kuch — funnels, bottlenecks, experiment
measurement — inhi events pe based hai. Isliye validation yahan strict hai:
garbage in, garbage decisions out.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from pydantic import Field, field_validator, model_validator

from app.models.enums import EventType
from app.schemas.common import APISchema, UTCDateTime

# Event names snake_case mein enforce karte hain. Ek hi cheez ke liye
# "SignupCompleted", "signup completed" aur "signup_completed" teeno aana
# analytics ko chupke se tod deta hai — funnel step count aadha dikhega.
EVENT_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,118}[a-z0-9]$")

# Future events reject karte hain (thoda clock-skew allowance ke saath).
# Ek galat client clock "next month" ke events bhej kar poore time-series
# chart ko tod sakta hai.
MAX_CLOCK_SKEW = timedelta(minutes=5)

# Kitna purana event accept karein. Backfill legitimate hai, par 2 saal
# purana event silently aane se experiment results corrupt ho sakte hain.
MAX_EVENT_AGE = timedelta(days=400)


class EventIn(APISchema):
    """Ek incoming event."""

    name: str = Field(min_length=3, max_length=120, examples=["trial_started"])
    distinct_id: str = Field(
        min_length=1,
        max_length=200,
        description="Customer ke end-user ka pseudonymous id. Email/PII nahi bhejein.",
    )
    event_type: EventType = EventType.PRODUCT
    occurred_at: datetime | None = Field(
        default=None,
        description="Event customer ke system mein kab hua. Na do to server time use hoga.",
    )
    properties: dict[str, Any] = Field(default_factory=dict)
    revenue_amount_inr: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    idempotency_key: str | None = Field(
        default=None,
        max_length=200,
        description="Retry-safe dedup token. Same key dobara bhejne pe event duplicate nahi hoga.",
    )

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        normalised = value.strip().lower()
        if not EVENT_NAME_PATTERN.match(normalised):
            raise ValueError(
                "Event name snake_case hona chahiye, lowercase letter se shuru, "
                "e.g. 'trial_started'"
            )
        return normalised

    @field_validator("occurred_at")
    @classmethod
    def _validate_occurred_at(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None

        # Naive datetime ko UTC maan lete hain. Reject karna zyada strict hota
        # aur bahut se SDKs naive ISO strings bhejte hain.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        if value > now + MAX_CLOCK_SKEW:
            raise ValueError("occurred_at future mein nahi ho sakta")
        if value < now - MAX_EVENT_AGE:
            raise ValueError("occurred_at bahut purana hai (400 din se zyada)")
        return value

    @model_validator(mode="after")
    def _validate_revenue_consistency(self) -> "EventIn":
        """Revenue events ke paas amount hona chahiye.

        Bina amount ka revenue event MRR ko silently kam dikhayega — aur woh
        exactly wo tarah ka bug hai jo demo mein pakda nahi jaata par pilot
        mein customer ka trust todta hai.
        """
        if self.event_type is EventType.REVENUE and self.revenue_amount_inr is None:
            raise ValueError("revenue event ke saath revenue_amount_inr dena zaroori hai")
        if self.event_type is not EventType.REVENUE and self.revenue_amount_inr is not None:
            raise ValueError("revenue_amount_inr sirf event_type='revenue' ke saath allowed hai")
        return self


class EventBatchIn(APISchema):
    """Batch ingestion request.

    Batch endpoint kyun? Kyunki per-event HTTP request high-volume product ke
    liye impractical hai. Batch = kam network overhead, kam DB round-trips.
    """

    events: list[EventIn] = Field(min_length=1)


class EventIngestResponse(APISchema):
    """Ingestion ka result.

    `accepted` aur `duplicates` alag report karte hain. Client ko pata hona
    chahiye ki uska retry safely deduplicate hua, silently gum nahi hua.
    """

    workspace_id: uuid.UUID
    received: int
    accepted: int
    duplicates: int
    received_at: UTCDateTime


class EventOut(APISchema):
    """Stored event, debugging aur verification ke liye."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    event_type: EventType
    distinct_id: str
    occurred_at: UTCDateTime
    ingested_at: UTCDateTime
    properties: dict[str, Any]
    revenue_amount_inr: Decimal | None


class EventStats(APISchema):
    """Workspace ka ingestion summary — verify karne ke liye ki data pahunch raha hai."""

    workspace_id: uuid.UUID
    total_events: int
    unique_users: int
    event_names: list[str]
    first_event_at: UTCDateTime | None
    last_event_at: UTCDateTime | None
