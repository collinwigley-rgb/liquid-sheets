# AGENTS.md — start here (Claude, ChatGPT, or human)

This file exists so anyone (or any AI agent) picking up this repo cold —
Collin, Ricky, or either of their assistants — can get oriented in minutes,
not hours. Read this before touching anything else.

## What this repo is

A personal fork of [liquid-workflows/liquid-sheets](https://github.com/liquid-workflows/liquid-sheets)
(MIT, by Levi Zortman) — a free, static, browser-only auction fantasy-football
draft tool. Upstream's own docs (`CHARTER.md`, `PRODUCT-SCOPE.md`,
`RUNBOOK.md`, `docs/adr/`) describe *their* product: Yahoo/ESPN-first,
no server, no Sleeper API, no live draft read, built for a general audience.

**This fork is not that product.** It exists for one purpose: run
Collin's real Money_Talks auction draft on Sleeper, this Friday night
(next draft: **2026-09-04**). It is explicitly a one-and-done deployment
tuned to Collin's exact league — not a generalized tool. Where this fork's
goals conflict with upstream's charter (e.g. Sleeper integration, live
draft polling), the fork wins; do not "fix" fork-specific code to match
upstream's stated scope.

Upstream's docs are still useful as architecture reference (the engine,
the storage/versioning discipline, the verification gates) — just don't
treat `PRODUCT-SCOPE.md`'s CUT/DEFERRED rows as binding here.

## Real league data — read `sleeper.md` before asking Collin anything

[`sleeper.md`](sleeper.md) holds the actual Money_Talks league data pulled
live from the Sleeper API: league ID, draft ID, draft time, the real
roster_positions (superflex + 2 IDP-flex, confirmed), full scoring
settings, owner/team mapping, and current keepers. Most of what issues
#1, #2, and part of #3 marked `blocked-on-data` needed is already
answered there — check it before opening a new question to Collin.

## Where the actual task list lives

**GitHub Issues on this repo, not this file.** This file describes the
*shape* of the work once, on day one; it will go stale. Issues are the
live source of truth for what's done, in progress, or blocked.

- Milestone: **"Friday Draft (Money_Talks)"** — every issue needed for
  2026-09-04 is attached to it. Start there.
- Labels: `enhancement` (new capability), `bug` (something built is
  wrong), `blocked-on-data` (needs a real answer from Collin — a league
  ID, a roster confirmation, a scoring rule — before it can proceed).
- One pinned tracking issue checklists all the Friday-scope issues in one
  place — look for the issue titled "Friday Draft readiness checklist".

If you finish something, close the issue (or check its box on the
tracking issue) rather than leaving state only in a commit message or a
chat transcript. The next person/agent should never have to reconstruct
status by reading git log.

## The six things this fork needs to do that upstream's doesn't

1. **Superflex + 2 IDP-flex auction math** — the engine's roster-shape
   assumptions need to cover these slot types for VBD/dollar conversion.
2. **Pull league scoring from Sleeper** — read Money_Talks' real scoring
   settings via the Sleeper API instead of a hand-entered scoring profile.
3. **Keeper support from Sleeper** — kept players come off the biddable
   board, and the keeping team's starting budget reflects keeper cost.
4. **Custom scoring applied to raw projections** — re-derive each
   player's projected points from underlying stat-line projections using
   Money_Talks' actual scoring weights, not a source's own point total
   (which assumes different scoring).
5. **Live draft read** — read-only poll of Sleeper's live auction draft
   state during the real draft (pattern: FantasyEngine's own
   `api/lib/live-draft.ts`, read-only, no picks/sales written back to
   Sleeper).
6. **Mock draft room support** — same live-read capability pointed at a
   Sleeper mock draft, so the flow can be rehearsed before Friday.

Design docs for each (data model, API surface where relevant, open
questions) belong in `docs/adr/` or `docs/plans/` per this repo's existing
taxonomy — check there before assuming a decision hasn't been made yet.

## Running it locally

No build step, no `package.json`. Per `RUNBOOK.md`:

```
./dev.sh
```

Serves the repo root on `http://localhost:8013/app/` (must serve the repo
root, not `app/` alone — the app imports `../engine/engine.js`).

## Hard rules inherited from upstream (still apply here)

- No em/en dashes or non-ASCII anywhere (prose, code, commit messages).
  Check: `grep -nP '[\x{2014}\x{2013}]|[^\x00-\x7F]' <file>`
- `node --check` every JS file you touch.
- Any shell/version-affecting change bumps the masthead version in
  `app/index.html` and the cache name in `app/sw.js` together — the whole
  cache-busting mechanism depends on this.
- `engine/engine.js` changes must not silently drift — run the golden
  master (`node verify/run_golden.mjs verify/fixtures_NN`) before pushing
  anything that touches it.
- Full paths from the project root in docs, commits, and logs.

## Deploy

**Live at <https://collinwigley-rgb.github.io/liquid-sheets/app/>** —
GitHub Pages, serving the repo root from `main` (same reason `dev.sh`
serves the repo root locally: `app.js` imports `../engine/engine.js`, so
serving `app/` alone 404s the engine). Auto-deploys on every push to
`main`, usually live within about a minute — check
`gh api repos/collinwigley-rgb/liquid-sheets/pages/builds/latest` if in
doubt. Confirmed working end-to-end against the real public URL
2026-09-02 (quick-start flow, real board, no console errors). Upstream's
own Cloudflare Pages deploy (`liquid-workflows/liquid-sheets`) is a
separate, unrelated site — this fork does not touch it.

## Collaborators

- Collin (`collinwigley-rgb`) — owner.
- Ricky — needs a collaborator invite on *this* repo specifically (as of
  2026-09-02 he was not yet listed under Settings > Collaborators here,
  even if he has access elsewhere). If you're Ricky's agent and can't
  push, that's why — ask Collin to send the invite.
