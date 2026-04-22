"""Local dev HTTP server that mirrors the Vercel Python functions in api/*.py.

Run: python scripts/dev-server.py
Serves on http://localhost:3001 with routes matching the Vercel function names:
  POST /parse
  POST /generate-takeoff
  POST /generate-data-unit

In production, Vercel's Python runtime serves these directly at /api/* — the
rewrites in next.config.ts only proxy to this server during local dev.
"""
import importlib.util
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API_DIR = os.path.join(ROOT, "api")
sys.path.insert(0, API_DIR)


def load_handler(module_filename: str):
    path = os.path.join(API_DIR, module_filename)
    spec = importlib.util.spec_from_file_location(module_filename, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.handler


ROUTES = {
    "/parse": load_handler("parse.py"),
    "/generate-takeoff": load_handler("generate-takeoff.py"),
    "/generate-data-unit": load_handler("generate-data-unit.py"),
    "/crossref-lookup": load_handler("crossref-lookup.py"),
}


class DevHandler(BaseHTTPRequestHandler):
    def _dispatch(self, method: str):
        path = urlparse(self.path).path
        handler_cls = ROUTES.get(path)
        if not handler_cls:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"Not found"}')
            return

        try:
            # Instantiate the Vercel-style handler by delegating directly.
            # The vercel handler subclasses BaseHTTPRequestHandler — we re-use its
            # do_POST logic with our request context.
            handler = object.__new__(handler_cls)
            handler.rfile = self.rfile
            handler.wfile = self.wfile
            handler.headers = self.headers
            handler.command = method
            handler.path = self.path
            handler.request_version = self.request_version
            handler.client_address = self.client_address
            handler.server = self.server
            handler.connection = self.connection
            handler.requestline = self.requestline

            if method == "POST":
                handler.do_POST()
            else:
                handler.do_GET()
        except Exception:
            traceback.print_exc()
            try:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"dev-server exception"}')
            except Exception:
                pass

    def do_POST(self):
        self._dispatch("POST")

    def do_GET(self):
        self._dispatch("GET")

    def log_message(self, fmt, *args):
        sys.stderr.write("[dev-server] %s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(os.environ.get("DEV_API_PORT", 3001))
    print(f"[dev-server] listening on http://localhost:{port}")
    print(f"[dev-server] routes: {list(ROUTES.keys())}")
    ThreadingHTTPServer(("0.0.0.0", port), DevHandler).serve_forever()
