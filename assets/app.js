/* 每日金融 · 金融科技 — renders lesson JSON files from /lessons/ */
(function () {
  "use strict";

  var CATS = {
    finance: { zh: "金融", en: "Finance" },
    fintech: { zh: "金融科技", en: "Fintech" }
  };
  var WINDOW_DAYS = 9; // probe a little beyond 7 days so a late run never hides a lesson

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
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
    return (+p[1]) + "月" + (+p[2]) + "日 · 星期" + wd;
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

  /* ---------- display toggles (shared) ---------- */
  function setupToggles() {
    var defs = { en: "hide-en", py: "hide-py", hl: "no-hl" };
    Array.prototype.forEach.call(document.querySelectorAll("[data-toggle]"), function (btn) {
      var key = btn.getAttribute("data-toggle"), cls = defs[key];
      var saved = store("t-" + key);
      var on = saved ? saved === "on" : btn.getAttribute("data-default") !== "off";
      apply(on);
      btn.addEventListener("click", function () {
        on = !on; apply(on); store("t-" + key, on ? "on" : "off");
      });
      function apply(v) {
        btn.setAttribute("aria-pressed", v ? "true" : "false");
        document.body.classList.toggle(cls, !v);
      }
    });
  }

  /* ---------- home ---------- */
  function renderHome() {
    var todayEl = $("#today"), listEl = $("#list");
    var filter = new URLSearchParams(location.search).get("c") || "all";

    Array.prototype.forEach.call(document.querySelectorAll(".nav a[data-c]"), function (a) {
      a.classList.toggle("on", a.getAttribute("data-c") === filter);
    });

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
        return '<a class="card" href="' + lessonUrl(l) + '">' +
          chip(c) + ' <span class="meta">' + esc(prettyDate(l.date)) + "</span>" +
          "<h2>" + esc(l.title_zh) + "</h2>" +
          '<p class="en">' + esc(l.title_en) + "</p>" +
          '<p class="lede">' + esc(first.zh) + "</p>" +
          '<div class="foot meta"><span>生词 ' + (l.vocab || []).length + " 个</span>" +
          (l.source && l.source.name ? "<span>来源：" + esc(l.source.name) + "</span>" : "") + "</div></a>";
      });
      todayEl.innerHTML = cards.join("") || '<p class="empty">这个分类最近没有课文。</p>';

      var latestSet = Object.keys(latest).map(function (c) { return latest[c]; });
      var rest = shown.filter(function (l) { return latestSet.indexOf(l) === -1; });
      listEl.innerHTML = rest.length ? rest.map(function (l) {
        return '<li><a href="' + lessonUrl(l) + '"><span class="d">' + esc(l.date.slice(5).replace("-", "/")) +
          "<br>" + chip(l.category) + '</span><span><span class="t">' + esc(l.title_zh) +
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

  function splitSentences(text) {
    var parts = text.match(/[^。！？；!?]+[。！？；!?”"」）)]*/g) || [text];
    return parts.filter(function (s) { return s.trim(); });
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
    function block(text) {
      return splitSentences(text).map(function (s) {
        var i = sentences.push({ text: s, start: pos }) - 1;
        pos += s.length;
        return '<span class="sent" data-s="' + i + '">' + words(s) + "</span>";
      }).join("");
    }
    return { block: block, entries: entries, sentences: sentences, total: function () { return pos; } };
  }

  function renderLesson() {
    var q = new URLSearchParams(location.search), d = q.get("d"), c = q.get("c");
    var root = $("#lesson");
    if (!d || !c) { root.innerHTML = '<p class="empty">Lesson not found. <a href="./">回首页</a></p>'; return; }

    Promise.all([fetchLesson(d, c), loadRecent()]).then(function (res) {
      var l = res[0], recent = res[1];
      if (!l) {
        root.innerHTML = '<p class="empty">这篇课文已经过期或不存在。This lesson is older than 7 days or does not exist. <a href="./">回首页</a></p>';
        return;
      }
      document.title = l.title_zh + " · 每日金融";
      Array.prototype.forEach.call(document.querySelectorAll(".nav a[data-c]"), function (a) {
        a.classList.toggle("on", a.getAttribute("data-c") === c);
      });

      var R = makeReader(buildDict(l));
      var titleHtml = R.block(l.title_zh);
      var paras = (l.paragraphs || []).map(function (p) {
        return '<div class="para"><p class="zh" lang="zh-CN">' + R.block(p.zh) + '</p><p class="en">' + esc(p.en) + "</p></div>";
      }).join("");

      var src = l.source || {};
      var label = esc(src.name || "") + (src.name_en ? " · " + esc(src.name_en) : "");
      var srcHtml = (src.name || src.url)
        ? '<p class="source">来源 Source：' + (src.url ? '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + (label || esc(src.url)) + "</a>" : label) +
          (src.date ? " · " + esc(src.date) : "") + "</p>"
        : "";

      var feat = (l.featured || []).map(function (f) {
        var ex = (f.examples || []).map(function (e) {
          return '<div class="ex"><div class="z" lang="zh-CN">' + esc(e.zh) + '</div><div class="y">' + esc(e.py) +
            '</div><div class="e">' + esc(e.en) + "</div></div>";
        }).join("");
        return '<div class="fw"><div><span class="big" lang="zh-CN">' + esc(f.hanzi) + '</span><span class="p">' + esc(f.pinyin) + "</span></div>" +
          '<p class="def">' + (f.pos ? '<span class="pos">' + esc(f.pos) + "</span>" : "") + esc(f.en) + "</p>" +
          (f.note ? '<p class="note">' + esc(f.note) + "</p>" : "") + ex + "</div>";
      }).join("");

      var same = recent.filter(function (x) { return x.category === c; });
      var idx = -1;
      same.forEach(function (x, i) { if (x.date === d) idx = i; });
      var newer = idx > 0 ? same[idx - 1] : null, older = idx >= 0 ? same[idx + 1] : null;

      root.innerHTML =
        '<header class="lesson-head">' + chip(c) + ' <span class="meta">' + esc(prettyDate(l.date)) + "</span>" +
        '<h1 lang="zh-CN">' + titleHtml + '</h1><p class="en">' + esc(l.title_en) + "</p></header>" +
        '<div class="article">' + paras + srcHtml + "</div>" +
        (feat ? '<section class="featured"><h3>重点词汇</h3><div class="featured-grid">' + feat + "</div></section>" : "") +
        '<nav class="pager">' +
        (older ? '<a href="' + lessonUrl(older) + '">← ' + esc(older.date.slice(5)) + " " + esc(older.title_zh) + "</a>" : "<span></span>") +
        (newer ? '<a href="' + lessonUrl(newer) + '" style="text-align:right">' + esc(newer.date.slice(5)) + " " + esc(newer.title_zh) + " →</a>" : "") +
        "</nav>";

      wireWords(R.entries);
      setupPlayer(R.sentences, R.total());
    });
  }

  /* Tap any word → pinyin and meaning. */
  function wireWords(entries) {
    var pop = document.createElement("div");
    pop.className = "pop"; pop.hidden = true; document.body.appendChild(pop);
    var current = null;
    function clear() {
      pop.hidden = true;
      if (current) current.classList.remove("active");
      current = null;
    }
    document.addEventListener("click", function (e) {
      var w = e.target.closest && e.target.closest(".w");
      if (!w) { clear(); return; }
      if (current === w) { clear(); return; }
      clear(); current = w; w.classList.add("active");
      var v = entries[+w.getAttribute("data-k")];
      pop.innerHTML = "<b>" + esc(v.w) + "</b> " + esc(v.py) + "<br>" + esc(v.en) +
        (v.sc ? '<span class="tag">生词' + (v.hsk ? " · " + esc(v.hsk) : "") + "</span>" : "");
      pop.hidden = false;
      var b = w.getBoundingClientRect();
      var left = Math.max(8, Math.min(window.scrollX + b.left, window.scrollX + document.documentElement.clientWidth - 270));
      pop.style.left = left + "px";
      pop.style.top = (window.scrollY + b.bottom + 6) + "px";
    });
    window.addEventListener("resize", clear);
  }

  /* Read the whole lesson aloud with the device's Chinese voice; the bar seeks by position in the text. */
  function setupPlayer(sentences, total) {
    var bar = $("#player");
    if (!bar) return;
    var synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance || !sentences.length) {
      bar.innerHTML = '<span class="meta">这个浏览器不能朗读。Read-aloud isn\'t supported in this browser.</span>';
      return;
    }
    bar.innerHTML =
      '<button class="play" type="button" aria-label="Play">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="i-play" d="M7 4.5v15l13-7.5z"/><path class="i-pause" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg></button>' +
      '<input class="seek" type="range" min="0" max="' + Math.max(total - 1, 0) + '" step="1" value="0" aria-label="Position in the text">' +
      '<span class="ptime meta">1 / ' + sentences.length + "</span>";
    var btn = bar.querySelector(".play"), seek = bar.querySelector(".seek"), label = bar.querySelector(".ptime");
    var cur = 0, playing = false, run = 0, voice = null, dragging = false;

    function pickVoice() {
      var vs = synth.getVoices().filter(function (v) { return /^zh[-_](CN|Hans)/i.test(v.lang) || v.lang === "zh"; });
      vs.sort(function (a, b) { return score(b) - score(a); });
      voice = vs[0] || null;
      function score(v) { return (/natural|neural|online/i.test(v.name) ? 4 : 0) + (/xiaoxiao|yunxi|tingting|google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1); }
    }
    pickVoice();
    if (typeof synth.onvoiceschanged !== "undefined") synth.onvoiceschanged = pickVoice;

    function sentAt(p) {
      for (var i = sentences.length - 1; i >= 0; i--) if (sentences[i].start <= p) return i;
      return 0;
    }
    function mark(i) {
      Array.prototype.forEach.call(document.querySelectorAll(".sent.speaking"), function (n) { n.classList.remove("speaking"); });
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
      u.lang = "zh-CN"; if (voice) u.voice = voice; u.rate = 0.95;
      u.onboundary = function (ev) { if (my === run && !dragging) seek.value = s.start + (offset || 0) + (ev.charIndex || 0); };
      u.onend = function () { if (my === run && playing) speak(i + 1, 0); };
      u.onerror = function () { if (my === run && playing) speak(i + 1, 0); };
      synth.speak(u);
    }
    btn.addEventListener("click", function () {
      if (playing) { run++; synth.cancel(); setPlaying(false); return; }
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
      // Double-click/tap a sentence while the bar is visible to jump there.
      var s = e.detail === 2 && e.target.closest && e.target.closest(".sent");
      if (s) { var i = +s.getAttribute("data-s"); cur = i; seek.value = sentences[i].start; if (playing) speak(i, 0); else mark(i); }
    });
    window.addEventListener("pagehide", function () { run++; synth.cancel(); });
  }

  /* ---------- vocab page ---------- */
  function plain(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "v").toLowerCase(); }

  function renderVocab() {
    var body = $("#vbody"), count = $("#vcount"), input = $("#vsearch");
    loadRecent().then(function (lessons) {
      var map = {}, order = [];
      lessons.forEach(function (l) {
        (l.vocab || []).forEach(function (v) {
          if (!v.hanzi) return;
          if (!map[v.hanzi]) { map[v.hanzi] = { v: v, seen: [] }; order.push(v.hanzi); }
          if (!map[v.hanzi].seen.some(function (s) { return s === l; })) map[v.hanzi].seen.push(l);
        });
      });
      var rows = order.map(function (h) { return map[h]; })
        .sort(function (a, b) { return b.seen.length - a.seen.length; });

      function draw() {
        var q = plain(input.value.trim());
        var lvl = (document.querySelector(".filters button.on") || {}).getAttribute
          ? document.querySelector(".filters button.on").getAttribute("data-l") : "all";
        var shown = rows.filter(function (r) {
          var v = r.v;
          if (lvl !== "all" && (v.hsk || "").indexOf(lvl) === -1) return false;
          if (!q) return true;
          return v.hanzi.indexOf(input.value.trim()) !== -1 || plain(v.pinyin).replace(/\s/g, "").indexOf(q.replace(/\s/g, "")) !== -1 ||
            plain(v.en).indexOf(q) !== -1;
        });
        count.textContent = shown.length + " / " + rows.length + " 个词";
        body.innerHTML = shown.map(function (r) {
          var v = r.v;
          return '<tr><td class="h" lang="zh-CN">' + esc(v.hanzi) + '</td><td class="p"><span>' + esc(v.pinyin) + "</span></td>" +
            '<td class="m"><span>' + esc(v.en) + '</span></td><td class="lvl">' + esc(v.hsk) + "</td>" +
            '<td class="src">' + r.seen.map(function (l) {
              return '<a href="' + lessonUrl(l) + '" title="' + esc(l.title_zh) + '">' + esc(l.date.slice(5)) + " " + esc((CATS[l.category] || {}).zh) + "</a>";
            }).join("") + "</td></tr>";
        }).join("") || '<tr><td colspan="5" class="empty">没有找到。No matching words.</td></tr>';
      }
      input.addEventListener("input", draw);
      Array.prototype.forEach.call(document.querySelectorAll(".filters button"), function (b) {
        b.addEventListener("click", function () {
          Array.prototype.forEach.call(document.querySelectorAll(".filters button"), function (x) { x.classList.remove("on"); });
          b.classList.add("on"); draw();
        });
      });
      body.addEventListener("click", function (e) {
        var tr = e.target.closest && e.target.closest("tr");
        if (tr && document.body.classList.contains("quiz")) tr.classList.toggle("reveal");
      });
      var quiz = $("#quiz");
      if (quiz) quiz.addEventListener("click", function () {
        var on = !document.body.classList.contains("quiz");
        document.body.classList.toggle("quiz", on);
        quiz.setAttribute("aria-pressed", on ? "true" : "false");
        Array.prototype.forEach.call(document.querySelectorAll("tr.reveal"), function (t) { t.classList.remove("reveal"); });
      });
      draw();
    });
  }

  /* ---------- theme switch: light / dark / eye-care ---------- */
  function setupThemes() {
    var btns = document.querySelectorAll("[data-theme-set]");
    if (!btns.length) return;
    function current() {
      var t = document.documentElement.getAttribute("data-theme");
      if (t) return t;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function paint() {
      var t = current();
      Array.prototype.forEach.call(btns, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-theme-set") === t ? "true" : "false"); });
    }
    Array.prototype.forEach.call(btns, function (b) {
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
    var page = document.body.getAttribute("data-page");
    if (page === "home") renderHome();
    if (page === "lesson") renderLesson();
    if (page === "vocab") renderVocab();
  });
})();
