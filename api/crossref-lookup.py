import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

from _lib.crossref import find_crossref


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", 0))
            body = self.rfile.read(length) if length > 0 else b""
            payload = json.loads(body) if body else {}

            items = payload.get("items")
            if items and isinstance(items, list):
                # Batch lookup: [{src_brand, src_model, target_brand}, ...]
                out = []
                for it in items:
                    out.append({
                        "xmodel": find_crossref(
                            it.get("src_brand", ""),
                            it.get("src_model", ""),
                            it.get("target_brand", ""),
                        ),
                    })
                return self._json(200, {"results": out})

            # Single lookup
            src_brand = payload.get("src_brand", "")
            src_model = payload.get("src_model", "")
            target_brand = payload.get("target_brand", "")
            xmodel = find_crossref(src_brand, src_model, target_brand)
            return self._json(200, {"xmodel": xmodel})
        except Exception as e:
            return self._json(500, {"error": f"Server error: {e}"})

    def _json(self, code: int, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
