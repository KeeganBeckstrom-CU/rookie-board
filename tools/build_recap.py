"""Build data/recap.json (This week's game recap) from data/players.json.
Usage: python3 tools/build_recap.py data/players.json data/recap.json [WEEK]
WEEK is the Monday refresh date (YYYY-MM-DD) used in each player's "[Refresh WEEK]" note; default = newest one found."""
import json, re, sys
players = json.load(open(sys.argv[1]))
if isinstance(players, dict): players = players.get("rows", [])
weeks = sorted(set(re.findall(r"\[Refresh (\d{4}-\d{2}-\d{2})\]", " ".join(p.get("notes") or "" for p in players))))
WEEK = sys.argv[3] if len(sys.argv) > 3 else (weeks[-1] if weeks else "")
TAG = "[Refresh " + WEEK + "]"
OLD = {}
try:
    for r in json.load(open(sys.argv[2])):
        if r.get("week") != WEEK: OLD[r["row_id"]] = r
except Exception:
    pass
N = r"(-?\d+|\(-\d+\))"
def n(x): return int(x.strip("()"))
def fpts(r):
    g = lambda k: r.get(k) or 0
    return round(g("pass_yds")/25 + 4*g("pass_td") - 2*g("int") + g("rush_yds")/10 + 6*g("rush_td") + g("rec") + g("rec_yds")/10 + 6*g("rec_td"), 1)
TH = {"QB": (24, 16, 10), "RB": (20, 12, 6), "WR": (20, 12, 6), "TE": (15, 9, 5)}
def tag(pos, f):
    a, b, c = TH[pos]
    return "Big game" if f >= a else "Solid" if f >= b else "Quiet" if f >= c else "Rough"
rows, bad = [], []
for p in players:
    note = p.get("notes") or ""; k = note.rfind(TAG)
    if k < 0: continue
    seg = note[k + len(TAG):].strip()
    r = {k2: None for k2 in ["result","pass_cmp","pass_att","pass_yds","pass_td","int","rush_att","rush_yds","rush_td","rec","rec_yds","rec_td"]}
    r.update(row_id=WEEK + "|" + p["id"], week=WEEK, player_id=p["id"], name=p["name"], pos=p["pos"], school=p["school"],
             rank=p["rank"], prev_rank=p["prev_rank"], overall_rank=p["overall_rank"], overall_prev=p["overall_prev"])
    news = re.search(r"News: (.*?)(?: Game check:| Rank:|$)", seg)
    news = news.group(1).strip() if news else ""
    if news.startswith("No new injury") or news.startswith("OU-Ole Miss"): news = ""
    news = re.sub(r"\s*https?://\S+", "", news).strip()
    rk = re.search(r"Rank: [A-Z]+\d+ \(was [A-Z]+\d+\): (.*)$", seg)
    reason = rk.group(1).strip() if rk else ""
    reason = re.sub(r"^[A-Z]+\d+ -> [A-Z]+\d+(?: \([^)]*\))?:\s*", "", reason)
    if seg.startswith("Added"):
        r["status"] = "added"
        r["note"] = "Added to the board this week at " + p["pos"] + str(p["rank"]) + ". " + re.sub(r"\.\s.*", ".", seg[len("Added: "):]).rstrip(".") + "."
    else:
        m = re.match(r"\d{4} through [\d-]+: (.*?)(?: Check:|$)", seg)
        body = m.group(1).strip() if m else ""
        if body.startswith("DNP"):
            r["status"] = "dnp"; r["note"] = "Did not play" + (" (injured)" if "injur" in body else "") + "."
        elif re.match(r"(played,? ?(\(G [^)]*\),? )?)?(0|no) (rec|catches)", body) or body.startswith("0 rec"):
            r["status"] = "played"; r["result"] = None; r["rec"], r["rec_yds"], r["rec_td"] = 0, 0, 0
            r["note"] = "Played but had no catches."
        elif body.startswith("did not play"):
            r["status"] = "dnp"
            g = re.search(r"\((.*?)\)", body)
            r["result"] = None
            r["note"] = "Did not play."
            if g:
                parts = [x.strip() for x in g.group(1).split(";", 1)]
                if re.match(r"[WL] \d+-\d+", parts[0]): r["result"] = "Team: " + parts[0]
                extra = parts[1] if len(parts) > 1 else ("" if re.match(r"[WL] \d+-\d+", parts[0]) else parts[0])
                if extra:
                    extra = re.sub(r"^(knee injury|injured)$", "injured", extra)
                    r["note"] = "Did not play (" + extra + (" in his place" if re.search(r"\d+[/-]\d+", extra) else "") + ")."
        else:
            mm = re.match(r"([WL] \d+-\d+ (?:vs|@|at) .+? \d+/\d+)(?: \(.*?\))?: (.*)$", body)
            if not mm: bad.append((p["id"], body)); continue
            r["status"] = "played"; r["result"] = mm.group(1); line = mm.group(2)
            q = re.search(r"(\d+)/(\d+), (-?\d+), (\d+) TD, (\d+) INT", line)
            if q: r["pass_cmp"], r["pass_att"], r["pass_yds"], r["pass_td"], r["int"] = map(int, q.groups())
            q = re.search(r"rush " + N + "-" + N + "-" + N, line)
            if q: r["rush_att"], r["rush_yds"], r["rush_td"] = map(n, q.groups())
            q = re.search(r"rec " + N + "-" + N + "-" + N, line)
            if q: r["rec"], r["rec_yds"], r["rec_td"] = map(n, q.groups())
            r["note"] = ""
            if line.startswith("DNP"):
                r["status"] = "dnp"; r["note"] = "Did not play" + (" (injured)" if "injur" in line else "") + "."
            elif re.search(r"\b(0 rec|no catches|0 catches)", line):
                r["rec"], r["rec_yds"], r["rec_td"] = 0, 0, 0
                r["note"] = "Played but had no catches."
            elif not any(r[x] is not None for x in ["pass_yds","rush_yds","rec_yds"]): bad.append((p["id"], line))
    # board effect sentence
    pos, now, prev = p["pos"], p["rank"], p["prev_rank"]
    f = fpts(r) if r["status"] == "played" else None
    t = tag(pos, f) if f is not None else None
    top = ""
    if p["overall_rank"] is not None and p["overall_prev"] is None: top = " Enters the Top 35 at " + str(p["overall_rank"]) + "."
    elif p["overall_rank"] is None and p["overall_prev"] is not None: top = " Drops out of the Top 35 (was " + str(p["overall_prev"]) + ")."
    elif p["overall_rank"] is not None and p["overall_prev"] != p["overall_rank"]:
        d = p["overall_prev"] - p["overall_rank"]
        top = " Top 35: " + str(p["overall_prev"]) + " → " + str(p["overall_rank"]) + "."
    if r["status"] == "added":
        eff = "New to the board at " + pos + str(now) + "." + top
    elif prev is not None and prev != now:
        eff = pos + str(prev) + " → " + pos + str(now) + ". " + (reason[:1].upper() + reason[1:])
        up = now < prev
        if t and "only because" not in reason and "players around him" not in reason:
            if up and t in ("Big game", "Solid"): eff += " His " + t.lower().replace("big game", "big") + " week backs up the move."
            elif up and t == "Rough": eff += " The move comes from the boards, not this game, which was a rough one."
            elif not up and t in ("Big game", "Solid"): eff += " The drop is about the boards, not his play: he had a " + t.lower().replace("big game", "big") + " week."
            elif not up and t == "Rough": eff += " A rough week backs up the drop."
        eff += top
    else:
        hold = "Holds at " + pos + str(now) + "."
        if r["status"] == "dnp":
            eff = hold + " Missing games doesn't move him by itself; the rank follows the big boards, which haven't dropped him yet."
        elif t == "Big game":
            eff = hold + (" A big week that cements his spot at the top." if now == 1 else " A big week, but our ranks follow the big boards and none have moved him yet. Keep stacking games like this and he has room to climb.")
        elif t == "Solid":
            eff = hold + " A solid week that keeps him right where he is."
        elif t == "Quiet":
            eff = hold + " A quiet week; one game doesn't change his spot" + (", and nobody is close to him." if now == 1 else ", but it doesn't help him close the gap either.")
        else:
            eff = hold + " A rough week. One game doesn't override the board consensus, but a second one would put his spot at risk."
        eff += top
        if not reason.startswith("No new board movement") and reason: eff = hold + " " + reason + top
    r["effect"] = eff.strip()
    if len(news) > 240: news = news[:240].rsplit(" ", 1)[0] + "…"
    r["news"] = news
    rows.append(r)
print("week", WEEK, "parsed", len(rows), "bad", len(bad)); [print("could not parse:", b) for b in bad]
# keep earlier weeks so the week picker can show them
allrows = list(OLD.values()) + rows
json.dump(allrows, open(sys.argv[2], "w"), separators=(",", ":"), ensure_ascii=False)
