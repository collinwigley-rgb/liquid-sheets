# v1.0 Acceptance Gauntlet - Results

Status: **PASS** (with one finding found and fixed during the run).
Run: 2026-08-27, against the V33 build on the dev server, fix landed as V34.
Definition of the gate: `V1-SCOPE-FREEZE.md` -> "Definition of done for v1.0".

## How this was run

Two halves, both reproducible:

1. **Automated gate** (shell commands, `verify/run_golden.mjs`): syntax, dash /
   non-ASCII, engine golden master.
2. **Browser half** (`verify/gauntlet/run_gauntlet.py`): real headless Chromium
   (Playwright, chromium-1223) driven against the live dev server at
   `http://localhost:8013/app/`. The persistence and recovery checks dynamically
   `import()` the app's own `app/storage.js` inside the page, so they exercise the
   genuine `saveDoc` / `loadDoc` / `migrate` / `importDocFile` / `wipeDoc` path,
   not a mock.

Reproduce:

```
cd liquid-sheets-public
./dev.sh                                   # serves http://localhost:8013/app/
# automated gate
for f in app/*.js engine/*.js verify/*.mjs; do node --check "$f"; done
grep -rlP '[\x{2014}\x{2013}]|[^\x00-\x7F]' app/ engine/     # expect no output
for d in verify/fixtures_*; do node verify/run_golden.mjs "$d"; done
# browser half (interpreter that owns the local Playwright install)
/Library/Developer/CommandLineTools/usr/bin/python3 verify/gauntlet/run_gauntlet.py
```

## Automated gate

| Check | Result |
|---|---|
| `node --check` on every JS module (app + engine + verify) | PASS, all parse |
| Dash / non-ASCII grep on `app/` and `engine/` | PASS, clean |
| Golden master, fixtures 24-29 | PASS, zero diff across all rows and fields on all six |

## Browser half (15/15 checks)

Mapped to the four gauntlet items in `V1-SCOPE-FREEZE.md`:

### AI-absent proof (hosted build ships zero AI)
- No cross-origin requests on load. PASS
- `copilot.js` never fetched. PASS *(after the fix below; this is the finding)*
- `#liveread` element absent from the DOM. PASS
- No password / api-key input in the DOM. PASS
- No AI / key wording in the rendered body text. PASS

### Gauntlet item 1 - Offline / airplane mode
- Service worker takes control of the page. PASS
- With the network cut (`context.set_offline(true)`), reload still renders the app
  shell (masthead present). PASS
- No same-origin shell request failed while offline (served from SW cache). PASS

### Gauntlet item 2 - Tab-kill persistence
- A doc seeded through the real `saveDoc` survives a full document reload
  (`loadDoc` returns it). PASS
- The reloaded doc is byte-identical on the fields that drive the board
  (league, names, runs, journal, favorites, calls, theme). PASS

### Gauntlet item 3 - Delete-site-data + import-file recovery
- `wipeDoc` empties the store; `loadDoc` then returns null. PASS
- The real `importDocFile` path (fed a `File` built from the exported JSON)
  restores the doc. PASS
- The restored doc is byte-identical to the original fingerprint. PASS

### Cross-cutting
- No uncaught console errors during the entire run. PASS

## Finding (found and fixed during the run)

**The hosted build precached an AI module it never runs.**

`app/copilot.js` is the browser half of the optional self-hosted copilot. The app
correctly gates its *import* on `AI_ENABLED` (false in the hosted build, since
`config.AI_ENDPOINT` is null), so the code never executes. But `app/sw.js` listed
`/app/copilot.js` in the service-worker precache `SHELL`, so the hosted service
worker fetched and cached it anyway. A reviewer inspecting cached assets would have
found an AI module sitting in an "AI-free" build.

**Fix (V34):** removed `/app/copilot.js` from the `SHELL` precache list and bumped
the cache to `liquid-sheets-v34` (and the masthead to V34 in lockstep). The file
still ships in the repo for self-hosters; when a self-hoster sets `AI_ENDPOINT`,
the runtime dynamic `import()` in `app.js` fetches it on demand and the SW's
network handler caches it then. The hosted cache is now genuinely AI-free. No UI or
theme CSS changed: `app/index.html` differs from the theme-freeze commit `1669bc2`
by exactly the one version-string line.

After the fix, the browser half is 15/15 (the `copilot.js never fetched` check
flipped to PASS).

## Not covered here (the human remainder)

**Gauntlet item 4 - two differently-shaped leagues built end-to-end through the
wizard UI, run side by side.** The engine's correctness across league shapes is
already proven by the golden master (which runs the real 2026 dataset through the
JS engine to zero diff against the Python reference). What is *not* automated is
driving the setup wizard UI twice with two different league configs and eyeballing
two correct boards. That is a short human-in-browser confirmation; the machinery it
would exercise (engine + storage) is otherwise covered above.

Recommended human pass (about 10 minutes):
1. Wizard: build a 12-team, $200, standard-scoring league; import a source; confirm
   a sensible board and The Call.
2. Wizard: build a differently-shaped league (for example 10-team, $300, a
   different flex/roster shape, ESPN preset); import a source; confirm a sensible
   board.
3. Confirm the two do not bleed into each other and each roster/purse math reads
   right.

Everything else in the gauntlet is green and reproducible from the commands above.
