#!/usr/bin/env python3
"""Add one lesson to the site and delete that category's lessons older than 7 days.

Usage (from the repo root):
    python3 scripts/publish.py path/to/lesson.json --source path/to/source.txt

--source is a file (kept OUTSIDE the repo, never published) holding everything that was
read about the story: the fetched article text or page summaries and any search snippets.
It is used only to check that the lesson does not copy that wording.

The JSON must contain at least: date (YYYY-MM-DD), category (finance|fintech),
title_zh, title_en, paragraphs [{zh, en}], source {name, name_en, url}, vocab [{hanzi, pinyin, en, hsk}],
glossary [{w, py, en}] (every other word in the title and paragraphs, so every word can be tapped),
featured [{hanzi, pinyin, pos, en, note, examples [{zh, py, en}]}].

Safeguards (the lesson is refused if any fails):
  * no copying: no run of 12+ Chinese characters shared with the source text, and
    at most 20% of the lesson's 6-character sequences may also appear in it;
    the headline may not share 8+ characters in a row with the source
  * text only: no HTML, images, or links anywhere except source.url
  * attribution: source.url must be a direct http(s) link to the original article
    (not a homepage, search page, redirect, cache or archive mirror), with the
    outlet named in Chinese and English

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


HAN = re.compile(r"[\u4e00-\u9fff]")


def uncovered(d):
    """Segment the text exactly like the website does (greedy longest match) and
    return the Chinese characters/runs that no glossary or vocab entry covers."""
    words = {g["w"] for g in d.get("glossary", []) if g.get("w")}
    words |= {v["hanzi"] for v in d.get("vocab", []) if v.get("hanzi")}
    longest = max((len(w) for w in words), default=1)
    missing = []
    for text in [d.get("title_zh", "")] + [p.get("zh", "") for p in d.get("paragraphs", [])]:
        i = 0
        while i < len(text):
            for size in range(min(longest, len(text) - i), 0, -1):
                if text[i:i + size] in words:
                    i += size
                    break
            else:
                if HAN.match(text[i]):
                    ctx = text[max(0, i - 4):i + 5]
                    if not missing or not missing[-1].endswith(f"…{ctx}…"):
                        missing.append(f"{text[i]}（…{ctx}…）")
                i += 1
    return missing


# ---------- safeguards ----------
CJK = re.compile(r"[\u4e00-\u9fff0-9０-９%％.]")
COPY_RUN = 12          # longest allowed shared run of characters (body)
TITLE_RUN = 8          # longest allowed shared run (headline)
SHINGLE = 6
MAX_OVERLAP = 0.20
BLOCKED_HOSTS = ("google.", "baidu.com", "bing.com", "sogou.com", "web.archive.org", "archive.ph", "archive.today",
                 "archive.is", "12ft.io", "removepaywall", "webcache", "translate.goog", "r.jina.ai")
TAG = re.compile(r"<[^>]+>|https?://|www\.|\.(?:png|jpe?g|gif|webp|svg)\b", re.I)


def chars(text):
    """Keep only Chinese characters and digits, so punctuation and spaces can't hide copying."""
    return "".join(CJK.findall(text or ""))


def shared_runs(lesson_text, source_text, n):
    src = {source_text[i:i + n] for i in range(len(source_text) - n + 1)}
    hits, i = [], 0
    while i <= len(lesson_text) - n:
        if lesson_text[i:i + n] in src:
            j = i + n
            while j < len(lesson_text) and lesson_text[i:j + 1] in source_text:
                j += 1
            hits.append(lesson_text[i:j]); i = j
        else:
            i += 1
    return hits


def check_copying(d, source_text):
    src = chars(source_text)
    if len(src) < 20:
        fail("the --source file is (nearly) empty; save everything you read about the story into it and run again")
    body = chars("".join(p["zh"] for p in d["paragraphs"]))
    runs = shared_runs(body, src, COPY_RUN)
    if runs:
        fail("these passages are copied from the source article — rewrite them in your own simple words: " + " | ".join(runs))
    title_runs = shared_runs(chars(d["title_zh"]), src, TITLE_RUN)
    if title_runs:
        fail("the headline copies the source's wording — write your own headline: " + " | ".join(title_runs))
    grams = [body[i:i + SHINGLE] for i in range(len(body) - SHINGLE + 1)]
    if grams:
        srcg = {src[i:i + SHINGLE] for i in range(len(src) - SHINGLE + 1)}
        ratio = sum(g in srcg for g in grams) / len(grams)
        if ratio > MAX_OVERLAP:
            fail(f"{ratio:.0%} of the lesson's wording overlaps the source (limit {MAX_OVERLAP:.0%}) — "
                 "rewrite it more simply in your own words and order")
        print(f"copy check passed: {ratio:.0%} overlap, no shared run of {COPY_RUN}+ characters")


def check_text_only(d):
    def walk(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                if path == "source" and k == "url":
                    continue
                walk(v, f"{path}.{k}" if path else k)
        elif isinstance(x, list):
            for i, v in enumerate(x):
                walk(v, f"{path}[{i}]")
        elif isinstance(x, str) and TAG.search(x):
            fail(f"{path} contains HTML, a link or an image reference ({TAG.search(x).group(0)!r}) — lessons must be plain text")
    walk(d, "")


def check_attribution(src):
    url = src.get("url", "")
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.netloc:
        fail("source.url must be a full http(s) link to the original article")
    host = u.netloc.lower()
    if any(b in host or b in url.lower() for b in BLOCKED_HOSTS):
        fail(f"source.url must link directly to the publisher's article, not a search page, redirect, cache or mirror: {url}")
    if u.path in ("", "/") or re.fullmatch(r"/(index\.html?)?", u.path):
        fail(f"source.url points to a homepage — link the specific article instead: {url}")


def validate(d):
    for key in ("date", "category", "title_zh", "title_en", "paragraphs", "vocab", "glossary"):
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
    for i, g in enumerate(d["glossary"]):
        for k in ("w", "py", "en"):
            if not g.get(k):
                fail(f"glossary entry {i + 1} is missing '{k}'")
    missing = uncovered(d)
    if missing:
        fail("these words have no definition — add them to 'glossary' (or 'vocab') and run again: " + "、".join(missing))
    for f in d.get("featured", []):
        if not f.get("hanzi") or not f.get("examples"):
            fail("each featured word needs 'hanzi' and 'examples'")
    d.pop("takeaway", None)  # the website never shows the takeaway
    src = d.setdefault("source", {})
    src["url"] = clean_url(src.get("url", ""))
    if not src.get("name") or not src.get("name_en"):
        fail("source needs both 'name' (Chinese) and 'name_en' (English)")
    check_attribution(src)
    check_text_only(d)
    return d


def main():
    args = sys.argv[1:]
    source = None
    if "--source" in args:
        i = args.index("--source")
        if i + 1 >= len(args):
            fail("--source needs a file path")
        source = pathlib.Path(args[i + 1]).read_text(encoding="utf-8")
        args = args[:i] + args[i + 2:]
    if len(args) != 1:
        fail("usage: python3 scripts/publish.py lesson.json --source source.txt")
    if source is None:
        fail("--source is required: save everything you read about the story (fetched page text and search "
             "snippets) to a file outside the repo and pass it, so the lesson can be checked for copied wording")
    raw = json.loads(pathlib.Path(args[0]).read_text(encoding="utf-8"))
    check_text_only(raw)
    lesson = validate(raw)
    check_copying(lesson, source)
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
