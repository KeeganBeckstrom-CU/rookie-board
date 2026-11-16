/* 2027 Rookie Board: game-style draft screens. */
(function () {
  "use strict";
  var P0 = dash.params() || {};
  var VIEWS = ["MYD", "TOP", "QB", "RB", "WR", "TE", "FAV", "MOCK", "INJ", "WEEK"];
  var BOARD = ["TOP", "QB", "RB", "WR", "TE"];
  var POS = ["QB", "RB", "WR", "TE"];
  var TABN = { MYD: "My draft", TOP: "Top 35", QB: "QB", RB: "RB", WR: "WR", TE: "TE", FAV: "Favorites", MOCK: "Mock draft", INJ: "Injuries", WEEK: "This week" };
  var TITLE = { MYD: "My draft", TOP: "Top 35 · Superflex PPR", QB: "Quarterbacks", RB: "Running backs", WR: "Wide receivers", TE: "Tight ends",
    FAV: "Favorites", MOCK: "Mock draft", INJ: "Injury report", WEEK: "Board changes" };
  var CTABS = [["report", "Scouting report"], ["grades", "Grades"], ["prod", "Production"], ["career", "Career"], ["notes", "Notes"]];
  var POSNAME = { QB: "QB", RB: "RB", WR: "WR", TE: "TE" };

  var state = {
    view: VIEWS.indexOf(P0.view) >= 0 ? P0.view : "TOP",
    q: "", declare: "", tag: "", favSort: P0.favSort || "overall",
    league: P0.league || null, week: null, open: null,
    cardTab: CTABS.some(function (t) { return t[0] === P0.cardTab; }) ? P0.cardTab : "report",
    favs: new Set(Array.isArray(P0.favs) ? P0.favs : []), unfavs: new Set(Array.isArray(P0.unfavs) ? P0.unfavs : []),
    navIds: []
  };
  var M = null;
  var root = document.getElementById("rookie-board");
  var mq = window.matchMedia("(max-width: 680px)");

  // ---------- small helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function fmt(v) { return v == null || v === "" ? "—" : (typeof v === "number" ? v.toLocaleString() : String(v)); }
  function num(v, d) { if (v == null || !isFinite(v)) return "—"; return d ? Number(v).toFixed(d) : Math.round(v).toLocaleString(); }
  function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function day(w, withYear) { return d3.utcFormat(withYear ? "%b %-d, %Y" : "%b %-d")(new Date(w + "T12:00:00Z")); }
  function firstLast(name) {
    var parts = String(name).split(" ");
    var suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1]) && parts.length > 2 ? " " + parts.pop() : "";
    var first = parts.length > 1 ? parts.shift() : "";
    return [first, parts.join(" ") + suffix];
  }
  function projShort(t) {
    if (!t) return "—";
    var s = String(t).split("(")[0].replace(/\bif he declares\b/i, "").replace(/[;,.\s]+$/, "").trim();
    return s || "—";
  }

  // ---------- colors ----------
  function hexRgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function sat(c) { var mx = Math.max.apply(null, c), mn = Math.min.apply(null, c); return mx ? (mx - mn) / mx : 0; }
  function shade(rgb, f) {
    return "#" + rgb.map(function (v) {
      var x = f < 0 ? v * (1 + f) : v + (255 - v) * f;
      return ("0" + Math.round(Math.max(0, Math.min(255, x))).toString(16)).slice(-2);
    }).join("");
  }
  // the school color that reads best as a tint on the dark navy screens
  function tintColor(p) {
    var a = hexRgb(p.school_color), b = hexRgb(p.school_color2);
    var base = a || [52, 70, 95];
    if (a && b && sat(a) < 0.2 && sat(b) > sat(a)) base = b;
    if (lum(base) < 0.12) base = base.map(function (v) { return Math.min(255, v + 40); });
    return shade(base, 0);
  }
  function setTint(node, p) {
    node.style.setProperty("--sc1", tintColor(p));
    node.style.setProperty("--sc2", p.school_color2 || "#c9a227");
    return node;
  }

  // ---------- SVG art ----------
  var SVGNS = "http://www.w3.org/2000/svg", uid = 0;
  function sv(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function star(svg, cx, cy, r, fill) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      pts.push((cx + rr * Math.cos(a)).toFixed(1) + "," + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return sv("polygon", { points: pts.join(" "), fill: fill, stroke: "#05080e", "stroke-width": "1" }, svg);
  }
  // original round seal in the school's two colors with its abbreviation (no real logos)
  function seal(p, opts) {
    opts = opts || {};
    var c1 = hexRgb(p.school_color) || [74, 81, 96], c2 = hexRgb(p.school_color2) || [255, 255, 255];
    if (Math.abs(lum(c1) - lum(c2)) < 0.12) c2 = lum(c1) > 0.5 ? [10, 15, 24] : [255, 255, 255];
    var id = "s" + (++uid), K = "#05080e";
    var svg = sv("svg", { viewBox: "2 10 100 100", "aria-hidden": "true" });
    var defs = sv("defs", {}, svg);
    var g = sv("linearGradient", { id: id + "f", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    sv("stop", { offset: "0", "stop-color": shade(c1, 0.25) }, g); sv("stop", { offset: ".5", "stop-color": shade(c1, 0) }, g); sv("stop", { offset: "1", "stop-color": shade(c1, -0.4) }, g);
    var t = sv("linearGradient", { id: id + "t", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
    sv("stop", { offset: "0", "stop-color": shade(c2, 0.4) }, t); sv("stop", { offset: ".45", "stop-color": shade(c2, 0) }, t); sv("stop", { offset: "1", "stop-color": shade(c2, -0.35) }, t);
    var F = "url(#" + id + "f)", T = "url(#" + id + "t)";
    sv("circle", { cx: "52.5", cy: "60.5", r: "46", fill: K }, svg);
    sv("circle", { cx: "50", cy: "58", r: "46", fill: T, stroke: K, "stroke-width": "2.5" }, svg);
    var rIn = opts.big ? 35 : 40;
    if (opts.big) sv("circle", { cx: "50", cy: "58", r: "41", fill: "none", stroke: K, "stroke-width": "1.4", "stroke-dasharray": "1.5 3.5" }, svg);
    sv("circle", { cx: "50", cy: "58", r: String(rIn), fill: F, stroke: K, "stroke-width": "2" }, svg);
    var cl = sv("clipPath", { id: id + "c" }, defs); sv("circle", { cx: "50", cy: "58", r: String(rIn) }, cl);
    var gg = sv("g", { "clip-path": "url(#" + id + "c)" }, svg);
    sv("rect", { x: "0", y: "81", width: "100", height: "5", fill: T, opacity: ".9" }, gg);
    sv("ellipse", { cx: "50", cy: "33", rx: "32", ry: "12", fill: "#fff", opacity: ".10" }, gg);
    if (opts.big) { star(svg, 12, 58, 5, shade(c1, 0)); star(svg, 88, 58, 5, shade(c1, 0)); }
    var ab = (p.school_abbr || "").slice(0, 5);
    var light = lum(c1) > 0.55;
    var fs = opts.big ? (ab.length <= 2 ? 36 : ab.length === 3 ? 30 : 25) : (ab.length <= 2 ? 42 : ab.length === 3 ? 35 : 29);
    var ta = { x: "50", y: "59", "text-anchor": "middle", "dominant-baseline": "middle", "font-family": "Impact, Haettenschweiler, Anton, 'Arial Narrow Bold', sans-serif",
      "font-size": String(fs), "letter-spacing": "0.5", fill: light ? "#0b0f18" : "#ffffff", stroke: light ? "#ffffff" : K,
      "stroke-width": opts.big ? "4.5" : "4", "paint-order": "stroke", "stroke-linejoin": "round" };
    if (ab.length >= 4) { ta.textLength = opts.big ? "50" : "60"; ta.lengthAdjust = "spacingAndGlyphs"; }
    sv("text", ta, svg).textContent = ab;
    return svg;
  }
  function crest(p, cls) { var w = el("span", "mx-crest" + (cls ? " " + cls : "")); w.appendChild(seal(p)); return w; }

  // generic player bust: faceless silhouette in a school-colored jersey, seal behind (no real likeness)
  function portrait(p) {
    var c1 = hexRgb(p.school_color) || [40, 60, 90], c2 = hexRgb(p.school_color2) || [230, 230, 230];
    if (Math.abs(lum(c1) - lum(c2)) < 0.1) c2 = lum(c1) > 0.5 ? [20, 24, 32] : [235, 238, 242];
    var id = "p" + (++uid);
    var wrap = el("div", "portrait");
    wrap.setAttribute("aria-hidden", "true");
    var svg = sv("svg", { viewBox: "0 0 220 200", width: "100%", height: "100%", preserveAspectRatio: "xMidYMax meet" }, wrap);
    var defs = sv("defs", {}, svg);
    var jg = sv("linearGradient", { id: id + "j", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    sv("stop", { offset: "0", "stop-color": shade(c1, 0.18) }, jg); sv("stop", { offset: ".55", "stop-color": shade(c1, 0) }, jg); sv("stop", { offset: "1", "stop-color": shade(c1, -0.45) }, jg);
    var hg = sv("radialGradient", { id: id + "h", cx: ".42", cy: ".32", r: ".75" }, defs);
    sv("stop", { offset: "0", "stop-color": "#4a5263" }, hg); sv("stop", { offset: ".6", "stop-color": "#262b35" }, hg); sv("stop", { offset: "1", "stop-color": "#12151b" }, hg);
    var ng = sv("linearGradient", { id: id + "n", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    sv("stop", { offset: "0", "stop-color": "#1a1e26" }, ng); sv("stop", { offset: "1", "stop-color": "#2c323d" }, ng);
    var rim = sv("linearGradient", { id: id + "r", x1: "0", y1: "0", x2: "1", y2: "0" }, defs);
    sv("stop", { offset: "0", "stop-color": "#fff", "stop-opacity": ".0" }, rim); sv("stop", { offset: "1", "stop-color": "#fff", "stop-opacity": ".35" }, rim);
    // seal behind, up and to the left (like a draft badge)
    var s = seal(p, { big: true });
    s.setAttribute("x", "0"); s.setAttribute("y", "4"); s.setAttribute("width", "112"); s.setAttribute("height", "112"); s.setAttribute("opacity", ".9");
    svg.appendChild(s);
    // shoulders / jersey
    sv("path", { d: "M34 200 C36 168 52 152 84 144 L104 138 L136 138 L156 144 C188 152 204 168 206 200 Z", fill: "url(#" + id + "j)", stroke: "#05080e", "stroke-width": "2" }, svg);
    // shoulder stripes
    sv("path", { d: "M50 170 C60 158 72 152 84 148", fill: "none", stroke: shade(c2, 0), "stroke-width": "5", "stroke-linecap": "round", opacity: ".9" }, svg);
    sv("path", { d: "M190 170 C180 158 168 152 156 148", fill: "none", stroke: shade(c2, 0), "stroke-width": "5", "stroke-linecap": "round", opacity: ".9" }, svg);
    // neck
    sv("path", { d: "M104 112 L104 140 C110 150 130 150 136 140 L136 112 Z", fill: "url(#" + id + "n)" }, svg);
    // collar
    sv("path", { d: "M100 137 C108 156 132 156 140 137 L146 141 C136 166 104 166 94 141 Z", fill: shade(c2, 0), stroke: "#05080e", "stroke-width": "1.5" }, svg);
    // head
    sv("ellipse", { cx: "120", cy: "84", rx: "29", ry: "35", fill: "url(#" + id + "h)", stroke: "#05080e", "stroke-width": "2" }, svg);
    sv("ellipse", { cx: "91.5", cy: "88", rx: "4.5", ry: "8", fill: "#2a2f39", stroke: "#05080e", "stroke-width": "1.5" }, svg);
    sv("ellipse", { cx: "148.5", cy: "88", rx: "4.5", ry: "8", fill: "#2a2f39", stroke: "#05080e", "stroke-width": "1.5" }, svg);
    sv("path", { d: "M134 56 C146 64 150 80 147 100", fill: "none", stroke: "url(#" + id + "r)", "stroke-width": "3", "stroke-linecap": "round" }, svg);
    // jersey wordmark band: position
    var t = sv("text", { x: "120", y: "188", "text-anchor": "middle", "font-family": "Barlow, sans-serif", "font-weight": "800", "font-size": "17",
      fill: shade(c2, 0), stroke: "#05080e", "stroke-width": "2.5", "paint-order": "stroke", "letter-spacing": "1" }, svg);
    t.textContent = p.pos || "";
    return wrap;
  }

  // talent diamond: tier number, or a "?" for players outside the Top 35 tiers
  function diamond(tier, big) {
    var id = "d" + (++uid);
    var hidden = tier == null;
    var cols = hidden ? ["#5aa0ff", "#1c4f9c"] : tier <= 1 ? ["#ffd65a", "#c98a00"] : tier <= 3 ? ["#ff6b55", "#c41f12"] : tier <= 5 ? ["#ff9a4a", "#c25a09"] : ["#9aa7bd", "#4d5a72"];
    var w = el("span", "mx-dia" + (big ? " lg" : ""));
    w.setAttribute("aria-hidden", "true");
    var svg = sv("svg", { viewBox: "0 0 100 100", width: "100%", height: "100%" }, w);
    var g = sv("linearGradient", { id: id, x1: "0", y1: "0", x2: "0", y2: "1" }, sv("defs", {}, svg));
    sv("stop", { offset: "0", "stop-color": cols[0] }, g); sv("stop", { offset: "1", "stop-color": cols[1] }, g);
    sv("polygon", { points: "50,4 94,50 50,96 6,50", fill: hidden ? "rgba(20,40,80,.6)" : "url(#" + id + ")", stroke: hidden ? cols[0] : "#05080e", "stroke-width": hidden ? "4" : "3" }, svg);
    sv("polygon", { points: "50,4 94,50 50,50 6,50", fill: "#fff", opacity: hidden ? ".06" : ".18" }, svg);
    var t = sv("text", { x: "50", y: "53", "text-anchor": "middle", "dominant-baseline": "middle", "font-family": "Barlow, sans-serif", "font-weight": "800",
      "font-size": "44", fill: "#fff", stroke: "#05080e", "stroke-width": "3", "paint-order": "stroke" }, svg);
    t.textContent = hidden ? "?" : String(tier);
    return w;
  }

  function icon(d, size) {
    var s = sv("svg", { viewBox: "0 0 24 24", width: String(size || 22), height: String(size || 22), fill: "none", stroke: "currentColor",
      "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
    sv("path", { d: d }, s);
    return s;
  }

  // ---------- grades ----------
  var GRADES = [[97, "A+"], [90, "A"], [83, "A-"], [76, "B+"], [66, "B"], [56, "B-"], [46, "C+"], [36, "C"], [26, "C-"], [13, "D"], [0, "F"]];
  function letter(pct) { for (var i = 0; i < GRADES.length; i++) if (pct >= GRADES[i][0]) return GRADES[i][1]; return "F"; }
  function gcol(g) {
    if (!g) return "transparent";
    var c = g.charAt(0);
    return c === "A" ? "#2f9a45" : c === "B" ? "#6f9a2c" : c === "C" ? "#c08a1e" : "#b8402f";
  }
  function per(a, b) { return a != null && b ? a / b : null; }

  // metric: [key, label, fn(p, s), higherIsBetter, format, useForGrade]
  var MET = {
    QB: [
      ["pyg", "Pass yds / game", function (p, s) { return per(s.pass_yds, s.games); }, true, 0],
      ["acc", "Accuracy (comp %)", function (p, s) { return s.att ? 100 * s.cmp / s.att : null; }, true, 1],
      ["ypa", "Yds / attempt", function (p, s) { return per(s.pass_yds, s.att); }, true, 1],
      ["tdr", "TD rate", function (p, s) { return s.att ? 100 * s.pass_td / s.att : null; }, true, 1],
      ["sec", "Ball security", function (p, s) { return s.att ? 100 * s.int / s.att : null; }, false, 1],
      ["ryg", "Rush yds / game", function (p, s) { return per(s.rush_yds, s.games); }, true, 0],
      ["rtd", "Rush TD", function (p, s) { return s.rush_td; }, true, 0],
      ["mkt", "Market value", function (p) { return p.market_rank; }, false, 0],
      ["age", "Draft-day age", function (p) { return p.age; }, false, 1]
    ],
    RB: [
      ["ryg", "Rush yds / game", function (p, s) { return per(s.rush_yds, s.games); }, true, 0],
      ["ypc", "Yds / carry", function (p, s) { return per(s.rush_yds, s.rush_att); }, true, 1],
      ["rtd", "Rush TD", function (p, s) { return s.rush_td; }, true, 0],
      ["rcg", "Catches / game", function (p, s) { return per(s.rec, s.games); }, true, 1],
      ["rcy", "Rec yds", function (p, s) { return s.rec_yds; }, true, 0],
      ["shr", "Yards share", function (p) { return p.share_yds; }, true, 1],
      ["dom", "Dominator", function (p) { return p.dominator; }, true, 1],
      ["bo", "Breakout age", function (p) { return p.breakout_age; }, false, 1],
      ["mkt", "Market value", function (p) { return p.market_rank; }, false, 0],
      ["age", "Draft-day age", function (p) { return p.age; }, false, 1]
    ],
    WR: [
      ["ryg", "Rec yds / game", function (p, s) { return per(s.rec_yds, s.games); }, true, 0],
      ["cpg", "Catches / game", function (p, s) { return per(s.rec, s.games); }, true, 1],
      ["ypr", "Yds / catch", function (p, s) { return per(s.rec_yds, s.rec); }, true, 1],
      ["rtd", "Rec TD", function (p, s) { return s.rec_td; }, true, 0],
      ["shr", "Yards share", function (p) { return p.share_yds; }, true, 1],
      ["tds", "TD share", function (p) { return p.share_td; }, true, 1],
      ["dom", "Dominator", function (p) { return p.dominator; }, true, 1],
      ["bdm", "Best dominator", function (p) { return p.best_dominator; }, true, 1],
      ["yta", "Yds / team pass att", function (p) { return p.yptpa_2026; }, true, 2],
      ["bo", "Breakout age", function (p) { return p.breakout_age; }, false, 1],
      ["mkt", "Market value", function (p) { return p.market_rank; }, false, 0],
      ["age", "Draft-day age", function (p) { return p.age; }, false, 1]
    ]
  };
  MET.TE = MET.WR;
  // 2026 report rows: [label, fn(p, s), higherIsBetter, format, suffix]
  var REP = {
    QB: [["Pass yds", function (p, s) { return s.pass_yds; }, true, 0], ["Pass TD", function (p, s) { return s.pass_td; }, true, 0],
      ["Comp %", function (p, s) { return s.att ? 100 * s.cmp / s.att : null; }, true, 1, "%"], ["INT", function (p, s) { return s.int; }, false, 0],
      ["Rush yds", function (p, s) { return s.rush_yds; }, true, 0], ["Rush TD", function (p, s) { return s.rush_td; }, true, 0]],
    RB: [["Rush yds", function (p, s) { return s.rush_yds; }, true, 0], ["Rush TD", function (p, s) { return s.rush_td; }, true, 0],
      ["Yds / carry", function (p, s) { return per(s.rush_yds, s.rush_att); }, true, 1], ["Catches", function (p, s) { return s.rec; }, true, 0],
      ["Rec yds", function (p, s) { return s.rec_yds; }, true, 0], ["Dominator", function (p) { return p.dominator; }, true, 1, "%"]],
    WR: [["Catches", function (p, s) { return s.rec; }, true, 0], ["Rec yds", function (p, s) { return s.rec_yds; }, true, 0],
      ["Rec TD", function (p, s) { return s.rec_td; }, true, 0], ["Yds / catch", function (p, s) { return per(s.rec_yds, s.rec); }, true, 1],
      ["Yards share", function (p) { return p.share_yds; }, true, 1, "%"], ["Dominator", function (p) { return p.dominator; }, true, 1, "%"]]
  };
  REP.TE = REP.WR;

  function rankAmong(list, getv, hi) {
    // returns map id -> {v, rank, pct, n}
    var vals = list.map(function (p) { var v = getv(p); return { id: p.id, v: v == null || !isFinite(v) ? null : v }; }).filter(function (x) { return x.v != null; });
    var out = {}, n = vals.length;
    vals.forEach(function (x) {
      var better = 0, worse = 0, tie = 0;
      vals.forEach(function (y) {
        if (y.id === x.id) return;
        if (y.v === x.v) tie++;
        else if (hi ? y.v > x.v : y.v < x.v) better++;
        else worse++;
      });
      out[x.id] = { v: x.v, rank: better + 1, n: n, pct: n > 1 ? 100 * (worse + tie / 2) / (n - 1) : 50 };
    });
    return out;
  }

  // ---------- model ----------
  function build() {
    var ids = ["players", "career", "changes", "mock", "mock_sources", "favorites", "leagues", "my_picks", "my_roster", "recap"], D = {};
    for (var i = 0; i < ids.length; i++) {
      var r = dash.data(ids[i]);
      if (r.status === "loading") return "loading";
      D[ids[i]] = r.status === "ok" && Array.isArray(r.data) ? r.data : [];
    }
    if (!D.players.length) return "error";
    var m = { players: D.players, byId: {}, career: {}, s26: {}, changes: D.changes, mock: D.mock, sources: D.mock_sources,
      saved: D.favorites.map(function (r) { return r.id; }), leagues: D.leagues, picks: D.my_picks, roster: D.my_roster, recap: D.recap };
    m.players.forEach(function (p) { m.byId[p.id] = p; m.career[p.id] = []; });
    D.career.forEach(function (r) { if (m.career[r.player_id]) m.career[r.player_id].push(r); });
    m.players.forEach(function (p) {
      m.career[p.id].sort(function (a, b) { return a.season - b.season; });
      var c = m.career[p.id].filter(function (r) { return r.season === 2026; })[0];
      m.s26[p.id] = c || {};
    });
    // grades and report ranks, per position
    m.grades = {}; m.report = {}; m.score = {}; m.posCount = {};
    POS.forEach(function (pos) {
      var list = m.players.filter(function (p) { return p.pos === pos; });
      m.posCount[pos] = list.length;
      var gm = MET[pos].map(function (d) { return { d: d, r: rankAmong(list, function (p) { return d[2](p, m.s26[p.id]); }, d[3]) }; });
      var rp = REP[pos].map(function (d) { return { d: d, r: rankAmong(list, function (p) { return d[1](p, m.s26[p.id]); }, d[2]) }; });
      list.forEach(function (p) {
        m.grades[p.id] = gm.map(function (x) {
          var h = x.r[p.id];
          return { key: x.d[0], label: x.d[1], v: h ? h.v : null, pct: h ? h.pct : null, grade: h && h.n > 2 ? letter(h.pct) : null, fmt: x.d[4], rank: h ? h.rank : null, n: h ? h.n : 0 };
        });
        m.report[p.id] = rp.map(function (x) {
          var h = x.r[p.id];
          return { label: x.d[0], v: h ? h.v : null, rank: h ? h.rank : null, n: h ? h.n : 0, fmt: x.d[3], suf: x.d[4] || "" };
        });
        var prod = m.grades[p.id].filter(function (g) { return g.pct != null && g.key !== "mkt" && g.key !== "age"; });
        m.score[p.id] = prod.length >= 3 ? prod.reduce(function (a, g) { return a + g.pct; }, 0) / prod.length / 10 : null;
      });
    });
    buildInjuries(m); buildFlags(m); buildNeeds(m); buildTargets(m);
    return m;
  }

  function buildInjuries(m) {
    var BODY = /torn|broken|fibula|\bACL\b|\bMCL\b|surgery|concussion|season-ending|out for the (season|year)|shoulder|knee|ankle|hamstring|\bfoot\b/i;
    var SEASON = /out for the (season|year)|season-ending|done for the season|ends his (year|season)|torn (acl|mcl)|broken/i;
    var SOON = /expected back|may return|could return|day[- ]to[- ]day|questionable/i;
    var BACK = /^(back\b|season debut|returning|returned)|back on the field|back early|back from/i;
    var best = {};
    m.changes.forEach(function (c) {
      if (!c.player_id) return;
      var text = c.headline + " " + c.detail;
      if (!(c.type === "injury" || (c.type === "faller" && BODY.test(text)))) return;
      var b = best[c.player_id];
      if (!b || c.week > b.week || (c.week === b.week && c.type === "injury" && b.type !== "injury")) best[c.player_id] = c;
    });
    var ORDER = { season: 0, out: 1, soon: 2, back: 3 };
    m.inj = {};
    m.injList = m.players.filter(function (p) { return best[p.id]; }).map(function (p) {
      var c = best[p.id], text = c.headline + " " + c.detail;
      var code = SEASON.test(text) ? "season" : BACK.test(c.headline) ? "back" : SOON.test(text) ? "soon" : "out";
      var r = { id: p.id, code: code, status: { season: "Out for season", out: "Out", soon: "Questionable", back: "Back" }[code],
        tag: { season: "OUT-YR", out: "OUT", soon: "Q", back: "" }[code],
        headline: c.type === "injury" || BODY.test(c.headline) ? c.headline : "", detail: c.detail, week: c.week };
      m.inj[p.id] = r;
      return r;
    }).sort(function (a, b) {
      var pa = m.byId[a.id], pb = m.byId[b.id];
      return ORDER[a.code] - ORDER[b.code] || (pa.overall_rank || 999) - (pb.overall_rank || 999) || pa.rank - pb.rank;
    });
  }
  function buildFlags(m) {
    m.flag = {};
    m.players.forEach(function (p) {
      if ((p.overall_rank == null && p.overall_prev == null) || p.market_rank == null || p.board_slot == null) return;
      var gap = Math.round(p.market_rank - p.board_slot);
      if (gap >= 6 || gap <= -6) m.flag[p.id] = { gap: gap, flag: gap >= 6 ? "Value" : "Pricey" };
    });
  }
  function buildNeeds(m) {
    m.needs = {};
    m.leagues.forEach(function (L) {
      m.needs[L.league_id] = POS.map(function (pos) {
        var mine = m.roster.filter(function (r) { return r.league_id === L.league_id && r.pos === pos; });
        var maxAge = pos === "QB" ? 27 : pos === "TE" ? 26 : 25;
        var young = mine.filter(function (r) { return r.age != null && r.age <= maxAge; }).length;
        var target = pos === "QB" ? (L.qb_slots === 2 ? 3 : 2) : pos === "RB" ? 3 : pos === "WR" ? (L.wr_slots === 3 ? 4 : 3) : 2;
        var ratio = young / target;
        var grade = ratio >= 1.34 ? "A" : ratio >= 1 ? "A-" : ratio >= 0.75 ? "B" : ratio >= 0.5 ? "C+" : ratio >= 0.34 ? "C" : ratio > 0 ? "D" : "F";
        return { pos: pos, count: mine.length, young: young, maxAge: maxAge, target: target, ratio: ratio, grade: grade,
          names: mine.slice().sort(function (a, b) { return (a.age || 99) - (b.age || 99); }) };
      });
    });
  }
  function buildTargets(m) {
    function phi(z) { var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
      var pr = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - pr : pr; }
    m.targets = {};
    m.picks.forEach(function (pk) {
      var L = m.leagues.filter(function (l) { return l.league_id === pk.league_id; })[0];
      if (!L) return;
      m.targets[pk.pick_id] = m.players.map(function (p) {
        var mult = p.pos === "QB" ? (L.qb_slots === 2 ? 0.8 : 1) : p.pos === "TE" ? (L.te_premium > 0 ? 0.9 : 1.15) : 1;
        var mu = (p.market_rank != null ? p.market_rank : 70) * mult;
        var sd = Math.max(0.6, ((p.market_hi || 0) - (p.market_lo || 0)) / 5, mu * 0.22);
        var chance = 1 - phi((pk.proj_overall - 0.5 - mu) / sd);
        var val = p.overall_rank != null ? p.overall_rank : 35 + (p.market_rank != null ? p.market_rank : 80) * 0.6;
        if (p.pos === "QB" && L.qb_slots === 2) val *= 0.85;
        if (p.pos === "TE" && !(L.te_premium > 0)) val *= 1.15;
        return { p: p, chance: Math.round(chance * 100), val: val };
      }).filter(function (c) { return c.chance >= 15; }).sort(function (a, b) { return a.val - b.val; }).slice(0, 6);
    });
  }

  // ---------- favorites ----------
  function isFav(id) { return (M.saved.indexOf(id) >= 0 && !state.unfavs.has(id)) || state.favs.has(id); }
  function toggleFav(id) {
    var saved = M.saved.indexOf(id) >= 0;
    if (isFav(id)) { state.favs.delete(id); if (saved) state.unfavs.add(id); }
    else { state.unfavs.delete(id); if (!saved) state.favs.add(id); }
    dash.setParams({ favs: Array.from(state.favs), unfavs: Array.from(state.unfavs) });
    render();
  }
  function favCount() { return M.players.filter(function (p) { return isFav(p.id); }).length; }
  function injCount() { return M.injList.filter(function (r) { return r.code !== "back"; }).length; }
  function mockPick(id) { var r = M.mock.filter(function (x) { return x.player_id === id; })[0]; return r || null; }
  var FAVSORT = {
    overall: function (a, b) { return (a.overall_rank || 999) - (b.overall_rank || 999) || a.rank - b.rank; },
    mock: function (a, b) { var x = mockPick(a.id), y = mockPick(b.id); return (x ? x.overall : 999) - (y ? y.overall : 999) || (a.overall_rank || 999) - (b.overall_rank || 999); },
    pos: function (a, b) { return POS.indexOf(a.pos) - POS.indexOf(b.pos) || a.rank - b.rank; },
    prod: function (a, b) { return (b.s26_yds || 0) - (a.s26_yds || 0); },
    name: function (a, b) { return a.name.localeCompare(b.name); }
  };

  // ---------- shared row pieces ----------
  function tags(p) {
    var box = el("span", "tags"), f = M.flag[p.id], j = M.inj[p.id];
    if (f) { var t = el("span", "mx-tag " + f.flag.toLowerCase(), f.flag); t.title = f.flag === "Value" ? "The market drafts him later than our board" : "The market drafts him earlier than our board"; box.appendChild(t); }
    if (j && j.tag) { var u = el("span", "mx-tag inj " + j.code, j.tag); u.title = j.status + " (as of " + day(j.week) + "): " + (j.headline || j.detail); box.appendChild(u); }
    return box.childNodes.length ? box : null;
  }
  function posChip(pos, txt) { var c = el("span", "mx-pos", txt || pos); c.style.setProperty("--pc", "var(--pos-" + pos + ")"); return c; }
  function col(v, l, cls, vcls) {
    var c = el("div", "mx-col" + (cls ? " " + cls : ""));
    if (v && v.nodeType) c.appendChild(v); else c.appendChild(el("div", "v" + (vcls ? " " + vcls : ""), v));
    if (l) c.appendChild(el("div", "l", l));
    return c;
  }
  function prodLine(p) {
    var kind = p.pos === "QB" ? "pass" : p.pos === "RB" ? "rush" : "rec";
    return { v: fmt(p.s26_yds) + " / " + fmt(p.s26_td), l: kind + " yds / TD" };
  }
  function starBtn(p) {
    var on = isFav(p.id);
    var b = el("button", "mx-star" + (on ? " on" : ""), on ? "★" : "☆");
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", (on ? "Remove " : "Add ") + p.name + (on ? " from" : " to") + " favorites");
    b.addEventListener("click", function (e) { e.stopPropagation(); toggleFav(p.id); });
    b.addEventListener("keydown", function (e) { e.stopPropagation(); });
    return b;
  }

  /* One draft-list row. opts: { rank, rankCls, move, cols: [[value, label, cls, vcls]...], note, mini } */
  function row(p, opts) {
    opts = opts || {};
    var r = setTint(el("div", "mx-row"), p);
    r.setAttribute("role", "button"); r.tabIndex = 0;
    r.setAttribute("aria-label", p.name + ", " + p.pos + p.rank + ", " + p.school);
    if (state.open === p.id) r.classList.add("sel");
    var rk = el("div", "mx-rk");
    rk.appendChild(el("div", "n" + (opts.rankCls ? " " + opts.rankCls : ""), opts.rank != null ? String(opts.rank) : String(p.rank)));
    if (opts.move != null) rk.appendChild(opts.move);
    var pt = el("div", "mx-pt"); pt.appendChild(portrait(p));
    var fl = firstLast(p.name);
    var nm = el("div", "mx-nm");
    nm.appendChild(el("div", "pos", p.pos));
    nm.appendChild(el("div", "first", fl[0]));
    var last = el("div", "last", fl[1]);
    nm.appendChild(last);
    var tg = tags(p);
    var sch = el("div", "sch", p.school);
    nm.appendChild(sch);
    if (tg) { if (mq.matches) nm.insertBefore(tg, nm.firstChild.nextSibling); else last.appendChild(tg); }
    var meta = el("div", "mx-meta");
    var r1 = el("div", "r1");
    add(r1, posChip(p.pos, "#" + p.rank + " " + p.pos), el("span", "typ", p.player_type || ""));
    meta.appendChild(r1);
    meta.appendChild(el("div", "r2", [p.height || null, p.weight ? p.weight + " lbs." : null, p.class || null, p.age ? "age " + p.age : null].filter(Boolean).join("  ·  ")));
    if (opts.note) meta.appendChild(el("div", "note", opts.note));
    add(r, rk, pt, nm, meta);
    (opts.cols || []).forEach(function (c) { r.appendChild(col(c[0], c[1], c[2], c[3])); });
    var mini = el("div", "mx-mini");
    (opts.mini || [posChip(p.pos, p.pos + p.rank), el("span", null, projShort(p.draft_projection))]).forEach(function (x) { if (x) mini.appendChild(typeof x === "string" ? el("span", null, x) : x); });
    r.appendChild(mini);
    r.appendChild(starBtn(p));
    var open = function () { openCard(p.id); };
    r.addEventListener("click", open);
    r.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    return r;
  }
  /* Week-over-week move: green up arrow, red down arrow, gold NEW. kind "top" uses the Top 35 rank. */
  function moveOf(p, kind) {
    var now = kind === "top" ? p.overall_rank : p.rank, prev = kind === "top" ? p.overall_prev : p.prev_rank;
    if (now == null) return null;
    if (prev == null) return "NEW";
    return prev - now;
  }
  function moveEl(p, kind, showFlat) {
    var d = moveOf(p, kind);
    if (d == null) return null;
    if (d === "NEW") { var n = el("span", "mx-mv new", "NEW"); n.setAttribute("aria-label", kind === "top" ? "new to the Top 35 this week" : "new to the board this week"); n.title = n.getAttribute("aria-label"); return n; }
    if (!d) { if (!showFlat) return null; var f = el("span", "mx-mv flat", "–"); f.setAttribute("aria-label", "no change since last week"); f.title = "No change since last week"; return f; }
    var s = el("span", "mx-mv " + (d > 0 ? "up" : "down"));
    add(s, el("i", null, d > 0 ? "▲" : "▼"), el("b", null, String(Math.abs(d))));
    s.setAttribute("aria-label", (d > 0 ? "up " : "down ") + Math.abs(d) + " since last week");
    s.title = (d > 0 ? "Up " : "Down ") + Math.abs(d) + " since last week";
    return s;
  }
  function boardCols(p, top) {
    var pl = prodLine(p);
    return [
      [projShort(p.draft_projection), "Projection", null, "sm"],
      [diamond(p.tier), p.tier != null ? "Tier " + p.tier : "Unranked"],
      [pl.v, pl.l, null, null],
      [el("span", "mx-pill " + (p.declare_likelihood || ""), p.declare_likelihood || "—"), "Declare", "c-dec"]
    ];
  }

  // ---------- team needs panel ----------
  function league() {
    if (!M.leagues.length) return null;
    if (!state.league || !M.leagues.some(function (l) { return l.league_id === state.league; })) state.league = M.leagues[0].league_id;
    return M.leagues.filter(function (l) { return l.league_id === state.league; })[0];
  }
  function needsPanel(L, withNames) {
    var box = el("section", "mx-panel mx-needs");
    box.appendChild(el("h2", "mx-h plain", "Team needs"));
    box.appendChild(el("div", "lg", L.my_team + " · " + L.league));
    box.appendChild(el("div", "sect", "Offense"));
    var needs = M.needs[L.league_id] || [];
    needs.forEach(function (n) {
      var r = el("div", "mx-need");
      var g = el("span", "g", n.grade); g.style.setProperty("--gc", n.ratio >= 1 ? "var(--ok)" : n.ratio >= 0.5 ? "var(--warn)" : "var(--bad)");
      var c = el("span", "c");
      var a = el("span"); a.appendChild(el("b", null, String(n.count))); a.appendChild(document.createTextNode(" Active"));
      var y = el("span"); y.appendChild(el("b", null, n.young + "/" + n.target)); y.appendChild(document.createTextNode(" Young"));
      add(c, a, y);
      add(r, el("span", "p", n.pos), g, c);
      if (withNames) {
        var nm = el("div", "names");
        n.names.forEach(function (x) {
          var s = el("span", x.slot !== "active" ? "dim" : null, x.name + (x.age != null ? " " + x.age : "") + (x.injury ? " · " + (x.injury === "Questionable" ? "Q" : x.injury) : ""));
          nm.appendChild(s);
        });
        r.appendChild(nm);
      }
      box.appendChild(r);
    });
    if (needs.length) {
      var srt = needs.slice().sort(function (a, b) { return b.ratio - a.ratio; });
      var s1 = el("div", "mx-sw"); add(s1, el("span", null, "Strongest position"), el("b", null, srt[0].pos));
      var s2 = el("div", "mx-sw"); add(s2, el("span", null, "Weakest position"), el("b", null, srt[srt.length - 1].pos));
      box.style.marginBottom = "0";
      add(box, el("div", null, ""), s1, s2);
    }
    box.appendChild(el("div", "note", "Young = players at or under " + needs.map(function (n) { return n.pos + " " + n.maxAge; }).join(", ") +
      " against a young-core target. Age only, not talent."));
    if (L.note) box.appendChild(el("div", "warn", L.note));
    return box;
  }
  function coachBox() {
    var box = document.getElementById("mx-coach");
    box.textContent = "";
    var L = league();
    if (!L) return;
    var t = el("div");
    add(t, el("div", "who", "(GM) " + L.my_team), el("div", "sub", L.record + " · " + ord(L.standing) + " of " + L.teams + " · " + L.qb_format));
    var sel = el("select"); sel.setAttribute("aria-label", "League");
    M.leagues.forEach(function (l) { var o = el("option", null, l.league); o.value = l.league_id; if (l.league_id === state.league) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", function (e) { state.league = e.target.value; dash.setParams({ league: state.league }); render(); });
    add(box, t, sel);
  }

  // ---------- views ----------
  function filtersBar(fav) {
    var bar = el("div", "mx-filters");
    var q = el("input", "mx-input"); q.type = "search"; q.placeholder = "Search player or school"; q.value = state.q; q.setAttribute("aria-label", "Search player or school");
    q.addEventListener("input", function (e) { state.q = e.target.value; renderMainOnly(); });
    bar.appendChild(q);
    if (fav) {
      var fs = el("select", "mx-select"); fs.setAttribute("aria-label", "Sort favorites");
      [["overall", "Sort: Top 35 rank"], ["mock", "Sort: Mock draft pick"], ["pos", "Sort: Position, then rank"], ["prod", "Sort: 2026 yards"], ["name", "Sort: Name"]].forEach(function (o) {
        var x = el("option", null, o[1]); x.value = o[0]; if (o[0] === state.favSort) x.selected = true; fs.appendChild(x);
      });
      fs.addEventListener("change", function (e) { state.favSort = e.target.value; dash.setParams({ favSort: state.favSort }); renderMainOnly(); });
      bar.appendChild(fs);
    } else {
      var tg = el("select", "mx-select"); tg.setAttribute("aria-label", "Market tag");
      [["", "All market tags"], ["Value", "Value only"], ["Pricey", "Pricey only"]].forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; if (o[0] === state.tag) x.selected = true; tg.appendChild(x); });
      tg.addEventListener("change", function (e) { state.tag = e.target.value; renderMainOnly(); });
      var dc = el("select", "mx-select"); dc.setAttribute("aria-label", "Likely to declare");
      [["", "All declare odds"], ["High", "High to declare"], ["Medium", "Medium"], ["Low", "Low"]].forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; if (o[0] === state.declare) x.selected = true; dc.appendChild(x); });
      dc.addEventListener("change", function (e) { state.declare = e.target.value; renderMainOnly(); });
      add(bar, tg, dc);
    }
    return bar;
  }
  function boardView(main) {
    var v = state.view, top = v === "TOP", fav = v === "FAV";
    main.appendChild(filtersBar(fav));
    var q = state.q.toLowerCase();
    var rows = M.players.filter(function (p) {
      if (fav) { if (!isFav(p.id)) return false; }
      else if (top ? p.overall_rank == null : p.pos !== v) return false;
      if (!fav && state.declare && p.declare_likelihood !== state.declare) return false;
      if (!fav && state.tag) { var f = M.flag[p.id]; if (!f || f.flag !== state.tag) return false; }
      if (q && (p.name + " " + p.school).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(fav ? (FAVSORT[state.favSort] || FAVSORT.overall) : function (a, b) { return top ? a.overall_rank - b.overall_rank : a.rank - b.rank; });
    state.navIds = rows.map(function (p) { return p.id; });
    var list = el("div", "mx-list");
    if (!rows.length) {
      list.appendChild(el("div", "mx-empty", fav ? "No favorites yet. Tap the ☆ on any player to add him here." : "No players match those filters."));
      main.appendChild(list);
      return;
    }
    var lastTier = null;
    rows.forEach(function (p, i) {
      if (top && p.tier != null && p.tier !== lastTier) { list.appendChild(el("div", "mx-tier", "Tier " + p.tier)); lastTier = p.tier; }
      list.appendChild(row(p, {
        rank: fav ? i + 1 : top ? p.overall_rank : p.rank,
        move: moveEl(p, top ? "top" : "pos"),
        cols: boardCols(p, top),
        mini: [posChip(p.pos, p.pos + p.rank), p.tier != null ? "Tier " + p.tier : null, projShort(p.draft_projection)]
      }));
    });
    main.appendChild(list);
  }

  function mockView(main) {
    main.appendChild(el("p", "mx-intro", "A 10-team, 4-round linear rookie draft for a superflex PPR league (QB, 2 RB, 3 WR, TE, 2 flex, superflex; no TE premium). Picks follow the consensus of fall 2026 superflex mocks and rankings, adjusted for 10 teams, no TE premium, and declare or injury risk. Tap a pick for the player's screen."));
    var mix = el("div", "mx-mix");
    POS.forEach(function (pos) { var n = M.mock.filter(function (r) { return r.pos === pos; }).length; var s = el("span"); add(s, posChip(pos), el("span", null, n + (n === 1 ? " pick" : " picks"))); mix.appendChild(s); });
    main.appendChild(mix);
    state.navIds = [];
    var list = el("div", "mx-list");
    [1, 2, 3, 4].forEach(function (rd) {
      var rows = M.mock.filter(function (r) { return Number(r.round) === rd; }).sort(function (a, b) { return a.overall - b.overall; });
      if (!rows.length) return;
      list.appendChild(el("div", "mx-round", "Round " + rd));
      rows.forEach(function (r) {
        var p = M.byId[r.player_id];
        if (!p) return;
        state.navIds.push(p.id);
        list.appendChild(row(p, {
          rank: r.pick, rankCls: "pick", note: r.note,
          cols: [
            [r.sf_avg != null ? "Avg " + r.sf_avg : "—", "SF consensus", null, "sm"],
            [diamond(p.tier), p.tier != null ? "Tier " + p.tier : "Unranked"],
            [r.sf_range || "—", "Range", null, null],
            [String(r.sf_sources), r.sf_sources === 1 ? "List" : "Lists", "c-dec", "big"]
          ],
          mini: [posChip(p.pos, p.pos + r.pos_rank), r.sf_avg != null ? "SF avg " + r.sf_avg : null, "range " + r.sf_range]
        }));
      });
    });
    main.appendChild(list);
    if (M.sources.length) {
      var so = el("section", "mx-panel mx-box method");
      so.appendChild(el("h3", null, "Mocks and rankings used"));
      var l = el("div", "mx-links");
      M.sources.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (s) {
        if (!/^https?:\/\//.test(s.url)) return;
        var a = el("a", null, s.name + " (" + s.format + ", " + day(s.date) + ")"); a.href = s.url; a.target = "_blank"; a.rel = "noopener"; l.appendChild(a);
      });
      so.appendChild(l);
      main.appendChild(so);
    }
  }

  function myDraftView(main) {
    var L = league();
    if (!L) { main.appendChild(el("div", "mx-empty", "No leagues found.")); return; }
    var picks = M.picks.filter(function (x) { return x.league_id === L.league_id; }).sort(function (a, b) { return a.proj_overall - b.proj_overall; });
    main.appendChild(el("p", "mx-intro", L.my_team + " · " + L.record + " · " + ord(L.standing) + " of " + L.teams + " · " + L.lineup +
      (L.te_premium ? " · TE premium " + L.te_premium : "") + ". For each of your 2027 picks (projected slot from current standings), the best players on our board with the chance he's still there."));
    if (!picks.length) { main.appendChild(el("div", "mx-empty", "No 2027 picks found for this team.")); return; }
    state.navIds = [];
    picks.forEach(function (pk) {
      var hd = el("div", "mx-pickhd");
      add(hd, el("span", "pk", pk.proj_pick), el("span", "via", pk.from_team === "Own" ? "Own pick" : "Via " + pk.from_team));
      main.appendChild(hd);
      var list = el("div", "mx-list");
      (M.targets[pk.pick_id] || []).forEach(function (t, i) {
        var p = t.p;
        if (state.navIds.indexOf(p.id) < 0) state.navIds.push(p.id);
        var cls = t.chance >= 70 ? "hi" : t.chance >= 40 ? "mid" : "lo";
        list.appendChild(row(p, {
          rank: i + 1,
          cols: [
            [projShort(p.draft_projection), "Projection", null, "sm"],
            [diamond(p.tier), p.tier != null ? "Tier " + p.tier : "Unranked"],
            [p.overall_rank != null ? "#" + p.overall_rank : p.pos + p.rank, p.overall_rank != null ? "Top 35" : "Pos. rank"],
            [t.chance + "%", "Still there", "c-dec", "big " + cls]
          ],
          mini: [posChip(p.pos, p.pos + p.rank), p.tier != null ? "Tier " + p.tier : null, (function () { var s = el("b", null, t.chance + "% still there"); s.style.color = cls === "hi" ? "var(--ok)" : cls === "mid" ? "var(--warn)" : "var(--bad)"; return s; })()]
        }));
      });
      if (!list.childNodes.length) list.appendChild(el("div", "mx-empty", "No likely targets at this slot."));
      main.appendChild(list);
    });
  }

  function itemFor(p, rightNode, hl, dt) {
    var it = el("div", "mx-item");
    it.setAttribute("role", "button"); it.tabIndex = 0;
    var who = el("div", "who");
    add(who, crest(p), el("span", null, p.name), posChip(p.pos, p.pos + p.rank), el("span", "sch", p.school));
    add(it, who, rightNode);
    if (hl) it.appendChild(el("div", "hl", hl));
    if (dt) it.appendChild(el("div", "dt", dt));
    var go = function () { openCard(p.id); };
    it.addEventListener("click", go);
    it.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    return it;
  }
  function injView(main) {
    var last = M.changes.filter(function (r) { return r.type === "injury"; }).map(function (r) { return r.week; }).sort().pop();
    main.appendChild(el("p", "mx-intro", "Every prospect on the board with an injury note, newest note per player, from the weekly board updates" +
      (last ? " (latest injury notes: " + day(last) + ")" : "") + ". Each line shows the date it was written, so check for newer news before you draft."));
    state.navIds = M.injList.map(function (r) { return r.id; });
    if (!M.injList.length) { main.appendChild(el("div", "mx-empty", "No injuries noted.")); return; }
    var grid = el("div", "mx-groups");
    [["season", "Out for the season", "faller"], ["out", "Out", "faller"], ["soon", "Questionable or expected back", "injury"], ["back", "Back on the field", "riser"]].forEach(function (g) {
      var items = M.injList.filter(function (r) { return r.code === g[0]; });
      if (!items.length) return;
      var card = el("section", "mx-panel mx-group " + g[2]);
      card.appendChild(el("h2", "mx-h", g[1] + " · " + items.length));
      items.forEach(function (r) {
        var p = M.byId[r.id];
        card.appendChild(itemFor(p, el("span", "mx-pill " + r.code, r.status), r.headline, r.detail + " (" + day(r.week) + ")"));
      });
      grid.appendChild(card);
    });
    main.appendChild(grid);
  }

  // ---------- weekly game recap ----------
  var RTH = { QB: [24, 16, 10], RB: [20, 12, 6], WR: [20, 12, 6], TE: [15, 9, 5] };
  function recapPts(r) {
    if (r.status !== "played") return null;
    function g(k) { return Number(r[k]) || 0; }
    return Math.round((g("pass_yds") / 25 + 4 * g("pass_td") - 2 * g("int") + g("rush_yds") / 10 + 6 * g("rush_td") + g("rec") + g("rec_yds") / 10 + 6 * g("rec_td")) * 10) / 10;
  }
  function recapTag(r, pts) {
    if (r.status === "dnp") return ["Did not play", "dnp"];
    if (r.status === "added") return ["New", "new"];
    var t = RTH[r.pos] || RTH.WR;
    return pts >= t[0] ? ["Big game", "big"] : pts >= t[1] ? ["Solid", "solid"] : pts >= t[2] ? ["Quiet", "quiet"] : ["Rough", "rough"];
  }
  function statLine(r) {
    var parts = [];
    if (r.pass_att != null) parts.push(r.pass_cmp + "/" + r.pass_att + ", " + r.pass_yds + " yds, " + r.pass_td + " TD, " + r.int + " INT");
    if (r.rush_att != null && (r.rush_att || r.pos === "RB")) parts.push(r.rush_att + " car, " + r.rush_yds + " yds" + (r.rush_td ? ", " + r.rush_td + " TD" : ""));
    if (r.rec != null && (r.rec || r.pos !== "QB")) parts.push(r.rec + " rec, " + r.rec_yds + " yds" + (r.rec_td ? ", " + r.rec_td + " TD" : ""));
    return parts.join("  ·  ");
  }
  function recapCard(r, p, top) {
    var pts = recapPts(r), tg = recapTag(r, pts);
    var c = setTint(el("div", "mx-rcard"), p);
    c.setAttribute("role", "button"); c.tabIndex = 0;
    var rk = el("div", "mx-rcrk");
    rk.appendChild(el("div", "n", top && p.overall_rank != null ? String(p.overall_rank) : p.pos + p.rank));
    var mv = moveEl(p, top && p.overall_rank != null ? "top" : "pos", true);
    if (mv) rk.appendChild(mv);
    var who = el("div", "who");
    add(who, crest(p), el("span", "nm", p.name), posChip(p.pos, p.pos + p.rank), el("span", "sch", p.school));
    var score = el("div", "mx-rpts " + tg[1]);
    if (pts != null) add(score, el("div", "v", pts.toFixed(1)), el("div", "l", "PPR pts"));
    score.appendChild(el("div", "t", tg[0]));
    var mid = el("div", "mid");
    mid.appendChild(who);
    if (r.result) mid.appendChild(el("div", "res", r.result));
    var sl = statLine(r);
    if (sl && r.status === "played" && !r.note) mid.appendChild(el("div", "line", sl));
    if (r.note) mid.appendChild(el("div", "nt", r.note));
    add(c, rk, mid, score);
    var eff = el("div", "eff");
    add(eff, el("b", null, "Board impact: "), document.createTextNode(r.effect || ""));
    c.appendChild(eff);
    if (r.news) c.appendChild(el("div", "news", r.news));
    var go = function () { openCard(p.id); };
    c.addEventListener("click", go);
    c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    return c;
  }
  function recapSection(main) {
    var rows = (M.recap || []).filter(function (r) { return r.week === state.week && M.byId[r.player_id]; });
    if (!rows.length) return;
    var sec = el("section", "mx-panel mx-recap");
    sec.id = "week-recap";
    var hd = el("div", "mx-rhead");
    add(hd, el("h2", "mx-h", "Game recap"), el("p", null, "How every prospect played this weekend, what it was worth in PPR points (4 per pass TD), and what it did to his spot on the board. ▲ green = moved up since last week, ▼ red = moved down."));
    sec.appendChild(hd);
    // highlights
    var played = rows.filter(function (r) { return r.status === "played"; }).map(function (r) { return { r: r, p: M.byId[r.player_id], pts: recapPts(r) }; });
    var byPts = played.slice().sort(function (a, b) { return b.pts - a.pts; });
    var best = byPts.filter(function (x) { return x.p.overall_rank != null; }).slice(0, 5);
    var sleepers = byPts.filter(function (x) { return x.p.overall_rank == null; }).slice(0, 5);
    var rough = played.filter(function (x) { return x.p.overall_rank != null && recapTag(x.r, x.pts)[1] === "rough"; }).sort(function (a, b) { return a.p.overall_rank - b.p.overall_rank; });
    var out = rows.filter(function (r) { return r.status === "dnp" && M.byId[r.player_id].overall_rank != null; }).map(function (r) { return { r: r, p: M.byId[r.player_id] }; });
    var hl = el("div", "mx-rhl");
    function mini(title, cls, list, right) {
      if (!list.length) return;
      var b = el("div", "mx-rmini " + cls);
      b.appendChild(el("h3", null, title));
      list.forEach(function (x) {
        var it = el("button", "it"); it.type = "button";
        var mv = moveEl(x.p, x.p.overall_rank != null ? "top" : "pos", true);
        add(it, crest(x.p), el("span", "nm", x.p.name), posChip(x.p.pos, x.p.pos + x.p.rank), mv, el("span", "rt", right(x)));
        it.addEventListener("click", function () { openCard(x.p.id); });
        b.appendChild(it);
      });
      hl.appendChild(b);
    }
    mini("Best games in the Top 35", "big", best, function (x) { return x.pts.toFixed(1) + " pts"; });
    mini("Sleeper watch: best games outside the Top 35", "sleep", sleepers, function (x) { return x.pts.toFixed(1) + " pts"; });
    mini("Rough weeks in the Top 35", "rough", rough, function (x) { return x.pts.toFixed(1) + " pts"; });
    mini("Top 35 players who sat", "dnp", out, function () { return "DNP"; });
    sec.appendChild(hl);
    // filter chips
    var F = [["TOP", "Top 35"], ["QB", "QB"], ["RB", "RB"], ["WR", "WR"], ["TE", "TE"], ["FAV", "★ Favorites"]];
    if (!state.recapPos) state.recapPos = "TOP";
    var bar = el("div", "mx-rfilt"); bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Recap filter");
    F.forEach(function (f) {
      var b = el("button", "mx-rchip", f[1]); b.type = "button"; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(state.recapPos === f[0]));
      b.addEventListener("click", function () { state.recapPos = f[0]; renderMainOnly(); var w = document.getElementById("week-recap"); if (w) w.scrollIntoView({ block: "start" }); });
      bar.appendChild(b);
    });
    sec.appendChild(bar);
    var k = state.recapPos, top = k === "TOP";
    var list = rows.filter(function (r) {
      var p = M.byId[r.player_id];
      return top ? p.overall_rank != null : k === "FAV" ? isFav(p.id) : p.pos === k;
    }).sort(function (a, b) {
      var p = M.byId[a.player_id], q = M.byId[b.player_id];
      return top ? p.overall_rank - q.overall_rank : k === "FAV" ? (p.overall_rank || 99) - (q.overall_rank || 99) || p.rank - q.rank : p.rank - q.rank;
    });
    var grid = el("div", "mx-rcards");
    if (!list.length) grid.appendChild(el("div", "mx-empty", k === "FAV" ? "No favorites yet. Tap the ☆ on any player to add him." : "No players here."));
    list.forEach(function (r) { var p = M.byId[r.player_id]; grid.appendChild(recapCard(r, p, top)); if (state.navIds.indexOf(p.id) < 0) state.navIds.push(p.id); });
    sec.appendChild(grid);
    main.appendChild(sec);
  }
  function weekView(main) {
    var weeks = Array.from(new Set(M.changes.map(function (r) { return r.week; }))).sort().reverse();
    if (!weeks.length) { main.appendChild(el("div", "mx-empty", "No weekly notes yet.")); return; }
    if (!state.week || weeks.indexOf(state.week) < 0) state.week = weeks[0];
    var bar = el("div", "mx-filters");
    var sel = el("select", "mx-select"); sel.setAttribute("aria-label", "Week");
    weeks.forEach(function (w) { var o = el("option", null, "Week of " + day(w, true)); o.value = w; if (w === state.week) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", function (e) { state.week = e.target.value; renderMainOnly(); });
    bar.appendChild(sel);
    main.appendChild(bar);
    var rows = M.changes.filter(function (r) { return r.week === state.week; });
    ["summary", "method"].forEach(function (t) {
      rows.filter(function (r) { return r.type === t; }).forEach(function (r) {
        var s = el("section", "mx-panel mx-box" + (t === "method" ? " method" : ""));
        add(s, el("h3", null, r.headline), el("p", null, r.detail));
        main.appendChild(s);
      });
    });
    state.navIds = [];
    recapSection(main);
    var grid = el("div", "mx-groups");
    [["riser", "Risers", "riser"], ["faller", "Fallers", "faller"], ["added", "Added to the board", ""], ["removed", "Removed from the board", ""], ["injury", "Injuries and availability", "injury"]].forEach(function (g) {
      var items = rows.filter(function (r) { return r.type === g[0]; });
      if (!items.length) return;
      var card = el("section", "mx-panel mx-group " + g[2]);
      card.appendChild(el("h2", "mx-h", g[1] + " · " + items.length));
      items.forEach(function (r) {
        var rk = el("span", "rk", (r.from_rank != null ? r.board + r.from_rank : "") + (r.from_rank != null && r.to_rank != null ? " → " : "") + (r.to_rank != null ? r.board + r.to_rank : ""));
        var p = M.byId[r.player_id];
        if (p) {
          if (state.navIds.indexOf(p.id) < 0) state.navIds.push(p.id);
          card.appendChild(itemFor(p, rk, r.headline, r.detail));
        } else {
          var it = el("div", "mx-item"); it.style.cursor = "default";
          var who = el("div", "who"); add(who, el("span", null, r.name), r.pos ? posChip(r.pos) : null);
          add(it, who, rk, el("div", "hl", r.headline), el("div", "dt", r.detail));
          card.appendChild(it);
        }
      });
      grid.appendChild(card);
    });
    main.appendChild(grid);
  }

  // ---------- player screen ----------
  var card = document.getElementById("mx-card");
  var cardPushed = false;
  function openCard(id) { state.open = id; render(); }
  function closeCard() { state.open = null; render(); }
  function stepCard(d) {
    var ids = state.navIds, i = ids.indexOf(state.open);
    if (i < 0 || !ids[i + d]) return;
    state.open = ids[i + d]; renderCard(true);
  }
  function setCardTab(t) { state.cardTab = t; dash.setParams({ cardTab: t }); renderCard(false); }
  function stepTab(d) {
    var i = CTABS.map(function (t) { return t[0]; }).indexOf(state.cardTab);
    setCardTab(CTABS[(i + d + CTABS.length) % CTABS.length][0]);
  }

  function key(v, l, cls) { var d = el("div"); add(d, el("div", "v" + (cls ? " " + cls : ""), v), el("div", "l", l)); return d; }

  function tabReport(p, body) {
    var j = M.inj[p.id];
    if (j) {
      var ib = el("section", "mx-injbox " + j.code);
      var top = el("div", "top");
      add(top, el("span", "mx-pill " + j.code, j.status), j.headline ? el("span", null, j.headline) : null, el("span", "d", "as of " + day(j.week)));
      add(ib, top, el("p", null, j.detail));
      body.appendChild(ib);
    }
    var panel = el("section", "mx-cpanel");
    var g3 = el("div", "mx-grid3");
    // board rank
    var c1 = el("div");
    c1.appendChild(el("h3", "mx-h", p.overall_rank != null ? "Top 35 rank" : "Position rank"));
    var bn = el("div", "mx-bignum");
    add(bn, el("div", "v", p.overall_rank != null ? String(p.overall_rank) : p.pos + p.rank),
      el("div", "of", p.overall_rank != null ? "of 35 · " + p.pos + p.rank + " on our board" : "of " + M.posCount[p.pos] + " " + p.pos + "s on our board"),
      el("div", "t", p.overall_note || p.summary || ""));
    c1.appendChild(bn);
    // profile
    var c2 = el("div");
    c2.appendChild(el("h3", "mx-h", "Player profile"));
    var pr = el("div", "mx-prof");
    [["Height", p.height], ["Weight", p.weight != null ? p.weight + " lbs" : null], ["Age", p.age != null ? p.age + " (draft day)" : null], ["College", p.school],
      ["Class", p.class], ["Archetype", p.player_type], ["Birth date", p.dob], ["Formerly", p.prev_schools]].forEach(function (x) {
      if (x[0] === "Formerly" && !x[1]) return;
      add(pr, el("div", "k", x[0] + ":"), el("div", "v", fmt(x[1])));
    });
    var dk = el("div", "v"); dk.appendChild(el("span", "mx-pill " + (p.declare_likelihood || ""), p.declare_likelihood || "—"));
    add(pr, el("div", "k", "Declare:"), dk);
    c2.appendChild(pr);
    // 2026 report
    var c3 = el("div");
    var sc = M.score[p.id];
    var h3 = el("h3", "mx-h", "2026 report");
    if (sc != null) h3.appendChild(el("span", "x", sc.toFixed(1)));
    c3.appendChild(h3);
    var rep = el("div", "mx-rep");
    (M.report[p.id] || []).forEach(function (r) {
      var line = el("div", "r");
      var top1 = r.rank === 1 && r.n > 2;
      add(line, el("span", "s" + (top1 ? " on" : ""), "★"), el("span", "k", r.label),
        el("span", "val", r.v == null ? "—" : num(r.v, r.fmt) + r.suf),
        el("span", "rk" + (top1 ? " top" : ""), r.rank ? ord(r.rank) + " " + p.pos : "—"));
      rep.appendChild(line);
    });
    c3.appendChild(rep);
    c3.appendChild(el("div", "mx-gnote", (p.s26_through ? "2026 to date, through " + day(p.s26_through) + ". " : "") +
      "Rank among the " + M.posCount[p.pos] + " " + p.pos + "s on this board. Score: average percentile of his production grades, 0–10."));
    add(g3, c1, c2, c3);
    panel.appendChild(g3);
    // top skills + talent
    var sk = el("div", "mx-sub");
    sk.appendChild(el("h3", "mx-h", "Top skills"));
    var row3 = el("div", "mx-skills");
    var best = (M.grades[p.id] || []).filter(function (g) { return g.grade; }).sort(function (a, b) { return b.pct - a.pct; }).slice(0, 3);
    best.forEach(function (g) {
      var s = el("div", "mx-skill");
      var t = el("div", "mx-tile", g.grade); t.style.setProperty("--gcol", gcol(g.grade));
      add(s, t, el("div", "lb", g.label), el("div", "sub", ord(g.rank) + " of " + g.n));
      row3.appendChild(s);
    });
    for (var i = best.length; i < 3; i++) { var e = el("div", "mx-skill"); e.appendChild(el("div", "sub", "")); row3.appendChild(e); }
    var tal = el("div", "mx-talent");
    add(tal, el("div", "t", "Tier"), diamond(p.tier, true),
      el("div", "sub", p.tier != null ? (p.overall_rank != null ? "Top 35 · #" + p.overall_rank : "Last week's Top 35") : "Outside the Top 35"));
    row3.appendChild(tal);
    sk.appendChild(row3);
    panel.appendChild(sk);
    body.appendChild(panel);
  }

  function tabGrades(p, body) {
    var wrap = el("div", "mx-gwrap");
    var panel = el("section", "mx-cpanel");
    panel.appendChild(el("h3", "mx-h", "Core grades"));
    var grid = el("div", "mx-ggrid");
    (M.grades[p.id] || []).forEach(function (g) {
      var c = el("div", "mx-gcell");
      c.style.setProperty("--gcol", gcol(g.grade));
      var dv = g.v == null ? "no data" : (g.key === "mkt" ? "SF market #" + num(g.v) : num(g.v, g.fmt) + (/share|dom|acc|tdr|sec|bdm/.test(g.key) ? "%" : "")) + (g.rank ? " · " + ord(g.rank) + " of " + g.n : "");
      add(c, el("div", "k", g.label), el("div", "v" + (g.grade ? "" : " na"), g.grade || "—"), el("div", "bar"), el("div", "d", dv));
      grid.appendChild(c);
    });
    panel.appendChild(grid);
    panel.appendChild(el("div", "mx-gnote", "Grades rank him against the other " + M.posCount[p.pos] + " " + p.pos + "s on this board (A+ = top 3%, C = middle, F = bottom 13%), using 2026 stats per game where it applies. Lower is better for ball security (INT rate), breakout age, market rank and age. They describe production on paper, not film."));
    wrap.appendChild(panel);
    var L = league();
    if (L) wrap.appendChild(needsPanel(L, false));
    body.appendChild(wrap);
  }

  function tabProd(p, body) {
    var panel = el("section", "mx-cpanel");
    var s = M.s26[p.id] || {};
    function rating(k, v, d, pct, sub) {
      var r = el("div", "mx-rating");
      var bar = el("div", "bar"), i = el("i");
      if (pct != null) { i.style.width = Math.max(4, Math.min(100, pct)) + "%"; r.style.setProperty("--gcol", pct >= 66 ? "var(--ok)" : pct >= 36 ? "var(--warn)" : "var(--bad)"); }
      bar.appendChild(i);
      add(r, el("div", "k", k), el("div", "v", v), bar, sub ? el("div", "d", sub) : null);
      return r;
    }
    var gmap = {}; (M.grades[p.id] || []).forEach(function (g) { gmap[g.key] = g; });
    panel.appendChild(el("h3", "mx-h", "2026 production"));
    var a = el("div", "mx-ratings");
    if (p.pos === "QB") {
      a.appendChild(rating("Games", fmt(s.games)));
      a.appendChild(rating("Pass yds", fmt(s.pass_yds), null, gmap.pyg && gmap.pyg.pct));
      a.appendChild(rating("Pass TD", fmt(s.pass_td), null, gmap.tdr && gmap.tdr.pct));
      a.appendChild(rating("Comp %", s.att ? num(100 * s.cmp / s.att, 1) : "—", null, gmap.acc && gmap.acc.pct));
      a.appendChild(rating("Yds / att", s.att ? num(s.pass_yds / s.att, 1) : "—", null, gmap.ypa && gmap.ypa.pct));
      a.appendChild(rating("INT", fmt(s.int), null, gmap.sec && gmap.sec.pct));
      a.appendChild(rating("Rush yds", fmt(s.rush_yds), null, gmap.ryg && gmap.ryg.pct));
      a.appendChild(rating("Rush TD", fmt(s.rush_td), null, gmap.rtd && gmap.rtd.pct));
    } else {
      a.appendChild(rating("Games", fmt(s.games)));
      if (p.pos === "RB") {
        a.appendChild(rating("Rush yds", fmt(s.rush_yds), null, gmap.ryg && gmap.ryg.pct));
        a.appendChild(rating("Yds / carry", s.rush_att ? num(s.rush_yds / s.rush_att, 1) : "—", null, gmap.ypc && gmap.ypc.pct));
        a.appendChild(rating("Rush TD", fmt(s.rush_td), null, gmap.rtd && gmap.rtd.pct));
      }
      a.appendChild(rating("Catches", fmt(s.rec), null, (gmap.cpg || gmap.rcg || {}).pct));
      a.appendChild(rating("Rec yds", fmt(s.rec_yds), null, (gmap.ryg && p.pos !== "RB" ? gmap.ryg : gmap.rcy || {}).pct));
      a.appendChild(rating("Rec TD", fmt(s.rec_td), null, gmap.rtd && p.pos !== "RB" ? gmap.rtd.pct : null));
      a.appendChild(rating("Yards share", p.share_yds != null ? p.share_yds + "%" : "—", null, gmap.shr && gmap.shr.pct));
      if (p.pos !== "RB") a.appendChild(rating("TD share", p.share_td != null ? p.share_td + "%" : "—", null, gmap.tds && gmap.tds.pct));
      a.appendChild(rating("Dominator", p.dominator != null ? p.dominator + "%" : "—", null, gmap.dom && gmap.dom.pct));
    }
    panel.appendChild(a);
    if (p.pos !== "QB") {
      var b = el("div", "mx-sub");
      b.appendChild(el("h3", "mx-h", "Breakout profile"));
      var r2 = el("div", "mx-ratings");
      r2.appendChild(rating("Breakout age", p.breakout_age != null ? num(p.breakout_age, 1) : "—", null, gmap.bo && gmap.bo.pct, p.breakout_season ? "Season " + p.breakout_season : null));
      r2.appendChild(rating("Best dominator", p.best_dominator != null ? p.best_dominator + "%" : "—", null, gmap.bdm && gmap.bdm.pct));
      if (p.pos !== "RB" || p.yptpa_2026) {
        r2.appendChild(rating("Yds / team att '26", p.yptpa_2026 != null ? num(p.yptpa_2026, 2) : "—", null, gmap.yta && gmap.yta.pct));
        r2.appendChild(rating("Best yds / team att", p.yptpa_best != null ? num(p.yptpa_best, 2) : "—"));
      }
      b.appendChild(r2);
      if (p.breakout_status) b.appendChild(el("div", "mx-gnote", p.breakout_status));
      b.appendChild(el("div", "mx-gnote", "Breakout = first college season with a dominator of " + (p.pos === "TE" ? "15" : "20") + "%+ (age on Sept. 1; 19 or under is elite). Dominator = share of team yards and TDs; 30%+ is elite for a WR, 20%+ for a TE. Yards per team pass attempt stands in for yards per route run: 2.0+ strong, 2.5+ elite."));
      panel.appendChild(b);
    }
    var c = el("div", "mx-sub");
    c.appendChild(el("h3", "mx-h", "Superflex market"));
    var r3 = el("div", "mx-ratings");
    r3.appendChild(rating("Market #", p.market_rank != null ? String(p.market_rank) : "—", null, gmap.mkt && gmap.mkt.pct));
    r3.appendChild(rating("Avg slot", p.market_avg != null ? num(p.market_avg, 1) : "—"));
    r3.appendChild(rating("Range", p.market_lo != null ? p.market_lo + "–" + p.market_hi : "—"));
    r3.appendChild(rating("Lists", fmt(p.market_n)));
    var mp = mockPick(p.id);
    r3.appendChild(rating("Our mock", mp ? mp.pick : "—"));
    var f = M.flag[p.id];
    r3.appendChild(rating("Market tag", f ? f.flag : "—", null, null, f ? (f.gap > 0 ? "+" : "") + f.gap + " vs our board" : null));
    c.appendChild(r3);
    panel.appendChild(c);
    var land = el("div", "mx-sub");
    land.appendChild(el("h3", "mx-h", "NFL landing spot"));
    if (p.nfl_team) {
      var r4 = el("div", "mx-ratings");
      add(r4, rating("Team", p.nfl_team), rating("Round", fmt(p.nfl_round)), rating("Pick", fmt(p.nfl_pick)));
      land.appendChild(r4);
      if (p.landing_note) land.appendChild(el("div", "mx-gnote", p.landing_note));
    } else land.appendChild(el("div", "mx-gnote", "Fills in after the NFL Draft (April 22, 2027): team, round, pick and depth chart."));
    panel.appendChild(land);
    body.appendChild(panel);
  }

  var COLS = {
    QB: [["games", "G"], ["cmp", "Cmp"], ["att", "Att"], ["pass_yds", "Pass Yds"], ["pass_td", "Pass TD"], ["int", "Int"], ["rush_att", "Rush"], ["rush_yds", "Rush Yds"], ["rush_td", "Rush TD"]],
    RB: [["games", "G"], ["rush_att", "Att"], ["rush_yds", "Rush Yds"], ["rush_td", "Rush TD"], ["rec", "Rec"], ["rec_yds", "Rec Yds"], ["rec_td", "Rec TD"]],
    WR: [["games", "G"], ["rec", "Rec"], ["rec_yds", "Rec Yds"], ["rec_td", "Rec TD"], ["rush_att", "Rush"], ["rush_yds", "Rush Yds"], ["rush_td", "Rush TD"]],
    TE: [["games", "G"], ["rec", "Rec"], ["rec_yds", "Rec Yds"], ["rec_td", "Rec TD"]]
  };
  function tabCareer(p, body) {
    var panel = el("section", "mx-cpanel");
    panel.appendChild(el("h3", "mx-h", "College career stats"));
    var rows = M.career[p.id] || [];
    var wrap = el("div", "mx-tablewrap"), t = el("table", "mx-table");
    var cols = [["season", "Season"], ["school", "School"]].concat(COLS[p.pos]);
    var thead = el("thead"), hr = el("tr");
    cols.forEach(function (c) { var th = el("th", null, c[1]); th.scope = "col"; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr", r.partial ? "partial" : "");
      cols.forEach(function (c) {
        var v = r[c[0]];
        if (c[0] === "season") v = String(r.season) + (r.partial ? "*" : "");
        tr.appendChild(el("td", v == null ? "na" : null, c[0] === "season" || c[0] === "school" ? v : fmt(v)));
      });
      tb.appendChild(tr);
    });
    if (!rows.length) { var tr0 = el("tr"), td0 = el("td", "na", "No verified stat lines yet"); td0.colSpan = cols.length; tr0.appendChild(td0); tb.appendChild(tr0); }
    t.appendChild(tb); wrap.appendChild(t); panel.appendChild(wrap);
    var part = rows.filter(function (r) { return r.partial; })[0];
    if (part) panel.appendChild(el("div", "mx-gnote", "* 2026 season to date" + (part.through ? ", through " + day(part.through, true) : "") + ". Blank cells were not confirmed by a second source."));
    body.appendChild(panel);
  }

  function tabNotes(p, body) {
    var panel = el("section", "mx-cpanel");
    var g = el("div", "mx-notes");
    function block(title, text) { if (!text) return null; var d = el("div"); add(d, el("h3", "mx-h", title), el("p", null, text)); return d; }
    var left = el("div"), right = el("div");
    left.style.display = right.style.display = "grid"; left.style.gap = right.style.gap = "22px"; left.style.alignContent = right.style.alignContent = "start";
    add(left, block("Breakdown", p.summary), block("Play style", p.play_style));
    if (p.comps) { var cs = el("div"); cs.appendChild(el("h3", "mx-h", "Player comparisons")); var cc = el("div", "mx-comps"); p.comps.split(" · ").forEach(function (c) { cc.appendChild(el("span", null, c)); }); cs.appendChild(cc); left.appendChild(cs); }
    add(left, block("Projected NFL usage", p.nfl_usage));
    add(right, block("Draft projection", p.draft_projection), block("Declare outlook", p.declare_note));
    var vr = el("div"); vr.appendChild(el("h3", "mx-h", "Verification"));
    var vv = el("div", "mx-verify");
    add(vv, el("span", p.bio_verified ? "ok" : "no", p.bio_verified ? "✓ Bio confirmed by 2 sources" : "! Bio from 1 source"),
      el("span", p.stats_verified ? "ok" : "no", p.stats_verified ? "✓ Stats confirmed by 2 sources" : "! Some stats from 1 source"));
    vr.appendChild(vv);
    if (p.notes) { var n = el("p", "mx-small", p.notes); n.style.marginTop = "10px"; vr.appendChild(n); }
    right.appendChild(vr);
    if (p.sources) {
      var so = el("div"); so.appendChild(el("h3", "mx-h", "Sources"));
      var l = el("div", "mx-links");
      p.sources.split(/\s+/).filter(Boolean).slice(0, 14).forEach(function (u) {
        if (!/^https?:\/\//.test(u)) return;
        var a = el("a", null, u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]); a.href = u; a.target = "_blank"; a.rel = "noopener"; l.appendChild(a);
      });
      so.appendChild(l); right.appendChild(so);
    }
    add(g, left, right);
    panel.appendChild(g);
    body.appendChild(panel);
  }

  function renderCard(resetScroll) {
    var p = state.open ? M.byId[state.open] : null;
    if (!p) {
      if (!card.hidden) {
        card.hidden = true; card.textContent = "";
        document.documentElement.classList.remove("mx-lock");
        if (cardPushed) { cardPushed = false; if (history.state && history.state.mxCard) history.back(); }
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
      }
      return;
    }
    var prevScroll = card.querySelector(".mx-cscroll");
    var keep = !resetScroll && prevScroll && card.getAttribute("data-pid") === p.id ? prevScroll.scrollTop : 0;
    card.textContent = "";
    setTint(card, p);
    card.setAttribute("data-pid", p.id);
    card.setAttribute("aria-label", p.name + " player screen");
    var wm = el("div", "wm"); wm.appendChild(seal(p, { big: true })); card.appendChild(wm);
    var sc = el("div", "mx-cscroll"), inn = el("div", "mx-cin");
    // header
    var head = el("div", "mx-chead");
    var port = el("div", "mx-cport"); port.appendChild(portrait(p));
    var fl = firstLast(p.name);
    var nm = el("div", "mx-cname");
    var schl = el("div", "sch");
    add(schl, crest(p), el("span", null, p.school + (p.class ? " · " + p.class : "")));
    var tg = tags(p); if (tg) schl.appendChild(tg);
    var hn = el("h2"); hn.style.margin = "0";
    add(hn, el("div", "first", fl[0]), el("div", "last", fl[1]));
    add(nm, el("div", "pos", p.pos + " · " + p.pos + p.rank + " on our board"), hn, schl);
    var keys = el("div", "mx-ckeys");
    var mv = p.prev_rank == null ? "NEW" : p.prev_rank - p.rank;
    add(keys,
      key(projShort(p.draft_projection), "Projection"),
      key(p.tier != null ? "Tier " + p.tier : "—", "Talent"),
      key(((p.bio_verified ? 1 : 0) + (p.stats_verified ? 1 : 0)) * 50 + "%", "Verified"),
      key(mv === "NEW" ? "NEW" : mv === 0 ? "–" : (mv > 0 ? "▲ " : "▼ ") + Math.abs(mv), "Rank change (week)", mv === "NEW" ? "" : mv > 0 ? "up" : mv < 0 ? "down" : ""));
    add(head, port, nm, keys);
    inn.appendChild(head);
    inn.appendChild(el("div", "mx-bluebar"));
    // tabs
    var tabs = el("div", "mx-ctabs"); tabs.setAttribute("role", "tablist");
    var kl = el("button", "mx-key", "Q"); kl.type = "button"; kl.setAttribute("aria-label", "Previous section"); kl.addEventListener("click", function () { stepTab(-1); });
    tabs.appendChild(kl);
    CTABS.forEach(function (t) {
      var b = el("button", "mx-ctab", t[1]); b.type = "button"; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(state.cardTab === t[0]));
      b.addEventListener("click", function () { setCardTab(t[0]); });
      tabs.appendChild(b);
    });
    var kr = el("button", "mx-key", "E"); kr.type = "button"; kr.setAttribute("aria-label", "Next section"); kr.addEventListener("click", function () { stepTab(1); });
    tabs.appendChild(kr);
    inn.appendChild(tabs);
    var body = el("div");
    ({ report: tabReport, grades: tabGrades, prod: tabProd, career: tabCareer, notes: tabNotes })[state.cardTab](p, body);
    inn.appendChild(body);
    sc.appendChild(inn);
    card.appendChild(sc);
    // bottom hint bar
    var foot = el("div", "mx-cfoot");
    function hint(cls, glyph, label, fn, aria) {
      var b = el("button", "mx-hint " + cls); b.type = "button";
      var g = el("span", "gl", glyph); g.setAttribute("aria-hidden", "true");
      add(b, g, el("span", "tx", label));
      if (aria) b.setAttribute("aria-label", aria);
      b.addEventListener("click", fn);
      return b;
    }
    var ids = state.navIds, i = ids.indexOf(p.id);
    var on = isFav(p.id);
    var bBack = hint("back", "✕", "Back", closeCard, "Close player screen");
    var bFav = hint("fav" + (on ? " on" : ""), on ? "★" : "☆", on ? "Saved" : "Favorite", function () { toggleFav(p.id); }, (on ? "Remove " : "Add ") + p.name + (on ? " from" : " to") + " favorites");
    var bPrev = hint("", "◀", "Prev", function () { stepCard(-1); }, "Previous player");
    var bNext = hint("", "▶", "Next", function () { stepCard(1); }, "Next player");
    bPrev.disabled = i <= 0; bNext.disabled = i < 0 || i >= ids.length - 1;
    add(foot, bBack, bFav, el("span", "sp", i >= 0 ? (i + 1) + " / " + ids.length : ""), bPrev, bNext);
    card.appendChild(foot);
    if (card.hidden) {
      lastFocus = document.activeElement;
      card.hidden = false;
      document.documentElement.classList.add("mx-lock");
      if (!cardPushed) { try { history.pushState({ mxCard: true }, ""); cardPushed = true; } catch (e) {} }
      bBack.focus({ preventScroll: true });
    }
    sc.scrollTop = keep;
  }
  var lastFocus = null;
  window.addEventListener("popstate", function () { if (cardPushed) { cardPushed = false; state.open = null; render(); } });
  document.addEventListener("keydown", function (e) {
    if (card.hidden) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") { e.preventDefault(); closeCard(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stepCard(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stepCard(-1); }
    else if (e.key === "q" || e.key === "Q") stepTab(-1);
    else if (e.key === "e" || e.key === "E") stepTab(1);
  });
  // swipe between players on touch screens
  var tx = null, ty = null;
  card.addEventListener("touchstart", function (e) {
    var t = e.target;
    while (t && t !== card) { if (t.classList && (t.classList.contains("mx-tablewrap") || t.classList.contains("mx-ctabs"))) { tx = null; return; } t = t.parentNode; }
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  card.addEventListener("touchend", function (e) {
    if (tx == null) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) stepCard(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ---------- chrome: tabs, chips, bottom nav ----------
  var tabsEl = document.getElementById("mx-tabs"), chipsEl = document.getElementById("mx-chips"), bnav = document.getElementById("mx-bnav");
  function setView(v) {
    if (state.view !== v) { state.view = v; state.open = null; dash.setParams({ view: v }); render(); }
    window.scrollTo(0, 0);
  }
  VIEWS.forEach(function (v) {
    var b = el("button", "mx-tab"); b.type = "button"; b.id = "tab-" + v; b.setAttribute("role", "tab");
    add(b, el("span", null, TABN[v]), el("span", "n", ""));
    b.addEventListener("click", function () { setView(v); });
    tabsEl.appendChild(b);
  });
  document.getElementById("mx-prevtab").addEventListener("click", function () { setView(VIEWS[(VIEWS.indexOf(state.view) + VIEWS.length - 1) % VIEWS.length]); });
  document.getElementById("mx-nexttab").addEventListener("click", function () { setView(VIEWS[(VIEWS.indexOf(state.view) + 1) % VIEWS.length]); });
  BOARD.forEach(function (v) {
    var b = el("button", "mx-chip", v === "TOP" ? "Top 35" : v); b.type = "button"; b.id = "chip-" + v; b.setAttribute("role", "tab");
    b.addEventListener("click", function () { setView(v); });
    chipsEl.appendChild(b);
  });
  var lastBoard = BOARD.indexOf(state.view) >= 0 ? state.view : "TOP";
  var NAV = [
    ["BOARD", "Board", "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"],
    ["MYD", "My draft", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"],
    ["MOCK", "Mock", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"],
    ["FAV", "Favorites", "M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z"],
    ["INJ", "Injuries", "M12 8v8M8 12h8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
    ["WEEK", "This week", "M3 17l6-6 4 4 8-8M15 7h6v6"]
  ];
  NAV.forEach(function (n) {
    var b = el("button", "mx-nb"); b.type = "button"; b.id = "nav-" + n[0];
    add(b, icon(n[2]), el("span", null, n[1]));
    if (n[0] === "FAV" || n[0] === "INJ") b.appendChild(el("span", "bdg" + (n[0] === "INJ" ? " red" : ""), ""));
    b.addEventListener("click", function () { setView(n[0] === "BOARD" ? lastBoard : n[0]); });
    bnav.appendChild(b);
  });

  function syncChrome() {
    var v = state.view;
    if (BOARD.indexOf(v) >= 0) lastBoard = v;
    root.setAttribute("data-view", v);
    document.getElementById("mx-pagetitle").textContent = TITLE[v];
    VIEWS.forEach(function (x) {
      var b = document.getElementById("tab-" + x);
      b.setAttribute("aria-selected", String(x === v));
      var n = "";
      if (POS.indexOf(x) >= 0) n = M.players.filter(function (p) { return p.pos === x; }).length;
      if (x === "FAV") n = favCount() || "";
      if (x === "INJ") n = injCount() || "";
      b.querySelector(".n").textContent = n;
    });
    var sel = document.getElementById("tab-" + v);
    if (sel && sel.scrollIntoView && !mq.matches) { var t = tabsEl; var l = sel.offsetLeft, r = l + sel.offsetWidth; if (l < t.scrollLeft || r > t.scrollLeft + t.clientWidth) t.scrollLeft = l - 40; }
    BOARD.forEach(function (x) { document.getElementById("chip-" + x).setAttribute("aria-selected", String(x === v)); });
    NAV.forEach(function (n) {
      var on = n[0] === "BOARD" ? BOARD.indexOf(v) >= 0 : v === n[0];
      var b = document.getElementById("nav-" + n[0]);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    var bf = document.querySelector("#nav-FAV .bdg"), nf = favCount(); bf.textContent = nf ? String(nf) : ""; bf.hidden = !nf;
    var bi = document.querySelector("#nav-INJ .bdg"), ni = injCount(); bi.textContent = ni ? String(ni) : ""; bi.hidden = !ni;
  }

  function renderSide() {
    var side = document.getElementById("mx-side"), bodyEl = side.parentNode;
    side.textContent = "";
    var L = league();
    var show = !!L && ["MYD", "MOCK", "TOP", "QB", "RB", "WR", "TE", "FAV"].indexOf(state.view) >= 0;
    bodyEl.classList.toggle("noside", !show);
    bodyEl.classList.toggle("side-first", state.view === "MYD");
    if (show) side.appendChild(needsPanel(L, state.view === "MYD"));
  }
  function renderMainOnly() {
    var main = document.getElementById("mx-main");
    var focusQ = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("mx-input");
    var pos = focusQ ? document.activeElement.selectionStart : null;
    main.textContent = "";
    var v = state.view;
    if (v === "MYD") myDraftView(main);
    else if (v === "MOCK") mockView(main);
    else if (v === "INJ") injView(main);
    else if (v === "WEEK") weekView(main);
    else boardView(main);
    if (focusQ) { var q = main.querySelector(".mx-input"); if (q) { q.focus({ preventScroll: true }); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
    if (window.rbMeasure) window.rbMeasure();
  }

  function render() {
    if (!M || M === "loading") {
      var b = build();
      if (b === "loading") { document.getElementById("mx-main").textContent = ""; document.getElementById("mx-main").appendChild(el("div", "mx-empty", "Loading the board…")); return; }
      if (b === "error") { document.getElementById("mx-main").textContent = ""; document.getElementById("mx-main").appendChild(el("div", "mx-empty", "The board's data didn't load. Refresh to try again.")); return; }
      M = b;
    }
    coachBox();
    syncChrome();
    renderSide();
    renderMainOnly();
    renderCard(false);
  }
  if (mq.addEventListener) mq.addEventListener("change", function () { if (M) render(); });
  dash.onData(render);
})();
