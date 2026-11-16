/* Small stand-in for the dashboard runtime the board was written against.
   Loads data/<id>.json, exposes dash.data / dash.onData / dash.calc / dash.params / dash.setParams,
   and the one d3 helper the page uses (d3.utcFormat). Filters and favorites persist in localStorage. */
(function () {
  var SOURCES = ["players", "career", "changes", "mock", "mock_sources", "favorites", "leagues", "my_picks", "my_roster", "recap"];
  var KEY = "rookie-board-params-v1";
  var store = {}, calcs = {}, cache = {}, listeners = [], version = 0;

  var params = {};
  try { params = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { params = {}; }

  function notify() {
    version++;
    cache = {};
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  function data(id) {
    if (calcs[id]) {
      var hit = cache[id];
      if (hit && hit.version === version) return hit.result;
      var c = calcs[id], args = [], ready = true;
      c.inputs.forEach(function (inp) {
        var r = data(inp);
        if (r.status !== "ok") ready = false;
        args.push(Array.isArray(r.data) || calcs[inp] ? r.data : []);
      });
      var result;
      if (!ready) result = { status: "loading", data: null, meta: [] };
      else {
        try { result = { status: "ok", data: c.fn.apply(null, args), meta: [] }; }
        catch (e) { console.error(e); result = { status: "error", data: null, message: String(e), meta: [] }; }
      }
      cache[id] = { version: version, result: result };
      return result;
    }
    return store[id] || { status: SOURCES.indexOf(id) >= 0 ? "loading" : "missing", data: [], meta: [] };
  }

  window.dash = {
    data: data,
    onData: function (fn) { listeners.push(fn); try { fn(); } catch (e) { console.error(e); } },
    calc: function (id, def) { calcs[id] = { inputs: def.inputs || [], fn: def.fn }; },
    params: function () { return params; },
    setParams: function (o) {
      for (var k in o) params[k] = o[k];
      try { localStorage.setItem(KEY, JSON.stringify(params)); } catch (e) { /* private mode: keep in memory */ }
    },
    resetParams: function () { params = {}; try { localStorage.removeItem(KEY); } catch (e) {} notify(); },
    refresh: function () {}
  };

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  window.d3 = {
    utcFormat: function (spec) {
      return function (d) {
        return spec
          .replace("%b", MONTHS[d.getUTCMonth()])
          .replace("%-d", String(d.getUTCDate()))
          .replace("%Y", String(d.getUTCFullYear()));
      };
    }
  };

  function load(id) {
    return fetch("data/" + id + ".json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(id + ": HTTP " + r.status); return r.json(); })
      .then(function (rows) { if (rows && !Array.isArray(rows) && Array.isArray(rows.rows)) rows = rows.rows; store[id] = { status: "ok", data: rows, meta: [] }; })
      .catch(function (e) { console.error(e); store[id] = { status: "error", data: [], message: String(e), meta: [] }; });
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  // Tell the page how tall the sticky bar is, so tier headings can stick right under it on phones.
  function measure() {
    var c = document.getElementById("mx-chips"), r = document.getElementById("rookie-board");
    if (c && r) r.style.setProperty("--mx-stick", (c.offsetHeight || 0) + "px");
  }
  window.addEventListener("resize", measure);
  window.rbMeasure = measure;

  window.addEventListener("DOMContentLoaded", function () {
    Promise.all(SOURCES.map(load)).then(function () {
      notify();
      // "Data through" stamp from the newest weekly note and the stats cut-off.
      var el = document.getElementById("data-asof");
      var ch = store.changes && store.changes.data || [], pl = store.players && store.players.data || [];
      var wk = ch.map(function (r) { return r.week; }).sort().pop();
      var thru = pl.map(function (r) { return r.s26_through || ""; }).sort().pop();
      if (el && wk) {
        var f = window.d3.utcFormat("%b %-d, %Y");
        var g = window.d3.utcFormat("%b %-d");
        el.textContent = "Updated " + g(new Date(wk + "T12:00:00Z")) + (thru ? " · stats through " + g(new Date(thru + "T12:00:00Z")) : "");
      }
    });
  });
})();
