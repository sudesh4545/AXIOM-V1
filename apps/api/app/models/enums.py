"""Domain enums.

Sab enums `native_enum=False` ke saath store hote hain, yaani database mein
`VARCHAR + CHECK constraint` banta hai, Postgres ka native `ENUM` type nahi.

Kyun? Postgres native enum mein naya value add karna `ALTER TYPE ... ADD
VALUE` hai jo purane Postgres versions mein transaction ke andar nahi chalta,
aur value **remove** karna lagbhag impossible hai. VARCHAR + CHECK ek normal
migration hai. Ek growing product mein enum values roz badalti hain.
"""

from __future__ import annotations

from enum import StrEnum


class OrganizationPlan(StrEnum):
    PILOT = "pilot"
    STARTER = "starter"
    GROWTH = "growth"
    SCALE = "scale"


class WorkspaceEnvironment(StrEnum):
    """Ek hi organization ke paas production aur sandbox workspace ho sakte hain.

    Yeh AXIOM ke liye safety feature hai: experiment pehle sandbox workspace
    mein test hota hai, phir production mein jaata hai.
    """

    PRODUCTION = "production"
    STAGING = "staging"
    SANDBOX = "sandbox"


class UserRole(StrEnum):
    """Role-based access. Approval flow ke liye critical.

    AXIOM ka core safety rule hai: live experiment se pehle human approval.
    Woh approval kaun de sakta hai — yeh role decide karta hai. `VIEWER` aur
    `ANALYST` experiment propose kar sakte hain par approve nahi.
    """

    OWNER = "owner"
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"

    @property
    def can_approve_experiments(self) -> bool:
        return self in (UserRole.OWNER, UserRole.ADMIN)


class EventType(StrEnum):
    """Event ka category.

    Revenue events ko alag mark karna zaroori hai kyunki MRR/churn jaise
    financial metrics inhi se bante hain, aur inpe stricter validation aur
    audit requirements lagti hain.
    """

    PRODUCT = "product"
    REVENUE = "revenue"
    LIFECYCLE = "lifecycle"


class DataSource(StrEnum):
    """Dashboard payload ke saath honesty flag.

    PROJECT_CONTEXT ka rule: "No fabricated metrics". Isliye API har response
    mein saaf batati hai ki number demo seed data se aaya hai ya real ingested
    events se. Frontend ise badge ke roop mein dikha sakta hai.
    """

    DEMO_SEED = "demo_seed"
    INGESTED = "ingested"


# ---------------------------------------------------------------------------
# Experiment / risk / decision enums
#
# Yeh abhi sirf API contract mein use ho rahe hain kyunki experiments aur
# decision_receipts tables Day 16 aur Day 23 pe aayengi. Values ab hi fix kar
# rahe hain taaki frontend ko baad mein badalna na pade.
# ---------------------------------------------------------------------------


class SeverityLevel(StrEnum):
    """Detected bottleneck kitna serious hai."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskLevel(StrEnum):
    """Reality Gate ka risk verdict.

    `HIGH` matlab experiment block hai — chahe AI ne kitna bhi confident
    proposal diya ho. AI proposal deta hai; deterministic policy decide karti
    hai ki allowed hai ya nahi.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ExperimentStatus(StrEnum):
    DRAFT = "draft"
    AWAITING_APPROVAL = "awaiting_approval"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ROLLED_BACK = "rolled_back"


class DecisionOutcome(StrEnum):
    """Decision Receipt ka final state.

    `MONITORING` important hai: har decision turant "verified" nahi hota.
    Statistical confidence aane mein time lagta hai, aur premature "verified"
    label lagana hi metric-gaming ka pehla step hai.
    """

    VERIFIED = "verified"
    MONITORING = "monitoring"
    ROLLED_BACK = "rolled_back"
    INCONCLUSIVE = "inconclusive"


class MetricUnit(StrEnum):
    INR = "inr"
    PERCENT = "percent"
    COUNT = "count"


class TrendDirection(StrEnum):
    UP = "up"
    DOWN = "down"
    FLAT = "flat"
