# Liquid Sheets - Operations Runbook

The day-to-day operational reference: how to develop, verify, deploy, roll back,
and handle the common failures. Strategy lives elsewhere (`CHARTER.md`,
`MASTER-PLAN.md`, `V1-SCOPE-FREEZE.md`, `docs/adr/`); this doc is the "how do I
actually do X" page.

## Facts at a glance

| | |
|---|---|
| Repo | `github.com/liquid-workflows/liquid-sheets` (org owned by Levi) |
| Local path | `Documents/claude-projects/fantasy-football/liquid-sheets-public/` |
| Type | Static, client-side-only PWA. No build step, no backend, no package.json |
| App entry | app at `/<host>/app/`; a landing page (`index.html`) sits at the domain root |
| Host | Cloudflare Pages, git-connected, auto-deploys on push to `main` |
| Dev server | `./dev.sh` -> `http://localhost:8013/app/` (port 8013 is dedicated) |
| Engine | `engine/engine.js`, byte-identical to the private Python engine (golden master) |
| Storage | one versioned doc in IndexedDB; JSON export/import is the recovery ritual (ADR-0005) |

## Local development

```
cd liquid-sheets-public
./dev.sh
```

Serves the repo root on port 8013 and opens at `http://localhost:8013/app/`. The
server must serve the repo root, not `app/` alone, because the app imports
`../engine/engine.js`. There is nothing to build or install.

## The hard rules (every change)

1. **No em/en dashes or non-ASCII, anywhere.** Prose, code, comments, commit
   messages. Validate a touched file with
   `grep -nP '[\x{2014}\x{2013}]|[^\x00-\x7F]' <file>` (expect no output).
2. **`node --check` every JS file you touch.**
3. **Any shell change bumps two things in lockstep:** the masthead version in
   `app/index.html` (`<span class="ver">`) AND the cache name in `app/sw.js`
   (`const CACHE`). This is the entire cache-busting mechanism; a stale service
   worker is the number-one source of "my change did not show up."
4. **`engine/engine.js` must not drift.** Any change near it must keep the golden
   master at zero diff (see below). Personal-value nudges (My Calls) are applied
   in a client-side revaluation outside the engine precisely to protect this.
5. **Full paths from the project root** in every doc, commit message, and log line.

## Verification gates

Run before pushing anything non-trivial. In rough cost order:

### Static checks (fast, always)
```
for f in app/*.js engine/*.js verify/*.mjs; do node --check "$f"; done
grep -rlP '[\x{2014}\x{2013}]|[^\x00-\x7F]' app/ engine/     # expect no output
```
Both also run in CI on every push and PR.

### Golden master (LOCAL ONLY, before any engine-adjacent change)
```
node verify/run_golden.mjs verify/fixtures_29     # or any fixtures_NN dir
```
Zero diff is the only pass. This does NOT run in CI: the fixtures embed licensed
projection data and are gitignored (`verify/fixtures*/`), so they only exist on a
machine that generated them. To (re)generate them from the private database:
```
python3 verify/export_fixtures.py --db <path/to/levi.db> --run <N> --out verify/fixtures_<N>/
```
See `verify/README.md` for the recorded-run numbers and the rounding traps the
harness guards.

### Acceptance gauntlet (browser, before a release or any shell/storage change)
Real headless Chromium against the running dev server; exercises the app's own
`app/storage.js` module, not a mock. Covers AI-absent proof, offline/airplane,
tab-kill persistence, and delete-data + import recovery.
```
./dev.sh &                                        # must be up on 8013
/Library/Developer/CommandLineTools/usr/bin/python3 verify/gauntlet/run_gauntlet.py
```
Expect `15/15 checks passed`. This same harness runs in CI (which installs its own
Chromium). Results and scope: `GAUNTLET-v1.md`. The one gauntlet item not automated
is building two differently-shaped leagues through the wizard UI; do that by hand on
the live site.

## Deploy

Cloudflare Pages is git-connected to the `main` branch: **every push to `main`
auto-builds (no build command) and deploys.** There is no manual deploy step in the
normal flow.

- **Production URL / custom domain:** the Liquid Workflows subdomain, wired in the
  CF Pages project under Custom domains. The project also has a `*.pages.dev` URL.
- **Path constraint (do not break):** the app is served at `/app/` and the service
  worker scope and PWA `start_url`/`scope` are all absolute `/app/`. The site must
  be served from a domain root (custom domain or `*.pages.dev`), NOT a subpath like
  `user.github.io/liquid-sheets/`, or the absolute paths break. The domain root
  serves a landing page (`index.html` at the repo root) whose call to action links
  into `/app/`; the app itself lives under `/app/`.
- **First-time CF Pages setup** (already done once; recorded here for a rebuild):
  CF dashboard -> Workers & Pages -> Pages -> Connect to Git -> authorize the
  **liquid-workflows** org -> pick `liquid-sheets`. Build settings: framework
  preset None, build command empty, output directory `/`, production branch `main`.
- **Ship a change:** commit, bump masthead + SW cache if the shell changed, push to
  `main`. CF deploys within a minute or two. Then hard-refresh (see stale-SW below).

CI is a signal, not a deploy gate: CF deploys regardless of the Actions result.

## Pushing (two-GitHub-account gotcha)

This machine's default git identity is the **WCK work account** (`lzortman-wck`),
which has NO access to the `liquid-workflows` org repo. A plain `git push` returns
`403 ... denied to lzortman-wck`. Push as the personal `LeviZ` account (an owner of
the org), one-shot, without persisting the token:
```
TOKEN=$(gh auth token --user LeviZ)
git push "https://LeviZ:${TOKEN}@github.com/liquid-workflows/liquid-sheets.git" main
```
For seamless pushes you can instead make `LeviZ` the active `gh` account
(`gh auth switch --user LeviZ`), but that changes global state affecting other
repos, so prefer the one-shot form here.

## Rollback

- **Fastest (production):** Cloudflare Pages keeps every deployment. In the CF Pages
  project -> Deployments, open a known-good prior deployment and "Rollback to this
  deployment." Instant, no git needed.
- **Source rollback:** `git revert <bad-sha>` then push `main`; CF redeploys the
  reverted tree. Prefer revert over force-push on a public repo.
- **After any rollback that changed the shell,** confirm the served masthead version
  and SW cache name are the ones you expect (a rolled-back SW cache name is normal
  and correct).

## Common incidents

**"My change did not show up" (stale service worker).** The number-one issue. The
SW serves the shell cache-first. If you did not bump `app/sw.js` `CACHE`, the old
shell is still served. Fix: bump the cache name (and masthead) and redeploy. To
force a client to update now: DevTools -> Application -> Service Workers ->
Unregister, then hard-reload; or Application -> Storage -> Clear site data. The
gauntlet and a masthead-version check confirm which shell is actually live.

**App broke after an import format changed.** By design this is a user-facing "confirm
two dropdowns" step in the column mapper, not an app crash. If the mapper itself
fails, check `app/importers.js`; there is no server hotfix channel, so a fix is a
normal deploy.

**Offline mode not working.** The SW must have activated at least once online first.
Load the app online, confirm a controlling SW (DevTools -> Application -> Service
Workers shows "activated and is running"), then it works offline. The gauntlet's
offline check verifies this end to end.

**A draft looks wrong / numbers disputed.** Every number traces to a run (doctrine
R1). Have the user export their JSON backup (gear -> Export); load it locally and
inspect `doc.runs`. The engine is golden-master-verified, so a discrepancy is almost
always input data (which source, which mapping), not the math.

**Lost draft state.** Recovery is the JSON file: gear -> Import a previously exported
backup. There is no server-side copy by design (client-side everything, constraint
#2). Encourage exporting a backup before and mid-draft.

## CI

`.github/workflows/ci.yml`, on every push to `main` and every PR:
- **static-checks** job: `node --check` on all JS + the no-dash/non-ASCII rule.
- **gauntlet** job: installs Playwright + Chromium, serves the repo on 8013, runs
  `verify/gauntlet/run_gauntlet.py` (expects 15/15).

Not in CI: the golden master (gitignored fixtures) - it is a local gate. If you
change anything near the engine, run it locally before pushing.
