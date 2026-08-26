"""Pytest fixtures.

Tests apna alag in-memory SQLite database use karte hain, `axiom_local.db`
nahi. Test suite ko development data pe kabhi depend nahi karna chahiye —
warna "mere machine pe pass ho raha hai" wali classic problem aati hai.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.models.enums import OrganizationPlan, UserRole, WorkspaceEnvironment
from app.models.organization import Organization
from app.models.user import User
from app.models.workspace import Workspace

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Fresh in-memory database per test.

    `StaticPool` zaroori hai. SQLite `:memory:` har **connection** ke liye
    naya database banata hai. Normal pooling ke saath test ka setup ek
    connection pe tables banata aur request doosri connection pe unhe dhoondhta
    — "no such table" error. StaticPool ek hi connection reuse karta hai.
    """
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    # Tests mein `create_all` use kar rahe hain, Alembic nahi — tests fast
    # rehne chahiye. Migrations ka apna check `alembic upgrade head` hai jo
    # real database pe chalta hai.
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session_factory(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, expire_on_commit=False, autoflush=False)


@pytest_asyncio.fixture
async def db_session(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def seeded(db_session: AsyncSession) -> dict[str, object]:
    """Ek organization + workspace + owner user."""
    organization = Organization(
        name="Test Cloud",
        slug="test-cloud",
        plan=OrganizationPlan.PILOT,
    )
    db_session.add(organization)
    await db_session.flush()

    workspace = Workspace(
        organization_id=organization.id,
        name="Test Cloud",
        slug="production",
        environment=WorkspaceEnvironment.PRODUCTION,
        objective="Increase paid conversion from 14.8% to 20%.",
    )
    owner = User(
        organization_id=organization.id,
        email="owner@test.example",
        full_name="Asha Iyer",
        role=UserRole.OWNER,
    )
    analyst = User(
        organization_id=organization.id,
        email="analyst@test.example",
        full_name="Dev Kumar",
        role=UserRole.ANALYST,
    )
    db_session.add_all([workspace, owner, analyst])
    await db_session.commit()

    return {
        "organization": organization,
        "workspace": workspace,
        "owner": owner,
        "analyst": analyst,
    }


@pytest_asyncio.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client jo test database use karta hai.

    `dependency_overrides` FastAPI ka testing seam hai — hum production
    `get_session` ko test version se replace karte hain, application code chhue
    bina.
    """

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_session] = override_get_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as http_client:
        yield http_client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
def unknown_workspace_id() -> uuid.UUID:
    return uuid.uuid4()
