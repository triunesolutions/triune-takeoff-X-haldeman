import json
import os
import re
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

_DB_PATH = os.path.join(os.path.dirname(__file__), "crossref.json")


@lru_cache(maxsize=1)
def _db() -> Dict:
    with open(_DB_PATH, encoding="utf-8") as f:
        return json.load(f)


def brands() -> List[str]:
    return _db()["brands"]


def categories() -> List[str]:
    return _db()["categories"]


def brands_by_category() -> Dict[str, List[str]]:
    return _db()["brands_by_category"]


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
    if not name:
        return None
    idx = _brand_name_index()
    n = _norm(name)
    if n in idx:
        return idx[n]
    for k, v in idx.items():
        if k.startswith(n) or n.startswith(k):
            return v
    return None


def _split_models(value: str) -> List[str]:
    if not value:
        return []
    return [p.strip() for p in str(value).split(",") if p.strip()]


def _model_matches(row_value: str, query_model: str) -> bool:
    if not row_value or not query_model:
        return False
    q = _norm(query_model)
    if not q:
        return False
    for candidate in _split_models(row_value):
        c = _norm(candidate)
        if c == q:
            return True
        if len(q) >= 3 and (q in c or c in q):
            return True
    return False


def _find_row(src_brand: str, src_model: str) -> Optional[Dict]:
    """Locate the first data row whose src_brand column matches src_model."""
    src_canon = resolve_brand(src_brand)
    if not src_canon:
        return None
    for row in _db()["data"]:
        rv = row["brands"].get(src_canon, "")
        if rv and _model_matches(rv, src_model):
            return row
    return None


def lookup(src_brand: str, src_model: str, target_brand: str) -> Tuple[str, str]:
    """Return (xmodel, category). Empty strings if nothing matches."""
    row = _find_row(src_brand, src_model)
    if row is None:
        return ("", "")
    category = row.get("category", "") or ""
    tgt_canon = resolve_brand(target_brand)
    if not tgt_canon:
        return ("", category)
    src_canon = resolve_brand(src_brand)
    if src_canon == tgt_canon:
        return (str(src_model or ""), category)
    return (str(row["brands"].get(tgt_canon, "") or "").strip(), category)


def find_crossref(src_brand: str, src_model: str, target_brand: str) -> str:
    """Backward-compatible xmodel-only lookup."""
    xmodel, _ = lookup(src_brand, src_model, target_brand)
    return xmodel


def match_category(src_brand: str, src_model: str) -> str:
    """Return the category for a (src_brand, src_model) pair, or ''."""
    row = _find_row(src_brand, src_model)
    return row.get("category", "") if row else ""
