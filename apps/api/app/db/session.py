"""Async database engine aur session management.

FastAPI async framework hai. Agar hum blocking (sync) database driver use
karein to ek slow query poore event loop ko rok degi aur baaki saare
concurrent requests wait karenge. Isliye async SQLAlchemy + async driver
(`aiosqlite` local, `asyncpg` Postgres pe).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

settings = get_settings()


def _engine_kwargs() -> dict[str, Any]:
    """Engine options, database ke hisaab se.

    SQLite single-file database hai — usme connection pooling ka koi matlab
    nahi. Postgres pe pooling zaroori hai warna har request naya TCP +
    authentication handshake karegi.
    """
    kwargs: dict[str, Any] = {"echo": settings.database_echo, "future": True}

    if settings.is_sqlite:
        kwargs["connect_args"] = {"timeout": 30}
    else:
        kwargs.update(
            pool_size=10,
            max_overflow=20,
            # Connection use karne se pehle check karo ki zinda hai. Cloud
            # Postgres idle connections silently drop kar deta hai.
            pool_pre_ping=True,
            pool_recycle=1800,
        )
    return kwargs


engine: AsyncEngine = create_async_engine(settings.database_url, **_engine_kwargs())

SessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,  # commit ke baad bhi objects readable rahein
    autoflush=False,
)


if settings.is_sqlite:

    @event.listens_for(engine.sync_engine, "connect")
    def _apply_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
        """SQLite ko Postgres jaisa behave karwao.

        Bahut important: SQLite foreign keys ko **default se enforce nahi
        karta**. Iske bina hum local pe orphan rows insert kar sakte hain jo
        Postgres pe production mein reject ho jaayenge — worst kism ka bug.
        """
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")  # concurrent reads allow karo
        cursor.close()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: per-request database session.

    Commit route explicitly karta hai. Auto-commit dependency mein nahi rakha
    kyunki tab read-only endpoints bhi transaction close karte hain aur yeh
    dikhna band ho jaata hai ki write actually kahan ho rahi hai.
    """
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def check_database_connection() -> bool:
    """Health endpoint ke liye halka connectivity probe."""
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
