import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

from _lib.data_unit import (
    apply_raw_column_mapping,
    build_data_unit_sheet,
    clean_unit_matrix,
    detect_unit_column,
    df_to_xlsx_bytes,
    guess_multiplier_column,
    zip_per_unit_bytes,
)
from _lib.parsing import read_bytes_to_df


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", 0))
            body = self.rfile.read(length) if length > 0 else b""
            payload = json.loads(body) if body else {}

            mode = payload.get("mode", "generate")  # "inspect" or "generate"
            raw_name = payload.get("raw_filename", "")
            raw_b64 = payload.get("raw_b64", "")
            unit_name = payload.get("unit_filename", "")
            unit_b64 = payload.get("unit_b64", "")

            if not raw_b64 or not unit_b64:
                return self._json(400, {"error": "Both raw_b64 and unit_b64 are required"})

            raw_df, err = read_bytes_to_df(base64.b64decode(raw_b64), raw_name)
            if err:
                return self._json(400, {"error": f"Raw file error: {err}"})
            unit_df, err = read_bytes_to_df(base64.b64decode(unit_b64), unit_name)
            if err:
                return self._json(400, {"error": f"Unit file error: {err}"})

            raw_df = apply_raw_column_mapping(raw_df)
            unit_matrix_clean, matrix_unit_detected = clean_unit_matrix(unit_df)
            raw_unit_detected = detect_unit_column(raw_df) or ""
            guessed_mult = guess_multiplier_column(unit_matrix_clean, matrix_unit_detected)

            if mode == "inspect":
                units_in_matrix = unit_matrix_clean[matrix_unit_detected].dropna().astype(str).str.strip().tolist()
                raw_units = raw_df[raw_unit_detected].fillna("").astype(str).str.strip().unique().tolist() if raw_unit_detected in raw_df.columns else []
                has_empty = any(u == "" for u in raw_units)
                units_list = sorted(set(units_in_matrix + [u for u in raw_units if u != ""]))
                if has_empty:
                    units_list = ["<<EMPTY UNIT>>"] + units_list

                return self._json(200, {
                    "raw_columns": list(raw_df.columns),
                    "unit_columns": list(unit_matrix_clean.columns),
                    "raw_unit_col": raw_unit_detected,
                    "matrix_unit_col": matrix_unit_detected,
                    "multiplier_col": guessed_mult or "",
                    "units_list": units_list,
                    "raw_preview": raw_df.head(50).fillna("").astype(str).to_dict(orient="records"),
                })

            # generate mode
            raw_unit_col = payload.get("raw_unit_col") or raw_unit_detected
            matrix_unit_col = payload.get("matrix_unit_col") or matrix_unit_detected
            multiplier_col = payload.get("multiplier_col") or guessed_mult
            selected_units = payload.get("selected_units")
            include_empty = payload.get("include_empty", True)
            split_by_unit = payload.get("split_by_unit", False)
            out_base = payload.get("out_base", "Data_Unit_Sheet")

            final_df = build_data_unit_sheet(
                raw_df=raw_df,
                unit_df=unit_matrix_clean,
                raw_unit_col=raw_unit_col,
                matrix_unit_col=matrix_unit_col,
                multiplier_col=multiplier_col if multiplier_col else None,
                selected_units=selected_units,
                include_empty=include_empty,
                default_multiplier=1,
            )

            safe = "".join(c for c in out_base if c.isalnum() or c in " -_").strip() or "Data_Unit_Sheet"

            if split_by_unit:
                content = zip_per_unit_bytes(final_df)
                return self._json(200, {
                    "filename": f"{safe}.zip",
                    "content_b64": base64.b64encode(content).decode("ascii"),
                    "mime": "application/zip",
                    "preview_rows": final_df.head(200).fillna("").astype(str).to_dict(orient="records"),
                    "preview_columns": list(final_df.columns),
                })

            content = df_to_xlsx_bytes(final_df)
            return self._json(200, {
                "filename": f"{safe}.xlsx",
                "content_b64": base64.b64encode(content).decode("ascii"),
                "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "preview_rows": final_df.head(200).fillna("").astype(str).to_dict(orient="records"),
                "preview_columns": list(final_df.columns),
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
