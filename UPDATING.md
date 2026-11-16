# Updating the live site

The live site (https://keeganbeckstrom-cu.github.io/rookie-board/) reads everything from `data/`. The weekly refresh updates the Claude dashboard first, then copies the same data here.

## Each Monday, after the dashboard refresh

1. Put the new copies of these files in `data/`, using exactly the JSON the dashboard's datasets point to (same field names and shapes, a plain JSON array):
   `players.json`, `career.json`, `changes.json`, `mock.json`, `mock_sources.json`, `leagues.json`, `my_picks.json`, `my_roster.json`, `favorites.json`.
   Only replace a file when there is a new version of it; leave the others alone.
2. Rebuild the game recap from the new players file:
   `python3 tools/build_recap.py data/players.json data/recap.json`
   It reads each player's newest `[Refresh YYYY-MM-DD]` note (game line, news, rank note) and keeps earlier weeks. It prints any player it could not parse; fix the note wording or leave him out, never guess a stat line.
3. Check every file still parses: `for f in data/*.json; do python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" || echo "BAD $f"; done`
4. In `sw.js`, bump the `CACHE` name (`rookie-board-vN` -> `vN+1`) so phones pick up the new data.
5. Commit to `main` as `Claude <noreply@anthropic.com>` with a message like `Weekly refresh YYYY-MM-DD` and push. If the push is rejected, `git pull --rebase` once and push again.

The recap's This week tab shows a week only if `changes.json` has rows for that same Monday date.
