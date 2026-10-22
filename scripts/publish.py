#!/usr/bin/env python3
"""Add one lesson to the site and delete that category's lessons older than 7 days.

Usage (from the repo root):
    python3 scripts/publish.py path/to/lesson.json

The JSON must contain at least: date (YYYY-MM-DD), category (finance|fintech),
title_zh, title_en, paragraphs [{zh, en}], source {name, url}, vocab [{hanzi, pinyin, en, hsk}],
featured [{hanzi, pinyin, pos, en, note, examples [{zh, py, en}]}].

It writes lessons/<date>-<category>.json and removes lessons/*-<category>.json whose
date is more than 6 days before <date> (so 7 days are kept). Only standard library.
"""
import datetime as dt
import json
import pathlib
import re
import sys
from urllib.parse import parse_qs, urlparse

KEEP_DAYS = 7
CATEGORIES = {"finance", "fintech"}
ROOT = pathlib.Path(__file__).resolve().parent.parent
LESSONS = ROOT / "lessons"
NAME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-(finance|fintech)\.json$")


def fail(msg):
    sys.exit(f"publish.py: {msg}")


def clean_url(url):
    """Unwrap Google redirect links (https://www.google.com/url?q=...)."""
    if not url:
        return url
    u = urlparse(url)
    if u.netloc.endswith("google.com") and u.path == "/url":
        q = parse_qs(u.query).get("q")
        if q:
            return q[0]
    return url


def validate(d):
    for key in ("date", "category", "title_zh", "title_en", "paragraphs", "vocab"):
        if not d.get(key):
            fail(f"missing '{key}'")
    try:
        dt.date.fromisoformat(d["date"])
    except ValueError:
        fail(f"bad date {d['date']!r}, expected YYYY-MM-DD")
    if d["category"] not in CATEGORIES:
        fail(f"category must be one of {sorted(CATEGORIES)}")
    for i, p in enumerate(d["paragraphs"]):
        if not p.get("zh") or not p.get("en"):
            fail(f"paragraph {i + 1} needs both 'zh' and 'en'")
    for i, v in enumerate(d["vocab"]):
        for k in ("hanzi", "pinyin", "en"):
            if not v.get(k):
                fail(f"vocab entry {i + 1} is missing '{k}'")
    for f in d.get("featured", []):
        if not f.get("hanzi") or not f.get("examples"):
            fail("each featured word needs 'hanzi' and 'examples'")
    d.pop("takeaway", None)  # the website never shows the takeaway
    src = d.setdefault("source", {})
    src["url"] = clean_url(src.get("url", ""))
    return d


def main():
    if len(sys.argv) != 2:
        fail("usage: python3 scripts/publish.py lesson.json")
    lesson = validate(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")))
    LESSONS.mkdir(exist_ok=True)

    out = LESSONS / f"{lesson['date']}-{lesson['category']}.json"
    out.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}")

    cutoff = dt.date.fromisoformat(lesson["date"]) - dt.timedelta(days=KEEP_DAYS - 1)
    for f in sorted(LESSONS.glob(f"*-{lesson['category']}.json")):
        m = NAME_RE.match(f.name)
        if m and dt.date.fromisoformat(m.group(1)) < cutoff:
            f.unlink()
            print(f"removed {f.relative_to(ROOT)} (older than {KEEP_DAYS} days)")


if __name__ == "__main__":
    main()
