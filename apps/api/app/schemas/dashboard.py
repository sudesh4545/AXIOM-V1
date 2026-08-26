"""Typed dashboard contract.

Yeh file AXIOM ke frontend aur backend ke beech ka **single source of truth**
hai. Frontend ke TypeScript types (`apps/web/app/lib/axiom-contract.ts`) isko
exactly mirror karte hain.

Day 1 pe dashboard ke saare numbers `page.tsx` mein hardcoded the. Ab woh is
contract ke through aate hain — matlab jab Day 8-11 pe real funnel computation
aayegi, frontend ko chhune ki zaroorat nahi padegi. Sirf service layer badlega.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.models.enums import (
    DataSource,
    DecisionOutcome,
    ExperimentStatus,
    MetricUnit,
    RiskLevel,
    SeverityLevel,
    TrendDirection,
    WorkspaceEnvironment,
)
from app.schemas.common import APISchema, UTCDateTime

# ---------------------------------------------------------------------------
# Workspace header
# ---------------------------------------------------------------------------


class WorkspaceSummary(APISchema):
    id: uuid.UUID
    name: str
    slug: str
    environment: WorkspaceEnvironment
    organization_name: str
    objective: str | None = None


class SystemStatus(APISchema):
    """Top-right "Live / All systems healthy" indicator.

    Yeh AXIOM ke apne health ke baare mein hai, customer ke business ke baare
    mein nahi. Agar ingestion ruk jaaye to yeh `degraded` hoga — user ko pata
    hona chahiye ki dashboard stale data dikha raha hai.
    """

    state: str = Field(description="healthy | degraded | down")
    label: str
    message: str


# ---------------------------------------------------------------------------
# KPI cards
# ---------------------------------------------------------------------------


class MetricCard(APISchema):
    """Ek KPI card.

    `display_value` aur `raw_value` dono kyun bhej rahe hain?
    Formatting business logic hai, presentation nahi — "₹8.4L" Indian lakh
    convention hai jo `Intl.NumberFormat` easily nahi deta. Server pe format
    karne se web, future mobile app aur email reports sab same string
    dikhayenge. `raw_value` saath hai charts, sorting aur thresholds ke liye.
    """

    key: str
    label: str
    display_value: str
    raw_value: float
    unit: MetricUnit
    delta_pct: float
    direction: TrendDirection
    is_improvement: bool = Field(
        description=(
            "Direction se alag hai. Churn neeche jaana `direction=down` par "
            "`is_improvement=True` hai. Frontend colour isse decide karta hai, "
            "arrow direction se nahi."
        )
    )
    tone: str = Field(description="Visual accent: cyan | violet | blue | pink")
    comparison_label: str
    spark: list[float] = Field(description="Sparkline ke normalised 0-100 points")


# ---------------------------------------------------------------------------
# Growth chart
# ---------------------------------------------------------------------------


class GrowthPoint(APISchema):
    label: str
    value: float
    occurred_on: UTCDateTime


class GrowthSeries(APISchema):
    metric_key: str
    metric_label: str
    range_label: str
    unit: MetricUnit
    current_display: str
    # `axis_max` bhejna zaroori hai taaki frontend bar height nikaal sake
    # (value / axis_max). Iske bina frontend ko max guess karna padta aur
    # data badalne pe chart chup-chaap galat scale dikhata.
    axis_max: float
    axis_labels: list[str]
    x_axis_labels: list[str]
    points: list[GrowthPoint]


# ---------------------------------------------------------------------------
# Bottleneck funnel
# ---------------------------------------------------------------------------


class FunnelStep(APISchema):
    label: str
    user_count: int
    # Do alag conversion numbers — inko confuse karna funnel analysis ki sabse
    # common galti hai:
    conversion_pct: float = Field(description="Funnel ke pehle step ke % mein")
    step_conversion_pct: float = Field(description="Turant pichhle step ke % mein")
    width_pct: float = Field(description="Bar ki visual width")
    is_bottleneck: bool = False


class Bottleneck(APISchema):
    stage: str
    severity: SeverityLevel
    summary: str
    drop_off_pct: float
    steps: list[FunnelStep]
    evidence_window_days: int


# ---------------------------------------------------------------------------
# Recommendation + Reality Gate
# ---------------------------------------------------------------------------


class RealityGateCheck(APISchema):
    """Ek deterministic policy check.

    Yeh checks AI nahi karta. AI proposal deta hai; yeh checks code hain jo
    haan/na bolte hain. Isse LLM hallucination production tak nahi pahunchti.
    """

    label: str
    passed: bool
    detail: str


class RealityGate(APISchema):
    passed: bool
    requires_human_approval: bool = Field(
        default=True,
        description="V1 mein always True — koi bhi live experiment human approval ke bina nahi.",
    )
    checks: list[RealityGateCheck]


class Recommendation(APISchema):
    id: uuid.UUID
    title: str
    description: str
    focus_metric: str
    predicted_uplift_pct: float
    confidence_pct: float
    risk_level: RiskLevel
    traffic_pct: float
    duration_days: int
    # Evidence har proposal ke saath mandatory hai. Bina evidence ka
    # recommendation "advice" hai, aur AXIOM ka poora point advice se aage
    # jaana hai.
    evidence: list[str]
    assumptions: list[str]
    reality_gate: RealityGate
    status: ExperimentStatus


# ---------------------------------------------------------------------------
# Active experiments
# ---------------------------------------------------------------------------


class ActiveExperiment(APISchema):
    id: uuid.UUID
    name: str
    focus_metric: str
    status: ExperimentStatus
    progress_pct: float
    observed_lift_pct: float
    traffic_pct: float
    guardrail_breached: bool = False
    # Sequential testing ke bina roz "significance" check karna false positives
    # deta hai. V1 mein hum naive p-value **claim nahi** karte; yeh flag
    # honestly batata hai ki result abhi conclusive nahi hai.
    is_conclusive: bool = False


# ---------------------------------------------------------------------------
# Decision receipts
# ---------------------------------------------------------------------------


class DecisionReceiptSummary(APISchema):
    id: uuid.UUID
    title: str
    decided_at: UTCDateTime
    decided_at_display: str
    outcome: DecisionOutcome
    impact_pct: float
    summary: str


# ---------------------------------------------------------------------------
# Top-level response
# ---------------------------------------------------------------------------


class DashboardResponse(APISchema):
    """Poora overview screen ka payload — ek request mein.

    Kyun ek endpoint, chhote-chhote 6 endpoints nahi? Kyunki dashboard ek
    consistent snapshot hai. Agar 6 alag calls hotin to metrics 10:00:01 ka
    data dikhate aur funnel 10:00:03 ka — aur user ko samajh nahi aata ki
    numbers match kyun nahi ho rahe. Ek payload = ek `generated_at`.
    """

    workspace: WorkspaceSummary
    generated_at: UTCDateTime
    data_source: DataSource
    data_source_note: str = Field(
        description=(
            "Human-readable honesty statement. Frontend ise badge/tooltip mein "
            "dikhata hai taaki demo data kabhi real data jaisa na lage."
        )
    )
    operator_first_name: str
    system_status: SystemStatus
    metrics: list[MetricCard]
    growth: GrowthSeries
    bottleneck: Bottleneck
    recommendation: Recommendation
    experiments: list[ActiveExperiment]
    decisions: list[DecisionReceiptSummary]
