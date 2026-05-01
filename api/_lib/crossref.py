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
    if len(n) >= 4:
        for k, v in idx.items():
            if k.startswith(n) or n.startswith(k):
                return v
    return None


def _split_models(value: str) -> List[str]:
    if not value:
        return []
    return [p.strip() for p in str(value).split(",") if p.strip()]


def _model_matches(row_value: str, query_model: str) -> bool:
    """Exact normalized-token match. Whitespace/punctuation-insensitive but no
    substring fallback — '300' must not match '300F', and 'ACB' must not match
    'ACBL-HE'."""
    if not row_value or not query_model:
        return False
    q = _norm(query_model)
    if not q:
        return False
    return any(_norm(c) == q for c in _split_models(row_value))


def _find_row(src_brand: str, src_model: str) -> Optional[Dict]:
    """Find the best data row whose src_brand cell exactly contains src_model.

    When several rows match, prefer the most specific source cell (fewest
    listed model tokens) so a row whose source column is exactly 'CSP' beats
    a row that lists 'CSP, SP, SP-A, SP-B'."""
    src_canon = resolve_brand(src_brand)
    if not src_canon:
        return None
    best: Optional[Dict] = None
    best_token_count = 10**9
    for row in _db()["data"]:
        rv = row["brands"].get(src_canon, "")
        if not rv or not _model_matches(rv, src_model):
            continue
        tokens = len(_split_models(rv))
        if tokens < best_token_count:
            best = row
            best_token_count = tokens
            if tokens == 1:
                break
    return best


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
