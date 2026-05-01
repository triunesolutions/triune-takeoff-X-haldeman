"""Customer → per-category target brand rules.

Category names MUST match the master-sheet Category column exactly — names
use '/' (not '-') as separators (e.g. 'Gravity / Relief Ventilator').

A rule value may be either a single brand name (str) or a list of brand
names (preferred → fallback). When a list is given, the lookup tries each
brand in order and returns the first one with a non-empty cross-reference.
"""
from typing import Dict, List, Union

BrandRule = Union[str, List[str]]

_ADGRD = [
    "GRD",
    "Diffusers",
    "Critical Environments",
    "Chilled Beams",
    "Displacement/Underfloor",
]
_LOUVERS = ["Louvers and Penthouses"]
_DAMPERS = ["Fire Damper", "Smoke Damper", "Fire/Smoke Damper"]
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

HALDEMAN_RULES: Dict[str, BrandRule] = {
    **{c: "Krueger" for c in _ADGRD},
    **{c: "Ruskin" for c in _LOUVERS},
    **{c: "Loren Cook" for c in _FANS},
}

MMS_RULES: Dict[str, BrandRule] = {
    **{c: ["Tuttle & Bailey", "Krueger"] for c in _ADGRD},
    **{c: "POTTORFF" for c in _DAMPERS},
    **{c: "Twin City Fan" for c in _FANS},
}

CUSTOMERS: Dict[str, Dict[str, BrandRule]] = {
    "Haldeman": HALDEMAN_RULES,
    "MMS": MMS_RULES,
}


def rules_for(customer: str) -> Dict[str, BrandRule]:
    if not customer:
        return {}
    return CUSTOMERS.get(customer, {})
