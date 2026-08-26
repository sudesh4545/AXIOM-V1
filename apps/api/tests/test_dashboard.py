"""Dashboard contract tests.

Yeh tests numbers ko "sahi" nahi check karte — abhi woh demo constants hain.
Yeh **contract** check karte hain: shape, honesty flags aur derived logic. Jab
Day 8-11 pe real aggregation aayegi, yeh tests waise hi pass hone chahiye. Agar
tab yeh toot jaate hain, matlab frontend bhi toot gaya.
"""

from __future__ import annotations

import uuid
from typing import Any

from httpx import AsyncClient


async def _dashboard(client: AsyncClient, seeded: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    response = await client.get(
        f"/api/v1/workspaces/{seeded['workspace'].id}/dashboard", **kwargs
    )
    assert response.status_code == 200
    return response.json()


# ---------------------------------------------------------------------------
# Shape + honesty
# ---------------------------------------------------------------------------


async def test_dashboard_returns_full_payload(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)

    for key in (
        "workspace",
        "generatedAt",
        "dataSource",
        "dataSourceNote",
        "operatorFirstName",
        "systemStatus",
        "metrics",
        "growth",
        "bottleneck",
        "recommendation",
        "experiments",
        "decisions",
    ):
        assert key in body, f"missing `{key}` in dashboard payload"


async def test_dashboard_labels_itself_as_demo_data(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Sabse important test.

    PROJECT_CONTEXT ka rule: "No fabricated metrics." Agar yeh flag hat jaaye,
    to demo numbers screenshot/demo mein real lagne lagenge. Yeh test us rule ko
    code mein enforce karta hai.
    """
    body = await _dashboard(client, seeded)

    assert body["dataSource"] == "demo_seed"
    assert "demo" in body["dataSourceNote"].lower()


async def test_data_source_note_mentions_ingested_events(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Events ingest hone ke baad note batata hai ki woh stored hain par KPI
    computation abhi baaki hai — half-truth se bachne ke liye."""
    await client.post(
        f"/api/v1/workspaces/{seeded['workspace'].id}/events",
        json={"events": [{"name": "signup_completed", "distinctId": "user_001"}]},
    )

    body = await _dashboard(client, seeded)

    assert "1 real" in body["dataSourceNote"]


async def test_operator_falls_back_when_no_header(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)

    assert body["operatorFirstName"] == "there"


async def test_operator_resolved_from_header(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """`X-Axiom-User-Email` header se operator identify hota hai.

    Yeh **authentication nahi** hai — trivially spoofable hai, aur `deps.py`
    mein loudly documented hai. Real JWT auth Day 4 pe aayega.
    """
    body = await _dashboard(
        client, seeded, headers={"X-Axiom-User-Email": "owner@test.example"}
    )

    assert body["operatorFirstName"] == "Asha"


async def test_unknown_operator_email_does_not_break_dashboard(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Galat email pe 401 nahi — kyunki yeh auth nahi hai, sirf personalisation.

    Isse 401 dena jhoot hota: aisa lagta ki API authenticated hai, jabki nahi
    hai.
    """
    body = await _dashboard(
        client, seeded, headers={"X-Axiom-User-Email": "nobody@test.example"}
    )

    assert body["operatorFirstName"] == "there"


async def test_unknown_workspace_returns_404(
    client: AsyncClient, unknown_workspace_id: uuid.UUID
) -> None:
    response = await client.get(f"/api/v1/workspaces/{unknown_workspace_id}/dashboard")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Metric cards
# ---------------------------------------------------------------------------


async def test_metrics_match_day_one_design(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)

    by_key = {metric["key"]: metric for metric in body["metrics"]}
    assert set(by_key) == {"mrr", "activation_rate", "trial_conversion", "churn_rate"}
    assert by_key["mrr"]["displayValue"] == "₹8.4L"
    assert by_key["activation_rate"]["displayValue"] == "38.6%"


async def test_churn_down_is_an_improvement(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """`direction` aur `isImprovement` deliberately alag fields hain.

    Churn neeche jaana accha hai. Agar frontend arrow direction se colour
    decide karta, to "churn 0.6% gira" laal dikhta — poori tarah ulta signal.
    """
    body = await _dashboard(client, seeded)

    churn = next(metric for metric in body["metrics"] if metric["key"] == "churn_rate")
    assert churn["direction"] == "down"
    assert churn["deltaPct"] < 0
    assert churn["isImprovement"] is True


async def test_every_metric_has_a_sparkline(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)

    for metric in body["metrics"]:
        assert len(metric["spark"]) >= 2, f"{metric['key']} sparkline too short"


# ---------------------------------------------------------------------------
# Growth chart
# ---------------------------------------------------------------------------


async def test_growth_series_is_chart_ready(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)
    growth = body["growth"]

    assert len(growth["points"]) == 19
    assert growth["axisMax"] > 0
    # Har point axis ke andar hona chahiye, warna bar chart overflow karega.
    assert all(point["value"] <= growth["axisMax"] for point in growth["points"])
    assert len(growth["xAxisLabels"]) == 6


async def test_growth_points_are_chronological(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)

    dates = [point["occurredOn"] for point in body["growth"]["points"]]
    assert dates == sorted(dates)


async def test_growth_current_display_matches_last_point(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Header ka bada number chart ke last point se match karna chahiye.

    Yeh dono independently hardcode karna easy tha — aur tab woh chupke se
    diverge ho jaate. Isliye `current_display` last point se derive hota hai.
    """
    body = await _dashboard(client, seeded)
    growth = body["growth"]

    assert growth["currentDisplay"] == "₹8.4L"
    assert growth["points"][-1]["value"] == 840_000.0


# ---------------------------------------------------------------------------
# Bottleneck funnel — derived logic
# ---------------------------------------------------------------------------


async def test_funnel_has_two_distinct_conversion_numbers(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """`conversionPct` (pehle step se) aur `stepConversionPct` (pichhle step se).

    Inko confuse karna funnel analysis ki sabse common galti hai.
    """
    body = await _dashboard(client, seeded)
    steps = body["bottleneck"]["steps"]

    trial = steps[1]
    assert trial["conversionPct"] == 43.8  # 5,632 / 12,846
    assert trial["stepConversionPct"] == 43.8  # same, kyunki yeh step 2 hai

    activated = steps[2]
    assert activated["conversionPct"] == 12.9  # 1,659 / 12,846
    assert activated["stepConversionPct"] == 29.5  # 1,659 / 5,632
    assert activated["conversionPct"] != activated["stepConversionPct"]


async def test_bottleneck_is_derived_not_hardcoded(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Bottleneck sabse kharab **step** conversion wala step hona chahiye.

    Cumulative % dekhne pe "Invited teammate" (6.8%) sabse bura lagta hai, par
    woh isliye kam hai ki pichhle steps already users kha gaye. Asli leak
    Trial → Activated hai (29.5% step conversion).
    """
    body = await _dashboard(client, seeded)
    steps = body["bottleneck"]["steps"]

    flagged = [step for step in steps if step["isBottleneck"]]
    assert len(flagged) == 1
    assert flagged[0]["label"] == "Activated"

    worst_step_conversion = min(step["stepConversionPct"] for step in steps[1:])
    assert flagged[0]["stepConversionPct"] == worst_step_conversion


async def test_bottleneck_stage_names_the_flagged_transition(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Stage label bhi derive hota hai, hardcode nahi.

    Warna bottleneck shift hone pe dashboard confidently galat stage dikhata.
    """
    body = await _dashboard(client, seeded)
    bottleneck = body["bottleneck"]

    assert bottleneck["stage"] == "Started trial → Activated"
    assert "Activated" in bottleneck["summary"]


async def test_funnel_counts_only_decrease(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Funnel monotonically ghatna chahiye — badhna data bug ka signal hai."""
    body = await _dashboard(client, seeded)

    counts = [step["userCount"] for step in body["bottleneck"]["steps"]]
    assert counts == sorted(counts, reverse=True)


async def test_drop_off_matches_flagged_step(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)
    bottleneck = body["bottleneck"]

    flagged = next(step for step in bottleneck["steps"] if step["isBottleneck"])
    assert bottleneck["dropOffPct"] == round(100 - flagged["stepConversionPct"], 1)
    assert bottleneck["severity"] == "high"  # 70.5% drop-off -> 60-85 band


# ---------------------------------------------------------------------------
# Recommendation + Reality Gate
# ---------------------------------------------------------------------------


async def test_recommendation_ships_evidence_and_assumptions(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Bina evidence ka recommendation sirf "advice" hai.

    AXIOM ka poora point advice se aage jaana hai, isliye contract mein evidence
    optional nahi hai.
    """
    body = await _dashboard(client, seeded)
    recommendation = body["recommendation"]

    assert len(recommendation["evidence"]) >= 1
    assert len(recommendation["assumptions"]) >= 1


async def test_assumptions_admit_correlation_not_causation(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Honesty check: observed relationship ko causal batana nahi chahiye."""
    body = await _dashboard(client, seeded)
    assumptions = " ".join(body["recommendation"]["assumptions"]).lower()

    assert "correlational" in assumptions or "not causally" in assumptions


async def test_reality_gate_always_requires_human_approval(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """V1 mein koi bhi live experiment human approval ke bina nahi chal sakta.

    Yeh PROJECT_CONTEXT ka hard safety rule hai. Test isliye hai ki yeh flag
    "convenience" ke naam pe koi silently False na kar de.
    """
    body = await _dashboard(client, seeded)
    gate = body["recommendation"]["realityGate"]

    assert gate["requiresHumanApproval"] is True
    assert len(gate["checks"]) >= 5
    assert all("detail" in check and check["detail"] for check in gate["checks"])


async def test_reality_gate_passed_is_derived_from_checks(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)
    gate = body["recommendation"]["realityGate"]

    assert gate["passed"] == all(check["passed"] for check in gate["checks"])


async def test_recommendation_awaits_approval(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)

    assert body["recommendation"]["status"] == "awaiting_approval"


# ---------------------------------------------------------------------------
# Experiments + decisions
# ---------------------------------------------------------------------------


async def test_running_experiments_are_not_claimed_conclusive(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Sequential testing ke bina "significant" bolna false positive hai.

    Har running experiment `isConclusive: false` hona chahiye jab tak proper
    statistics na aaye.
    """
    body = await _dashboard(client, seeded)

    assert len(body["experiments"]) == 3
    for experiment in body["experiments"]:
        assert experiment["status"] == "running"
        assert experiment["isConclusive"] is False
        assert 0 <= experiment["progressPct"] <= 100


async def test_decisions_include_a_rollback(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Ek rolled-back receipt dikhna zaroori hai.

    Sirf success dikhane wala dashboard credible nahi hota. Rollback yeh sabit
    karta hai ki system galat result pakadta aur wapas leta hai.
    """
    body = await _dashboard(client, seeded)

    outcomes = {decision["outcome"] for decision in body["decisions"]}
    assert "rolled_back" in outcomes
    assert "verified" in outcomes

    rolled_back = next(d for d in body["decisions"] if d["outcome"] == "rolled_back")
    assert rolled_back["impactPct"] < 0


async def test_decisions_are_newest_first(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    body = await _dashboard(client, seeded)

    dates = [decision["decidedAt"] for decision in body["decisions"]]
    assert dates == sorted(dates, reverse=True)


# ---------------------------------------------------------------------------
# Stability
# ---------------------------------------------------------------------------


async def test_all_dashboard_timestamps_are_explicit_utc(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Chart ke saare timestamps timezone-explicit hone chahiye.

    Bina `Z` ke JS `new Date(...)` string ko local time maanta hai — IST browser
    mein poora growth chart 5.5 ghante shift ho jaata, bina koi error diye.
    """
    body = await _dashboard(client, seeded)

    stamps = [body["generatedAt"]]
    stamps += [point["occurredOn"] for point in body["growth"]["points"]]
    stamps += [decision["decidedAt"] for decision in body["decisions"]]

    for stamp in stamps:
        assert stamp.endswith("Z") or "+" in stamp[10:], f"timezone-naive timestamp: {stamp}"


async def test_demo_ids_are_stable_across_requests(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Demo ids uuid5 se bante hain, uuid4 se nahi.

    Har request pe naya id aata to React keys badalti, cache invalid hota, aur
    "same experiment" compare karna namumkin ho jaata.
    """
    first = await _dashboard(client, seeded)
    second = await _dashboard(client, seeded)

    assert first["recommendation"]["id"] == second["recommendation"]["id"]
    assert [e["id"] for e in first["experiments"]] == [
        e["id"] for e in second["experiments"]
    ]
