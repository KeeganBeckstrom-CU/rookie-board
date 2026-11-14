(function () {
  var P0 = dash.params() || {};
  var state = { pos: "TOP", q: "", declare: "", open: null, week: null, focus: null,
    crest: "seal", favSort: P0.favSort || "overall",
    league: P0.league || null,
    favs: new Set(Array.isArray(P0.favs) ? P0.favs : []), unfavs: new Set(Array.isArray(P0.unfavs) ? P0.unfavs : []) };
  var POS = ["QB", "RB", "WR", "TE"];
  var VIEWS = ["MYD", "TOP", "QB", "RB", "WR", "TE", "FAV", "MOCK", "WEEK"];
  var TABNAME = { MYD: "My draft", TOP: "Top 35", FAV: "★ Favorites", MOCK: "Mock draft", WEEK: "This week" };
  var LABEL = { TOP: "Overall top 35 · superflex PPR", FAV: "Favorites", QB: "Quarterbacks", RB: "Running backs", WR: "Wide receivers", TE: "Tight ends" };
  var COLS = {
    QB: [["games","G"],["cmp","Cmp"],["att","Att"],["pass_yds","Pass Yds"],["pass_td","Pass TD"],["int","Int"],["rush_att","Rush"],["rush_yds","Rush Yds"],["rush_td","Rush TD"]],
    RB: [["games","G"],["rush_att","Att"],["rush_yds","Rush Yds"],["rush_td","Rush TD"],["rec","Rec"],["rec_yds","Rec Yds"],["rec_td","Rec TD"]],
    WR: [["games","G"],["rec","Rec"],["rec_yds","Rec Yds"],["rec_td","Rec TD"],["rush_att","Rush"],["rush_yds","Rush Yds"],["rush_td","Rush TD"]],
    TE: [["games","G"],["rec","Rec"],["rec_yds","Rec Yds"],["rec_td","Rec TD"]]
  };
  var HEAD26 = { TOP: "yds / TD", FAV: "yds / TD", QB: "Pass yds / TD", RB: "Rush yds / TD", WR: "Rec yds / TD", TE: "Rec yds / TD" };

  dash.calc("rank_moves", {
    title: "Rank change since last week",
    description: "Position rank last week minus position rank now (positive = moved up); NEW when the player wasn't on last week's board.",
    inputs: ["players"],
    fn: function (players) {
      return players.map(function (p) {
        return { id: p.id, move: p.prev_rank == null ? "NEW" : p.prev_rank - p.rank };
      });
    }
  });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function mark(e, field, id, src) {
    e.setAttribute("data-source", src || "players");
    e.setAttribute("data-field", field);
    e.setAttribute("data-where", "id=" + encodeURIComponent(id));
    return e;
  }
  function fmt(v) { return v == null || v === "" ? "—" : (typeof v === "number" ? v.toLocaleString() : String(v)); }

  var tabs = document.getElementById("pos-tabs");
  VIEWS.forEach(function (p) {
    var b = el("button", "rb-tab" + (TABNAME[p] ? " alt" : ""));
    b.type = "button"; b.id = "tab-" + p; b.setAttribute("role", "tab");
    b.appendChild(el("span", null, TABNAME[p] || p));
    b.appendChild(el("span", "n", ""));
    b.addEventListener("click", function () { state.pos = p; state.open = null; state.focus = null; render(); });
    tabs.appendChild(b);
  });
  document.getElementById("rb-search").addEventListener("input", function (e) { state.q = e.target.value.toLowerCase(); render(); });
  document.getElementById("rb-declare").addEventListener("change", function (e) { state.declare = e.target.value; render(); });
  document.getElementById("rb-tag").addEventListener("change", function (e) { state.tag = e.target.value; render(); });
  var favSortSel = document.getElementById("rb-favsort");
  favSortSel.value = state.favSort;
  favSortSel.addEventListener("change", function (e) { state.favSort = e.target.value; dash.setParams({ favSort: e.target.value }); render(); });


  // A lightened version of the school's color, so dark school colors still read on the dark board.
  function hexRgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function sat(c) { var mx = Math.max.apply(null, c), mn = Math.min.apply(null, c); return mx ? (mx - mn) / mx : 0; }
  function schoolTint(p) {
    var a = hexRgb(p.school_color), b = hexRgb(p.school_color2);
    var base = a;
    // near-black, near-white or gray primaries fall back to the second color when it has more color
    if (a && b && (sat(a) < 0.2) && sat(b) > sat(a)) base = b;
    if (!base) base = [143, 163, 191];
    var l = lum(base);
    var mix = l < 0.2 ? 0.55 : l < 0.4 ? 0.42 : l < 0.6 ? 0.28 : 0.12;
    var lt = base.map(function (v) { return Math.round(v + (255 - v) * mix); });
    var hex = "#" + lt.map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
    var rgba = function (al) { return "rgba(" + lt.join(",") + "," + al + ")"; };
    return { hex: hex, tint: rgba(0.34), tint2: rgba(0.14), tintH: rgba(0.48) };
  }
  function applyTint(node, p) {
    var t = schoolTint(p);
    node.classList.add("tinted");
    node.style.setProperty("--tl", t.hex);
    node.style.setProperty("--tint", t.tint);
    node.style.setProperty("--tint-2", t.tint2);
    node.style.setProperty("--tint-h", t.tintH);
    node.style.setProperty("--sc1", p.school_color || "#23395a");
    node.style.setProperty("--sc2", p.school_color2 || "#ffc72c");
    return node;
  }

  // Original crests in five styles, each in the school's two colors with its abbreviation (no real logos).
  var SVGNS = "http://www.w3.org/2000/svg", crestN = 0;
  var CRESTS = [
    ["shield", "Varsity shield"], ["seal", "Stadium seal"], ["pennant", "Felt pennant"],
    ["hex", "Carbon hex"], ["patch", "Stitched patch"]
  ];
  function sv(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function shade(rgb, f) { // f < 0 darkens, f > 0 lightens
    return "#" + rgb.map(function (v) {
      var x = f < 0 ? v * (1 + f) : v + (255 - v) * f;
      return ("0" + Math.round(Math.max(0, Math.min(255, x))).toString(16)).slice(-2);
    }).join("");
  }
  function contrast(a, b) { return Math.abs(lum(a) - lum(b)); }
  function crestText(svg, ab, x, y, size, ink, extra) {
    var a = {
      x: String(x), y: String(y), "text-anchor": "middle", "dominant-baseline": "middle",
      "font-family": "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      "font-size": String(size), "letter-spacing": "0.5", fill: ink, stroke: "#05080e", "stroke-width": "4.5",
      "paint-order": "stroke", "stroke-linejoin": "round"
    };
    for (var k in (extra || {})) a[k] = extra[k];
    var t = sv("text", a, svg);
    t.textContent = ab;
    return t;
  }
  function star(svg, cx, cy, r, fill) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      pts.push((cx + rr * Math.cos(ang)).toFixed(1) + "," + (cy + rr * Math.sin(ang)).toFixed(1));
    }
    return sv("polygon", { points: pts.join(" "), fill: fill, stroke: "#05080e", "stroke-width": "1" }, svg);
  }
  function badge(p, big, style) {
    style = style || state.crest || "shield";
    var c1 = hexRgb(p.school_color) || [74, 81, 96];
    var c2 = hexRgb(p.school_color2) || [255, 255, 255];
    if (contrast(c1, c2) < 0.12) c2 = lum(c1) > 0.5 ? [10, 15, 24] : [255, 255, 255];
    var ink = contrast(c1, c2) >= contrast(c1, [255, 255, 255]) ? shade(c2, 0) : "#ffffff";
    var id = "crest" + (++crestN);
    var wrap = el("div", "rb-badge rb-crest cs-" + style + (big ? " lg" : ""));
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.setProperty("--glow", schoolTint(p).hex);
    var svg = sv("svg", { viewBox: "0 0 100 116", width: "100%", height: "100%" }, wrap);
    var defs = sv("defs", {}, svg);
    var g = sv("linearGradient", { id: id + "f", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    sv("stop", { offset: "0", "stop-color": shade(c1, 0.25) }, g);
    sv("stop", { offset: "0.5", "stop-color": shade(c1, 0) }, g);
    sv("stop", { offset: "1", "stop-color": shade(c1, -0.4) }, g);
    var t = sv("linearGradient", { id: id + "t", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
    sv("stop", { offset: "0", "stop-color": shade(c2, 0.4) }, t);
    sv("stop", { offset: "0.45", "stop-color": shade(c2, 0) }, t);
    sv("stop", { offset: "1", "stop-color": shade(c2, -0.35) }, t);
    var F = "url(#" + id + "f)", T = "url(#" + id + "t)", K = "#05080e";
    var ab = (p.school_abbr || "").slice(0, 5);
    var fs = ab.length <= 2 ? 40 : ab.length === 3 ? 34 : ab.length === 4 ? 27 : 22;

    if (style === "seal") {
      // readable lettering: white with a heavy black outline, or dark with a white outline on light school colors
      var light = lum(c1) > 0.55;
      var sInk = light ? "#0b0f18" : "#ffffff", sStroke = light ? "#ffffff" : K;
      var sFs = big ? (ab.length <= 2 ? 36 : ab.length === 3 ? 30 : 25) : (ab.length <= 2 ? 42 : ab.length === 3 ? 35 : 29);
      svg.setAttribute("viewBox", "2 10 100 100");
      sv("circle", { cx: "52.5", cy: "60.5", r: "46", fill: K }, svg);
      sv("circle", { cx: "50", cy: "58", r: "46", fill: T, stroke: K, "stroke-width": "2.5" }, svg);
      var rIn = big ? 35 : 40;
      if (big) sv("circle", { cx: "50", cy: "58", r: "41", fill: "none", stroke: K, "stroke-width": "1.4", "stroke-dasharray": "1.5 3.5" }, svg);
      sv("circle", { cx: "50", cy: "58", r: String(rIn), fill: F, stroke: K, "stroke-width": "2" }, svg);
      var cl = sv("clipPath", { id: id + "c" }, defs); sv("circle", { cx: "50", cy: "58", r: String(rIn) }, cl);
      var gg = sv("g", { "clip-path": "url(#" + id + "c)" }, svg);
      sv("rect", { x: "0", y: "81", width: "100", height: "5", fill: T, opacity: ".9" }, gg);
      sv("ellipse", { cx: "50", cy: "33", rx: "32", ry: "12", fill: "#fff", opacity: ".10" }, gg);
      var starFill = shade(c1, 0);
      if (big) { star(svg, 12, 58, 5, starFill); star(svg, 88, 58, 5, starFill); }
      var tExtra = { stroke: sStroke, "stroke-width": big ? "4.5" : "4", "letter-spacing": "0.5" };
      if (ab.length >= 4) { tExtra.textLength = big ? "50" : "60"; tExtra.lengthAdjust = "spacingAndGlyphs"; }
      crestText(svg, ab, 50, 59, sFs, sInk, tExtra);
    } else if (style === "pennant") {
      sv("path", { d: "M10 22 L98 56 L10 90 Z", fill: K }, svg);
      sv("path", { d: "M7 19 L95 53 L7 87 Z", fill: F, stroke: K, "stroke-width": "2.5", "stroke-linejoin": "round" }, svg);
      sv("rect", { x: "4", y: "15", width: "14", height: "76", rx: "2", fill: T, stroke: K, "stroke-width": "2" }, svg);
      sv("path", { d: "M22 30 L80 53 L22 76", fill: "none", stroke: T, "stroke-width": "3" }, svg);
      sv("path", { d: "M7 19 L95 53 L60 40 Z", fill: "#fff", opacity: ".14" }, svg);
      crestText(svg, ab, 43, 54, fs * 0.72, ink, { transform: "rotate(-4 43 54)", "font-style": "italic" });
    } else if (style === "hex") {
      var pat = sv("pattern", { id: id + "p", width: "4", height: "4", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
      sv("rect", { width: "2", height: "4", fill: "#000", opacity: ".22" }, pat);
      sv("polygon", { points: "52.5,6.5 96.5,31.5 96.5,89.5 52.5,114.5 8.5,89.5 8.5,31.5", fill: K }, svg);
      sv("polygon", { points: "50,4 94,29 94,87 50,112 6,87 6,29", fill: T, stroke: K, "stroke-width": "2.5", "stroke-linejoin": "round" }, svg);
      sv("polygon", { points: "50,13 86,34 86,82 50,103 14,82 14,34", fill: F, stroke: K, "stroke-width": "1.8", "stroke-linejoin": "round" }, svg);
      sv("polygon", { points: "50,13 86,34 86,82 50,103 14,82 14,34", fill: "url(#" + id + "p)" }, svg);
      sv("path", { d: "M14 72 L50 92 L86 72 L86 80 L50 100 L14 80 Z", fill: T, opacity: ".95" }, svg);
      sv("path", { d: "M14 34 L50 13 L86 34 L86 44 L50 28 L14 44 Z", fill: "#fff", opacity: ".16" }, svg);
      crestText(svg, ab, 50, 56, fs * 0.95, ink);
    } else if (style === "patch") {
      sv("rect", { x: "8.5", y: "18.5", width: "88", height: "86", rx: "20", fill: K }, svg);
      sv("rect", { x: "6", y: "16", width: "88", height: "86", rx: "20", fill: T, stroke: K, "stroke-width": "2.5" }, svg);
      sv("rect", { x: "13", y: "23", width: "74", height: "72", rx: "14", fill: F, stroke: K, "stroke-width": "1.5" }, svg);
      sv("rect", { x: "17.5", y: "27.5", width: "65", height: "63", rx: "10", fill: "none", stroke: ink, "stroke-width": "1.6", "stroke-dasharray": "4 3", opacity: ".9" }, svg);
      sv("path", { d: "M13 37 C13 27 20 23 30 23 L70 23 C80 23 87 27 87 37 L87 46 C64 38 36 38 13 46 Z", fill: "#fff", opacity: ".13" }, svg);
      star(svg, 50, 37, 5, ink);
      crestText(svg, ab, 50, 66, fs * 0.95, ink);
    } else { // shield
      var SHIELD = "M50 3 L94 14 C94 52 88 86 50 113 C12 86 6 52 6 14 Z";
      var INNER = "M50 11 L86 20 C86 53 80 81 50 104 C20 81 14 53 14 20 Z";
      sv("path", { d: SHIELD, fill: K, transform: "translate(2.5 2.5)" }, svg);
      sv("path", { d: SHIELD, fill: T, stroke: K, "stroke-width": "2.5" }, svg);
      sv("path", { d: INNER, fill: F, stroke: K, "stroke-width": "1.5" }, svg);
      var clip = sv("clipPath", { id: id + "c" }, defs); sv("path", { d: INNER }, clip);
      var band = sv("g", { "clip-path": "url(#" + id + "c)" }, svg);
      sv("path", { d: "M0 70 L100 46 L100 58 L0 82 Z", fill: T, opacity: "0.9" }, band);
      sv("path", { d: "M0 86 L100 62 L100 65 L0 89 Z", fill: T, opacity: "0.55" }, band);
      sv("path", { d: "M14 20 L50 11 L86 20 C86 30 85 38 84 44 C62 34 38 34 16 44 C15 38 14 30 14 20 Z", fill: "#ffffff", opacity: "0.16" }, band);
      star(svg, 50, 22, 5, ink);
      crestText(svg, ab, 50, 64, fs, ink, { "font-style": "italic" });
    }
    return wrap;
  }

  function fact(k, v, field, id, small) {
    var f = el("div", "rb-fact");
    f.appendChild(el("div", "k", k));
    var val = el("div", "v" + (small ? " small" : ""), fmt(v));
    if (field) mark(val, field, id);
    f.appendChild(val);
    return f;
  }

  function detail(p, careerRows) {
    var d = applyTint(el("div", "rb-detail"), p);
    d.setAttribute("role", "region");
    d.setAttribute("aria-label", p.name + " scouting card");

    var head = el("div", "rb-card-head");
    head.style.setProperty("--hc1", p.school_color || "#23395a");
    head.style.setProperty("--hc2", p.school_color2 || "#ffc72c");
    head.appendChild(badge(p, true));
    var hn = el("div");
    hn.appendChild(mark(el("div", "big", p.name), "name", p.id));
    var line = el("div", "rb-muted");
    line.appendChild(mark(el("span", null, p.school), "school", p.id));
    if (p.prev_schools) { line.appendChild(document.createTextNode(" · formerly ")); line.appendChild(mark(el("span", null, p.prev_schools), "prev_schools", p.id)); }
    line.appendChild(document.createTextNode(" · "));
    line.appendChild(mark(el("span", null, p.class), "class", p.id));
    hn.appendChild(line);
    head.appendChild(hn);
    d.appendChild(head);

    var facts = el("div", "rb-facts");
    facts.appendChild(fact("Age (draft day)", p.age, "age", p.id));
    facts.appendChild(fact("Height", p.height, "height", p.id));
    facts.appendChild(fact("Weight", p.weight == null ? null : p.weight + " lb", "weight", p.id));
    facts.appendChild(fact("Birth date", p.dob, "dob", p.id, true));
    facts.appendChild(fact("Player type", p.player_type, "player_type", p.id, true));
    facts.appendChild(fact("Projected pick", p.draft_projection, "draft_projection", p.id, true));
    var dec = el("div", "rb-fact");
    dec.appendChild(el("div", "k", "Likely to declare"));
    var dv = el("div", "v small");
    dv.appendChild(mark(el("span", "rb-pill " + (p.declare_likelihood || ""), p.declare_likelihood || "—"), "declare_likelihood", p.id));
    dec.appendChild(dv);
    facts.appendChild(dec);
    d.appendChild(facts);

    var left = el("div", "rb-stack");
    function block(title, field, text) {
      var s = el("div");
      s.appendChild(el("h4", null, title));
      s.appendChild(mark(el("p", null, text || "—"), field, p.id));
      return s;
    }
    if (p.overall_rank != null && p.overall_note) {
      var ob = el("div");
      var oh = el("h4", null, "Top 35 · #");
      oh.appendChild(mark(el("span", null, String(p.overall_rank)), "overall_rank", p.id));
      oh.appendChild(document.createTextNode(" overall (superflex PPR)"));
      ob.appendChild(oh);
      ob.appendChild(mark(el("p", null, p.overall_note), "overall_note", p.id));
      left.appendChild(ob);
    }
    var prof = el("div", "rb-prof");
    prof.appendChild(el("h4", null, "Production profile · 2026 share of team offense"));
    if (p.share_yds != null) {
      [["Yards share", "share_yds", p.share_yds], ["TD share", "share_td", p.share_td], ["Dominator", "dominator", p.dominator]].forEach(function (b) {
        var r = el("div", "bar");
        r.appendChild(el("span", "k", b[0]));
        var tr = el("span", "track");
        var fill = el("span", "fill");
        fill.style.width = Math.min(100, (b[2] || 0) * 2) + "%";
        tr.appendChild(fill);
        r.appendChild(tr);
        var v = el("span", "v");
        v.appendChild(mark(el("span", null, b[2] == null ? "—" : String(b[2])), b[1], p.id));
        v.appendChild(document.createTextNode("%"));
        r.appendChild(v);
        prof.appendChild(r);
      });
      prof.appendChild(el("div", "rb-notes", p.pos === "RB" ? "RB: scrimmage yards and TDs as a share of the team's rushing + passing totals. Bar is full at 50%. 30%+ dominator is elite." : "Receiving yards and TDs as a share of the team's passing totals. Bar is full at 50%. 30%+ dominator is elite for a WR, 20%+ for a TE."));
    } else prof.appendChild(el("p", "rb-notes", p.pos === "QB" ? "Share stats are for RB, WR and TE." : "No 2026 share yet."));
    var mkb = el("div", "rb-frow");
    function mb(k, v, field) { var x = el("span", "rb-fbox"); x.appendChild(el("span", "k", k)); x.appendChild(mark(el("span", "v", fmt(v)), field, p.id)); return x; }
    mkb.appendChild(mb("Tier", p.tier, "tier"));
    mkb.appendChild(mb("SF market #", p.market_rank, "market_rank"));
    mkb.appendChild(mb("Avg slot", p.market_avg, "market_avg"));
    mkb.appendChild(mb("Lists", p.market_n, "market_n"));
    prof.appendChild(mkb);
    if (p.pos !== "QB") {
      var bo = el("div", "rb-frow");
      bo.appendChild(mb("Breakout age", p.breakout_age, "breakout_age"));
      bo.appendChild(mb("Breakout season", p.breakout_season, "breakout_season"));
      bo.appendChild(mb("Best dominator %", p.best_dominator, "best_dominator"));
      if (p.pos !== "RB" || p.yptpa_2026) {
        bo.appendChild(mb("Yds / team pass att '26", p.yptpa_2026, "yptpa_2026"));
        bo.appendChild(mb("Best yds / team att", p.yptpa_best, "yptpa_best"));
      }
      prof.appendChild(bo);
      prof.appendChild(mark(el("div", "rb-notes", p.breakout_status || ""), "breakout_status", p.id));
      prof.appendChild(el("div", "rb-notes", "Breakout = first college season with a dominator of " + (p.pos === "TE" ? "15" : "20") + "%+ (age on Sept. 1 that year; younger is better, 19 or under is elite). Yards per team pass attempt stands in for yards per route run, which is PFF subscriber data: 2.0+ is strong, 2.5+ elite."));
    }
    var land = el("div", "rb-frow");
    if (p.nfl_team) {
      land.appendChild(mb("NFL team", p.nfl_team, "nfl_team"));
      land.appendChild(mb("Round", p.nfl_round, "nfl_round"));
      land.appendChild(mb("Pick", p.nfl_pick, "nfl_pick"));
      if (p.landing_note) prof.appendChild(mark(el("p", "rb-notes", p.landing_note), "landing_note", p.id));
    } else land.appendChild(el("span", "rb-notes", "NFL landing spot: fills in after the NFL Draft (April 22, 2027): team, round, pick and depth chart."));
    prof.appendChild(land);
    left.appendChild(prof);
    left.appendChild(block("Breakdown", "summary", p.summary));
    left.appendChild(block("Play style", "play_style", p.play_style));
    var cs = el("div");
    cs.appendChild(el("h4", null, "Player comparisons"));
    var comps = el("div", "rb-comps");
    mark(comps, "comps", p.id);
    (p.comps ? p.comps.split(" · ") : ["—"]).forEach(function (c) { comps.appendChild(el("span", null, c)); });
    cs.appendChild(comps);
    left.appendChild(cs);
    left.appendChild(block("Projected NFL usage", "nfl_usage", p.nfl_usage));
    left.appendChild(block("Declare outlook", "declare_note", p.declare_note));
    d.appendChild(left);

    var right = el("div", "rb-stack");
    var st = el("div");
    st.appendChild(el("h4", null, "College career stats"));
    var wrap = el("div", "rb-tablewrap");
    var t = el("table", "rb-career");
    t.setAttribute("data-source", "career");
    t.setAttribute("data-row-key", "row_id");
    var thead = el("thead"), hr = el("tr");
    var cols = [["season","Season"],["school","School"]].concat(COLS[p.pos]);
    cols.forEach(function (c) { var th = el("th", null, c[1]); th.setAttribute("data-field", c[0]); th.scope = "col"; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody");
    careerRows.forEach(function (r) {
      var tr = el("tr", r.partial ? "partial" : "");
      tr.setAttribute("data-key", encodeURIComponent(r.row_id));
      cols.forEach(function (c, i) {
        var v = r[c[0]];
        if (c[0] === "season" && r.partial) v = String(r.season) + "*";
        tr.appendChild(el("td", null, c[0] === "season" ? String(v) : fmt(v)));
      });
      tb.appendChild(tr);
    });
    if (!careerRows.length) {
      var tr0 = el("tr"); var td0 = el("td", "rb-muted", "No verified stat lines yet");
      td0.colSpan = cols.length; td0.style.textAlign = "left"; tr0.appendChild(td0); tb.appendChild(tr0);
    }
    t.appendChild(tb);
    wrap.appendChild(t);
    st.appendChild(wrap);
    var part = careerRows.filter(function (r) { return r.partial; })[0];
    if (part) st.appendChild(el("div", "rb-notes", "* 2026 season to date" + (part.through ? ", through " + part.through : "") + ". Blank cells were not confirmed by a second source."));
    right.appendChild(st);

    var ver = el("div");
    ver.appendChild(el("h4", null, "Verification"));
    var vr = el("div", "rb-verify");
    vr.appendChild(mark(el("span", p.bio_verified ? "ok" : "no", p.bio_verified ? "✓ Bio confirmed by 2 sources" : "! Bio from 1 source"), "bio_verified", p.id));
    vr.appendChild(mark(el("span", p.stats_verified ? "ok" : "no", p.stats_verified ? "✓ Stats confirmed by 2 sources" : "! Some stats from 1 source"), "stats_verified", p.id));
    ver.appendChild(vr);
    if (p.notes) { var n = mark(el("p", "rb-notes", p.notes), "notes", p.id); n.style.marginTop = "8px"; ver.appendChild(n); }
    right.appendChild(ver);

    if (p.sources) {
      var so = el("div");
      so.appendChild(el("h4", null, "Sources"));
      var sl = el("div", "rb-sources");
      mark(sl, "sources", p.id);
      p.sources.split(/\s+/).filter(Boolean).slice(0, 12).forEach(function (u) {
        if (!/^https?:\/\//.test(u)) return;
        var a = el("a", null, u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]);
        a.href = u; a.target = "_blank"; a.rel = "noopener";
        sl.appendChild(a);
      });
      so.appendChild(sl);
      right.appendChild(so);
    }
    d.appendChild(right);
    return d;
  }

  function moveOf(id) {
    var m = dash.data("rank_moves");
    if (m.status !== "ok" || !m.data) return null;
    for (var i = 0; i < m.data.length; i++) if (m.data[i].id === id) return m.data[i].move;
    return null;
  }

  var GROUPS = [
    ["riser", "Risers"], ["faller", "Fallers"], ["added", "Added to the board"],
    ["removed", "Removed from the board"], ["injury", "Injuries and availability"]
  ];
  function cmark(e, field, id) {
    e.setAttribute("data-source", "changes");
    e.setAttribute("data-field", field);
    e.setAttribute("data-where", "change_id=" + encodeURIComponent(id));
    return e;
  }
  function renderWeek() {
    var box = document.getElementById("rb-week");
    box.textContent = "";
    var cd = dash.data("changes");
    if (cd.status !== "ok") {
      box.appendChild(el("div", "rb-empty", cd.status === "loading" ? "Loading weekly notes…" : "Weekly notes didn’t load."));
      return;
    }
    var weeks = Array.from(new Set(cd.data.map(function (r) { return r.week; }))).sort().reverse();
    if (!weeks.length) { box.appendChild(el("div", "rb-empty", "No weekly notes yet.")); return; }
    if (!state.week || weeks.indexOf(state.week) < 0) state.week = weeks[0];
    var head = el("div", "rb-week-head");
    var wt = el("h2", "rb-week-title");
    wt.id = "week-title";
    wt.textContent = "Board changes · week of " + d3.utcFormat("%b %-d, %Y")(new Date(state.week + "T12:00:00Z"));
    head.appendChild(wt);
    if (weeks.length > 1) {
      var sel = el("select", "rb-select");
      sel.setAttribute("aria-label", "Week");
      weeks.forEach(function (w) { var o = el("option", null, d3.utcFormat("%b %-d")(new Date(w + "T12:00:00Z"))); o.value = w; if (w === state.week) o.selected = true; sel.appendChild(o); });
      sel.addEventListener("change", function (e) { state.week = e.target.value; render(); });
      head.appendChild(sel);
    }
    box.appendChild(head);
    var rows = cd.data.filter(function (r) { return r.week === state.week; });
    ["summary", "method"].forEach(function (t) {
      rows.filter(function (r) { return r.type === t; }).forEach(function (r) {
        var s = el("div", "rb-summary" + (t === "method" ? " method" : ""));
        s.appendChild(cmark(el("h3", null, r.headline), "headline", r.change_id));
        s.appendChild(cmark(el("p", null, r.detail), "detail", r.change_id));
        box.appendChild(s);
      });
    });
    var grid = el("div", "rb-groups");
    GROUPS.forEach(function (g) {
      var items = rows.filter(function (r) { return r.type === g[0]; });
      if (!items.length) return;
      var card = el("div", "rb-group " + g[0]);
      card.id = "week-" + g[0];
      card.appendChild(el("h4", null, g[1] + " · " + items.length));
      items.forEach(function (r) {
        var it = el("div", "rb-item");
        var who = el("div", "who");
        who.appendChild(cmark(el("span", null, r.name), "name", r.change_id));
        who.appendChild(document.createTextNode(" "));
        who.appendChild(cmark(el("span", "rb-muted", r.pos), "pos", r.change_id));
        it.appendChild(who);
        var rk = el("div", "ranks");
        if (r.from_rank != null) { rk.appendChild(document.createTextNode(r.board)); rk.appendChild(cmark(el("span", null, String(r.from_rank)), "from_rank", r.change_id)); }
        if (r.from_rank != null && r.to_rank != null) rk.appendChild(document.createTextNode(" → "));
        if (r.to_rank != null) { rk.appendChild(document.createTextNode(r.board)); rk.appendChild(cmark(el("span", null, String(r.to_rank)), "to_rank", r.change_id)); }
        it.appendChild(rk);
        it.appendChild(cmark(el("div", "hl", r.headline), "headline", r.change_id));
        it.appendChild(cmark(el("div", "dt", r.detail), "detail", r.change_id));
        if (r.player_id) {
          it.style.cursor = "pointer";
          it.addEventListener("click", function () {
            var pd = dash.data("players");
            var p = pd.status === "ok" ? pd.data.filter(function (x) { return x.id === r.player_id; })[0] : null;
            if (!p) return;
            state.pos = p.pos; state.open = p.id; state.q = ""; document.getElementById("rb-search").value = "";
            render();
            var rr = document.getElementById("row-" + p.id); if (rr) rr.scrollIntoView({ block: "center" });
          });
        }
        card.appendChild(it);
      });
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }


  function openPlayer(pid) {
    var pd = dash.data("players");
    var p = pd.status === "ok" ? pd.data.filter(function (x) { return x.id === pid; })[0] : null;
    if (!p) return;
    state.pos = p.pos; state.open = p.id; state.q = ""; document.getElementById("rb-search").value = "";
    render();
    var rr = document.getElementById("row-" + p.id); if (rr) rr.scrollIntoView({ block: "center" });
  }
  function mmark(e, field, pick) {
    e.setAttribute("data-source", "mock");
    e.setAttribute("data-field", field);
    e.setAttribute("data-where", "pick=" + encodeURIComponent(pick));
    return e;
  }
  dash.calc("mock_mix", {
    title: "Mock draft picks by position",
    description: "Count of mock-draft picks at each position.",
    inputs: ["mock"],
    fn: function (mock) {
      return ["QB", "RB", "WR", "TE"].map(function (pos) {
        return { pos: pos, picks: mock.filter(function (r) { return r.pos === pos; }).length };
      });
    }
  });
  function renderMock() {
    var box = document.getElementById("rb-mock");
    box.textContent = "";
    var md = dash.data("mock");
    var top = el("div");
    var t = el("h2", "rb-mock-title", "Projected rookie draft");
    t.id = "mock-title";
    top.appendChild(t);
    top.appendChild(el("p", "rb-mock-intro", "A 10-team, 4-round linear rookie draft for a superflex PPR league (QB, 2 RB, 3 WR, TE, 2 flex, superflex; no TE premium). Picks follow the consensus of fall 2026 superflex mocks and rankings, adjusted for this format: 10 teams instead of the usual 12, TEs pushed back without TE premium, and declare or injury risk priced in. Click a pick to open the player's card."));
    box.appendChild(top);
    if (md.status !== "ok") {
      box.appendChild(el("div", "rb-empty", md.status === "loading" ? "Loading mock draft…" : "Mock draft didn’t load."));
      return;
    }
    var mix = dash.data("mock_mix");
    if (mix.status === "ok" && mix.data) {
      var mx = el("div", "rb-mix");
      mx.setAttribute("data-source", "mock_mix");
      mix.data.forEach(function (r) {
        var b = el("div", "mx");
        var c = el("span", "rb-pos"); c.style.setProperty("--pc", "var(--pos-" + r.pos + ")"); c.appendChild(el("span", null, r.pos));
        b.appendChild(c);
        var n = el("span", null, String(r.picks));
        n.setAttribute("data-source", "mock_mix"); n.setAttribute("data-field", "picks"); n.setAttribute("data-where", "pos=" + r.pos);
        b.appendChild(n);
        b.appendChild(el("span", "rb-muted", r.picks === 1 ? "pick" : "picks"));
        mx.appendChild(b);
      });
      box.appendChild(mx);
    }
    [1, 2, 3, 4].forEach(function (rd) {
      var rows = md.data.filter(function (r) { return Number(r.round) === rd; }).sort(function (a, b) { return a.overall - b.overall; });
      if (!rows.length) return;
      var sec = el("section");
      sec.id = "mock-round-" + rd;
      sec.appendChild(el("div", "rb-round-head", "Round " + rd));
      var grid = el("div", "rb-picks");
      rows.forEach(function (r) {
        var c = applyTint(el("button", "rb-pick"), r);
        c.type = "button";
        var pk = el("div", "pk");
        pk.appendChild(mmark(el("span", null, r.pick), "pick", r.pick));
        var ov = el("span", "ov", "#");
        ov.appendChild(mmark(el("span", null, String(r.overall)), "overall", r.pick));
        pk.appendChild(ov);
        c.appendChild(pk);
        c.appendChild(badge(r));
        var info = el("div");
        info.appendChild(mmark(el("div", "nm", r.name), "name", r.pick));
        var meta = el("div", "meta");
        var pc = el("span", "rb-pos"); pc.style.setProperty("--pc", "var(--pos-" + r.pos + ")");
        pc.appendChild(mmark(el("span", null, r.pos), "pos", r.pick));
        pc.appendChild(mmark(el("span", null, String(r.pos_rank)), "pos_rank", r.pick));
        meta.appendChild(pc);
        meta.appendChild(mmark(el("span", null, r.school), "school", r.pick));
        info.appendChild(meta);
        c.appendChild(info);
        if (r.sf_avg != null) {
          var mk = el("div", "mk", "SF consensus avg ");
          mk.appendChild(mmark(el("span", null, String(r.sf_avg)), "sf_avg", r.pick));
          mk.appendChild(document.createTextNode(" · range "));
          mk.appendChild(mmark(el("span", null, r.sf_range), "sf_range", r.pick));
          mk.appendChild(document.createTextNode(" · "));
          mk.appendChild(mmark(el("span", null, String(r.sf_sources)), "sf_sources", r.pick));
          mk.appendChild(document.createTextNode(" lists"));
          c.appendChild(mk);
        }
        c.appendChild(mmark(el("div", "why", r.note), "note", r.pick));
        c.addEventListener("click", function () { openPlayer(r.player_id); });
        grid.appendChild(c);
      });
      sec.appendChild(grid);
      box.appendChild(sec);
    });
    var sd = dash.data("mock_sources");
    if (sd.status === "ok" && sd.data.length) {
      var so = el("div", "rb-summary method");
      so.appendChild(el("h3", null, "Mocks and rankings used"));
      var sl = el("div", "rb-msources");
      sl.setAttribute("data-source", "mock_sources");
      sd.data.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (s) {
        if (!/^https?:\/\//.test(s.url)) return;
        var a = el("a", null, s.name + " (" + s.format + ", " + d3.utcFormat("%b %-d")(new Date(s.date + "T12:00:00Z")) + ")");
        a.href = s.url; a.target = "_blank"; a.rel = "noopener";
        sl.appendChild(a);
      });
      so.appendChild(sl);
      box.appendChild(so);
    }
  }



  // Favorites: stars saved by Claude (the "favorites" source) plus ones toggled in this browser.
  function savedFavs() {
    var f = dash.data("favorites");
    return f.status === "ok" && Array.isArray(f.data) ? f.data.map(function (r) { return r.id; }) : [];
  }
  function isFav(id) {
    return (savedFavs().indexOf(id) >= 0 && !state.unfavs.has(id)) || state.favs.has(id);
  }
  function toggleFav(id) {
    var saved = savedFavs().indexOf(id) >= 0;
    if (isFav(id)) { state.favs.delete(id); if (saved) state.unfavs.add(id); }
    else { state.unfavs.delete(id); if (!saved) state.favs.add(id); }
    dash.setParams({ favs: Array.from(state.favs), unfavs: Array.from(state.unfavs) });
    render();
  }
  function favCount(players) { return players.filter(function (r) { return isFav(r.id); }).length; }
  function mockPickOf(id) {
    var m = dash.data("mock");
    if (m.status !== "ok") return null;
    var r = m.data.filter(function (x) { return x.player_id === id; })[0];
    return r ? Number(r.overall) : null;
  }
  var FAVSORT = {
    overall: function (a, b) { return (a.overall_rank || 999) - (b.overall_rank || 999) || a.rank - b.rank; },
    mock: function (a, b) { return (mockPickOf(a.id) || 999) - (mockPickOf(b.id) || 999) || (a.overall_rank || 999) - (b.overall_rank || 999); },
    pos: function (a, b) { return POS.indexOf(a.pos) - POS.indexOf(b.pos) || a.rank - b.rank; },
    prod: function (a, b) { return (b.s26_yds || 0) - (a.s26_yds || 0); },
    name: function (a, b) { return a.name.localeCompare(b.name); }
  };

  function renderCrestPick(p) {
    var box = document.getElementById("rb-crestpick");
    box.textContent = "";
    box.hidden = true; // style chosen: stadium seal
  }

  // Focus panel: the highlighted prospect, recruiting-board style.
  function renderFocus(p, count) {
    var box = document.getElementById("rb-focus");
    box.textContent = "";
    if (!p) return;
    var top = state.pos === "TOP";
    box.style.setProperty("--fc1", p.school_color || "#8e1b1b");
    var h = el("div", "rb-fhead");
    h.appendChild(el("span", null, top ? "All prospects · Top 35 superflex" : "All prospects · " + LABEL[state.pos]));
    if (state.pos === "FAV") h.lastChild.textContent = "Your favorites";
    h.appendChild(el("span", "cnt", state.pos === "FAV" ? count + (count === 1 ? " player" : " players") : "Board: " + (top ? p.overall_rank : p.rank) + " / " + count));
    box.appendChild(h);
    var b = el("div", "rb-fbody");
    b.appendChild(badge(p, true));
    var id = el("div", "rb-fid");
    id.appendChild(mark(el("div", "p", p.pos), "pos", p.id));
    id.appendChild(mark(el("div", "r", String(p.rank)), "rank", p.id));
    b.appendChild(id);
    var nm = el("div", "rb-fname");
    var parts = String(p.name).split(" ");
    var first = parts.length > 1 ? parts.shift() : "";
    if (first) { nm.appendChild(el("div", "first", first)); nm.appendChild(document.createTextNode(" ")); }
    nm.appendChild(el("div", "last", parts.join(" ")));
    nm.setAttribute("data-source", "players"); nm.setAttribute("data-field", "name"); nm.setAttribute("data-where", "id=" + encodeURIComponent(p.id));
    var ty = mark(el("div", "type", p.player_type || ""), "player_type", p.id);
    var wrapN = el("div"); wrapN.appendChild(nm); wrapN.appendChild(ty);
    b.appendChild(wrapN);
    var st = el("div", "rb-fstats");
    function fb(k, v, field, cls) {
      var x = el("span", "rb-fbox" + (cls ? " " + cls : ""));
      x.appendChild(el("span", "k", k));
      x.appendChild(mark(el("span", "v", fmt(v)), field, p.id));
      return x;
    }
    var r1 = el("div", "rb-frow");
    if (p.overall_rank != null) r1.appendChild(fb("Top 35", p.overall_rank, "overall_rank", "hi"));
    var y = el("span", "rb-fbox hi");
    y.appendChild(el("span", "k", "2026 " + (p.pos === "QB" ? "pass" : p.pos === "RB" ? "rush" : "rec")));
    var yv = el("span", "v");
    yv.appendChild(mark(el("span", null, fmt(p.s26_yds)), "s26_yds", p.id));
    yv.appendChild(document.createTextNode(" yds · "));
    yv.appendChild(mark(el("span", null, fmt(p.s26_td)), "s26_td", p.id));
    yv.appendChild(document.createTextNode(" TD"));
    y.appendChild(yv);
    r1.appendChild(y);
    var dc = el("span", "rb-fbox");
    dc.appendChild(el("span", "k", "Declare"));
    dc.appendChild(mark(el("span", "rb-pill " + (p.declare_likelihood || ""), p.declare_likelihood || "—"), "declare_likelihood", p.id));
    r1.appendChild(dc);
    var vfx = flagOf(p.id);
    if (vfx) {
      var vb = el("span", "rb-fbox");
      vb.appendChild(el("span", "k", "Market"));
      var vt = el("span", "rb-vflag " + vfx.flag.toLowerCase());
      vt.appendChild(cm(el("span", null, vfx.flag), "value_flags", "flag", p.id, "id"));
      vb.appendChild(vt);
      var gp = el("span", "v");
      gp.appendChild(document.createTextNode(vfx.gap > 0 ? "+" : ""));
      gp.appendChild(cm(el("span", null, String(vfx.gap)), "value_flags", "gap", p.id, "id"));
      vb.appendChild(gp);
      r1.appendChild(vb);
    }
    st.appendChild(r1);
    var r2 = el("div", "rb-frow");
    r2.appendChild(fb("Ht", p.height, "height"));
    r2.appendChild(fb("Wt", p.weight, "weight"));
    r2.appendChild(fb("Age", p.age, "age"));
    r2.appendChild(fb("Cl", p.class, "class"));
    r2.appendChild(fb("School", p.school, "school"));
    st.appendChild(r2);
    b.appendChild(st);
    var pj = el("div", "rb-fproj");
    pj.appendChild(el("span", "k", "Draft projection"));
    pj.appendChild(mark(el("span", null, p.draft_projection || "—"), "draft_projection", p.id));
    b.appendChild(pj);
    box.appendChild(b);
  }


  // ---------- league-aware draft tools ----------
  dash.calc("value_flags", {
    title: "Our board vs the superflex market",
    description: "Superflex market consensus slot minus our scouting board's slot, for players in our Top 35 now or last week. 6+ = the market drafts him later than our board says (Value); -6 or less = earlier (Pricey).",
    inputs: ["players"],
    fn: function (players) {
      return players.filter(function (p) { return (p.overall_rank != null || p.overall_prev != null) && p.market_rank != null && p.board_slot != null; }).map(function (p) {
        var gap = Math.round(p.market_rank - p.board_slot);
        return { id: p.id, gap: gap, flag: gap >= 6 ? "Value" : gap <= -6 ? "Pricey" : "" };
      });
    }
  });

  dash.calc("needs", {
    title: "Roster needs by league",
    description: "Youth pipeline by league and position: players on Keegan's roster, how many are young (QB 27 or under, RB/WR 25 or under, TE 26 or under), and a need level from the shortfall against a young-core target (QB 3 in 2-QB leagues, 2 in superflex; RB 3; WR 4 with 3 WR starters, else 3; TE 2). Age only, not talent.",
    inputs: ["my_roster", "leagues"],
    fn: function (my_roster, leagues) {
      var out = [];
      leagues.forEach(function (L) {
        ["QB", "RB", "WR", "TE"].forEach(function (pos) {
          var mine = my_roster.filter(function (r) { return r.league_id === L.league_id && r.pos === pos; });
          var maxAge = pos === "QB" ? 27 : pos === "TE" ? 26 : 25;
          var young = mine.filter(function (r) { return r.age != null && r.age <= maxAge; }).length;
          var target = pos === "QB" ? (L.qb_slots === 2 ? 3 : 2) : pos === "RB" ? 3 : pos === "WR" ? (L.wr_slots === 3 ? 4 : 3) : 2;
          var short = target - young;
          out.push({ key: L.league_id + "|" + pos, league_id: L.league_id, pos: pos, count: mine.length, young: young, max_age: maxAge, target: target,
            need: short >= 2 ? "High" : short === 1 ? "Medium" : "Low" });
        });
      });
      return out;
    }
  });

  dash.calc("targets", {
    title: "Best targets at each of Keegan's picks",
    description: "For each of Keegan's 2027 picks: the highest players on our board with their chance to still be there. Chance = how likely the league takes him at or after that pick, from his superflex market slot (normal curve, spread from his range across lists), with QBs moved earlier in 2-QB leagues and TEs later without TE premium.",
    inputs: ["players", "leagues", "my_picks"],
    fn: function (players, leagues, my_picks) {
      function phi(z) { var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
        var pr = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - pr : pr; }
      var out = [];
      my_picks.forEach(function (pk) {
        var L = leagues.filter(function (l) { return l.league_id === pk.league_id; })[0];
        if (!L) return;
        var cands = players.map(function (p) {
          var mult = p.pos === "QB" ? (L.qb_slots === 2 ? 0.8 : 1) : p.pos === "TE" ? (L.te_premium > 0 ? 0.9 : 1.15) : 1;
          var mu = (p.market_rank != null ? p.market_rank : 70) * mult;
          var sd = Math.max(0.6, ((p.market_hi || 0) - (p.market_lo || 0)) / 5, mu * 0.22);
          var chance = 1 - phi((pk.proj_overall - 0.5 - mu) / sd);
          var val = p.overall_rank != null ? p.overall_rank : 35 + (p.market_rank != null ? p.market_rank : 80) * 0.6;
          if (p.pos === "QB" && L.qb_slots === 2) val *= 0.85;
          if (p.pos === "TE" && !(L.te_premium > 0)) val *= 1.15;
          return { p: p, chance: chance, val: val };
        }).filter(function (c) { return c.chance >= 0.15; })
          .sort(function (a, b) { return a.val - b.val; }).slice(0, 6);
        cands.forEach(function (c, i) {
          out.push({ key: pk.pick_id + "|" + c.p.id, pick_id: pk.pick_id, league_id: pk.league_id, order: i + 1,
            player_id: c.p.id, name: c.p.name, pos: c.p.pos, chance: Math.round(c.chance * 100) });
        });
      });
      return out;
    }
  });

  function flagOf(id) {
    var f = dash.data("value_flags");
    if (f.status !== "ok" || !f.data) return null;
    var r = f.data.filter(function (x) { return x.id === id; })[0];
    return r && r.flag ? r : null;
  }
  function cm(e, src, field, key, keyField) {
    e.setAttribute("data-source", src); e.setAttribute("data-field", field);
    e.setAttribute("data-where", (keyField || "key") + "=" + encodeURIComponent(key));
    return e;
  }

  function renderMyDraft() {
    var box = document.getElementById("rb-mydraft");
    box.textContent = "";
    var ld = dash.data("leagues"), pd = dash.data("players");
    if (ld.status !== "ok" || pd.status !== "ok") {
      box.appendChild(el("div", "rb-empty", ld.status === "loading" || pd.status === "loading" ? "Loading your leagues…" : "League data didn’t load."));
      return;
    }
    if (!state.league || !ld.data.some(function (l) { return l.league_id === state.league; })) state.league = ld.data[0].league_id;
    var L = ld.data.filter(function (l) { return l.league_id === state.league; })[0];
    var sw = el("div", "rb-lgsw");
    ld.data.forEach(function (l) {
      var b = el("button", "rb-tab", l.league);
      b.type = "button"; b.setAttribute("aria-selected", String(l.league_id === state.league));
      b.addEventListener("click", function () { state.league = l.league_id; dash.setParams({ league: l.league_id }); render(); });
      sw.appendChild(b);
    });
    box.appendChild(sw);

    var hd = el("div", "rb-lghead");
    hd.id = "my-league";
    var h1 = el("div", "t");
    h1.appendChild(cm(el("span", null, L.my_team), "leagues", "my_team", L.league_id, "league_id"));
    hd.appendChild(h1);
    var meta = el("div", "rb-frow");
    function lb(k, v, field) { var x = el("span", "rb-fbox"); x.appendChild(el("span", "k", k)); x.appendChild(cm(el("span", "v", fmt(v)), "leagues", field, L.league_id, "league_id")); return x; }
    meta.appendChild(lb("Record", L.record, "record"));
    meta.appendChild(lb("Standing", L.standing, "standing"));
    meta.appendChild(lb("QB", L.qb_format, "qb_format"));
    meta.appendChild(lb("TE premium", L.te_premium, "te_premium"));
    meta.appendChild(lb("WR slots", L.wr_slots, "wr_slots"));
    hd.appendChild(meta);
    hd.appendChild(cm(el("div", "rb-muted lineup", L.lineup), "leagues", "lineup", L.league_id, "league_id"));
    if (L.note) hd.appendChild(cm(el("div", "warn", L.note), "leagues", "note", L.league_id, "league_id"));
    box.appendChild(hd);

    // needs + roster
    var grid = el("div", "rb-groups");
    var nd = dash.data("needs"), rr = dash.data("my_roster");
    var nc = el("div", "rb-group");
    nc.id = "my-needs";
    nc.appendChild(el("h4", null, "Roster needs · youth pipeline (age only, not talent)"));
    ["QB", "RB", "WR", "TE"].forEach(function (pos) {
      var n = nd.status === "ok" ? nd.data.filter(function (x) { return x.league_id === L.league_id && x.pos === pos; })[0] : null;
      var row = el("div", "rb-need");
      var c = el("span", "rb-pos"); c.style.setProperty("--pc", "var(--pos-" + pos + ")"); c.appendChild(el("span", null, pos));
      row.appendChild(c);
      if (n) {
        row.appendChild(cm(el("span", "rb-pill " + (n.need === "High" ? "Low" : n.need === "Medium" ? "Medium" : "High"), n.need), "needs", "need", n.key));
        var d = el("span", "rb-muted");
        d.appendChild(cm(el("span", null, String(n.count)), "needs", "count", n.key));
        d.appendChild(document.createTextNode(" rostered · "));
        d.appendChild(cm(el("span", null, String(n.young)), "needs", "young", n.key));
        d.appendChild(document.createTextNode(" age "));
        d.appendChild(cm(el("span", null, String(n.max_age)), "needs", "max_age", n.key));
        d.appendChild(document.createTextNode(" or under · young-core target "));
        d.appendChild(cm(el("span", null, String(n.target)), "needs", "target", n.key));
        row.appendChild(d);
      }
      var names = rr.status === "ok" ? rr.data.filter(function (x) { return x.league_id === L.league_id && x.pos === pos; })
        .sort(function (a, b) { return (a.age || 99) - (b.age || 99); }) : [];
      var nl = el("div", "rb-rlist");
      names.forEach(function (x) {
        var s = el("span", "rp" + (x.slot !== "active" ? " dim" : ""));
        s.appendChild(cm(el("span", null, x.name), "my_roster", "name", x.row_id, "row_id"));
        if (x.age != null) { s.appendChild(document.createTextNode(" ")); s.appendChild(cm(el("span", "rb-muted", String(x.age)), "my_roster", "age", x.row_id, "row_id")); }
        nl.appendChild(s);
      });
      row.appendChild(nl);
      nc.appendChild(row);
    });
    grid.appendChild(nc);
    box.appendChild(grid);

    // picks with targets
    var pk = dash.data("my_picks"), tg = dash.data("targets");
    var picks = pk.status === "ok" ? pk.data.filter(function (x) { return x.league_id === L.league_id; }).sort(function (a, b) { return a.proj_overall - b.proj_overall; }) : [];
    var ph = el("div", "rb-round-head", "Your 2027 picks · projected slot from current standings");
    ph.id = "my-picks";
    box.appendChild(ph);
    if (!picks.length) box.appendChild(el("div", "rb-empty", "No 2027 picks found for this team."));
    var pg = el("div", "rb-picks");
    picks.forEach(function (p) {
      var c = el("div", "rb-pick rb-mypick");
      var top = el("div", "pk");
      top.appendChild(cm(el("span", null, p.proj_pick), "my_picks", "proj_pick", p.pick_id, "pick_id"));
      var via = el("span", "ov");
      if (p.from_team === "Own") { via.appendChild(cm(el("span", null, p.from_team), "my_picks", "from_team", p.pick_id, "pick_id")); via.appendChild(document.createTextNode(" pick")); }
      else { via.appendChild(document.createTextNode("via ")); via.appendChild(cm(el("span", null, p.from_team), "my_picks", "from_team", p.pick_id, "pick_id")); }
      top.appendChild(via);
      c.appendChild(top);
      var list = tg.status === "ok" ? tg.data.filter(function (x) { return x.pick_id === p.pick_id; }).sort(function (a, b) { return a.order - b.order; }) : [];
      var ul = el("div", "rb-tlist");
      list.forEach(function (t) {
        var pl = pd.data.filter(function (x) { return x.id === t.player_id; })[0];
        var it = el("button", "rb-trow");
        it.type = "button";
        if (pl) it.appendChild(badge(pl, false));
        var nm = el("span", "tn");
        nm.appendChild(cm(el("span", null, t.name), "targets", "name", t.key));
        it.appendChild(nm);
        var ps = el("span", "rb-pos"); ps.style.setProperty("--pc", "var(--pos-" + t.pos + ")");
        ps.appendChild(cm(el("span", null, t.pos), "targets", "pos", t.key));
        it.appendChild(ps);
        if (pl && pl.tier) { var tr = el("span", "rb-tierchip", "T"); tr.appendChild(mark(el("span", null, String(pl.tier)), "tier", pl.id)); it.appendChild(tr); }
        var ch = el("span", "chance " + (t.chance >= 70 ? "hi" : t.chance >= 40 ? "mid" : "lo"));
        ch.appendChild(cm(el("span", null, String(t.chance)), "targets", "chance", t.key));
        ch.appendChild(document.createTextNode("%"));
        it.appendChild(ch);
        it.addEventListener("click", function () { if (typeof openPlayer === "function") openPlayer(t.player_id); });
        ul.appendChild(it);
      });
      c.appendChild(ul);
      c.appendChild(el("div", "why", "% = chance he's still on the board at this pick. Tap a name for his card."));
      pg.appendChild(c);
    });
    box.appendChild(pg);
  }

  function render() {
    var pr = dash.data("players"), cr = dash.data("career");
    var list = document.getElementById("rb-list");
    var upd = document.getElementById("board-updated");
    list.textContent = "";
    VIEWS.forEach(function (p) {
      var b = document.getElementById("tab-" + p);
      b.setAttribute("aria-selected", String(p === state.pos));
      var n = "";
      if (pr.status === "ok" && POS.indexOf(p) >= 0) n = pr.data.filter(function (r) { return r.pos === p; }).length;
      if (pr.status === "ok" && p === "FAV") n = favCount(pr.data);
      b.querySelector(".n").textContent = n;
    });
    var isWeek = state.pos === "WEEK", isMock = state.pos === "MOCK", isMy = state.pos === "MYD", other = isWeek || isMock || isMy;
    document.getElementById("rb-mydraft").hidden = !isMy;
    document.getElementById("rb-week").hidden = !isWeek;
    document.getElementById("rb-mock").hidden = !isMock;
    list.hidden = other;
    if (other) { document.getElementById("rb-focus").hidden = true; document.getElementById("rb-crestpick").hidden = true; }
    document.getElementById("rb-favsort").hidden = state.pos !== "FAV";
    document.getElementById("rb-declare").hidden = state.pos === "FAV";
    document.getElementById("rb-cols").style.display = other ? "none" : "";
    document.getElementById("rb-filters").style.visibility = other ? "hidden" : "";
    if (isWeek) { upd.textContent = "Week-to-week changes and why"; renderWeek(); return; }
    if (isMock) { upd.textContent = "10-team superflex · 4 rounds"; renderMock(); return; }
    if (isMy) { upd.textContent = "Your leagues · picks · targets"; renderMyDraft(); return; }
    document.getElementById("col-26").textContent = "2026 " + HEAD26[state.pos];
    if (pr.status !== "ok") {
      upd.textContent = "—";
      list.appendChild(el("div", "rb-empty", pr.status === "loading" ? "Loading prospects…" : "Prospect data didn’t load."));
      return;
    }
    upd.textContent = LABEL[state.pos] + " · ranked by blended big boards";
    var careerAll = cr.status === "ok" ? cr.data : [];
    var top = state.pos === "TOP";
    var fav = state.pos === "FAV";
    var rows = pr.data.filter(function (r) {
      if (fav) { if (!isFav(r.id)) return false; }
      else if (top ? r.overall_rank == null : r.pos !== state.pos) return false;
      if (state.declare && r.declare_likelihood !== state.declare) return false;
      if (state.tag) { var tf = flagOf(r.id); if (!tf || tf.flag !== state.tag) return false; }
      if (state.q && (r.name + " " + r.school).toLowerCase().indexOf(state.q) < 0) return false;
      return true;
    }).sort(fav ? FAVSORT[state.favSort] || FAVSORT.overall : function (a, b) { return top ? a.overall_rank - b.overall_rank : a.rank - b.rank; });
    if (!rows.length) {
      document.getElementById("rb-focus").hidden = true;
      renderCrestPick(pr.data.filter(function (r) { return r.overall_rank === 1; })[0] || pr.data[0]);
      list.appendChild(el("div", "rb-empty", fav ? "No favorites yet. Tap the ☆ next to any player to add him here." : "No players match those filters."));
      return;
    }
    if (!state.focus || !rows.some(function (r) { return r.id === state.focus; })) state.focus = rows[0].id;
    document.getElementById("rb-focus").hidden = false;
    renderFocus(rows.filter(function (r) { return r.id === state.focus; })[0], rows.length);
    renderCrestPick(rows.filter(function (r) { return r.id === state.focus; })[0]);

    var lastTier = null;
    rows.forEach(function (p) {
      if (top && p.tier != null && p.tier !== lastTier) {
        var th = el("div", "rb-tierhd", "Tier ");
        th.appendChild(mark(el("span", null, String(p.tier)), "tier", p.id));
        list.appendChild(th);
        lastTier = p.tier;
      }
      var row = el("div", "rb-row");
      row.setAttribute("role", "button"); row.tabIndex = 0;
      row.setAttribute("aria-expanded", String(state.open === p.id));
      row.id = "row-" + p.id;
      applyTint(row, p);

      var cS = el("div", "c-star");
      var stb = el("button", "rb-star" + (isFav(p.id) ? " on" : ""), isFav(p.id) ? "★" : "☆");
      stb.type = "button";
      stb.setAttribute("aria-pressed", String(isFav(p.id)));
      stb.setAttribute("aria-label", (isFav(p.id) ? "Remove " : "Add ") + p.name + (isFav(p.id) ? " from" : " to") + " favorites");
      stb.addEventListener("click", function (e) { e.stopPropagation(); toggleFav(p.id); });
      stb.addEventListener("keydown", function (e) { e.stopPropagation(); });
      cS.appendChild(stb);
      var c1 = el("div", "c-rank");
      if (fav) c1.appendChild(el("div", "rb-rank", String(rows.indexOf(p) + 1)));
      else c1.appendChild(mark(el("div", "rb-rank", String(top ? p.overall_rank : p.rank)), top ? "overall_rank" : "rank", p.id));
      if (!top && !fav) {
        var mv = moveOf(p.id);
        if (mv === "NEW") c1.appendChild(mark(el("span", "rb-move new", "NEW"), "move", p.id, "rank_moves"));
        else if (mv) {
          var mvs = el("span", "rb-move " + (mv > 0 ? "up" : "down"), mv > 0 ? "▲" : "▼");
          mvs.appendChild(mark(el("span", null, String(Math.abs(mv))), "move", p.id, "rank_moves"));
          mvs.setAttribute("aria-label", (mv > 0 ? "up " : "down ") + Math.abs(mv) + " since last week");
          c1.appendChild(mvs);
        }
      }
      var c2 = el("div", "c-name");
      var nm = el("div", "rb-name");
      nm.appendChild(el("span", "rb-caret", "▶"));
      nm.appendChild(mark(el("span", "nm", p.name), "name", p.id));
      var vf = flagOf(p.id);
      if (vf) {
        var vc = el("span", "rb-vflag " + vf.flag.toLowerCase());
        vc.appendChild(cm(el("span", null, vf.flag), "value_flags", "flag", p.id, "id"));
        vc.title = vf.flag === "Value" ? "The market takes him later than our board would" : "The market takes him earlier than our board would";
        nm.appendChild(vc);
      }
      c2.appendChild(nm);
      var cP = el("div", "ctr c-pos");
      var chip = el("span", "rb-pos");
      chip.style.setProperty("--pc", "var(--pos-" + p.pos + ")");
      chip.appendChild(mark(el("span", null, p.pos), "pos", p.id));
      if (top || fav) chip.appendChild(mark(el("span", null, String(p.rank)), "rank", p.id));
      cP.appendChild(chip);
      var c3 = el("div", "rb-school c-school");
      c3.appendChild(badge(p));
      c3.appendChild(mark(el("span", "sn", p.school), "school", p.id));
      var cC = mark(el("div", "ctr c-cl", fmt(p.class)), "class", p.id);
      var c4 = mark(el("div", "num c-age", fmt(p.age)), "age", p.id);
      var c5 = mark(el("div", "num c-ht", fmt(p.height)), "height", p.id);
      var c6 = mark(el("div", "num c-wt", fmt(p.weight)), "weight", p.id);
      var c7 = el("div", "num rb-stat26 c-26");
      if (top || fav) c7.appendChild(el("span", "lbl", p.pos === "QB" ? "pass " : p.pos === "RB" ? "rush " : "rec "));
      c7.appendChild(mark(el("span", null, fmt(p.s26_yds)), "s26_yds", p.id));
      c7.appendChild(el("span", "lbl", " / "));
      c7.appendChild(mark(el("span", null, fmt(p.s26_td)), "s26_td", p.id));
      var cD = el("div", "ctr c-dec");
      cD.appendChild(mark(el("span", "rb-pill " + (p.declare_likelihood || ""), p.declare_likelihood || "—"), "declare_likelihood", p.id));
      var c8 = el("div", "rb-proj c-proj");
      c8.appendChild(mark(el("span", null, p.draft_projection || "—"), "draft_projection", p.id));
      [cS, c1, c2, cP, c3, cC, c4, c5, c6, c7, cD, c8].forEach(function (c) { row.appendChild(c); });
      if (state.focus === p.id) row.classList.add("sel");
      var openRow = function () {
        state.open = state.open === p.id ? null : p.id;
        state.focus = p.id;
        render();
        var r = document.getElementById("row-" + p.id);
        if (r) r.focus({ preventScroll: true });
      };
      row.setAttribute("aria-expanded", String(state.open === p.id));
      row.addEventListener("click", openRow);
      row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRow(); } });
      list.appendChild(row);
      if (state.open === p.id) {
        var cRows = careerAll.filter(function (r) { return r.player_id === p.id; })
          .sort(function (a, b) { return a.season - b.season; });
        list.appendChild(detail(p, cRows));
      }
    });
  }

  dash.onData(render);
})();
