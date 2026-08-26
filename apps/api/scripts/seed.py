"""Demo workspace seed script.

Chalane ka tareeka:
    cd apps/api
    python -m scripts.seed              # default: 800 synthetic users
    python -m scripts.seed --users 2000
    python -m scripts.seed --reset      # pehle purana demo data hatao

Yeh script **synthetic** SaaS company banati hai. PROJECT_CONTEXT ka approach
yahi hai: "Start with synthetic SaaS data, then support real integrations."

Do important properties:

1. **Deterministic** — fixed random seed. Do baar chalane pe wahi data. Iske
   bina "kal number alag the" wali debugging shuru ho jaati hai.

2. **Idempotent** — har event ka `idempotency_key` deterministic hai, isliye
   script dobara chalane se duplicate events nahi bante. Yeh ingestion ke
   dedup logic ko bhi live test karta hai.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal, engine
from app.models.enums import (
    EventType,
    OrganizationPlan,
    UserRole,
    WorkspaceEnvironment,
)
from app.models.event import Event
from app.models.organization import Organization
from app.models.user import User
from app.models.workspace import Workspace

# Fixed seed — reproducible data. Har run same output.
RANDOM_SEED = 20260826

ORG_SLUG = "acme-cloud"

# Funnel conversion rates. Yeh Day 1 ke locked design reference se match karte
# hain taaki seeded data aur dashboard ek hi kahani bolein.
TRIAL_RATE = 0.439  # signup -> trial
ACTIVATION_RATE = 0.295  # trial -> activated  (yahi bottleneck hai)
INVITE_RATE = 0.528  # activated -> invited teammate
PAID_RATE = 0.148  # trial -> paid

WINDOW_DAYS = 30


async def seed(users_count: int, reset: bool) -> None:
    random.seed(RANDOM_SEED)
    now = datetime.now(timezone.utc)

    async with SessionLocal() as session:
        if reset:
            await _reset(session)

        organization = await _upsert_organization(session)
        production, sandbox = await _upsert_workspaces(session, organization)
        operators = await _upsert_users(session, organization)
        await session.commit()

        event_count = await _seed_events(
            session, organization, production, users_count=users_count, now=now
        )
        await session.commit()

        _print_summary(organization, production, sandbox, operators, users_count, event_count)

    await engine.dispose()


async def _reset(session: AsyncSession) -> None:
    """Purana demo organization hatao.

    Events/workspaces/users ko explicitly delete nahi kar rahe — schema mein
    `ondelete="CASCADE"` hai aur SQLite pe humne `PRAGMA foreign_keys=ON` set
    kiya hai, to database khud cascade karega. Yeh cascade ka live proof bhi
    hai.
    """
    print("Resetting existing demo data...")
    await session.execute(delete(Organization).where(Organization.slug == ORG_SLUG))
    await session.commit()


async def _upsert_organization(session: AsyncSession) -> Organization:
    existing = await session.scalar(select(Organization).where(Organization.slug == ORG_SLUG))
    if existing:
        print(f"Organization '{ORG_SLUG}' already exists — reusing it.")
        return existing

    organization = Organization(
        name="Acme Cloud",
        slug=ORG_SLUG,
        plan=OrganizationPlan.PILOT,
        industry="B2B SaaS — collaboration tooling",
    )
    session.add(organization)
    await session.flush()
    print(f"Created organization: {organization.name}")
    return organization


async def _upsert_workspaces(
    session: AsyncSession, organization: Organization
) -> tuple[Workspace, Workspace]:
    """Production + sandbox workspace.

    Do workspaces deliberately bana rahe hain. AXIOM ka safety pitch hai ki
    customer production ko chhue bina experiment try kar sakta hai — us claim
    ko demo mein dikhna chahiye, sirf docs mein nahi.
    """
    specs = [
        (
            "Acme Cloud",
            "production",
            WorkspaceEnvironment.PRODUCTION,
            "Increase paid conversion from 14.8% to 20% in 60 days without "
            "increasing churn by more than 2%.",
        ),
        (
            "Acme Cloud — Sandbox",
            "sandbox",
            WorkspaceEnvironment.SANDBOX,
            "Safe environment for testing AXIOM experiment configuration.",
        ),
    ]

    workspaces: list[Workspace] = []
    for name, slug, environment, objective in specs:
        existing = await session.scalar(
            select(Workspace).where(
                Workspace.organization_id == organization.id,
                Workspace.slug == slug,
            )
        )
        if existing:
            workspaces.append(existing)
            continue

        workspace = Workspace(
            organization_id=organization.id,
            name=name,
            slug=slug,
            environment=environment,
            objective=objective,
        )
        session.add(workspace)
        await session.flush()
        print(f"Created workspace: {workspace.name} ({workspace.environment.value})")
        workspaces.append(workspace)

    return workspaces[0], workspaces[1]


async def _upsert_users(session: AsyncSession, organization: Organization) -> list[User]:
    """Console operators.

    Deliberately teen alag roles seed kar rahe hain taaki approval gate
    testable ho: `analyst` experiment propose kar sakta hai par approve nahi.
    """
    specs = [
        ("sudesh@acmecloud.example", "Sudesh Mehar", UserRole.OWNER),
        ("priya@acmecloud.example", "Priya Nair", UserRole.ADMIN),
        ("rahul@acmecloud.example", "Rahul Verma", UserRole.ANALYST),
    ]

    operators: list[User] = []
    for email, full_name, role in specs:
        existing = await session.scalar(
            select(User).where(
                User.organization_id == organization.id,
                User.email == email,
            )
        )
        if existing:
            operators.append(existing)
            continue

        user = User(
            organization_id=organization.id,
            email=email,
            full_name=full_name,
            role=role,
            # `hashed_password` khaali hai. Auth Day 4 pe aayega — abhi fake
            # hash daal dena isse "kaam kar raha hai" jaisa dikhata, jo galat
            # impression hai.
            hashed_password=None,
        )
        session.add(user)
        await session.flush()
        print(f"Created user: {user.email} ({user.role.value})")
        operators.append(user)

    return operators


async def _seed_events(
    session: AsyncSession,
    organization: Organization,
    workspace: Workspace,
    *,
    users_count: int,
    now: datetime,
) -> int:
    """Synthetic product + revenue events banao.

    Funnel isi shape ka hai jo dashboard dikhata hai, isliye jab Day 8-11 pe
    real aggregation aayegi, computed numbers seed data se match karenge — aur
    tab hum verify kar payenge ki computation sahi hai.
    """
    # Pehle se seeded events dobara na banayein.
    existing_count = await session.scalar(
        select(Event.id).where(Event.workspace_id == workspace.id).limit(1)
    )
    if existing_count is not None:
        print("Events already seeded for this workspace — skipping event generation.")
        print("(`--reset` use karein fresh data ke liye.)")
        return 0

    events: list[Event] = []

    def add(
        distinct_id: str,
        name: str,
        offset_days: float,
        *,
        event_type: EventType = EventType.PRODUCT,
        properties: dict | None = None,
        revenue: Decimal | None = None,
    ) -> None:
        occurred_at = now - timedelta(days=WINDOW_DAYS) + timedelta(days=offset_days)
        events.append(
            Event(
                organization_id=organization.id,
                workspace_id=workspace.id,
                name=name,
                event_type=event_type,
                distinct_id=distinct_id,
                occurred_at=occurred_at,
                properties=properties or {},
                revenue_amount_inr=revenue,
                # Deterministic key => script idempotent hai.
                idempotency_key=f"seed:{workspace.slug}:{distinct_id}:{name}",
            )
        )

    for index in range(users_count):
        distinct_id = f"user_{index:05d}"
        signup_day = random.uniform(0, WINDOW_DAYS - 1)

        add(
            distinct_id,
            "signup_completed",
            signup_day,
            properties={
                "plan": random.choice(["free", "trial"]),
                "source": random.choice(["organic", "google_ads", "referral", "content"]),
            },
        )

        if random.random() >= TRIAL_RATE:
            continue

        trial_day = min(signup_day + random.uniform(0, 0.5), WINDOW_DAYS - 0.1)
        add(distinct_id, "trial_started", trial_day, properties={"trial_days": 14})

        activated = random.random() < ACTIVATION_RATE
        if activated:
            activation_day = min(trial_day + random.uniform(0.1, 3), WINDOW_DAYS - 0.1)
            add(
                distinct_id,
                "activated",
                activation_day,
                properties={"key_action": "created_first_project"},
            )

            if random.random() < INVITE_RATE:
                add(
                    distinct_id,
                    "teammate_invited",
                    min(activation_day + random.uniform(0.1, 2), WINDOW_DAYS - 0.1),
                    properties={"invite_count": random.randint(1, 4)},
                )

        if random.random() < PAID_RATE:
            paid_day = min(trial_day + random.uniform(3, 14), WINDOW_DAYS - 0.05)
            amount = Decimal(random.choice(["1499.00", "2999.00", "4999.00", "9999.00"]))
            add(
                distinct_id,
                "invoice_paid",
                paid_day,
                event_type=EventType.REVENUE,
                properties={"billing_period": "monthly", "currency": "INR"},
                revenue=amount,
            )

    session.add_all(events)
    print(f"Generated {len(events):,} events for {users_count:,} synthetic users.")
    return len(events)


def _print_summary(
    organization: Organization,
    production: Workspace,
    sandbox: Workspace,
    operators: list[User],
    users_count: int,
    event_count: int,
) -> None:
    print()
    print("=" * 72)
    print("AXIOM demo data ready")
    print("=" * 72)
    print(f"Organization      : {organization.name} ({organization.slug})")
    print(f"Production WS id  : {production.id}")
    print(f"Sandbox WS id     : {sandbox.id}")
    print(f"Operators         : {', '.join(u.email for u in operators)}")
    print(f"Synthetic users   : {users_count:,}")
    print(f"Events created    : {event_count:,}")
    print()
    print("Try it:")
    print("  uvicorn app.main:app --reload --port 8000")
    print(f"  curl http://localhost:8000/api/v1/workspaces/{production.id}/dashboard")
    print(f"  curl http://localhost:8000/api/v1/workspaces/{production.id}/events/stats")
    print()
    print("NOTE: Dashboard KPI/funnel values are still demo constants. Real")
    print("      computation from these events arrives in the analytics milestone.")
    print("      Every dashboard response says so in its `dataSourceNote` field.")
    print("=" * 72)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed AXIOM demo data")
    parser.add_argument(
        "--users",
        type=int,
        default=800,
        help="Kitne synthetic end-users banane hain (default: 800)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Seed karne se pehle purana demo organization delete karo",
    )
    args = parser.parse_args()

    if args.users < 1:
        parser.error("--users 1 se zyada hona chahiye")

    asyncio.run(seed(users_count=args.users, reset=args.reset))


if __name__ == "__main__":
    main()
