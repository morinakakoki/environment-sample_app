#!/usr/bin/env python3
"""Push a text message to one LINE user via the Messaging API.

Usage:
  echo "text" | python3 line_push.py                 # send to $LINE_USER_ID
  python3 line_push.py --file msg.txt --to Uxxxxxxxx  # explicit destination
  python3 line_push.py --dry-run < msg.txt            # print payload, send nothing

Env:
  LINE_CHANNEL_ACCESS_TOKEN  Messaging API channel access token (long-lived)
  LINE_USER_ID               destination user ID (starts with "U"); --to overrides

Exit codes: 0 sent (or dry-run) / 2 config or input missing / 3 API error
Endpoint: POST https://api.line.me/v2/bot/message/push
Body:     {"to": "<userId>", "messages": [{"type": "text", "text": "..."}]}
Limits:   5000 chars per text message (LINE counts UTF-16 code units), 5 messages per request
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

API = "https://api.line.me/v2/bot/message/push"
MAX_UNITS = 5000   # UTF-16 code units per text message
MAX_MSGS = 5       # message objects per push request
SAFETY = 100       # keep a margin under MAX_UNITS


def utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def chunk(text: str, limit: int = MAX_UNITS - SAFETY) -> list[str]:
    """Split on line boundaries so that no chunk exceeds `limit` UTF-16 units."""
    out, cur = [], ""
    for line in text.splitlines(keepends=True):
        while utf16_len(line) > limit:            # a single over-long line
            cut = limit // 2                      # every code point is <= 2 units
            out.append(cur + line[:cut]) if cur else out.append(line[:cut])
            cur, line = "", line[cut:]
        if utf16_len(cur + line) > limit and cur:
            out.append(cur)
            cur = ""
        cur += line
    if cur:
        out.append(cur)
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--file", help="read message text from this file instead of stdin")
    p.add_argument("--to", help="destination user ID (default: $LINE_USER_ID)")
    p.add_argument("--dry-run", action="store_true", help="print the request and exit without sending")
    p.add_argument("--retry-key", help="X-Line-Retry-Key UUID for idempotent retries (default: new uuid4)")
    a = p.parse_args()

    text = (open(a.file, encoding="utf-8").read() if a.file else sys.stdin.read()).strip()
    if not text:
        print("line_push: empty message; nothing sent", file=sys.stderr)
        return 2

    to = a.to or os.environ.get("LINE_USER_ID", "")
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
    if not to or (not token and not a.dry_run):
        print("line_push: set LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID (or --to)", file=sys.stderr)
        return 2

    parts = chunk(text)
    if len(parts) > MAX_MSGS:
        dropped = len(parts) - MAX_MSGS
        parts = parts[:MAX_MSGS]
        parts[-1] = parts[-1].rstrip() + f"\n…(続き {dropped} 通分は省略。詳細は Artifact)"
        print(f"line_push: message too long, {dropped} chunk(s) dropped", file=sys.stderr)

    payload = {"to": to, "messages": [{"type": "text", "text": t} for t in parts]}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "X-Line-Retry-Key": a.retry_key or str(uuid.uuid4()),
    }

    if a.dry_run:
        shown = dict(headers, Authorization="Bearer ***")
        print(json.dumps({"url": API, "headers": shown, "body": payload}, ensure_ascii=False, indent=2))
        return 0

    req = urllib.request.Request(API, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"line_push: sent {len(parts)} message(s), HTTP {r.status}")
            return 0
    except urllib.error.HTTPError as e:
        print(f"line_push: HTTP {e.code} {e.reason}: {e.read().decode('utf-8', 'replace')}", file=sys.stderr)
        return 3
    except urllib.error.URLError as e:
        print(f"line_push: network error: {e.reason}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
