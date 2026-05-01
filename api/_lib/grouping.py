from typing import Dict, List, Optional

import pandas as pd

from .constants import STRICT_KEYS, TRIUNE_COLUMNS
from .crossref import find_crossref, lookup as crossref_lookup, match_category
from .parsing import norm_key, normalize, parse_tag_for_sort


def apply_grouping_strict(df: pd.DataFrame) -> pd.DataFrame:
    grouped = (
        df.groupby(STRICT_KEYS, dropna=False)
          .agg({
              "QTY": "sum",
              "_NECK_NUM": "min", "_MODULE_W": "min", "_MODULE_H": "min",
              "_DUCT_W": "min", "_DUCT_H": "min",
              "XBRAND": "first", "XMODEL": "first",
              "ACCESSORIES1": "first", "ACCESSORIES2": "first", "REMARK": "first",
          }).reset_index()
    )
    grouped = grouped.sort_values(
        by=["PRODUCT", "MODEL", "TAG", "_NECK_NUM", "_MODULE_W", "_MODULE_H",
            "_DUCT_W", "_DUCT_H", "TYPE", "MOUNTING", "BRAND"]
    ).reset_index(drop=True)
    return grouped


def reorder_grouped(grouped: pd.DataFrame,
                    sort_keys: List[str],
                    ascending: bool = True,
                    manual_products: Optional[List[str]] = None,
                    manual_tags: Optional[Dict[str, List[str]]] = None) -> pd.DataFrame:
    df = grouped.copy().reset_index(drop=True)
    prod_series = df["PRODUCT"].fillna("").astype(str).tolist()
    tag_series = df["TAG"].fillna("").astype(str).tolist()
    prod_norms = [norm_key(x) for x in prod_series]
    tag_norms = [norm_key(x) for x in tag_series]

    if manual_products:
        seen = set()
        manual_norm = []
        for p in manual_products:
            pn = norm_key(p)
            if pn and pn not in seen:
                seen.add(pn); manual_norm.append(pn)
        unique_prods = []; unique_prods_norm = []
        for orig, norm in zip(prod_series, prod_norms):
            if norm not in unique_prods_norm:
                unique_prods_norm.append(norm); unique_prods.append(orig)
        manual_in_df = []
        for m in manual_norm:
            if m in unique_prods_norm:
                manual_in_df.append(unique_prods[unique_prods_norm.index(m)])
        if manual_in_df:
            remaining = [p for p in unique_prods if p not in manual_in_df]
            cat_order = manual_in_df + remaining
            df["PRODUCT"] = pd.Categorical(df["PRODUCT"], categories=cat_order, ordered=True)
            if not sort_keys or sort_keys[0] != "PRODUCT":
                sort_keys = ["PRODUCT"] + [k for k in (sort_keys or []) if k != "PRODUCT"]

    manual_by_product = {}
    if manual_tags and isinstance(manual_tags, dict):
        for k, v in manual_tags.items():
            manual_by_product[norm_key(k)] = [norm_key(x) for x in (v or [])]

    auto_orders = []
    for t in tag_series:
        cat, num, alpha, orig = parse_tag_for_sort(t)
        if cat == 0:
            auto_orders.append((0, num or 0, "", ""))
        elif cat == 1:
            auto_orders.append((1, 0, alpha or "", ""))
        elif cat == 2:
            auto_orders.append((2, num or 0, alpha or "", ""))
        else:
            auto_orders.append((3, 0, "", t))
    order_idx = sorted(range(len(auto_orders)), key=lambda i: auto_orders[i])
    auto_rank = {i: rank for rank, i in enumerate(order_idx)}

    pri_list = []
    for i, (p_norm, t_norm) in enumerate(zip(prod_norms, tag_norms)):
        L = manual_by_product.get(p_norm)
        if L:
            pri = L.index(t_norm) if t_norm in L else 1000000 + auto_rank.get(i, 0)
        else:
            pri = 1000000 + auto_rank.get(i, 0)
        pri_list.append(pri)

    df["_TAG_PRI"] = pri_list

    sk = sort_keys or []
    effective = ["_TAG_PRI" if k == "TAG" else k for k in sk]
    if not effective:
        effective = ["PRODUCT", "MODEL", "_TAG_PRI", "_NECK_NUM",
                     "_MODULE_W", "_MODULE_H", "_DUCT_W", "_DUCT_H"]
    valid = [k for k in effective if k in df.columns]
    if not valid:
        return df.drop(columns=[c for c in ["_TAG_PRI"] if c in df.columns])

    df = df.sort_values(by=valid, ascending=ascending, kind="mergesort").reset_index(drop=True)
    if "_TAG_PRI" in df.columns:
        df = df.drop(columns=["_TAG_PRI"])
    return df


def build_rows_toprow(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    grand_total = 0.0

    for p, Gp in df.groupby("PRODUCT", dropna=False):
        Gp = Gp.reset_index(drop=True)
        product_total = 0.0
        first_for_prod = True
        for _, r in Gp.iterrows():
            rec = {c: r.get(c, "") for c in TRIUNE_COLUMNS}
            if not first_for_prod:
                rec.update({"PRODUCT": ""})
            first_for_prod = False
            rows.append(rec)
            q = float(r.get("QTY", 0) or 0)
            product_total += q
            grand_total += q

        prod_total_row = {c: "" for c in TRIUNE_COLUMNS}
        prod_label = str(p).strip() if str(p).strip() != "" else "PRODUCT"
        prod_total_row["PRODUCT"] = f"{prod_label} Total"
        prod_total_row["QTY"] = product_total
        rows.append(prod_total_row)

        rows.append({c: "" for c in TRIUNE_COLUMNS})
        rows.append({c: "" for c in TRIUNE_COLUMNS})

    rows.append({**{c: "" for c in TRIUNE_COLUMNS},
                 "PRODUCT": "Grand Total", "QTY": float(grand_total)})
    return pd.DataFrame(rows)[TRIUNE_COLUMNS]


def apply_crossref(df: pd.DataFrame,
                   target_brand: str,
                   overrides: Optional[Dict] = None,
                   customer_rules: Optional[Dict] = None) -> pd.DataFrame:
    """Fill XBRAND / XMODEL columns.

    Resolution order per row:
      1. Per-row override (if set).
      2. customer_rules: map of {category: brand-or-[brands]} — looks up the
         row's category, then chooses the brand for that category. A list
         value is a fallback chain: try each brand in order; the first one
         that yields a non-empty xmodel wins. If none does, the FIRST brand
         is used with an empty xmodel (so the column header still reflects
         the customer's preferred brand).
      3. Global target_brand fallback.
    """
    df = df.copy()
    overrides = overrides or {}
    customer_rules = customer_rules or {}

    def default_brands(src_brand: str, src_model: str) -> List[str]:
        if customer_rules:
            cat = match_category(src_brand, src_model)
            rule = customer_rules.get(cat) if cat else None
            if rule is None:
                return []
            return [rule] if isinstance(rule, str) else list(rule)
        return [target_brand] if target_brand else []

    def resolve_chain(src_brand: str, src_model: str, chain: List[str]):
        """Walk fallback chain → (chosen_brand, xmodel)."""
        chain = [b for b in chain if b]
        if not chain:
            return ("", "")
        for tb in chain:
            xm = find_crossref(src_brand, src_model, tb)
            if xm:
                return (tb, xm)
        return (chain[0], "")

    xbrands: list = []
    xmodels: list = []
    for b, m in zip(df["BRAND"].astype(str), df["MODEL"].astype(str)):
        key = f"{norm_key(b)}|{norm_key(m)}"
        o = overrides.get(key)

        if isinstance(o, dict):
            if "target_brand" in o:
                tb = o.get("target_brand") or ""
                if "xmodel" in o:
                    xbrands.append(tb); xmodels.append(o.get("xmodel") or "")
                    continue
                if not tb:
                    xbrands.append(""); xmodels.append("")
                    continue
                xbrands.append(tb); xmodels.append(find_crossref(b, m, tb))
                continue
            if "xmodel" in o:
                # Override has only xmodel — keep the chain's chosen brand.
                cb, _ = resolve_chain(b, m, default_brands(b, m))
                xbrands.append(cb); xmodels.append(o.get("xmodel") or "")
                continue

        if isinstance(o, str):
            tb = o
            if not tb:
                xbrands.append(""); xmodels.append("")
            else:
                xbrands.append(tb); xmodels.append(find_crossref(b, m, tb))
            continue

        cb, xm = resolve_chain(b, m, default_brands(b, m))
        xbrands.append(cb); xmodels.append(xm)

    df["XBRAND"] = xbrands
    df["XMODEL"] = xmodels
    return df


def takeoff_pipeline(df_raw: pd.DataFrame,
                     mapping: Dict[str, str],
                     sort_keys: Optional[List[str]] = None,
                     ascending: bool = True,
                     manual_products: Optional[List[str]] = None,
                     manual_tags: Optional[Dict[str, List[str]]] = None,
                     target_brand: str = "",
                     crossref_overrides: Optional[Dict[str, str]] = None,
                     customer_rules: Optional[Dict[str, str]] = None) -> pd.DataFrame:
    norm, _ = normalize(df_raw, mapping)
    grouped = apply_grouping_strict(norm)
    reordered = reorder_grouped(grouped, sort_keys or [], ascending=ascending,
                                manual_products=manual_products, manual_tags=manual_tags)
    with_xref = apply_crossref(reordered, target_brand,
                               overrides=crossref_overrides,
                               customer_rules=customer_rules)
    rows = build_rows_toprow(with_xref)
    cols = [c for c in rows.columns if not c.startswith("_")]
    return rows[cols]
