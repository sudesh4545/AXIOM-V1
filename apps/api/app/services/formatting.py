"""Indian number formatting helpers.

Server pe format kyun kar rahe hain, frontend pe nahi?

`Intl.NumberFormat` "8.4 lakh" nahi deta jo Indian B2B SaaS founders padhte
hain — woh "₹840,000" ya "₹8,40,000" deta hai. Aur agar formatting frontend
mein hui, to web app, future mobile app aur email reports teeno mein alag
string dikhegi. Ek jagah format karna = har surface pe same number.
"""

from __future__ import annotations

from decimal import Decimal

LAKH = Decimal("100000")
CRORE = Decimal("10000000")


def format_inr_compact(amount: float | Decimal) -> str:
    """Rupees ko Indian compact notation mein badlo.

    >>> format_inr_compact(840000)
    '₹8.4L'
    >>> format_inr_compact(12500000)
    '₹1.25Cr'
    >>> format_inr_compact(4200)
    '₹4,200'
    """
    value = Decimal(str(amount))
    sign = "-" if value < 0 else ""
    value = abs(value)

    if value >= CRORE:
        return f"{sign}₹{_trim(value / CRORE)}Cr"
    if value >= LAKH:
        return f"{sign}₹{_trim(value / LAKH)}L"
    return f"{sign}₹{int(value):,}"


def format_percent(value: float, decimals: int = 1) -> str:
    """>>> format_percent(38.62) -> '38.6%'"""
    return f"{value:.{decimals}f}%"


def format_delta(value: float, decimals: int = 1) -> str:
    """Signed delta with arrow. Sign se arrow decide hota hai.

    >>> format_delta(12.4)
    '↑ 12.4%'
    >>> format_delta(-0.6)
    '↓ 0.6%'
    """
    arrow = "↑" if value > 0 else "↓" if value < 0 else "→"
    return f"{arrow} {abs(value):.{decimals}f}%"


def _trim(value: Decimal) -> str:
    """Trailing zeros hatao: 8.40 -> '8.4', 3.00 -> '3'."""
    quantised = value.quantize(Decimal("0.01"))
    text = f"{quantised:.2f}".rstrip("0").rstrip(".")
    return text or "0"
