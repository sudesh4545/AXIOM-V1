"""SQLAlchemy declarative base aur common column mixins.

Design decisions jo interview mein defend karne padenge:

1. **UUID primary keys** — auto-increment integers tenant-isolated SaaS mein
   leak karte hain (`/workspaces/2` guess karke doosre customer ka data try
   kar sakte ho). UUIDs guessable nahi hote aur multi-database merge safe hai.

2. **`Uuid` type (native nahi)** — SQLAlchemy 2.0 ka `Uuid` Postgres pe native
   `UUID` column banata hai aur SQLite pe `CHAR(32)`. Ek hi model code dono
   pe chalta hai.

3. **Timezone-aware timestamps** — `DateTime(timezone=True)` always. Naive
   datetimes hi analytics ke sabse common bug ka source hote hain.

4. **Naming convention** — Alembic ko constraints rename/drop karne ke liye
   naam chahiye. SQLite mein `ALTER TABLE` limited hai, isliye batch migrations
   bina named constraints ke fail ho jaati hain.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum as SAEnum
from sqlalchemy import MetaData, Uuid, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# Product events ka shape har customer ka alag hota hai, isliye properties
# schemaless JSON mein jaati hain. Postgres pe yeh JSONB banega (indexable,
# binary, fast), SQLite pe plain JSON text.
JSONColumn = JSON().with_variant(postgresql.JSONB(), "postgresql")


def enum_column(enum_cls: type[PyEnum], length: int = 32) -> SAEnum:
    """Enum column banao jo database mein enum ki **value** store kare.

    Yeh ek asli trap hai. SQLAlchemy default se enum ka `.name` store karta
    hai, `.value` nahi. Hamare `StrEnum`s mein name uppercase hai aur value
    lowercase (`PILOT = "pilot"`). Default behaviour ke saath:

        database   -> 'PILOT'
        API JSON   -> 'pilot'

    API se dekhne pe sab theek lagta hai (SQLAlchemy round-trip kar leta hai),
    par:
      - hand-likhi SQL `WHERE plan = 'pilot'` chup-chaap zero rows degi;
      - CSV/database dump aur API response match nahi karenge;
      - analytics queries (jo is project mein bahut aayengi) galat nikalengi.

    `values_callable` se hum values persist karte hain, to teeno jagah — DB,
    SQL aur JSON — same lowercase string dikhti hai.

    `native_enum=False` isliye ki Postgres ka native ENUM type migrate karna
    dard hai (`ALTER TYPE ... ADD VALUE`, aur value remove karna lagbhag
    impossible). VARCHAR + CHECK ek normal migration hai.
    """
    return SAEnum(
        enum_cls,
        native_enum=False,
        validate_strings=True,
        length=length,
        values_callable=lambda cls: [member.value for member in cls],
    )


class Base(DeclarativeBase):
    """Sab AXIOM tables ka base."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKeyMixin:
    """UUID primary key, application side pe generate hoti hai."""

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    """`created_at` / `updated_at` audit columns.

    `server_default=func.now()` use kiya hai (Python default nahi) taaki
    direct SQL inserts — seed scripts, migrations, admin queries — bhi sahi
    timestamp paayein.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
