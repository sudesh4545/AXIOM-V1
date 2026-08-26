"""Event ingestion tests.

Sabse zyada tests idempotency aur validation pe hain, kyunki yeh dono silently
fail hote hain. Ek duplicate event exception nahi phenkta — woh sirf activation
rate galat kar deta hai, aur us galat number pe AXIOM galat experiment
recommend karta hai. Aisa bug production mein mahino chhupa reh sakta hai.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event


def _event(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "trial_started",
        "distinctId": "user_001",
        "eventType": "product",
        "properties": {"trialDays": 14},
    }
    payload.update(overrides)
    return payload


async def _events_url(seeded: dict[str, Any]) -> str:
    return f"/api/v1/workspaces/{seeded['workspace'].id}/events"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_ingest_accepts_batch(client: AsyncClient, seeded: dict[str, Any]) -> None:
    url = await _events_url(seeded)

    response = await client.post(
        url,
        json={"events": [_event(distinctId="user_001"), _event(distinctId="user_002")]},
    )

    # 202, 201 nahi — kuch events duplicate ho sakte hain, isliye "created"
    # ka guarantee nahi diya ja sakta.
    assert response.status_code == 202
    body = response.json()
    assert body["received"] == 2
    assert body["accepted"] == 2
    assert body["duplicates"] == 0


async def test_ingest_persists_events(
    client: AsyncClient, seeded: dict[str, Any], db_session: AsyncSession
) -> None:
    url = await _events_url(seeded)
    await client.post(url, json={"events": [_event()]})

    stored = await db_session.scalar(select(func.count()).select_from(Event))
    assert stored == 1


async def test_ingest_defaults_occurred_at_to_now(
    client: AsyncClient, seeded: dict[str, Any], db_session: AsyncSession
) -> None:
    """`occurredAt` na bheja jaaye to server time use hoti hai."""
    url = await _events_url(seeded)
    await client.post(url, json={"events": [_event()]})

    event = await db_session.scalar(select(Event))
    assert event is not None
    assert event.occurred_at is not None


async def test_ingest_stores_revenue_as_exact_decimal(
    client: AsyncClient, seeded: dict[str, Any], db_session: AsyncSession
) -> None:
    """Paisa exactly store hona chahiye.

    Agar `revenue_amount_inr` float hota, to 1499.99 store karke 1499.9899999
    wapas milta. Chhoti si galti, par MRR aur churn dono galat kar deti hai.
    """
    url = await _events_url(seeded)
    await client.post(
        url,
        json={
            "events": [
                _event(
                    name="invoice_paid",
                    eventType="revenue",
                    revenueAmountInr="1499.99",
                    properties={},
                )
            ]
        },
    )

    event = await db_session.scalar(select(Event))
    assert event is not None
    assert str(event.revenue_amount_inr) == "1499.99"


# ---------------------------------------------------------------------------
# Idempotency — retry safety
# ---------------------------------------------------------------------------


async def test_same_idempotency_key_across_requests_is_deduped(
    client: AsyncClient, seeded: dict[str, Any], db_session: AsyncSession
) -> None:
    """Network retry simulate karo: wahi payload dobara bhejo."""
    url = await _events_url(seeded)
    payload = {"events": [_event(idempotencyKey="evt-abc-123")]}

    first = await client.post(url, json=payload)
    second = await client.post(url, json=payload)

    assert first.json()["accepted"] == 1
    assert second.json()["accepted"] == 0
    # Client ko yeh pata chalna zaroori hai ki uska retry dedupe hua,
    # chup-chaap gum nahi hua.
    assert second.json()["duplicates"] == 1

    stored = await db_session.scalar(select(func.count()).select_from(Event))
    assert stored == 1


async def test_duplicate_idempotency_key_within_one_batch(
    client: AsyncClient, seeded: dict[str, Any], db_session: AsyncSession
) -> None:
    """Ek hi batch mein duplicate key.

    Agar hum dono insert karne ki koshish karte, to unique constraint poori
    transaction tod deta aur **saare** valid events bhi gir jaate.
    """
    url = await _events_url(seeded)

    response = await client.post(
        url,
        json={
            "events": [
                _event(idempotencyKey="dup-key"),
                _event(idempotencyKey="dup-key"),
                _event(idempotencyKey="unique-key"),
            ]
        },
    )

    body = response.json()
    assert body["received"] == 3
    assert body["accepted"] == 2
    assert body["duplicates"] == 1

    stored = await db_session.scalar(select(func.count()).select_from(Event))
    assert stored == 2


async def test_events_without_idempotency_key_are_not_deduped(
    client: AsyncClient, seeded: dict[str, Any], db_session: AsyncSession
) -> None:
    """Bina key ke dedup possible nahi hai — aur yeh honest limitation hai.

    Do identical events bina key ke bheje jaayein to dono store honge. Hum
    (name, distinct_id, occurred_at) pe guess karke dedup **nahi** karte,
    kyunki woh legitimate repeated actions ko galti se drop kar deta.
    """
    url = await _events_url(seeded)

    await client.post(url, json={"events": [_event(), _event()]})

    stored = await db_session.scalar(select(func.count()).select_from(Event))
    assert stored == 2


async def test_idempotency_key_is_scoped_per_workspace(
    client: AsyncClient, seeded: dict[str, Any], db_session: AsyncSession
) -> None:
    """Do workspaces same key use kar sakte hain — unka counter alag hai."""
    from app.models.workspace import Workspace
    from app.models.enums import WorkspaceEnvironment

    other = Workspace(
        organization_id=seeded["organization"].id,
        name="Other",
        slug="sandbox",
        environment=WorkspaceEnvironment.SANDBOX,
    )
    db_session.add(other)
    await db_session.commit()

    payload = {"events": [_event(idempotencyKey="shared-key")]}
    first = await client.post(f"/api/v1/workspaces/{seeded['workspace'].id}/events", json=payload)
    second = await client.post(f"/api/v1/workspaces/{other.id}/events", json=payload)

    assert first.json()["accepted"] == 1
    assert second.json()["accepted"] == 1

    stored = await db_session.scalar(select(func.count()).select_from(Event))
    assert stored == 2


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


async def test_rejects_non_snake_case_event_name(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """"TrialStarted" aur "trial_started" ek hi cheez ke do naam ban jaate hain.

    Isse funnel step count aadha dikhta hai — sabse mehnga silent analytics bug.
    """
    url = await _events_url(seeded)

    response = await client.post(url, json={"events": [_event(name="Trial Started")]})

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_validation_error_is_actionable_and_serialisable(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Regression test — yeh case pehle **500** deta tha, 422 nahi.

    Custom validator ka `ValueError` Pydantic error dict ke `ctx` field mein
    exception object ke roop mein aata hai, jo JSON serialisable nahi hai. Us
    par `json.dumps` fail hota tha aur bare-Exception handler 500 bhej deta tha.
    Matlab AXIOM ki saari hand-likhi validation galat status code de rahi thi
    aur SDK integrator ko koi useful message nahi milta tha.

    Saath mein yeh bhi check kar rahe hain ki error batch ka **index** batata
    hai — 200 events ke batch mein "kuch galat hai" bekaar message hai.
    """
    url = await _events_url(seeded)

    response = await client.post(
        url,
        json={"events": [_event(), _event(name="Trial Started")]},
    )

    assert response.status_code == 422
    errors = response.json()["details"]["errors"]
    assert len(errors) == 1
    assert errors[0]["field"] == "body.events.1.name"
    assert "snake_case" in errors[0]["message"]


async def test_validation_error_does_not_echo_payload(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Error response mein customer ka raw input wapas nahi jaata.

    Pydantic default se `input` field mein user ka data echo karta hai. Event
    payload mein customer data hota hai aur error responses monitoring/proxy
    logs mein chale jaate hain — isliye humne woh field deliberately drop kiya
    hai. Field ka naam aur reason debugging ke liye kaafi hai.
    """
    url = await _events_url(seeded)

    response = await client.post(
        url,
        json={"events": [_event(name="Trial Started", distinctId="secret_customer_id")]},
    )

    assert "secret_customer_id" not in response.text


async def test_normalises_event_name_case(
    client: AsyncClient, seeded: dict[str, Any], db_session: AsyncSession
) -> None:
    """Valid snake_case uppercase mein aaye to lowercase kar dete hain."""
    url = await _events_url(seeded)

    await client.post(url, json={"events": [_event(name="TRIAL_STARTED")]})

    event = await db_session.scalar(select(Event))
    assert event is not None
    assert event.name == "trial_started"


async def test_revenue_event_requires_amount(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Bina amount ka revenue event MRR ko chup-chaap kam dikhayega."""
    url = await _events_url(seeded)

    response = await client.post(
        url,
        json={"events": [_event(name="invoice_paid", eventType="revenue")]},
    )

    assert response.status_code == 422


async def test_product_event_rejects_revenue_amount(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Product event pe amount bhejna integration mistake hai — batana chahiye."""
    url = await _events_url(seeded)

    response = await client.post(
        url,
        json={"events": [_event(revenueAmountInr="500.00")]},
    )

    assert response.status_code == 422


async def test_rejects_future_occurred_at(client: AsyncClient, seeded: dict[str, Any]) -> None:
    """Galat client clock poore time-series chart ko tod sakta hai."""
    url = await _events_url(seeded)
    future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()

    response = await client.post(url, json={"events": [_event(occurredAt=future)]})

    assert response.status_code == 422


async def test_allows_small_clock_skew(client: AsyncClient, seeded: dict[str, Any]) -> None:
    """Client clocks thode aage-peeche hote hain — 5 min tolerance hai."""
    url = await _events_url(seeded)
    slightly_ahead = (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat()

    response = await client.post(url, json={"events": [_event(occurredAt=slightly_ahead)]})

    assert response.status_code == 202


async def test_rejects_very_old_events(client: AsyncClient, seeded: dict[str, Any]) -> None:
    url = await _events_url(seeded)
    ancient = (datetime.now(timezone.utc) - timedelta(days=500)).isoformat()

    response = await client.post(url, json={"events": [_event(occurredAt=ancient)]})

    assert response.status_code == 422


async def test_rejects_empty_batch(client: AsyncClient, seeded: dict[str, Any]) -> None:
    url = await _events_url(seeded)

    response = await client.post(url, json={"events": []})

    assert response.status_code == 422


async def test_rejects_oversized_batch(client: AsyncClient, seeded: dict[str, Any]) -> None:
    """Batch cap ek basic resource guard hai (real rate limiting Day 28)."""
    url = await _events_url(seeded)
    events = [_event(distinctId=f"user_{i}") for i in range(501)]

    response = await client.post(url, json={"events": events})

    assert response.status_code == 413


async def test_unknown_workspace_returns_404(
    client: AsyncClient, unknown_workspace_id: uuid.UUID
) -> None:
    """Unknown workspace pe 404, 403 nahi.

    403 dena confirm kar deta hai ki woh id valid hai, jo enumeration attack ko
    madad karta hai.
    """
    response = await client.post(
        f"/api/v1/workspaces/{unknown_workspace_id}/events",
        json={"events": [_event()]},
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


async def test_stats_reports_ingestion_summary(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    url = await _events_url(seeded)
    await client.post(
        url,
        json={
            "events": [
                _event(name="signup_completed", distinctId="user_001"),
                _event(name="trial_started", distinctId="user_001"),
                _event(name="signup_completed", distinctId="user_002"),
            ]
        },
    )

    response = await client.get(f"{url}/stats")

    assert response.status_code == 200
    body = response.json()
    assert body["totalEvents"] == 3
    assert body["uniqueUsers"] == 2
    assert set(body["eventNames"]) == {"signup_completed", "trial_started"}
    assert body["firstEventAt"] is not None


async def test_stats_timestamps_are_explicit_utc(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Timestamps mein `Z` (ya offset) hona **zaroori** hai.

    Regression test. SQLite mein timezone type nahi hota, isliye woh datetime
    naive karke wapas deta hai aur JSON `"2026-07-27T10:25:06.544652"` banta
    hai — bina `Z` ke. JavaScript ka `new Date(...)` us string ko **local time**
    maanta hai, to IST browser mein har timestamp 5.5 ghante shift ho jaata.
    Koi error nahi aata, bas chart chupke se galat ho jaata hai.
    """
    url = await _events_url(seeded)
    await client.post(url, json={"events": [_event()]})

    body = (await client.get(f"{url}/stats")).json()

    for field in ("firstEventAt", "lastEventAt"):
        value = body[field]
        assert value.endswith("Z") or "+" in value[10:], f"{field} timezone-naive hai: {value}"


async def test_stats_on_empty_workspace(client: AsyncClient, seeded: dict[str, Any]) -> None:
    """Khaali workspace crash nahi karni chahiye — SQL aggregates NULL dete hain."""
    url = await _events_url(seeded)

    response = await client.get(f"{url}/stats")

    assert response.status_code == 200
    body = response.json()
    assert body["totalEvents"] == 0
    assert body["uniqueUsers"] == 0
    assert body["eventNames"] == []
    assert body["firstEventAt"] is None
