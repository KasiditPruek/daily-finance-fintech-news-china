# 每日金融 · 金融科技

Daily Chinese finance, fintech & business news lessons for an HSK 4 learner, plus a daily HSK word list,, published with GitHub Pages.

Site: https://kasiditpruek.github.io/daily-finance-fintech-news-china/

## How it works

- One scheduled Claude task runs every morning (Bangkok time) and writes three lessons, **金融**, **金融科技** and **商业** (business), plus 20 HSK study words.
- Each lesson is a JSON file in `lessons/`, named `YYYY-MM-DD-<category>.json` with category `finance`, `fintech` or `business`.
- `scripts/publish.py lesson.json --source source.txt` validates a lesson, writes it to `lessons/`, and deletes that category's lessons older than 7 days.
- `vocab` is the 生词 list (words above HSK 4); `glossary` defines every other word, so readers can tap any word in the article. `publish.py` refuses a lesson where any Chinese character in the title or paragraphs has no definition.
- `publish.py` also adds each lesson's 生词 to `lessons/vocab-all.json`, a permanent word list (word, pinyin, meaning, level, dates seen; no article text). It is never trimmed, so commit it together with the lesson file. `python3 scripts/publish.py --backfill` rebuilds it from the lessons currently in `lessons/`.
- **Study loop.** Tap a word and mark it 学习中 (learning) or 认识 (known). Known words stop being highlighted; learning words come back on the 复习 page as flashcards after 1, 3, 7, 14, 30 and 60 days. English translations stay hidden until you ask for them, paragraph by paragraph. All of this is saved in the reader's browser (`localStorage`), nothing is sent anywhere.
- The lesson page reads the article aloud with the device's built-in Chinese voice (no audio files, no cost).
- **HSK 词汇.** `hsk.html` teaches 840 words in a fixed order: the 365 words new HSK 1–3 added to the old HSK 1–3 lists, then the 475 words new HSK 4 added to the old HSK 4 list (from the "HSK 4 words added in HSK 3.0" Sheet). `python3 scripts/publish_hsk.py --next` says which Sheet rows come next; `python3 scripts/publish_hsk.py day.json` writes `hsk/YYYY-MM-DD.json` and adds the words to `hsk/all.json` (never trimmed). Marking a word 学/会 uses the same study loop and review queue as lesson words, and lesson words on the list get a 词表 tag.
- The pages (`index.html`, `lesson.html`, `hsk.html`, `vocab.html`, `review.html`) are plain HTML + `assets/app.js`, which loads the last 7 days of lesson files in the browser. No build step; `.nojekyll` tells GitHub Pages to serve files as they are.

## Legal safeguards

- **Facts only.** Lessons are written from the basic facts of a story (what happened, who announced what, numbers, officials' statements) in simple Chinese, in our own order and words. No outlet's structure, headline, wording, analysis or commentary; no expert/analyst opinions; no paywalled details.
- **Copy check.** `publish.py --source` compares the lesson with everything the job read about the story and refuses to publish if they share a run of 12+ characters, if the headline shares 8+, or if more than 20% of the wording overlaps.
- **Text only.** Lessons may not contain HTML, links or image references; the pages' Content-Security-Policy blocks images and media from any other site. The only graphics are our own flag SVG and emoji.
- **Respectful sourcing.** Pages are read only through normal public access that honours robots.txt; no paywall bypassing, logins, caches or mirrors.
- **Attribution.** Every lesson names the outlet in Chinese and English and links directly to the original article, at the top and bottom of the page. Homepages, search pages and redirects are rejected.
- **Not advice.** The footer states the site is for language study only, not financial or investment advice. Only the last 7 days are kept.

## Lesson format

```json
{
  "date": "2026-10-22",
  "category": "finance",
  "title_zh": "…",
  "title_en": "…",
  "paragraphs": [{ "zh": "…", "en": "…" }],
  "source": { "name": "第一财经", "name_en": "Yicai (China Business Network)", "url": "https://…" },
  "vocab": [{ "hanzi": "债券", "pinyin": "zhàiquàn", "en": "bond", "hsk": "HSK 7–9" }],
  "glossary": [{ "w": "宣布", "py": "xuānbù", "en": "to announce" }],
  "featured": [{
    "hanzi": "债券", "pinyin": "zhàiquàn", "pos": "noun", "en": "bond",
    "note": "发行债券 / 债券市场 …",
    "examples": [{ "zh": "…", "py": "…", "en": "…" }]
  }]
}
```

## GitHub Pages setup

Settings → Pages → Build and deployment → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)**.

Lessons are original simplified summaries written for language study; each links to its original publisher.
