"""Demo dashboard builder.

**Yeh file jaan-boojh kar demo data return karti hai.** Numbers Day 1 ke locked
design reference se match karte hain. Har response mein `data_source` aur
`data_source_note` saaf batate hain ki yeh seed data hai.

PROJECT_CONTEXT ka rule hai: "No fabricated metrics, integrations, experiments
or customer results." Isliye hum demo data ko real batane ki koshish nahi
karte — API level pe hi label lagate hain, taaki frontend, screenshot ya demo
mein yeh confusion na ho.

Day 8-11 pe `build_dashboard` ke andar ke hardcoded blocks ek-ek karke real
SQL aggregations se replace honge. **Contract nahi badlega** — isliye frontend
ko dobara likhne ki zaroorat nahi padegi. Yeh is design ka poora point hai.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    DataSource,
    DecisionOutcome,
    ExperimentStatus,
    MetricUnit,
    RiskLevel,
    SeverityLevel,
    TrendDirection,
)
from app.models.event import Event
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.dashboard import (
    ActiveExperiment,
    Bottleneck,
    DashboardResponse,
    DecisionReceiptSummary,
    FunnelStep,
    GrowthPoint,
    GrowthSeries,
    MetricCard,
    RealityGate,
    RealityGateCheck,
    Recommendation,
    SystemStatus,
    WorkspaceSummary,
)
from app.services.formatting import format_inr_compact, format_percent

# Demo ids stable rakhne ke liye uuid5 use karte hain (random uuid4 nahi).
# Isse frontend React keys, caching aur "same experiment" comparison reliably
# kaam karte hain — har request pe naya id nahi milta.
_DEMO_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://axiom.dev/demo")


def _demo_id(workspace_id: uuid.UUID, slug: str) -> uuid.UUID:
    return uuid.uuid5(_DEMO_NAMESPACE, f"{workspace_id}:{slug}")


# MRR curve, ₹10L axis ke percentage mein. Day 1 chart se liya gaya hai.
_MRR_CURVE_PCT = [20, 29, 38, 33, 39, 48, 43, 52, 51, 64, 54, 61, 70, 67, 74, 72, 80, 77, 84]
_MRR_AXIS_MAX = 1_000_000.0

_SPARKLINES: dict[str, list[float]] = {
    "cyan": [14, 20, 17, 29, 24, 39, 31, 46, 41, 53],
    "violet": [12, 19, 16, 28, 25, 36, 30, 44, 38, 53],
    "blue": [10, 17, 14, 26, 20, 35, 29, 46, 38, 55],
    "pink": [50, 43, 46, 36, 40, 30, 34, 22, 26, 14],
}

# Funnel ke absolute user counts. Percentages inse **derive** hote hain,
# hardcode nahi — warna edit karte waqt woh chupke se inconsistent ho jaate.
_FUNNEL_COUNTS: list[tuple[str, int, float]] = [
    # (label, user_count, visual_width_pct)
    ("Signed up", 12_846, 100.0),
    ("Started trial", 5_632, 78.0),
    ("Activated", 1_659, 56.0),
    ("Invited teammate", 876, 37.0),
]


async def build_dashboard(
    session: AsyncSession,
    workspace: Workspace,
    operator: User | None,
    *,
    now: datetime,
) -> DashboardResponse:
    """Poora overview payload banao.

    `now` parameter ke roop mein inject kiya hai, andar `datetime.now()` call
    nahi kiya. Isse tests deterministic ho jaate hain — time-dependent code ka
    test likhna warna flaky hota hai.
    """
    ingested_count = await _count_events(session, workspace.id)

    return DashboardResponse(
        workspace=WorkspaceSummary(
            id=workspace.id,
            name=workspace.name,
            slug=workspace.slug,
            environment=workspace.environment,
            organization_name=workspace.organization.name,
            objective=workspace.objective,
        ),
        generated_at=now,
        data_source=DataSource.DEMO_SEED,
        data_source_note=_data_source_note(ingested_count),
        operator_first_name=operator.first_name if operator else "there",
        system_status=SystemStatus(
            state="healthy",
            label="Live",
            message="All systems healthy",
        ),
        metrics=_build_metrics(),
        growth=_build_growth(now),
        bottleneck=_build_bottleneck(),
        recommendation=_build_recommendation(workspace.id),
        experiments=_build_experiments(workspace.id),
        decisions=_build_decisions(workspace.id, now),
    )


async def _count_events(session: AsyncSession, workspace_id: uuid.UUID) -> int:
    """Is workspace mein kitne real events ingest ho chuke hain."""
    result = await session.execute(
        select(func.count()).select_from(Event).where(Event.workspace_id == workspace_id)
    )
    return int(result.scalar_one())


def _data_source_note(ingested_count: int) -> str:
    """Honesty statement jo frontend badge mein dikhta hai."""
    if ingested_count == 0:
        return (
            "Displayed metrics are AXIOM demo seed data. No product events have "
            "been ingested into this workspace yet."
        )
    return (
        f"Displayed metrics are AXIOM demo seed data. {ingested_count:,} real "
        "events have been ingested and are stored, but funnel and KPI "
        "computation from live events is scheduled for the analytics milestone."
    )


# ---------------------------------------------------------------------------
# KPI cards
# ---------------------------------------------------------------------------


def _build_metrics() -> list[MetricCard]:
    return [
        MetricCard(
            key="mrr",
            label="MRR",
            display_value=format_inr_compact(840_000),
            raw_value=840_000.0,
            unit=MetricUnit.INR,
            delta_pct=12.4,
            direction=TrendDirection.UP,
            is_improvement=True,
            tone="cyan",
            comparison_label="vs 7d prior",
            spark=_SPARKLINES["cyan"],
        ),
        MetricCard(
            key="activation_rate",
            label="Activation",
            display_value=format_percent(38.6),
            raw_value=38.6,
            unit=MetricUnit.PERCENT,
            delta_pct=4.2,
            direction=TrendDirection.UP,
            is_improvement=True,
            tone="violet",
            comparison_label="vs 7d prior",
            spark=_SPARKLINES["violet"],
        ),
        MetricCard(
            key="trial_conversion",
            label="Trial Conversion",
            display_value=format_percent(14.8),
            raw_value=14.8,
            unit=MetricUnit.PERCENT,
            delta_pct=2.1,
            direction=TrendDirection.UP,
            is_improvement=True,
            tone="blue",
            comparison_label="vs 7d prior",
            spark=_SPARKLINES["blue"],
        ),
        MetricCard(
            key="churn_rate",
            label="Churn",
            display_value=format_percent(3.2),
            raw_value=3.2,
            unit=MetricUnit.PERCENT,
            delta_pct=-0.6,
            direction=TrendDirection.DOWN,
            # Churn ke liye neeche jaana **accha** hai. Yeh field isliye hai:
            # frontend colour `is_improvement` se decide karta hai, arrow ki
            # direction se nahi. Warna "churn 0.6% gira" laal dikhta.
            is_improvement=True,
            tone="pink",
            comparison_label="vs 7d prior",
            spark=_SPARKLINES["pink"],
        ),
    ]


# ---------------------------------------------------------------------------
# Growth chart
# ---------------------------------------------------------------------------


def _build_growth(now: datetime) -> GrowthSeries:
    """MRR series, `now` pe khatm hone wali.

    Dates `now` se peeche generate hoti hain, hardcoded nahi — taaki demo
    kabhi bhi khola jaaye, chart current dikhe, 3 mahine purana na lage.
    """
    point_count = len(_MRR_CURVE_PCT)
    step_days = 2
    start = now - timedelta(days=step_days * (point_count - 1))

    points: list[GrowthPoint] = []
    for index, pct in enumerate(_MRR_CURVE_PCT):
        occurred_on = start + timedelta(days=step_days * index)
        points.append(
            GrowthPoint(
                label=occurred_on.strftime("%b %d"),
                value=round(_MRR_AXIS_MAX * pct / 100, 2),
                occurred_on=occurred_on,
            )
        )

    # Chart ke neeche 6 sparse x-axis labels — sab 19 labels rakhne se overlap
    # ho jaata hai.
    label_slots = 6
    x_axis_labels = [
        points[round(i * (point_count - 1) / (label_slots - 1))].label
        for i in range(label_slots)
    ]

    return GrowthSeries(
        metric_key="mrr",
        metric_label="MRR",
        range_label="30D",
        unit=MetricUnit.INR,
        current_display=format_inr_compact(points[-1].value),
        axis_max=_MRR_AXIS_MAX,
        axis_labels=["₹10L", "₹7.5L", "₹5L", "₹2.5L", "₹0"],
        x_axis_labels=x_axis_labels,
        points=points,
    )


# ---------------------------------------------------------------------------
# Bottleneck funnel
# ---------------------------------------------------------------------------


def _build_bottleneck() -> Bottleneck:
    """Funnel banao aur sabse kharab step ko bottleneck mark karo.

    Bottleneck **derive** hota hai, hardcode nahi: jis step ka
    `step_conversion_pct` sabse kam hai (pehle step ko chhod kar), wahi
    biggest leak hai.

    Yeh distinction important hai. "Invited teammate" pe sirf 6.8% users
    pahunchte hain, to naive dekhne pe wahi sabse bura lagta hai. Par woh
    kharab isliye hai ki uske pehle ke steps already users kha gaye. Asli leak
    Trial -> Activated hai, jahan 5,632 mein se sirf 1,659 aage badhte hain
    (29.5%). Cumulative percentage dekh kar galat experiment run karna
    experimentation ki sabse common galti hai.
    """
    total = _FUNNEL_COUNTS[0][1]

    steps: list[FunnelStep] = []
    for index, (label, count, width) in enumerate(_FUNNEL_COUNTS):
        previous_count = _FUNNEL_COUNTS[index - 1][1] if index > 0 else count
        steps.append(
            FunnelStep(
                label=label,
                user_count=count,
                conversion_pct=round(count / total * 100, 1),
                step_conversion_pct=round(count / previous_count * 100, 1),
                width_pct=width,
                is_bottleneck=False,
            )
        )

    worst = min(steps[1:], key=lambda step: step.step_conversion_pct)
    worst.is_bottleneck = True
    worst_index = steps.index(worst)
    stage = f"{steps[worst_index - 1].label} → {worst.label}"

    drop_off_pct = round(100 - worst.step_conversion_pct, 1)

    return Bottleneck(
        # `stage` bhi derive ho raha hai. Pehle yahan "Trial → Activation"
        # hardcoded tha — agar funnel badal jaata aur bottleneck kisi doosre
        # step pe shift ho jaata, to label purana hi reh jaata aur dashboard
        # confidently galat stage ka naam dikhata.
        stage=stage,
        severity=_severity_for(drop_off_pct),
        summary=(
            f"{stage}: {steps[worst_index - 1].user_count:,} users reached "
            f"'{steps[worst_index - 1].label}' but only {worst.user_count:,} "
            f"({worst.step_conversion_pct}%) reached '{worst.label}'. This is the "
            "largest single-step drop in the funnel."
        ),
        drop_off_pct=drop_off_pct,
        steps=steps,
        evidence_window_days=30,
    )


def _severity_for(drop_off_pct: float) -> SeverityLevel:
    """Drop-off ko severity band mein map karo.

    Thresholds explicit rakhe hain (magic numbers code mein bikhre nahi) taaki
    baad mein inhe per-customer configurable banaya ja sake.
    """
    if drop_off_pct >= 85:
        return SeverityLevel.CRITICAL
    if drop_off_pct >= 60:
        return SeverityLevel.HIGH
    if drop_off_pct >= 35:
        return SeverityLevel.MEDIUM
    return SeverityLevel.LOW


# ---------------------------------------------------------------------------
# Recommendation + Reality Gate
# ---------------------------------------------------------------------------


def _build_recommendation(workspace_id: uuid.UUID) -> Recommendation:
    return Recommendation(
        id=_demo_id(workspace_id, "recommendation:invite-in-onboarding"),
        title="Move team invitation into onboarding step 2",
        description=(
            "Surface the 'Invite teammate' action inside onboarding step 2 for "
            "10% of new trial users, instead of leaving it in post-signup settings."
        ),
        focus_metric="Activation Rate",
        predicted_uplift_pct=7.2,
        confidence_pct=76.0,
        risk_level=RiskLevel.LOW,
        traffic_pct=10.0,
        duration_days=7,
        evidence=[
            "Users who invite at least one teammate in their first session activate "
            "at 61.4% versus 24.8% for solo users (30-day window).",
            "Only 15.6% of trial users currently discover the invite action before "
            "their first session ends.",
            "Trial → Activated is the largest single-step funnel drop at 70.5%.",
        ],
        assumptions=[
            "The observed invite/activation relationship is currently correlational, "
            "not causally verified. This experiment is designed to test causality.",
            "Onboarding step 2 placement does not increase step-2 abandonment.",
            "Team-based accounts behave similarly to single-seat accounts.",
        ],
        reality_gate=_build_reality_gate(),
        status=ExperimentStatus.AWAITING_APPROVAL,
    )


def _build_reality_gate() -> RealityGate:
    """Deterministic policy checks.

    Yeh AXIOM ka safety core hai. AI model proposal generate karta hai, par
    yeh checks **code** hain — model se nahi poochhe jaate. Isliye ek
    hallucinating LLM bhi apne aap production tak nahi pahunch sakta.

    Day 23-25 pe yeh checks real policy engine se aayenge; abhi structure aur
    contract fix kar rahe hain.
    """
    checks = [
        RealityGateCheck(
            label="Bounded traffic",
            passed=True,
            detail="10% of new trial users only. Existing users unaffected.",
        ),
        RealityGateCheck(
            label="Reversible",
            passed=True,
            detail="Feature-flag controlled. Rollback completes in under 60 seconds.",
        ),
        RealityGateCheck(
            label="Guardrail metrics defined",
            passed=True,
            detail="Onboarding completion rate and churn rate are monitored.",
        ),
        RealityGateCheck(
            label="No policy violations",
            passed=True,
            detail="No pricing, billing, privacy or communication policy is touched.",
        ),
        RealityGateCheck(
            label="Financial exposure",
            passed=True,
            detail="No spend required. Maximum downside is 7 days of 10% traffic.",
        ),
    ]
    return RealityGate(
        passed=all(check.passed for check in checks),
        # V1 mein yeh hamesha True hai. Autonomous launch scope se bahar hai.
        requires_human_approval=True,
        checks=checks,
    )


# ---------------------------------------------------------------------------
# Active experiments
# ---------------------------------------------------------------------------


def _build_experiments(workspace_id: uuid.UUID) -> list[ActiveExperiment]:
    return [
        ActiveExperiment(
            id=_demo_id(workspace_id, "experiment:onboarding-v2"),
            name="Onboarding v2 – Step Order",
            focus_metric="Activation Rate",
            status=ExperimentStatus.RUNNING,
            progress_pct=68.0,
            observed_lift_pct=4.1,
            traffic_pct=25.0,
            guardrail_breached=False,
            # 68% progress pe result conclusive nahi hai. Ise "significant"
            # bolna sequential testing ke bina false positive hota hai —
            # AXIOM jaan-boojh kar aisa claim nahi karta.
            is_conclusive=False,
        ),
        ActiveExperiment(
            id=_demo_id(workspace_id, "experiment:pricing-value-prop"),
            name="Pricing Page – Value Prop",
            focus_metric="Trial Conversion",
            status=ExperimentStatus.RUNNING,
            progress_pct=42.0,
            observed_lift_pct=2.7,
            traffic_pct=50.0,
            guardrail_breached=False,
            is_conclusive=False,
        ),
        ActiveExperiment(
            id=_demo_id(workspace_id, "experiment:invite-nudge"),
            name="Nudge – Invite Teammate",
            focus_metric="Activation Rate",
            status=ExperimentStatus.RUNNING,
            progress_pct=31.0,
            observed_lift_pct=1.9,
            traffic_pct=10.0,
            guardrail_breached=False,
            is_conclusive=False,
        ),
    ]


# ---------------------------------------------------------------------------
# Decision receipts
# ---------------------------------------------------------------------------


def _build_decisions(workspace_id: uuid.UUID, now: datetime) -> list[DecisionReceiptSummary]:
    """Recent decision receipts.

    Teen alag outcomes deliberately dikhaye hain — verified, monitoring aur
    rolled back. Ek rolled-back receipt dikhana zaroori hai: yeh sabit karta
    hai ki system galat result ko pakadta aur wapas leta hai. Sirf success
    dikhane wala dashboard credible nahi hota.
    """
    specs: list[tuple[str, int, int, int, DecisionOutcome, float, str]] = [
        (
            "decision:pricing-page",
            2,  # days ago
            10,
            32,
            DecisionOutcome.VERIFIED,
            3.6,
            "Redesigned pricing page held a +3.6% trial-conversion lift across the "
            "full 14-day measurement window with no guardrail breach.",
        ),
        (
            "decision:onboarding-50",
            4,
            16,
            18,
            DecisionOutcome.MONITORING,
            1.2,
            "Onboarding v2 scaled from 25% to 50% of traffic. Lift is positive but "
            "the confidence interval still includes zero, so it remains monitored.",
        ),
        (
            "decision:discount-banner",
            7,
            9,
            11,
            DecisionOutcome.ROLLED_BACK,
            -1.4,
            "Homepage discount banner reduced trial conversion by 1.4% and breached "
            "the average-revenue guardrail. Automatically rolled back after 36 hours.",
        ),
    ]

    titles = {
        "decision:pricing-page": "Enable redesigned pricing page",
        "decision:onboarding-50": "Roll out onboarding v2 to 50%",
        "decision:discount-banner": "Discount banner on homepage",
    }

    decisions: list[DecisionReceiptSummary] = []
    for slug, days_ago, hour, minute, outcome, impact, summary in specs:
        decided_at = (now - timedelta(days=days_ago)).replace(
            hour=hour, minute=minute, second=0, microsecond=0
        )
        decisions.append(
            DecisionReceiptSummary(
                id=_demo_id(workspace_id, slug),
                title=titles[slug],
                decided_at=decided_at,
                decided_at_display=f"Decided {decided_at.strftime('%b %d, %I:%M %p').lstrip('0')}",
                outcome=outcome,
                impact_pct=impact,
                summary=summary,
            )
        )
    return decisions
