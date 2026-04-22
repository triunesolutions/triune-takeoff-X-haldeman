import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

from _lib.parsing import detect_map, read_bytes_to_df


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", 0))
            body = self.rfile.read(length) if length > 0 else b""
            payload = json.loads(body) if body else {}

            filename = payload.get("filename", "")
            data_b64 = payload.get("data_b64", "")
            if not data_b64:
                return self._json(400, {"error": "Missing data_b64"})

            raw = base64.b64decode(data_b64)
            df, err = read_bytes_to_df(raw, filename)
            if err:
                return self._json(400, {"error": err})

            mapping = detect_map(df)
            columns = list(df.columns)
            preview_rows = df.head(200).fillna("").astype(str).to_dict(orient="records")

            return self._json(200, {
                "columns": columns,
                "mapping": mapping,
                "preview": preview_rows,
                "total_rows": len(df),
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
