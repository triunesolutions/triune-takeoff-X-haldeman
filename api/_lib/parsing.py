import io
import re
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd

from .constants import TRIUNE_COLUMNS


def strip(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return ""
    return str(x).strip()


def sanename(s: str) -> str:
    s = str(s).strip().replace(" ", "_")
    return re.sub(r"[^A-Za-z0-9._-]+", "", s)


def normalize_product_text(s: str) -> str:
    if s is None:
        return ""
    t = str(s).strip()
    t = re.sub(r"\s+", " ", t)
    return t.lower()


def norm_key(s: str) -> str:
    if s is None:
        return ""
    return str(s).strip().lower()


def read_bytes_to_df(raw: bytes, filename: str):
    """Read uploaded file bytes into a DataFrame. Returns (df, error)."""
    name = (filename or "").lower()
    if name.endswith((".xls", ".xlsx")):
        try:
            df = pd.read_excel(io.BytesIO(raw), dtype=str)
            return df.fillna(""), None
        except Exception as e:
            return None, f"Failed to read Excel file: {e}"

    # CSV path
    try:
        try:
            text = raw.decode("utf-8-sig")
        except Exception:
            try:
                text = raw.decode("latin1")
            except Exception:
                return None, "Failed to decode CSV bytes as utf-8 or latin1."

        lines = [ln for ln in text.splitlines() if ln.strip() != ""]
        if not lines:
            return None, "File appears empty."
        sample = "\n".join(lines[:10])
        delim = ","
        try:
            import csv as _csv
            dialect = _csv.Sniffer().sniff(sample)
            delim = dialect.delimiter
        except Exception:
            for d in [",", ";", "\t", "|"]:
                if d in sample:
                    delim = d
                    break

        try:
            df = pd.read_csv(io.StringIO(text), sep=delim, dtype=str, engine="python")
        except Exception:
            df = pd.read_csv(io.StringIO(text), sep=None, engine="python", dtype=str)
        return df.fillna(""), None
    except Exception as e:
        return None, f"Unexpected error reading file: {e}"


def parse_tag_for_sort(tag: str) -> Tuple[int, Optional[int], Optional[str], str]:
    t = str(tag).strip()
    if t == "":
        return (3, None, None, t)
    if re.fullmatch(r"\d+", t):
        try:
            return (0, int(t.lstrip("0") or "0"), None, t)
        except Exception:
            return (3, None, None, t)
    if re.fullmatch(r"[A-Za-z]+", t):
        return (1, None, t.upper(), t)
    m = re.fullmatch(r"([A-Za-z]+)(\d+)", t)
    if m:
        letters = m.group(1).upper()
        num = int(m.group(2).lstrip("0") or "0")
        return (2, num, letters, t)
    return (3, None, None, t)


def detect_map(df: pd.DataFrame) -> Dict[str, str]:
    cols = {c.lower(): c for c in df.columns}

    def find(*names):
        for n in names:
            if n.lower() in cols:
                return cols[n.lower()]
        for key, orig in cols.items():
            for n in names:
                if n.lower() in key:
                    return orig
        return ""

    return {
        "PRODUCT": find("subject", "product", "item", "product name", "prod"),
        "BRAND": find("manufacturer", "brand", "make", "mfr"),
        "MODEL": find("model", "catalog", "cat no", "catalog no"),
        "QTY": find("quantity", "qty", "count", "qty.", "q'ty"),
        "TAG": find("label", "tag", "ref", "mark"),
        "NECK SIZE": find("neck size", "neck"),
        "MODULE SIZE": find("module size", "face size", "module", "face"),
        "DUCT SIZE": find("duct size", "duct"),
        "TYPE": find("type", "desc", "description"),
        "MOUNTING": find("mounting", "install"),
        "ACCESSORIES1": find("accessories", "accessories1", "accessory 1"),
        "ACCESSORIES2": find("accessories2", "accessory 2", "description"),
        "REMARK": find("remark", "remarks", "note", "notes"),
    }


def neck_num(v):
    m = re.search(r"\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else np.inf


def numbers_from_text(s: str):
    if s is None:
        return []
    s = str(s)
    s = re.sub(r"[×xX]", "x", s)
    s = re.sub(r"(?<=\d),(?=\d)", "", s)
    nums = re.findall(r"\d+(?:\.\d+)?", s)
    return [float(n) for n in nums]


def size_pair(s: str):
    nums = numbers_from_text(s)
    if not nums:
        return (float("inf"), float("inf"))
    if len(nums) == 1:
        return (nums[0], 0.0)
    return (nums[0], nums[1])


def normalize(df: pd.DataFrame, mapping: Dict[str, str]):
    out = pd.DataFrame()
    for c in TRIUNE_COLUMNS:
        src = mapping.get(c, "")
        out[c] = df[src] if src in df.columns else ""
    out["QTY"] = pd.to_numeric(out["QTY"], errors="coerce").fillna(0)
    for c in out.columns:
        if c != "QTY":
            out[c] = out[c].map(strip)

    out["_NECK_NUM"] = out["NECK SIZE"].map(neck_num)
    mod = out["MODULE SIZE"].map(size_pair)
    dct = out["DUCT SIZE"].map(size_pair)
    out["_MODULE_W"] = [t[0] for t in mod]
    out["_MODULE_H"] = [t[1] for t in mod]
    out["_DUCT_W"] = [t[0] for t in dct]
    out["_DUCT_H"] = [t[1] for t in dct]

    tag_series = out["TAG"].astype(str).fillna("").map(str).map(lambda s: s.strip())

    def pad_2(tv):
        tvs = str(tv).strip()
        if re.fullmatch(r"\d+", tvs):
            return tvs.zfill(2)
        return tvs

    out["TAG"] = tag_series.map(pad_2)
    return out, mapping
