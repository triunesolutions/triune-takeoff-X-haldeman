import json
import os
import re
from functools import lru_cache
from typing import Dict, List, Optional

_DB_PATH = os.path.join(os.path.dirname(__file__), "crossref.json")


@lru_cache(maxsize=1)
def _db() -> Dict:
    with open(_DB_PATH, encoding="utf-8") as f:
        return json.load(f)


def brands() -> List[str]:
    return _db()["brands"]


def _norm(s: str) -> str:
    if s is None:
        return ""
    s = str(s).strip().lower()
    return re.sub(r"[\s\-\.\_/]+", "", s)


@lru_cache(maxsize=1)
def _brand_name_index() -> Dict[str, str]:
    """Map normalized brand name → canonical brand name from DB."""
    out: Dict[str, str] = {}
    for b in _db()["brands"]:
        out[_norm(b)] = b
    # Common aliases
    aliases = {
        "titus": "Titus",
        "price": "Price Industries",
        "priceindustries": "Price Industries",
        "krueger": "Krueger",
        "ruskin": "Ruskin",
        "nailor": "Nailor",
        "pottorff": "POTTORFF",
        "greenheck": "Greenheck",
        "lorencook": "Loren Cook",
        "cook": "Loren Cook",
        "metalaire": "MetalAire",
        "carrier": "Carrier",
        "trane": "Trane",
        "tuttlebailey": "Tuttle & Bailey",
        "tuttleandbailey": "Tuttle & Bailey",
    }
    for k, v in aliases.items():
        out.setdefault(k, v)
    return out


def resolve_brand(name: str) -> Optional[str]:
    """Return canonical brand name from DB, or None if not found."""
    if not name:
        return None
    idx = _brand_name_index()
    n = _norm(name)
    if n in idx:
        return idx[n]
    # fuzzy: starts-with
    for k, v in idx.items():
        if k.startswith(n) or n.startswith(k):
            return v
    return None


def _split_models(value: str) -> List[str]:
    if not value:
        return []
    # Split on commas; trim each
    parts = [p.strip() for p in str(value).split(",")]
    return [p for p in parts if p]


def _model_variants(m: str) -> List[str]:
    """Generate comparison variants for a model string."""
    if not m:
        return []
    m = str(m).strip()
    return list({m, _norm(m)})


def _model_matches(row_value: str, query_model: str) -> bool:
    """Check if query_model appears in row_value (which may be comma-separated)."""
    if not row_value or not query_model:
        return False
    q = _norm(query_model)
    if not q:
        return False
    for candidate in _split_models(row_value):
        c = _norm(candidate)
        if c == q:
            return True
        # Substring matches (for cases like "BD-10" vs "BD-10XX")
        if len(q) >= 3 and (q in c or c in q):
            return True
    return False


def find_crossref(src_brand: str, src_model: str, target_brand: str) -> str:
    """Look up equivalent model for target_brand given source brand+model.

    Returns the target brand's model string (may be comma-separated if the
    equivalency group lists multiple models), or empty string if no match.
    """
    if not target_brand:
        return ""
    src_canon = resolve_brand(src_brand)
    tgt_canon = resolve_brand(target_brand)
    if not src_canon or not tgt_canon:
        return ""
    if src_canon == tgt_canon:
        return str(src_model or "")

    for row in _db()["data"]:
        rv = row.get(src_canon, "")
        if not rv:
            continue
        if _model_matches(rv, src_model):
            return str(row.get(tgt_canon, "")).strip()
    return ""
