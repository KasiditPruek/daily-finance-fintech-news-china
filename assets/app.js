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
  function annotate(text, vocab) {
    var words = (vocab || []).map(function (v) { return v.hanzi; })
      .filter(function (h) { return h && h.indexOf("…") === -1 && h.indexOf("...") === -1; })
      .sort(function (a, b) { return b.length - a.length; });
    var safe = esc(text);
    if (!words.length) return safe;
    var byWord = {};
    vocab.forEach(function (v, i) { if (!(v.hanzi in byWord)) byWord[v.hanzi] = i; });
    var re = new RegExp(words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|"), "g");
    return safe.replace(re, function (m) {
      var i = byWord[m], v = vocab[i];
      return '<ruby class="v" data-i="' + i + '">' + m + "<rt>" + esc(v.pinyin) + "</rt></ruby>";
    });
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

      var vocab = l.vocab || [];
      var paras = (l.paragraphs || []).map(function (p) {
        return '<div class="para"><p class="zh" lang="zh-CN">' + annotate(p.zh, vocab) + '</p><p class="en">' + esc(p.en) + "</p></div>";
      }).join("");
      var src = l.source || {};
      var srcHtml = src.url
        ? '<p class="source">来源：<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.name || src.url) + "</a>" +
          (src.date ? " · " + esc(src.date) : "") + "</p>"
        : (src.name ? '<p class="source">来源：' + esc(src.name) + "</p>" : "");

      var vocabHtml = vocab.map(function (v, i) {
        return '<li data-i="' + i + '"><span><span class="h" lang="zh-CN">' + esc(v.hanzi) + '</span> <span class="p">' + esc(v.pinyin) +
          '</span></span><span class="lvl">' + esc(v.hsk) + '</span><span class="m">' + esc(v.en) + "</span></li>";
      }).join("");

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
        '<h1 lang="zh-CN">' + esc(l.title_zh) + '</h1><p class="en">' + esc(l.title_en) + "</p></header>" +
        '<div class="lesson-grid"><div class="article">' + paras + srcHtml + "</div>" +
        '<aside class="vocab"><h3>生词（共 ' + vocab.length + " 个）</h3><ol>" + vocabHtml + "</ol></aside></div>" +
        (feat ? '<section class="featured"><h3>重点词汇</h3><div class="featured-grid">' + feat + "</div></section>" : "") +
        '<nav class="pager">' +
        (older ? '<a href="' + lessonUrl(older) + '">← ' + esc(older.date.slice(5)) + " " + esc(older.title_zh) + "</a>" : "<span></span>") +
        (newer ? '<a href="' + lessonUrl(newer) + '" style="text-align:right">' + esc(newer.date.slice(5)) + " " + esc(newer.title_zh) + " →</a>" : "") +
        "</nav>";

      wireVocabLinks(vocab);
    });
  }

  /* Tap a highlighted word → show meaning and flash it in the 生词 list. */
  function wireVocabLinks(vocab) {
    var pop = document.createElement("div");
    pop.className = "pop"; pop.hidden = true; document.body.appendChild(pop);
    var current = null;
    function clear() {
      pop.hidden = true;
      Array.prototype.forEach.call(document.querySelectorAll(".active"), function (n) { n.classList.remove("active"); });
      current = null;
    }
    document.addEventListener("click", function (e) {
      var r = e.target.closest && e.target.closest("ruby.v");
      if (!r) { clear(); return; }
      if (current === r) { clear(); return; }
      clear(); current = r;
      var i = r.getAttribute("data-i"), v = vocab[+i];
      Array.prototype.forEach.call(document.querySelectorAll('[data-i="' + i + '"]'), function (n) { n.classList.add("active"); });
      pop.innerHTML = "<b>" + esc(v.hanzi) + "</b> " + esc(v.pinyin) + "<br>" + esc(v.en) + (v.hsk ? " · " + esc(v.hsk) : "");
      pop.hidden = false;
      var b = r.getBoundingClientRect();
      var left = Math.max(8, Math.min(window.scrollX + b.left, window.scrollX + document.documentElement.clientWidth - 270));
      pop.style.left = left + "px";
      pop.style.top = (window.scrollY + b.bottom + 6) + "px";
      var li = document.querySelector('.vocab li[data-i="' + i + '"]');
      var box = document.querySelector(".vocab");
      if (li && box && box.scrollHeight > box.clientHeight) box.scrollTop = li.offsetTop - box.clientHeight / 2;
    });
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

  document.addEventListener("DOMContentLoaded", function () {
    setupToggles();
    var page = document.body.getAttribute("data-page");
    if (page === "home") renderHome();
    if (page === "lesson") renderLesson();
    if (page === "vocab") renderVocab();
  });
})();
