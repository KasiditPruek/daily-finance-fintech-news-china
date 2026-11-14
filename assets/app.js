/* 每日金融 · 金融科技 — renders lesson JSON files from /lessons/ and keeps the reader's word list */
(function () {
  "use strict";

  var CATS = {
    finance: { zh: "金融", en: "Finance" },
    fintech: { zh: "金融科技", en: "Fintech" }
  };
  var WINDOW_DAYS = 9; // probe a little beyond 7 days so a late run never hides a lesson

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function bangkokDate(offsetDays) {
    var d = new Date(Date.now() + (offsetDays || 0) * 864e5);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
  }
  function prettyDate(iso) {
    var p = iso.split("-");
    var wd = ["日", "一", "二", "三", "四", "五", "六"][new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()];
    return (+p[1]) + "月" + (+p[2]) + "日 星期" + wd;
  }
  function chip(cat) {
    return '<span class="chip ' + esc(cat) + '">' + esc((CATS[cat] || {}).zh || cat) + "</span>";
  }
  function lessonUrl(l) { return "lesson.html?d=" + encodeURIComponent(l.date) + "&c=" + encodeURIComponent(l.category); }

  function fetchLesson(date, cat) {
    return fetch("lessons/" + date + "-" + cat + ".json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return null;
        j.date = j.date || date; j.category = j.category || cat;
        return j;
      })
      .catch(function () { return null; });
  }

  /* All lessons from the recent window, newest first. */
  function loadRecent() {
    var jobs = [];
    for (var i = 0; i < WINDOW_DAYS; i++) {
      var d = bangkokDate(-i);
      Object.keys(CATS).forEach(function (c) { jobs.push(fetchLesson(d, c)); });
    }
    return Promise.all(jobs).then(function (all) {
      return all.filter(Boolean).sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.category === "finance" ? -1 : 1;
      });
    });
  }

  function splitSentences(text) {
    var parts = text.match(/[^。！？；!?]+[。！？；!?”"」）)]*/g) || [text];
    return parts.filter(function (s) { return s.trim(); });
  }

  /* ---------- my words: status + spaced review, saved in this browser ----------
     WORDS[hanzi] = { s: "l" (learning) | "k" (known), py, en, hsk, ctx, ctxEn, step, due }
     A learning word comes back after 1, 3, 7, 14, 30 and 60 days, then counts as known. */
  var WKEY = "my-words";
  var STEPS = [1, 3, 7, 14, 30, 60];
  var WORDS = (function () {
    try { return JSON.parse(localStorage.getItem(WKEY)) || {}; } catch (e) { return {}; }
  })();

  function day(offset) {
    var d = new Date(); d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function saveWords() {
    try { localStorage.setItem(WKEY, JSON.stringify(WORDS)); } catch (e) { /* private mode: keep in memory */ }
    paintDue();
  }
  function statusOf(h) { return WORDS[h] ? WORDS[h].s : ""; }
  // entry: { w, py, en, hsk }; ctx: { zh, en } sentence the word was met in (kept only in this browser)
  function setStatus(entry, s, ctx) {
    if (!s) { delete WORDS[entry.w]; saveWords(); return; }
    var old = WORDS[entry.w] || {};
    WORDS[entry.w] = {
      s: s, py: entry.py || old.py || "", en: entry.en || old.en || "", hsk: entry.hsk || old.hsk || "",
      ctx: (ctx && ctx.zh) || old.ctx || "", ctxEn: (ctx && ctx.en) || old.ctxEn || "",
      step: s === "l" && old.s === "l" ? old.step : 0,
      due: s === "l" ? (old.s === "l" ? old.due : day(0)) : ""
    };
    saveWords();
  }
  function grade(h, ok) {
    var r = WORDS[h];
    if (!r || r.s !== "l") return;
    if (!ok) { r.step = 0; r.due = day(0); }
    else if (r.step >= STEPS.length) { r.s = "k"; r.due = ""; }
    else { r.due = day(STEPS[r.step]); r.step++; }
    saveWords();
  }
  function wordsWith(s) { return Object.keys(WORDS).filter(function (h) { return WORDS[h].s === s; }); }
  function dueWords() {
    var t = day(0);
    return wordsWith("l").filter(function (h) { return WORDS[h].due <= t; });
  }
  function paintDue() {
    var b = $("#due");
    if (!b) return;
    var n = dueWords().length;
    b.hidden = !n; b.textContent = n;
    b.setAttribute("aria-label", n + " words to review");
  }
  function statusButtons(h) {
    var s = statusOf(h);
    return '<span class="st" data-h="' + esc(h) + '">' +
      '<button type="button" data-s="l" aria-pressed="' + (s === "l") + '" title="学习中 Learning: review this word">学</button>' +
      '<button type="button" data-s="k" aria-pressed="' + (s === "k") + '" title="认识 Known: stop highlighting it">会</button></span>';
  }

  /* ---------- speech ---------- */
  var synth = window.speechSynthesis, zhVoice = null, stopPlayer = null;
  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices().filter(function (v) { return /^zh[-_](CN|Hans)/i.test(v.lang) || v.lang === "zh"; });
    vs.sort(function (a, b) { return score(b) - score(a); });
    zhVoice = vs[0] || null;
    function score(v) { return (/natural|neural|online/i.test(v.name) ? 4 : 0) + (/xiaoxiao|yunxi|tingting|google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1); }
  }
  if (synth) {
    pickVoice();
    if (typeof synth.onvoiceschanged !== "undefined") synth.onvoiceschanged = pickVoice;
  }
  var canSpeak = !!(synth && window.SpeechSynthesisUtterance);
  function say(text) {
    if (!canSpeak) return;
    if (stopPlayer) stopPlayer();
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = 0.85;
    synth.speak(u);
  }
  var SPEAKER = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm11.5 3a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5zm-2-8.7v2.1a6.9 6.9 0 0 1 0 13.2v2.1a9 9 0 0 0 0-17.4z"/></svg>';
  function sayButton(text, label) {
    return canSpeak ? '<button type="button" class="say" data-say="' + esc(text) + '" aria-label="' + esc(label || "Listen") + '">' + SPEAKER + "</button>" : "";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-say]");
    if (b) say(b.getAttribute("data-say"));
  });

  /* ---------- display toggles (shared) ---------- */
  function setupToggles() {
    var defs = { en: "hide-en", py: "hide-py", hl: "no-hl" };
    $$("[data-toggle]").forEach(function (btn) {
      var key = btn.getAttribute("data-toggle"), cls = defs[key];
      var saved = store("t2-" + key);
      var on = saved ? saved === "on" : btn.getAttribute("data-default") !== "off";
      apply(on);
      btn.addEventListener("click", function () {
        on = !on; apply(on); store("t2-" + key, on ? "on" : "off");
      });
      function apply(v) {
        btn.setAttribute("aria-pressed", v ? "true" : "false");
        document.body.classList.toggle(cls, !v);
      }
    });
  }

  function markTabs(cat) {
    var page = document.body.getAttribute("data-page");
    $$(".tabs a").forEach(function (a) {
      var on = a.getAttribute("data-p") ? a.getAttribute("data-p") === page : a.getAttribute("data-c") === cat;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  /* ---------- home ---------- */
  function renderStudy() {
    var el = $("#study");
    if (!el) return;
    var due = dueWords().length, learning = wordsWith("l").length, known = wordsWith("k").length;
    if (!learning && !known) {
      el.innerHTML = '<div class="study-main"><p class="study-line">还没有生词。</p>' +
        '<p class="meta">Open a lesson and tap any word. Mark it 学习中 to review it later, or 认识 so it stops being highlighted.</p></div>';
      return;
    }
    el.innerHTML =
      '<div class="study-main">' +
      (due ? '<p class="study-line">今天要复习 <b>' + due + '</b> 个词</p><p class="meta">' + due + " word" + (due === 1 ? "" : "s") + " due for review today</p>"
           : '<p class="study-line">今天的复习做完了</p><p class="meta">Nothing due today. Read a lesson and add new words.</p>') +
      "</div>" +
      '<dl class="study-stats"><div><dt>学习中 Learning</dt><dd>' + learning + "</dd></div><div><dt>认识 Known</dt><dd>" + known + "</dd></div></dl>" +
      (due ? '<a class="btn primary" href="review.html">开始复习 Start review</a>'
           : (learning ? '<a class="btn" href="review.html?mode=all">练习全部 Practise all</a>' : '<a class="btn" href="vocab.html">打开生词本 Open word list</a>'));
  }

  function renderHome() {
    var todayEl = $("#today"), listEl = $("#list");
    var filter = new URLSearchParams(location.search).get("c") || "all";
    markTabs(filter);
    renderStudy();

    loadRecent().then(function (lessons) {
      if (!lessons.length) {
        todayEl.innerHTML = '<p class="empty">还没有课文。The first lesson will appear after the next scheduled run.</p>';
        listEl.innerHTML = "";
        return;
      }
      var shown = filter === "all" ? lessons : lessons.filter(function (l) { return l.category === filter; });

      // Latest lesson of each (shown) category
      var latest = {};
      shown.forEach(function (l) { if (!latest[l.category]) latest[l.category] = l; });
      var cards = Object.keys(CATS).filter(function (c) { return latest[c]; }).map(function (c) {
        var l = latest[c], first = (l.paragraphs && l.paragraphs[0]) || {};
        var fresh = (l.vocab || []).filter(function (v) { return statusOf(v.hanzi) !== "k"; }).length;
        return '<a class="card ' + esc(c) + '" href="' + lessonUrl(l) + '">' +
          '<div class="card-top">' + chip(c) + '<span class="meta">' + esc(prettyDate(l.date)) + "</span></div>" +
          '<h3 lang="zh-CN">' + esc(l.title_zh) + "</h3>" +
          '<p class="en">' + esc(l.title_en) + "</p>" +
          '<p class="lede" lang="zh-CN">' + esc(first.zh) + "</p>" +
          '<div class="foot meta"><span>你的生词 ' + fresh + " 个</span>" +
          (l.source && l.source.name ? "<span>来源：" + esc(l.source.name) + "</span>" : "") + "</div></a>";
      });
      todayEl.innerHTML = cards.join("") || '<p class="empty">这个分类最近没有课文。</p>';

      var latestSet = Object.keys(latest).map(function (c) { return latest[c]; });
      var rest = shown.filter(function (l) { return latestSet.indexOf(l) === -1; });
      listEl.innerHTML = rest.length ? rest.map(function (l) {
        return '<li><a href="' + lessonUrl(l) + '"><span class="d">' + esc(l.date.slice(5).replace("-", "/")) +
          "</span>" + chip(l.category) + '<span class="tt"><span class="t" lang="zh-CN">' + esc(l.title_zh) +
          '</span><span class="s">' + esc(l.title_en) + "</span></span></a></li>";
      }).join("") : '<li class="empty">No earlier lessons in the past 7 days.</li>';
    });
  }

  /* ---------- lesson ---------- */
  // One dictionary per lesson: 生词 (with HSK level) + glossary (every other word in the text).
  function buildDict(l) {
    var map = {}, max = 1;
    (l.glossary || []).forEach(function (g) { if (g.w) map[g.w] = { w: g.w, py: g.py, en: g.en }; });
    (l.vocab || []).forEach(function (v) {
      if (!v.hanzi || /…|\.\.\./.test(v.hanzi)) return;
      map[v.hanzi] = { w: v.hanzi, py: v.pinyin, en: v.en, hsk: v.hsk, sc: true };
    });
    Object.keys(map).forEach(function (k) { if (k.length > max) max = k.length; });
    return { map: map, max: max };
  }

  // Greedy longest-match segmentation — the same rule scripts/publish.py checks.
  function segment(text, D) {
    var out = [], i = 0;
    while (i < text.length) {
      var hit = null;
      for (var L = Math.min(D.max, text.length - i); L > 0; L--) {
        var s = text.substr(i, L);
        if (D.map.hasOwnProperty(s)) { hit = s; break; }
      }
      if (hit) { out.push({ t: hit, e: D.map[hit] }); i += hit.length; }
      else {
        if (out.length && !out[out.length - 1].e) out[out.length - 1].t += text.charAt(i);
        else out.push({ t: text.charAt(i) });
        i++;
      }
    }
    return out;
  }

  // Builds clickable word HTML and records sentences for the audio player.
  function makeReader(D) {
    var entries = [], sentences = [], pos = 0;
    function words(text) {
      return segment(text, D).map(function (tok) {
        if (!tok.e) return esc(tok.t);
        var k = entries.push(tok.e) - 1;
        if (tok.e.sc) return '<ruby class="w v" data-k="' + k + '">' + esc(tok.t) + "<rt>" + esc(tok.e.py) + "</rt></ruby>";
        return '<span class="w" data-k="' + k + '">' + esc(tok.t) + "</span>";
      }).join("");
    }
    function block(text, en) {
      return splitSentences(text).map(function (s) {
        var i = sentences.push({ text: s, start: pos, en: en || "" }) - 1;
        pos += s.length;
        return '<span class="sent" data-s="' + i + '">' + words(s) + "</span>";
      }).join("");
    }
    return { block: block, entries: entries, sentences: sentences, total: function () { return pos; } };
  }

  function showBtn() {
    return '<button type="button" class="tr-btn" aria-expanded="false">看翻译 Show English</button>';
  }

  function renderLesson() {
    var q = new URLSearchParams(location.search), d = q.get("d"), c = q.get("c");
    var root = $("#lesson");
    markTabs(c);
    if (!d || !c) { root.innerHTML = '<p class="empty">Lesson not found. <a href="./">回首页</a></p>'; return; }

    Promise.all([fetchLesson(d, c), loadRecent()]).then(function (res) {
      var l = res[0], recent = res[1];
      if (!l) {
        root.innerHTML = '<p class="empty">这篇课文已经过期或不存在。This lesson is older than 7 days or does not exist. <a href="./">回首页</a></p>';
        return;
      }
      document.title = l.title_zh + " · 每日金融";

      var D = buildDict(l), R = makeReader(D);
      var titleHtml = R.block(l.title_zh, l.title_en);
      var paras = (l.paragraphs || []).map(function (p) {
        return '<div class="para tr"><p class="zh" lang="zh-CN">' + R.block(p.zh, p.en) + "</p>" + showBtn() +
          '<p class="en">' + esc(p.en) + "</p></div>";
      }).join("");

      var src = l.source || {};
      var label = esc(src.name || "") + (src.name_en ? " · " + esc(src.name_en) : "");
      var srcHtml = (src.name || src.url)
        ? '<p class="source">来源 Source：' + (src.url ? '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + (label || esc(src.url)) + "</a>" : label) +
          (src.date ? " · " + esc(src.date) : "") + "</p>"
        : "";

      var feat = (l.featured || []).map(function (f) {
        var ex = (f.examples || []).map(function (e) {
          return '<div class="ex"><div class="z" lang="zh-CN">' + esc(e.zh) + sayButton(e.zh, "Listen to the example") + '</div><div class="y">' + esc(e.py) +
            '</div><div class="e">' + esc(e.en) + "</div></div>";
        }).join("");
        return '<div class="fw"><div class="fw-head"><span class="big" lang="zh-CN">' + esc(f.hanzi) + '</span><span class="p">' + esc(f.pinyin) + "</span>" +
          sayButton(f.hanzi, "Listen to " + f.hanzi) + "</div>" +
          '<p class="def">' + (f.pos ? '<span class="pos">' + esc(f.pos) + "</span>" : "") + esc(f.en) + "</p>" +
          (f.note ? '<p class="note">' + esc(f.note) + "</p>" : "") + ex + "</div>";
      }).join("");

      var vocab = (l.vocab || []).filter(function (v) { return D.map[v.hanzi]; });
      var vocabHtml = vocab.length
        ? '<section class="lv"><div class="lv-head"><h2>本课生词 <span class="sub">Words in this lesson</span></h2>' +
          '<span id="lvcount" class="meta"></span>' +
          '<button type="button" id="knowrest" class="btn small">其余都认识 I know the rest</button></div>' +
          '<ul class="lv-list">' + vocab.map(function (v) {
            return '<li><span class="h" lang="zh-CN">' + esc(v.hanzi) + '</span><span class="p">' + esc(v.pinyin) + "</span>" +
              '<span class="m">' + esc(v.en) + '</span><span class="lvl">' + esc(v.hsk || "") + "</span>" + statusButtons(v.hanzi) + "</li>";
          }).join("") + "</ul></section>"
        : "";

      var same = recent.filter(function (x) { return x.category === c; });
      var idx = -1;
      same.forEach(function (x, i) { if (x.date === d) idx = i; });
      var newer = idx > 0 ? same[idx - 1] : null, older = idx >= 0 ? same[idx + 1] : null;

      root.innerHTML =
        '<header class="lesson-head tr"><div class="card-top">' + chip(c) + '<span class="meta">' + esc(prettyDate(l.date)) + "</span></div>" +
        '<h1 lang="zh-CN">' + titleHtml + "</h1>" + showBtn() + '<p class="en">' + esc(l.title_en) + "</p>" +
        (src.url ? '<p class="orig">原文报道 Originally reported by：<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' +
          (label || esc(src.url)) + "</a></p>" : "") + "</header>" +
        '<div class="article">' + paras + srcHtml + "</div>" +
        vocabHtml +
        (feat ? '<section class="featured"><h2>重点词汇 <span class="sub">Key words</span></h2><div class="featured-grid">' + feat + "</div></section>" : "") +
        '<nav class="pager">' +
        (older ? '<a href="' + lessonUrl(older) + '"><span class="meta">上一篇 Older · ' + esc(older.date.slice(5)) + "</span>" + esc(older.title_zh) + "</a>" : "<span></span>") +
        (newer ? '<a class="next" href="' + lessonUrl(newer) + '"><span class="meta">下一篇 Newer · ' + esc(newer.date.slice(5)) + "</span>" + esc(newer.title_zh) + "</a>" : "") +
        "</nav>";

      // per-paragraph translation reveal
      root.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".tr-btn");
        if (!b) return;
        var on = b.parentNode.classList.toggle("show-en");
        b.setAttribute("aria-expanded", on ? "true" : "false");
        b.textContent = on ? "收起翻译 Hide English" : "看翻译 Show English";
      });

      function ctxFor(word) {
        for (var i = 1; i < R.sentences.length; i++) if (R.sentences[i].text.indexOf(word) !== -1) return { zh: R.sentences[i].text, en: R.sentences[i].en };
        return R.sentences[0] && R.sentences[0].text.indexOf(word) !== -1 ? { zh: R.sentences[0].text, en: R.sentences[0].en } : null;
      }
      function paint() {
        $$(".w", root).forEach(function (el) {
          var s = statusOf(R.entries[+el.getAttribute("data-k")].w);
          el.classList.toggle("l", s === "l"); el.classList.toggle("k", s === "k");
        });
        $$(".st", root).forEach(function (st) {
          var s = statusOf(st.getAttribute("data-h"));
          $$("button", st).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-s") === s ? "true" : "false"); });
        });
        var cnt = $("#lvcount");
        if (cnt) {
          var k = 0, ln = 0;
          vocab.forEach(function (v) { var s = statusOf(v.hanzi); if (s === "k") k++; if (s === "l") ln++; });
          cnt.textContent = vocab.length + " 个 · 学习中 " + ln + " · 认识 " + k;
          $("#knowrest").hidden = k + ln === vocab.length;
        }
      }
      function change(entry, s, ctx) {
        setStatus(entry, statusOf(entry.w) === s ? "" : s, ctx || ctxFor(entry.w));
        paint();
      }
      root.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".st button");
        if (b) { change(D.map[b.parentNode.getAttribute("data-h")], b.getAttribute("data-s")); return; }
        if (e.target.id === "knowrest") {
          vocab.forEach(function (v) { if (!statusOf(v.hanzi)) setStatus(D.map[v.hanzi], "k", ctxFor(v.hanzi)); });
          paint();
        }
      });

      paint();
      wireWords(R, change);
      setupPlayer(R.sentences, R.total());
    });
  }

  /* Tap any word → pinyin, meaning, audio and "learning / known" buttons. */
  function wireWords(R, change) {
    var pop = document.createElement("div");
    pop.className = "pop"; pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Word");
    document.body.appendChild(pop);
    var current = null, entry = null;
    function clear() {
      pop.hidden = true;
      if (current) current.classList.remove("active");
      current = null; entry = null;
    }
    function draw() {
      var s = statusOf(entry.w);
      pop.innerHTML =
        '<div class="pop-head"><b lang="zh-CN">' + esc(entry.w) + '</b><span class="py">' + esc(entry.py) + "</span>" + sayButton(entry.w, "Listen to " + entry.w) +
        '<button type="button" class="pop-x" aria-label="Close">×</button></div>' +
        '<p class="pop-en">' + esc(entry.en) + (entry.sc && entry.hsk ? ' <span class="tag">' + esc(entry.hsk) + "</span>" : "") + "</p>" +
        '<div class="pop-act"><button type="button" data-s="l" aria-pressed="' + (s === "l") + '">学习中 Learning</button>' +
        '<button type="button" data-s="k" aria-pressed="' + (s === "k") + '">认识 Know it</button></div>';
    }
    pop.addEventListener("click", function (e) {
      if (e.target.closest(".pop-x")) { clear(); return; }
      var b = e.target.closest(".pop-act button");
      if (!b || !entry) return;
      var sent = current && current.closest(".sent"), s = sent && R.sentences[+sent.getAttribute("data-s")];
      change(entry, b.getAttribute("data-s"), s ? { zh: s.text, en: s.en } : null);
      draw();
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".pop")) return;
      var w = e.target.closest && e.target.closest(".w");
      if (!w) { clear(); return; }
      if (current === w) { clear(); return; }
      clear(); current = w; w.classList.add("active");
      entry = R.entries[+w.getAttribute("data-k")];
      draw();
      pop.hidden = false;
      var b = w.getBoundingClientRect(), width = pop.offsetWidth || 280;
      var left = Math.max(8, Math.min(window.scrollX + b.left, window.scrollX + document.documentElement.clientWidth - width - 8));
      pop.style.left = left + "px";
      pop.style.top = (window.scrollY + b.bottom + 8) + "px";
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") clear(); });
    window.addEventListener("resize", clear);
  }

  /* Read the whole lesson aloud with the device's Chinese voice; the bar seeks by position in the text. */
  function setupPlayer(sentences, total) {
    var bar = $("#player");
    if (!bar) return;
    if (!canSpeak || !sentences.length) {
      bar.innerHTML = '<span class="meta">这个浏览器不能朗读。Read-aloud isn\'t supported in this browser.</span>';
      return;
    }
    bar.innerHTML =
      '<button class="play" type="button" aria-label="Play">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="i-play" d="M7 4.5v15l13-7.5z"/><path class="i-pause" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg></button>' +
      '<input class="seek" type="range" min="0" max="' + Math.max(total - 1, 0) + '" step="1" value="0" aria-label="Position in the text">' +
      '<span class="ptime meta">1 / ' + sentences.length + "</span>";
    var btn = bar.querySelector(".play"), seek = bar.querySelector(".seek"), label = bar.querySelector(".ptime");
    var cur = 0, playing = false, run = 0, dragging = false;

    function sentAt(p) {
      for (var i = sentences.length - 1; i >= 0; i--) if (sentences[i].start <= p) return i;
      return 0;
    }
    function mark(i) {
      $$(".sent.speaking").forEach(function (n) { n.classList.remove("speaking"); });
      var el = document.querySelector('.sent[data-s="' + i + '"]');
      if (el) el.classList.add("speaking");
      label.textContent = (i + 1) + " / " + sentences.length;
      return el;
    }
    function setPlaying(v) {
      playing = v; bar.classList.toggle("is-playing", v);
      btn.setAttribute("aria-label", v ? "Pause" : "Play");
    }
    function speak(i, offset) {
      var my = ++run;
      synth.cancel();
      if (i >= sentences.length) { setPlaying(false); cur = 0; seek.value = 0; mark(0); return; }
      cur = i;
      var s = sentences[i], text = s.text.slice(offset || 0);
      var el = mark(i);
      if (!dragging) seek.value = s.start + (offset || 0);
      if (el) {
        var r = el.getBoundingClientRect();
        if (r.top < 120 || r.bottom > window.innerHeight - 40) window.scrollBy({ top: r.top - window.innerHeight / 3, behavior: "smooth" });
      }
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = 0.95;
      u.onboundary = function (ev) { if (my === run && !dragging) seek.value = s.start + (offset || 0) + (ev.charIndex || 0); };
      u.onend = function () { if (my === run && playing) speak(i + 1, 0); };
      u.onerror = function () { if (my === run && playing) speak(i + 1, 0); };
      synth.speak(u);
    }
    function pause() { run++; synth.cancel(); setPlaying(false); }
    stopPlayer = function () { if (playing) pause(); };
    btn.addEventListener("click", function () {
      if (playing) { pause(); return; }
      setPlaying(true); speak(cur, 0);
    });
    seek.addEventListener("input", function () { dragging = true; var i = sentAt(+seek.value); mark(i); });
    seek.addEventListener("change", function () {
      dragging = false;
      var i = sentAt(+seek.value);
      cur = i; seek.value = sentences[i].start;
      if (playing) speak(i, 0); else mark(i);
    });
    document.addEventListener("click", function (e) {
      // Double-click/tap a sentence to jump there.
      var s = e.detail === 2 && e.target.closest && e.target.closest(".sent");
      if (s) { var i = +s.getAttribute("data-s"); cur = i; seek.value = sentences[i].start; if (playing) speak(i, 0); else mark(i); }
    });
    window.addEventListener("pagehide", function () { run++; synth.cancel(); });
  }

  /* ---------- word list page ---------- */
  function plain(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "v").toLowerCase(); }

  // First sentence in the current lessons that uses the word (for flashcards).
  function contextFinder(lessons) {
    var sents = [];
    lessons.forEach(function (l) {
      (l.paragraphs || []).forEach(function (p) {
        splitSentences(p.zh || "").forEach(function (s) { sents.push({ zh: s, en: p.en || "" }); });
      });
    });
    return function (h) {
      for (var i = 0; i < sents.length; i++) if (sents[i].zh.indexOf(h) !== -1) return sents[i];
      return null;
    };
  }

  function renderVocab() {
    var body = $("#vbody"), count = $("#vcount"), input = $("#vsearch"), practise = $("#practise");
    markTabs();
    var sel = { fscope: "week", fstatus: "all", flevel: "all" };
    var archive = null, week = [], shown = [], findCtx = function () { return null; };

    function lessonLinks(seen, byKey) {
      return seen.map(function (key) {
        var l = byKey[key], d = key.slice(5, 10), c = (CATS[key.slice(11)] || {}).zh || "";
        return l ? '<a href="' + lessonUrl(l) + '" title="' + esc(l.title_zh) + '">' + esc(d + " " + c) + "</a>"
                 : "<span>" + esc(d + " " + c) + "</span>";
      }).join("");
    }

    loadRecent().then(function (lessons) {
      var map = {}, byKey = {};
      findCtx = contextFinder(lessons);
      lessons.forEach(function (l) {
        var key = l.date + "-" + l.category; byKey[key] = l;
        (l.vocab || []).forEach(function (v) {
          if (!v.hanzi || /…|\.\.\./.test(v.hanzi)) return;
          if (!map[v.hanzi]) { map[v.hanzi] = { w: v.hanzi, py: v.pinyin, en: v.en, hsk: v.hsk || "", seen: [] }; week.push(map[v.hanzi]); }
          if (map[v.hanzi].seen.indexOf(key) === -1) map[v.hanzi].seen.push(key);
        });
      });
      week.sort(function (a, b) { return b.seen.length - a.seen.length; });

      function rows() {
        if (sel.fscope === "week") return week;
        var all = {}, out = [];
        Object.keys((archive && archive.words) || {}).forEach(function (h) {
          var a = archive.words[h];
          all[h] = { w: h, py: a.py, en: a.en, hsk: a.hsk || "", seen: (a.seen || []).slice().reverse() };
        });
        week.forEach(function (r) { if (!all[r.w]) all[r.w] = r; });
        // words you saved from lessons that are not in the published list (e.g. below HSK 5)
        Object.keys(WORDS).forEach(function (h) { if (!all[h]) all[h] = { w: h, py: WORDS[h].py, en: WORDS[h].en, hsk: WORDS[h].hsk || "", seen: [] }; });
        Object.keys(all).forEach(function (h) { out.push(all[h]); });
        return out.sort(function (a, b) { return b.seen.length - a.seen.length || (a.w < b.w ? -1 : 1); });
      }

      function draw() {
        var raw = input.value.trim(), q = plain(raw), all = rows();
        shown = all.filter(function (r) {
          var s = statusOf(r.w);
          if (sel.fstatus !== "all" && (sel.fstatus === "new" ? s : s !== sel.fstatus)) return false;
          if (sel.flevel !== "all" && r.hsk.indexOf(sel.flevel) === -1) return false;
          if (!q) return true;
          return r.w.indexOf(raw) !== -1 || plain(r.py).replace(/\s/g, "").indexOf(q.replace(/\s/g, "")) !== -1 || plain(r.en).indexOf(q) !== -1;
        });
        count.textContent = shown.length + " / " + all.length + " 个词";
        practise.disabled = !shown.length;
        practise.textContent = "用卡片练习 Practise " + Math.min(shown.length, 30) + " with flashcards";
        body.innerHTML = shown.slice(0, 600).map(function (r) {
          return '<tr><td class="h" lang="zh-CN">' + esc(r.w) + sayButton(r.w, "Listen to " + r.w) + '</td><td class="p">' + esc(r.py) + "</td>" +
            '<td class="m">' + esc(r.en) + '</td><td class="lvl">' + esc(r.hsk) + "</td>" +
            '<td class="src">' + lessonLinks(r.seen, byKey) + "</td><td class=\"sta\">" + statusButtons(r.w) + "</td></tr>";
        }).join("") || '<tr><td colspan="6" class="empty">没有找到。No words match these filters.</td></tr>';
      }

      input.addEventListener("input", draw);
      Object.keys(sel).forEach(function (id) {
        $$("#" + id + " button").forEach(function (b) {
          b.addEventListener("click", function () {
            $$("#" + id + " button").forEach(function (x) { x.classList.remove("on"); });
            b.classList.add("on"); sel[id] = b.getAttribute("data-v");
            if (id === "fscope" && sel.fscope === "all" && !archive) {
              fetch("lessons/vocab-all.json", { cache: "no-cache" })
                .then(function (r) { return r.ok ? r.json() : { words: {} }; })
                .catch(function () { return { words: {} }; })
                .then(function (j) { archive = j; draw(); });
              return;
            }
            draw();
          });
        });
      });
      body.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".st button");
        if (!b) return;
        var h = b.parentNode.getAttribute("data-h"), s = b.getAttribute("data-s");
        var r = shown.filter(function (x) { return x.w === h; })[0];
        if (!r) return;
        var next = statusOf(h) === s ? "" : s;
        setStatus(r, next, findCtx(h));
        $$("button", b.parentNode).forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-s") === next ? "true" : "false"); });
      });
      practise.addEventListener("click", function () {
        var pick = shown.filter(function (r) { return statusOf(r.w) !== "k"; });
        if (!pick.length) pick = shown;
        var cards = shuffle(pick.slice()).slice(0, 30).map(function (r) {
          var c = findCtx(r.w) || {};
          return { w: r.w, py: r.py, en: r.en, hsk: r.hsk, ctx: c.zh || "", ctxEn: c.en || "" };
        });
        try { sessionStorage.setItem("practice", JSON.stringify(cards)); } catch (e) { return; }
        location.href = "review.html?mode=practice";
      });
      draw();
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- review: flashcards ---------- */
  function renderReview() {
    var root = $("#review"), mode = new URLSearchParams(location.search).get("mode") || "due";
    markTabs();
    function card(h) {
      var r = WORDS[h];
      return { w: h, py: r.py, en: r.en, hsk: r.hsk, ctx: r.ctx, ctxEn: r.ctxEn };
    }
    var queue = [];
    if (mode === "practice") {
      try { queue = JSON.parse(sessionStorage.getItem("practice")) || []; } catch (e) { queue = []; }
    } else {
      queue = shuffle((mode === "all" ? wordsWith("l") : dueWords()).map(card));
    }
    var total = queue.length, done = 0, good = 0, missed = {}, cur = null, open = false;

    function empty() {
      var learning = wordsWith("l").length, next = wordsWith("l").map(function (h) { return WORDS[h].due; }).sort()[0];
      root.innerHTML = '<div class="deck-empty">' +
        (learning
          ? "<h1>今天没有要复习的词</h1><p>Nothing is due today. Your next review is on " + esc(next) + ".</p>" +
            '<p class="deck-links"><a class="btn primary" href="review.html?mode=all">练习全部 ' + learning + " 个词 Practise all</a>" +
            '<a class="btn" href="./">读今天的课文 Read today\'s lesson</a></p>'
          : "<h1>生词本还是空的</h1><p>Your review list is empty. Open a lesson, tap a word you want to remember and choose 学习中. It will show up here.</p>" +
            '<p class="deck-links"><a class="btn primary" href="./">读今天的课文 Read today\'s lesson</a>' +
            '<a class="btn" href="vocab.html">打开生词本 Open word list</a></p>') + "</div>";
    }
    function finish() {
      var again = Object.keys(missed).length;
      root.innerHTML = '<div class="deck-empty"><h1>复习完了</h1>' +
        "<p>" + total + " word" + (total === 1 ? "" : "s") + " reviewed. " + good + " remembered first time" +
        (again ? ", " + again + " to see again soon: <span lang=\"zh-CN\">" + esc(Object.keys(missed).join("、")) + "</span>" : "") + ".</p>" +
        '<p class="deck-links"><a class="btn primary" href="./">回首页 Back to lessons</a><a class="btn" href="vocab.html">生词本 Word list</a></p></div>';
      paintDue();
    }
    function mark(text, w, cls) {
      var i = text.indexOf(w);
      if (i === -1) return esc(text);
      return esc(text.slice(0, i)) + '<mark class="' + cls + '">' + (cls === "blank" ? "" : esc(w)) + "</mark>" + esc(text.slice(i + w.length));
    }
    function draw() {
      var c = cur, hasCtx = c.ctx && c.ctx.indexOf(c.w) !== -1, cloze = c.cloze && hasCtx;
      var front = cloze
        ? '<p class="deck-kind">填空 Which word fits?</p><p class="deck-sent big" lang="zh-CN">' + mark(c.ctx, c.w, open ? "hit" : "blank") + "</p>" +
          '<p class="deck-hint">' + esc(c.en) + "</p>"
        : '<p class="deck-kind">这个词是什么意思？ What does it mean?</p><p class="deck-word" lang="zh-CN">' + esc(c.w) + sayButton(c.w, "Listen to " + c.w) + "</p>" +
          (hasCtx ? '<p class="deck-sent" lang="zh-CN">' + mark(c.ctx, c.w, "hit") + "</p>" : "");
      var back = open
        ? '<div class="deck-back">' +
          (cloze ? '<p class="deck-answer" lang="zh-CN">' + esc(c.w) + sayButton(c.w, "Listen to " + c.w) + "</p>" : "") +
          '<p class="py">' + esc(c.py) + "</p>" + (cloze ? "" : '<p class="deck-en">' + esc(c.en) + "</p>") +
          (hasCtx && c.ctxEn ? '<p class="deck-ctxen">' + esc(c.ctxEn) + "</p>" : "") +
          (hasCtx ? '<p class="deck-listen">' + sayButton(c.ctx, "Listen to the sentence") + "<span>听句子 Listen to the sentence</span></p>" : "") + "</div>"
        : "";
      root.innerHTML =
        '<div class="deck-progress"><span class="meta">' + Math.min(done + 1, total) + " / " + total + "</span>" +
        '<div class="bar"><i style="width:' + Math.round(done / total * 100) + '%"></i></div>' +
        '<a class="meta" href="' + (mode === "practice" ? "vocab.html" : "./") + '">结束 End</a></div>' +
        '<div class="deck-card">' + front + back + "</div>" +
        '<div class="deck-act">' + (open
          ? '<button type="button" class="btn again" data-g="again">忘了 Again<kbd>1</kbd></button>' +
            '<button type="button" class="btn primary" data-g="good">记得 Got it<kbd>2</kbd></button>' +
            '<button type="button" class="btn" data-g="known">已经会了 Know it well<kbd>3</kbd></button>'
          : '<button type="button" class="btn primary wide" data-g="show">看答案 Show answer<kbd>Space</kbd></button>') + "</div>";
      var first = $(".deck-act .primary", root);
      if (first) first.focus({ preventScroll: true });
    }
    function next() {
      if (!queue.length) { finish(); return; }
      cur = queue.shift(); open = false;
      if (cur.cloze === undefined) cur.cloze = Math.random() < 0.5;
      draw();
    }
    function answer(g) {
      if (!cur) return;
      if (g === "show") { open = true; draw(); return; }
      if (!open) return;
      var h = cur.w;
      if (g === "again") {
        if (statusOf(h) !== "l") setStatus(cur, "l", { zh: cur.ctx, en: cur.ctxEn });
        grade(h, false);
        if (!missed[h]) { missed[h] = 1; }
        cur.cloze = !cur.cloze;
        queue.splice(Math.min(queue.length, 3), 0, cur); // comes back after a few cards
      } else {
        if (g === "known") setStatus(cur, "k");
        else grade(h, true);
        if (!missed[h]) good++;
        done++;
      }
      next();
    }
    if (!total) { empty(); return; }
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-g]");
      if (b) answer(b.getAttribute("data-g"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.target.closest && e.target.closest("input, textarea")) return;
      if (e.key === " " || e.key === "Enter") { if (!open) { e.preventDefault(); answer("show"); } }
      else if (e.key === "1") answer("again");
      else if (e.key === "2") answer("good");
      else if (e.key === "3") answer("known");
    });
    next();
  }

  /* ---------- theme switch: light / dark / eye-care ---------- */
  function setupThemes() {
    var btns = $$("[data-theme-set]");
    if (!btns.length) return;
    function current() {
      var t = document.documentElement.getAttribute("data-theme");
      if (t) return t;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function paint() {
      var t = current();
      btns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-theme-set") === t ? "true" : "false"); });
    }
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-theme-set");
        document.documentElement.setAttribute("data-theme", t);
        store("theme", t);
        paint();
      });
    });
    paint();
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupThemes();
    setupToggles();
    paintDue();
    var page = document.body.getAttribute("data-page");
    if (page === "home") renderHome();
    if (page === "lesson") renderLesson();
    if (page === "vocab") renderVocab();
    if (page === "review") renderReview();
  });
})();
