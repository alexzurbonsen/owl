"""Local UI preview server. Does not mock Thunderbird; browser tests supply mocks."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "extension"
csp = json.loads((root / "manifest.json").read_text())["content_security_policy"]["extension_pages"]

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", csp)
        super().end_headers()

ThreadingHTTPServer(("127.0.0.1", 8765), partial(Handler, directory=str(root))).serve_forever()
