"""Alembic migration environment.

Do important cheezein yahan hoti hain:

1. **Database URL settings se aati hai**, alembic.ini se nahi. Isse
   credentials git se bahar rehte hain aur ek hi migration set local SQLite
   aur production Postgres dono pe chalti hai.

2. **`render_as_batch=True`** — SQLite `ALTER TABLE` ko lagbhag support nahi
   karta (column drop, constraint change nahi hota). Batch mode Alembic ko
   "naya table banao → data copy karo → rename karo" karne deta hai. Iske bina
   local pe koi bhi schema change migration fail ho jaayegi.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings

# Yeh import zaroori hai: `Base.metadata` mein tables tabhi register hoti hain
# jab model modules import ho chuke hon. Iske bina autogenerate chup-chaap
# khaali migration banata hai — bahut confusing bug.
from app.models import Base  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def _configure_kwargs() -> dict[str, object]:
    return {
        "target_metadata": target_metadata,
        # Column type changes detect karo (default off hai).
        "compare_type": True,
        # Server default changes bhi detect karo.
        "compare_server_default": True,
        # SQLite ke limited ALTER TABLE ke liye — dekhein module docstring.
        "render_as_batch": settings.is_sqlite,
    }


def run_migrations_offline() -> None:
    """`--sql` mode: SQL script generate karo, chalao nahi.

    Production deployments mein yeh kaam ka hai — DBA migration SQL review kar
    sakta hai apply karne se pehle.
    """
    context.configure(
        url=settings.database_url,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_configure_kwargs(),
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, **_configure_kwargs())
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(_run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
