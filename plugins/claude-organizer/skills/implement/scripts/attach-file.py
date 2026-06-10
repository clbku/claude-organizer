#!/usr/bin/env python3
"""Upload a proof-of-work file to a card via the REST API's multipart route.

    python3 scripts/attach-file.py <CO-N> <path>

The file's bytes go straight from disk to the API over HTTP — they never pass
through an AI context (no MCP, no tokens spent encoding base64). This is the fast
path that replaced the old base64-over-MCP upload_card_attachment tool.

Standard library only; a Node twin lives at scripts/attach-file.mjs for machines
without Python. Keep the two in sync.

Config: CO_API_URL (default http://127.0.0.1:4400).
"""

import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API_URL = os.environ.get("CO_API_URL", "http://127.0.0.1:4400").rstrip("/")

# Mirror the Node twin's map so both store the same Content-Type — `mimetypes`
# alone diverges (e.g. `.log` isn't in its built-in table on a slim host).
MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".log": "text/plain",
    ".json": "application/json",
    ".csv": "text/csv",
    ".zip": "application/zip",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}

# Card-scoped token minted by the MCP (issue_commit_token); only needed when the
# API has auth on. Absent in sem-auth mode — then no extra header is sent.
COMMIT_TOKEN = os.environ.get("CO_COMMIT_TOKEN")


def with_token(headers):
    if COMMIT_TOKEN:
        return {**headers, "X-CO-Commit-Token": COMMIT_TOKEN}
    return headers


def fail(msg):
    print(f"✗ {msg}", file=sys.stderr)
    sys.exit(1)


def human_bytes(n):
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / 1024 / 1024:.1f} MB"


def build_multipart(field, filename, mime, data):
    """Hand-roll a multipart/form-data body — stdlib urllib has no builder."""
    boundary = uuid.uuid4().hex
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    body = head + data + b"\r\n" + f"--{boundary}--\r\n".encode("utf-8")
    return boundary, body


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        fail("usage: attach-file <CO-N> <path-to-file>")
    key, path = args[0], args[1]

    try:
        data = Path(path).read_bytes()
    except OSError as err:
        fail(f"could not read {path}: {err}")

    filename = os.path.basename(path)
    ext = os.path.splitext(filename)[1].lower()
    mime = (
        MIME_BY_EXT.get(ext)
        or mimetypes.guess_type(filename)[0]
        or "application/octet-stream"
    )

    boundary, body = build_multipart("file", filename, mime, data)
    req = urllib.request.Request(
        f"{API_URL}/cards/by-key/{key}/attachments",
        data=body,
        headers=with_token(
            {"Content-Type": f"multipart/form-data; boundary={boundary}"}
        ),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as res:
            res.read()
    except urllib.error.HTTPError as err:
        body_txt = err.read().decode("utf-8", "replace")
        fail(f"API responded {err.code}: {body_txt}")
    except urllib.error.URLError as err:
        fail(f"could not reach the API at {API_URL} ({err.reason}). Is it running?")

    print(f"✓ {key} — {filename} ({human_bytes(len(data))}) → attached")


if __name__ == "__main__":
    main()
