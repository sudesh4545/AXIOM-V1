"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# `Text` yahan import karna zaroori hai. Alembic autogenerate JSONB variant ko
# `postgresql.JSONB(astext_type=Text())` ke roop mein render karta hai — bina
# is import ke generated migration `NameError: name 'Text' is not defined`
# ke saath fail hoti hai. Alembic ka jaana-pehchana rendering gap hai.
from sqlalchemy import Text  # noqa: F401
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
