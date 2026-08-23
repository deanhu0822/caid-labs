"""Protected NVIDIA/Pydantic bridge for Vercel's Python runtime."""

from hashlib import sha256
from hmac import compare_digest
from http.server import BaseHTTPRequestHandler
import json
import os
from pathlib import Path
import sys


PIPELINE_DIRECTORY = Path(__file__).resolve().parents[1] / "product_pipeline"
if str(PIPELINE_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIRECTORY))

from nvidia_build_bridge import (  # noqa: E402
    _clean_error,
    api_key,
    observe,
    parse_document,
    reason,
    status,
)


MAX_REQUEST_BYTES = 36 * 1024 * 1024


def _dispatch(request: dict):
    action = request.get("action")
    payload = request.get("payload") or {}
    if action == "status":
        return status(payload)
    if action == "observe":
        return observe(payload)
    if action == "parse":
        return parse_document(payload)
    if action == "reason":
        return reason(payload)
    return {"ok": False, "error": "Unknown bridge action"}


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict):
        serialized = json.dumps(payload, ensure_ascii=False)
        key = api_key()
        if key:
            serialized = serialized.replace(key, "[redacted]")
        body = serialized.encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802 - required by BaseHTTPRequestHandler
        key = os.environ.get("NVIDIA_API_KEY", "")
        if not key:
            self._send_json(503, {"ok": False, "error": "NVIDIA_API_KEY is not configured"})
            return
        expected = sha256(f"forma-nvidia-bridge:{key}".encode("utf-8")).hexdigest()
        supplied = self.headers.get("X-Forma-Bridge-Token", "")
        if not compare_digest(supplied, expected):
            self._send_json(401, {"ok": False, "error": "Unauthorized bridge request"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                self._send_json(413, {"ok": False, "error": "Bridge request is empty or too large"})
                return
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Bridge request must be a JSON object")
            self._send_json(200, _dispatch(request))
        except Exception as error:  # noqa: BLE001
            self._send_json(400, {"ok": False, "error": _clean_error(error)})

    def log_message(self, format, *args):  # noqa: A002
        return
