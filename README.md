# 每日金融 · 金融科技

Daily Chinese finance & fintech news lessons for an HSK 4 learner, published with GitHub Pages.

Site: https://kasiditpruek.github.io/daily-finance-fintech-news-china/

## How it works

- Two scheduled Claude tasks write one lesson each: **金融** every morning, **金融科技** on weekday lunchtimes (Bangkok time).
- Each lesson is a JSON file in `lessons/`, named `YYYY-MM-DD-finance.json` or `YYYY-MM-DD-fintech.json`.
- `scripts/publish.py lesson.json` validates a lesson, writes it to `lessons/`, and deletes that category's lessons older than 7 days.
- `vocab` is the 生词 list (words above HSK 4); `glossary` defines every other word, so readers can tap any word in the article. `publish.py` refuses a lesson where any Chinese character in the title or paragraphs has no definition.
- The lesson page reads the article aloud with the device's built-in Chinese voice (no audio files, no cost).
- The pages (`index.html`, `lesson.html`, `vocab.html`) are plain HTML + `assets/app.js`, which loads the last 7 days of lesson files in the browser. No build step; `.nojekyll` tells GitHub Pages to serve files as they are.

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
