"""Event ingestion service.

Yeh AXIOM ka write path hai. Do cheezein isse "sirf ek INSERT" se zyada
banati hain:

1. **Idempotency** — network retries duplicate events bhejti hain. Ek hi
   `trial_started` do baar count hona activation rate ko galat kar dega, aur
   us galat number pe AXIOM experiment recommend karega. Silent data
   corruption sabse mehnga bug hai.

2. **Batch efficiency** — per-event query karne se 500 events = 500
   round-trips. Hum ek query mein existing keys nikaalte hain.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.workspace import Workspace
from app.schemas.events import EventBatchIn, EventIngestResponse, EventStats


async def ingest_events(
    session: AsyncSession,
    workspace: Workspace,
    payload: EventBatchIn,
    *,
    now: datetime | None = None,
) -> EventIngestResponse:
    """Batch ko store karo, duplicates skip karke.

    Return karta hai: kitne mile, kitne accept hue, kitne duplicate the.
    Client ko yeh farq pata hona chahiye — warna retry ke baad usse yeh clear
    nahi hoga ki uska data safely dedupe hua ya chup-chaap gum ho gaya.
    """
    now = now or datetime.now(timezone.utc)
    received = len(payload.events)

    # --- Step 1: batch ke andar ke duplicates hatao ---
    # Client galti se ek hi key do baar bhej sakta hai. Agar hum dono insert
    # karne ki koshish karein to unique constraint poori transaction tod dega.
    batch_keys: set[str] = set()
    candidates: list[Event] = []
    in_batch_duplicates = 0

    for incoming in payload.events:
        if incoming.idempotency_key is not None:
            if incoming.idempotency_key in batch_keys:
                in_batch_duplicates += 1
                continue
            batch_keys.add(incoming.idempotency_key)

        candidates.append(
            Event(
                organization_id=workspace.organization_id,
                workspace_id=workspace.id,
                name=incoming.name,
                event_type=incoming.event_type,
                distinct_id=incoming.distinct_id,
                # `occurred_at` na mile to server time. Comment worth rakhne
                # layak: yeh best-effort hai, aur isi wajah se `ingested_at`
                # alag column hai.
                occurred_at=incoming.occurred_at or now,
                properties=incoming.properties,
                revenue_amount_inr=incoming.revenue_amount_inr,
                idempotency_key=incoming.idempotency_key,
            )
        )

    # --- Step 2: database mein already maujood keys ek query mein nikaalo ---
    already_stored: set[str] = set()
    if batch_keys:
        result = await session.execute(
            select(Event.idempotency_key).where(
                Event.workspace_id == workspace.id,
                Event.idempotency_key.in_(batch_keys),
            )
        )
        already_stored = {key for key in result.scalars().all() if key is not None}

    fresh = [
        event
        for event in candidates
        if event.idempotency_key is None or event.idempotency_key not in already_stored
    ]
    duplicates = in_batch_duplicates + (len(candidates) - len(fresh))

    # --- Step 3: insert ---
    accepted = await _insert_events(session, workspace.id, fresh)

    # Jo events bulk insert mein conflict ki wajah se gire, woh bhi duplicate
    # hi hain (koi doosri concurrent request unhe pehle daal chuki thi).
    duplicates += len(fresh) - accepted

    return EventIngestResponse(
        workspace_id=workspace.id,
        received=received,
        accepted=accepted,
        duplicates=duplicates,
        received_at=now,
    )


async def _insert_events(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    events: list[Event],
) -> int:
    """Events insert karo, concurrent-insert race ko handle karte hue.

    Step 2 ka pre-check "check-then-act" hai, jo atomic nahi hai: do requests
    ek hi key ke saath ek hi waqt aa sakti hain, dono ka check pass ho jaayega,
    aur phir unique constraint fire karega.

    Isliye hum pehle fast bulk insert try karte hain. Agar constraint toote,
    to rollback karke ek-ek event SAVEPOINT ke andar daalte hain — tab ek
    conflicting row poore batch ko nahi maarta. Yeh slow path hai jo normally
    kabhi nahi chalta.
    """
    if not events:
        return 0

    session.add_all(events)
    try:
        await session.commit()
        return len(events)
    except IntegrityError:
        await session.rollback()

    accepted = 0
    for event in events:
        # Rollback ke baad objects detached ho jaate hain, isliye naya banate hain.
        retry = Event(
            organization_id=event.organization_id,
            workspace_id=workspace_id,
            name=event.name,
            event_type=event.event_type,
            distinct_id=event.distinct_id,
            occurred_at=event.occurred_at,
            properties=event.properties,
            revenue_amount_inr=event.revenue_amount_inr,
            idempotency_key=event.idempotency_key,
        )
        try:
            async with session.begin_nested():  # SAVEPOINT
                session.add(retry)
            accepted += 1
        except IntegrityError:
            # Duplicate — expected, chup-chaap skip karo.
            continue

    await session.commit()
    return accepted


async def get_event_stats(session: AsyncSession, workspace: Workspace) -> EventStats:
    """Ingestion summary — integrator verify kar sake ki data pahunch raha hai.

    Yeh endpoint "dikh raha hai ya nahi" wale debugging ke liye hai. Iske bina
    SDK integrate karne wale developer ko yeh pata hi nahi chalta ki uske
    events store hue ya nahi.
    """
    aggregate = await session.execute(
        select(
            func.count(Event.id),
            func.count(func.distinct(Event.distinct_id)),
            func.min(Event.occurred_at),
            func.max(Event.occurred_at),
        ).where(Event.workspace_id == workspace.id)
    )
    total, unique_users, first_at, last_at = aggregate.one()

    names_result = await session.execute(
        select(Event.name)
        .where(Event.workspace_id == workspace.id)
        .group_by(Event.name)
        .order_by(func.count(Event.id).desc())
        .limit(50)
    )

    return EventStats(
        workspace_id=workspace.id,
        total_events=int(total or 0),
        unique_users=int(unique_users or 0),
        event_names=list(names_result.scalars().all()),
        first_event_at=first_at,
        last_event_at=last_at,
    )
