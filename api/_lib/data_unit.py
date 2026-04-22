import io
import re
import zipfile
from typing import List, Optional, Tuple

import pandas as pd


def normalize_text(s: str) -> str:
    return re.sub(r"[\s_\-\.]+", " ", str(s).strip().lower())


def find_column(raw_cols: List[str], *aliases: str) -> Optional[str]:
    raw_norm = {c: normalize_text(c) for c in raw_cols}
    for alias in aliases:
        a = normalize_text(alias)
        for rc, rn in raw_norm.items():
            if rn == a:
                return rc
    for alias in aliases:
        a = normalize_text(alias)
        for rc, rn in raw_norm.items():
            if a in rn or rn in a:
                return rc
    tokens = set()
    for alias in aliases:
        tokens.update(normalize_text(alias).split())
    best, best_score = None, 0
    for rc, rn in raw_norm.items():
        tt = set(rn.split())
        score = len(tt & tokens)
        if score > best_score:
            best_score = score; best = rc
    return best if best_score > 0 else None


def detect_unit_column(df: pd.DataFrame) -> Optional[str]:
    for c in df.columns:
        if re.search(r"(^unit$)|unit(s)?|apt|apartment|flat|room|suite|unit_id|unitno|unit_no",
                     c, re.IGNORECASE):
            return c
    return None


def apply_raw_column_mapping(raw_df: pd.DataFrame) -> pd.DataFrame:
    df = raw_df.copy()
    cols = list(df.columns)
    lowered = {c.lower(): c for c in cols}
    exact_rules = {
        "subject": "PRODUCT",
        "page index": "Page Index",
        "label": "TAG",
        "manufacturer": "BRAND",
        "face size": "MODULE SIZE",
        "description": "ACCESSORIES2",
        "accessories": "ACCESSORIES1",
        "accessories1": "ACCESSORIES1",
    }
    exact_map = {}
    for low_key, dest in exact_rules.items():
        if low_key in lowered:
            orig = lowered[low_key]
            if orig != dest:
                exact_map[orig] = dest
    if exact_map:
        df = df.rename(columns=exact_map)

    mapping_pairs = {
        "QTY": ("quantity", "qty", "count", "qty.", "q'ty"),
        "BRAND": ("brand", "make", "mfr"),
        "MODEL": ("model", "catalog", "cat no", "catalog no"),
        "TAG": ("tag", "tag id", "label", "ref", "mark"),
        "NECK SIZE": ("neck size", "neck"),
        "MODULE SIZE": ("module size", "face size", "module", "face"),
        "DUCT SIZE": ("duct size", "duct"),
        "CFM": ("cfm", "airflow"),
        "TYPE": ("type", "desc", "description"),
        "MOUNTING": ("mounting", "install", "mount"),
        "ACCESSORIES1": ("accessories", "accessories1", "accessory 1", "accessory"),
        "ACCESSORIES2": ("accessories2", "accessory 2", "description", "desc"),
        "REMARK": ("remark", "remarks", "note", "notes"),
        "UNITS": ("unit", "units", "zone", "area", "apt", "apartment"),
    }
    rename = {}
    cols = list(df.columns)
    for target, aliases in mapping_pairs.items():
        if target in df.columns:
            continue
        found = find_column(cols, *aliases)
        if found and found not in rename and found != target:
            rename[found] = target
    if rename:
        df = df.rename(columns=rename)
    return df


def clean_unit_matrix(df: pd.DataFrame, unit_col_hint: Optional[str] = None) -> Tuple[pd.DataFrame, str]:
    df2 = df.copy()
    unit_col = unit_col_hint or detect_unit_column(df2) or df2.columns[0]
    df2[unit_col] = df2[unit_col].fillna("").astype(str).str.strip()
    df2 = df2[~df2[unit_col].str.upper().isin(["TOTAL", "GRAND TOTAL", "SUMMARY", "ALL"])]
    return df2.reset_index(drop=True), unit_col


def guess_multiplier_column(unit_df: pd.DataFrame, unit_col: str) -> Optional[str]:
    cands = [c for c in unit_df.columns if c != unit_col]
    for c in cands:
        sample = unit_df[c].dropna().astype(str).str.replace(",", "").str.strip()
        if sample.size and any(s.replace(".", "", 1).isdigit() for s in sample[:50]):
            return c
    return cands[0] if cands else None


def build_data_unit_sheet(
    raw_df: pd.DataFrame,
    unit_df: pd.DataFrame,
    raw_unit_col: str,
    matrix_unit_col: str,
    multiplier_col: Optional[str],
    selected_units: Optional[list] = None,
    include_empty: bool = True,
    default_multiplier: int = 1,
) -> pd.DataFrame:
    raw = raw_df.copy()
    mat = unit_df.copy()
    raw[raw_unit_col] = raw[raw_unit_col].fillna("").astype(str).str.strip()
    mat[matrix_unit_col] = mat[matrix_unit_col].fillna("").astype(str).str.strip()

    multiplier_map = {}
    if multiplier_col:
        for _, r in mat.iterrows():
            u = str(r.get(matrix_unit_col, "")).strip()
            v = r.get(multiplier_col, "")
            try:
                if pd.isna(v) or str(v).strip() == "":
                    continue
                num = int(float(str(v).replace(",", "").strip()))
                multiplier_map[u] = num
            except Exception:
                continue

    org_count_col = None
    for name in ["Org Count", "OrgCount", "ORIGINAL COUNT", "Count", "QTY", "Qty", "qty", "QTY/UNIT"]:
        if name in raw.columns:
            org_count_col = name; break
    if org_count_col is None:
        for c in raw.columns:
            sample = raw[c].dropna().astype(str).str.replace(",", "").str.strip()
            if sample.size and all(s.replace(".", "", 1).isdigit() for s in sample[:50]):
                org_count_col = c; break
    if org_count_col is None:
        raw["Org Count"] = 1
    else:
        raw["Org Count"] = pd.to_numeric(
            raw[org_count_col].fillna("0").astype(str).str.replace(",", "").str.strip(),
            errors="coerce"
        ).fillna(0).astype(int)

    def get_mult(u):
        if u == "" or pd.isna(u):
            return default_multiplier
        return multiplier_map.get(u, default_multiplier)

    raw["__unit_multiplier__"] = raw[raw_unit_col].apply(get_mult).astype(int)
    raw["Count"] = raw["Org Count"].astype(int) * raw["__unit_multiplier__"]

    if selected_units:
        sel = set(selected_units)
        vals = raw[raw_unit_col].fillna("").astype(str).str.strip()
        mask = vals.isin(sel)
        if "<<EMPTY UNIT>>" in sel:
            mask = mask | (vals == "")
        raw = raw[mask].copy()

    raw["UNITS"] = raw[raw_unit_col].replace({"": "<<EMPTY UNIT>>"})

    required_order = [
        "PRODUCT", "Page Index", "TAG", "Org Count", "Count", "BRAND", "MODEL",
        "NECK SIZE", "MODULE SIZE", "DUCT SIZE", "CFM", "TYPE", "MOUNTING",
        "ACCESSORIES1", "ACCESSORIES2", "REMARK", "UNITS", "DAMPER TYPE",
    ]
    for col in required_order:
        if col not in raw.columns:
            raw[col] = ""
    others = [c for c in raw.columns if c not in required_order and c != "__unit_multiplier__"]
    if "__unit_multiplier__" in raw.columns:
        raw = raw.drop(columns=["__unit_multiplier__"])
    return raw[required_order + others].copy()


def df_to_xlsx_bytes(df: pd.DataFrame, sheet_name: str = "Data Unit Sheet") -> bytes:
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as w:
        df.to_excel(w, index=False, sheet_name=sheet_name)
    bio.seek(0)
    return bio.getvalue()


def zip_per_unit_bytes(df: pd.DataFrame) -> bytes:
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for unit, g in df.groupby("UNITS"):
            safe = "".join(c if c.isalnum() or c in " -_." else "_" for c in str(unit))[:120] or "unit"
            zf.writestr(f"{safe}.xlsx", df_to_xlsx_bytes(g))
    mem.seek(0)
    return mem.getvalue()
