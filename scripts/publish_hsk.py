#!/usr/bin/env python3
"""Add one day's HSK study words to the site.

The study list is 840 words in a fixed order: the 365 words of the "HSK 1-3 gap" sheet
(new-HSK 1–3 words that are not in the old HSK 1–3 lists), then the 475 words of the
"HSK 4 gap" sheet (new-HSK 4 words that are not in the old HSK 4 list). Each day adds
the next block of words.

Usage (from the repo root):
    python3 scripts/publish_hsk.py --next [COUNT]     # which sheet rows to read next (default 20)
    python3 scripts/publish_hsk.py day.json           # publish one day's words

day.json:
  {"date": "YYYY-MM-DD",
   "words": [{"n": 1, "hanzi": "白天", "pinyin": "báitiān", "en": "daytime", "pos": "noun",
              "level": "HSK 1",
              "examples": [{"zh": "…", "py": "…", "en": "…"}, {"zh": "…", "py": "…", "en": "…"}]}, …]}

"n" is the word's place in the 840-word order, as --next prints it. Words must start at the
next unpublished number and run on without gaps. Publishing the same date again replaces
that day's words (so a re-run is safe). Writes hsk/YYYY-MM-DD.json (the day) and updates
hsk/all.json (every word published so far; never trimmed). Only standard library.
"""
import datetime as dt
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "hsk"
ALL = DIR / "all.json"
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")

# The fixed study order: (sheet name, first data row, number of words, level hint)
PARTS = [("HSK 1-3 gap", 2, 365, "HSK 1–3"), ("HSK 4 gap", 2, 475, "HSK 4")]
TOTAL = sum(p[2] for p in PARTS)
SHEET_URL = "https://claude.ai/artifact/7Xb8e7tjmVM7DZUmuCGZtV"
LEVELS = {"HSK 1", "HSK 2", "HSK 3", "HSK 4"}
TAG = re.compile(r"<[^>]+>|https?://|www\.|\.(?:png|jpe?g|gif|webp|svg)\b", re.I)
HAN = re.compile(r"[一-鿿]")


def fail(msg):
    sys.exit(f"publish_hsk.py: {msg}")


def load_all():
    try:
        data = json.loads(ALL.read_text(encoding="utf-8"))
        if isinstance(data.get("words"), list):
            return data
    except (OSError, ValueError):
        pass
    return {"total": TOTAL, "words": []}


def place(n):
    """Sheet name and row of word number n (1-based)."""
    start = 0
    for sheet, row0, count, _ in PARTS:
        if n <= start + count:
            return sheet, row0 + (n - start - 1)
        start += count
    return None, None


def next_rows(count):
    data = load_all()
    first = len(data["words"]) + 1
    if first > TOTAL:
        print(f"All {TOTAL} words are published. Nothing to add.")
        return
    last = min(TOTAL, first + count - 1)
    print(f"Next words: {first}–{last} of {TOTAL}. Read them from the Sheet {SHEET_URL}:")
    n = first
    while n <= last:
        sheet, row = place(n)
        m = n
        while m + 1 <= last and place(m + 1)[0] == sheet:
            m += 1
        print(f'  sheet "{sheet}", rows {row}–{place(m)[1]} → words n={n}–{m}')
        n = m + 1
    print("Columns: A Word, B Pinyin, C English, D Example 1, E Example 2, F Part of speech"
          " (the HSK 1-3 gap sheet also has G New level).")


def check_text(x, path):
    if isinstance(x, dict):
        for k, v in x.items():
            check_text(v, f"{path}.{k}")
    elif isinstance(x, list):
        for i, v in enumerate(x):
            check_text(v, f"{path}[{i}]")
    elif isinstance(x, str) and TAG.search(x):
        fail(f"{path} contains HTML, a link or an image reference — plain text only")


def publish(path):
    day = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    check_text(day, "day")
    date = day.get("date", "")
    try:
        dt.date.fromisoformat(date)
    except ValueError:
        fail(f"bad date {date!r}, expected YYYY-MM-DD")
    words = day.get("words") or []
    if not words:
        fail("'words' is empty")
    if len(words) > 40:
        fail("at most 40 words a day")

    data = load_all()
    data["words"] = [w for w in data["words"] if w.get("date") != date]  # re-running a date replaces it
    if any(w.get("date", "") > date for w in data["words"]):
        fail(f"a later day is already published; {date} can't be added before it")
    expect = len(data["words"]) + 1
    seen = {(w["hanzi"], w["n"]) for w in data["words"]}

    out = []
    for i, w in enumerate(words):
        where = f"word {i + 1}"
        for k in ("n", "hanzi", "pinyin", "en", "level"):
            if not w.get(k):
                fail(f"{where} is missing '{k}'")
        if w["n"] != expect + i:
            fail(f"{where} has n={w['n']}, expected n={expect + i} (run --next to see which rows to read)")
        if w["n"] > TOTAL:
            fail(f"{where}: n={w['n']} is past the end of the {TOTAL}-word list")
        if not HAN.search(w["hanzi"]):
            fail(f"{where}: hanzi {w['hanzi']!r} has no Chinese characters")
        if w["level"] not in LEVELS:
            fail(f"{where}: level must be one of {sorted(LEVELS)}")
        sheet, _ = place(w["n"])
        if sheet == "HSK 4 gap" and w["level"] != "HSK 4":
            fail(f"{where}: words from the HSK 4 gap sheet have level 'HSK 4'")
        if sheet == "HSK 1-3 gap" and w["level"] == "HSK 4":
            fail(f"{where}: words from the HSK 1-3 gap sheet have level HSK 1, 2 or 3 (column G)")
        exs = w.get("examples") or []
        if len(exs) < 2:
            fail(f"{where} ({w['hanzi']}) needs 2 examples")
        for j, e in enumerate(exs):
            for k in ("zh", "py", "en"):
                if not e.get(k):
                    fail(f"{where} ({w['hanzi']}) example {j + 1} is missing '{k}'")
        if (w["hanzi"], w["n"]) in seen:
            fail(f"{where} ({w['hanzi']}) is already published")
        out.append({"n": w["n"], "hanzi": w["hanzi"], "pinyin": w["pinyin"], "en": w["en"],
                    "pos": w.get("pos", ""), "level": w["level"], "date": date,
                    "examples": [{"zh": e["zh"], "py": e["py"], "en": e["en"]} for e in exs[:3]]})

    DIR.mkdir(exist_ok=True)
    (DIR / f"{date}.json").write_text(
        json.dumps({"date": date, "total": TOTAL, "words": out}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    data["total"] = TOTAL
    data["words"] = sorted(data["words"] + out, key=lambda w: w["n"])
    ALL.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote hsk/{date}.json ({len(out)} words, n={out[0]['n']}–{out[-1]['n']}); "
          f"hsk/all.json now has {len(data['words'])} / {TOTAL} words")

    # keep only the last 7 daily files (all.json keeps every word)
    cutoff = (dt.date.fromisoformat(date) - dt.timedelta(days=6)).isoformat()
    for f in sorted(DIR.glob("*.json")):
        if DAY_RE.match(f.name) and f.stem < cutoff:
            f.unlink()
            print(f"removed hsk/{f.name} (older than 7 days; its words stay in all.json)")


def main():
    args = sys.argv[1:]
    if args and args[0] == "--next":
        next_rows(int(args[1]) if len(args) > 1 else 20)
    elif len(args) == 1:
        publish(args[0])
    else:
        fail("usage: publish_hsk.py --next [COUNT]  |  publish_hsk.py day.json")


if __name__ == "__main__":
    main()
