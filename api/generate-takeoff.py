import base64
import io
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd

from _lib.constants import MAPPABLE_COLUMNS
from _lib.crossref import brands_by_category, match_category
from _lib.customers import rules_for
from _lib.grouping import takeoff_pipeline
from _lib.parsing import norm_key, read_bytes_to_df, sanename
from _lib.styling import style_takeoff_and_raw_bytes


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", 0))
            body = self.rfile.read(length) if length > 0 else b""
            payload = json.loads(body) if body else {}

            filename = payload.get("filename", "")
            data_b64 = payload.get("data_b64", "")
            mapping = payload.get("mapping", {})
            manual_products = payload.get("manual_products") or None
            manual_tags = payload.get("manual_tags_by_product") or None
            bold_cols = payload.get("bold_cols", [])
            colors = payload.get("colors", {})
            base_name = payload.get("base_name", "")
            target_brand = payload.get("target_brand", "") or ""
            customer = payload.get("customer", "") or ""
            customer_rules = rules_for(customer) if customer else None
            crossref_overrides = payload.get("crossref_overrides") or None

            if not data_b64:
                return self._json(400, {"error": "Missing data_b64"})

            raw = base64.b64decode(data_b64)
            df_in, err = read_bytes_to_df(raw, filename)
            if err:
                return self._json(400, {"error": err})

            # Build mapped source df (for RawData sheet) — only user-mapped columns
            source_mapped = pd.DataFrame()
            for c in MAPPABLE_COLUMNS:
                src = mapping.get(c, "")
                if src and src in df_in.columns:
                    source_mapped[c] = df_in[src].astype(str).fillna("")
                else:
                    source_mapped[c] = ""

            formatted = takeoff_pipeline(
                df_in,
                mapping,
                sort_keys=["PRODUCT", "MODEL", "TAG"],
                ascending=True,
                manual_products=manual_products,
                manual_tags=manual_tags,
                target_brand=target_brand,
                crossref_overrides=crossref_overrides,
                customer_rules=customer_rules,
            )

            xbytes = style_takeoff_and_raw_bytes(
                source_df=source_mapped,
                takeoff_df=formatted,
                header_hex=colors.get("header", "#ECF3FA"),
                product_hex=colors.get("product", "#92D050"),
                zebra_hex=colors.get("zebra", "#F7F7F7"),
                qty_gold_hex=colors.get("qtygold", "#FFF2CC"),
                bold_cols=bold_cols,
            )

            out_name = base_name or (filename.rsplit(".", 1)[0] + "_Triune_Haldeman")
            out_safe = sanename(out_name)

            content_b64 = base64.b64encode(xbytes).decode("ascii")

            # Per-row category map keyed by "<normBrand>|<normModel>" — drives
            # the client's per-product XBRAND dropdown filter.
            row_categories: dict = {}
            bbc = brands_by_category()
            for b, m in zip(formatted["BRAND"].astype(str), formatted["MODEL"].astype(str)):
                if not b and not m:
                    continue
                key = f"{norm_key(b)}|{norm_key(m)}"
                if key in row_categories:
                    continue
                cat = match_category(b, m)
                row_categories[key] = {
                    "category": cat,
                    "brands_in_category": bbc.get(cat, []),
                }

            return self._json(200, {
                "filename": f"{out_safe}.xlsx",
                "content_b64": content_b64,
                "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "preview_rows": formatted.head(500).fillna("").astype(str).to_dict(orient="records"),
                "preview_columns": list(formatted.columns),
                "row_categories": row_categories,
            })
        except Exception as e:
            return self._json(500, {"error": f"Server error: {e}"})

    def _json(self, code: int, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
