"""Customer → per-category target brand rules.

Category names MUST match the master-sheet Category column exactly — names
use '/' (not '-') as separators (e.g. 'Gravity / Relief Ventilator').
"""
from typing import Dict

_ADGRD = [
    "GRD",
    "Diffusers",
    "Critical Environments",
    "Chilled Beams",
    "Displacement/Underfloor",
]
_LOUVERS = ["Louvers and Penthouses"]
_FANS = [
    "Bathroom / Ceiling Fan",
    "Centrifugal Blower – Double Width",
    "Centrifugal Blower – Single Width",
    "Centrifugal Roof Exhauster",
    "Gravity / Relief Ventilator",
    "Hooded Propeller – Roof",
    "Inline / Axial Fan",
    "Kitchen Exhaust – Downblast",
    "Kitchen Exhaust – Upblast",
    "Kitchen Supply",
    "Lab Exhaust",
    "Plenum / Plug Fan",
    "Power Roof Ventilator",
    "Propeller / Wall Fan",
    "Propeller Upblast",
    "Tunnel / High Temp Fan",
    "Utility / Cabinet Fan",
    "Utility Exhaust Set",
]

HALDEMAN_RULES: Dict[str, str] = {
    **{c: "Krueger" for c in _ADGRD},
    **{c: "Ruskin" for c in _LOUVERS},
    **{c: "Loren Cook" for c in _FANS},
}

CUSTOMERS: Dict[str, Dict[str, str]] = {
    "Haldeman": HALDEMAN_RULES,
}


def rules_for(customer: str) -> Dict[str, str]:
    if not customer:
        return {}
    return CUSTOMERS.get(customer, {})
