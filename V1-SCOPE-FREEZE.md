# v1.0 Scope Freeze

Status: **DRAFT, awaiting Levi's sign-off.** Drafted 2026-08-27 against the V33 build.
Owner: Levi. Once signed, changes to this file require a note in the MASTER-PLAN.md learnings log.

## Why this doc exists

`PRODUCT-SCOPE.md` answers "which features survive at all." This doc answers a
different, later question: **of the features that survived, exactly which ones are
in the first public release, and where is the line drawn.** It converts an
in-flight parity build into a fixed target so the acceptance gauntlet has
something concrete to pass or fail against.

This is a release-scope freeze, not a feature triage. It does not re-litigate any
ratified PRODUCT-SCOPE call. It records what "v1.0" contains as of the freeze, so
that "are we done?" has a yes/no answer.

## What "v1.0" means here

v1.0 is the **build that gets frozen and put through the acceptance gauntlet**, not
the public launch itself. Per MASTER-PLAN.md the public launch targets July 2027 /
the 2027 draft season (Phases 5 and 6). Freezing scope now lets the gauntlet, the
brand pass, and the launch surface all aim at one stable feature set instead of a
moving one. Anything added after the freeze is v1.1+ by definition.

The freeze covers the **hosted static app only.** The self-hosted copilot server
(`copilot-server/`, ADR-0006) is a developer feature that ships in the repo but is
outside the hosted-app scope this doc freezes.

## In scope for v1.0 (as built at V33)

These are shipping. Each already exists in the build; the freeze declares them
final for v1.0 barring bug fixes.

### Engine and data model
- VBD core, Tremblay dollar conversion, shipped availability prior (all golden-master verified, fixtures 24-29, zero diff).
- Multi-source blend, one-source floor first-class, rank-implied stat-line converter.
- Runs immutability; every number traces to a run.
- Adjustments off by default (parsimony R2).
- Storage: plain structures in IndexedDB, single versioned doc, JSON export/import as the recovery ritual (ADR-0005). SCHEMA_VERSION 2 with 1->2 migration.

### Data-in
- Sleeper client-side fetch (one-click, CORS-confirmed).
- Generic projections CSV import with the universal column mapper + platform presets.
- Yahoo and ESPN paste/import paths.
- League setup wizard: budget, team count, roster shape, scoring knobs the engine uses, platform, team/owner names.

### Draft room
- Board tab: position columns, tier cliffs, surplus gradient, staged pulse, collapsible position columns.
- The Call: verdict + max bid on the staged player, with plan-fit context (planCap, eligible open-slot envelopes, purse).
- Sale flow, reopen-last-sale (double-tap Escape), append-only journal.
- Owner ledger + max-bid tracking; type-to-filter owner grid; manager<->team-name toggle.
- TEAMS tab (N-team draft grid).
- Deal column (my value vs pasted platform value, rescaled to league money supply).
- Plan / envelope layer: editable templates defaulting to stars-and-scrubs derived from the run's own values; multiple named variants; per-slot ~$eff projections and the purse row.
- Named bets ("My Call"): personal per-player dollar nudge, applied client-side outside engine.js so the base blend stays golden-master-stable. Off by default.
- Run selector: base blend run vs blend+My-Calls run vs any imported runs.
- Favorites: star a player from the research popup (replaces the cut tags layer).
- Inflation gauge, sold bar, heat, last-sale chips.
- Rosters dropdown (view any team).
- Print backup sheet (the offline paper fallback).
- Deterministic flow strip (runs, temperature, crunch, hoarders, pace) - no AI, pure ledger heuristics.
- Under-the-hood explainer, copy rewritten for strangers, including the honest note that the live AI read is self-host-only.
- Gear menu: theme toggle, Sleeper/Export/Import, armed 2-step reset.

### Themes (FROZEN)
- **Light and dark only, frozen at commit `1669bc2` (V33).** Light is the printed-sheet daylight mode; dark is the neutral-slate room mode. This is the final theme state for v1.0; no further theme changes ship in the first release. (This supersedes the PRODUCT-SCOPE "light/focus/dark/inverted AS-IS" row; focus and inverted were retired upstream at V55 and are not in v1.0.)
- The theme CSS is unchanged after the freeze commit. The later V34 bump (gauntlet fix) touches only the service-worker precache manifest and the version string; `app/index.html` differs from `1669bc2` by exactly one line (the masthead version). "Themes frozen at `1669bc2`" therefore remains literally true.

### PWA
- Service worker, cache-first app shell, offline-first. Install prompt.

## Explicitly out of v1.0 (deferred to v1.1+)

Named so nothing silently creeps back in. Each is a real future candidate, not a cut.

- **Pre-draft knapsack optimizer** (`plan_optimizer.py` shape). Deferred; the plan layer ships as live water-fill + editable envelopes without it.
- **Phase 4B Liquid Workflows brand pass.** Tokens landed so the brand can map on later; the brand identity itself is a separate pass and does not gate v1.0 function.
- **Mock draft simulator.** Needs an opponent model that generalizes. v1.1 candidate.
- **Post-season evaluation views** (calibration, market-vs-me). Zero draft-day value; needs season-end actuals design.
- **Power-kit ingestion scripts** (news sweep, price pulls). The copilot server and prompts ship in-repo; the personal-use ingestion scripts remain a post-launch encore (ADR-0004).
- **Post-Sept predecessor harvest.** Any V57+ additions the personal tool grows during Levi's 2026 draft get swept in after it freezes, as a v1.1 input.

## Explicitly cut (not returning)

Pointer to PRODUCT-SCOPE.md for full rationale. Two rows there postdate ratification
and are reaffirmed here as frozen for v1.0:

- **Player tags / flagged players / news-noise layer** - cut 2026-08-26. No import, no `doc.tags`, no modal profile block, no Call tag chips. Favorites cover "mark players I care about."
- **In-app BYO-key AI** - cut per ADR-0006. Hosted app ships zero AI. No key UX, no copilot DOM, no gear entry when `config.AI_ENDPOINT` is null.
- Server-side scrapers, Yahoo API, local server / DB snapshots, shipped AI opinions - all CUT per PRODUCT-SCOPE, unchanged.

## Definition of done for v1.0

v1.0 is done when the freeze holds AND the acceptance gauntlet passes. The gauntlet
is the gate; passing it is what "done" means.

**Automated (must be green at freeze):**
- `node --check` clean on every JS module.
- Dash / non-ASCII grep clean on all shipped files.
- Golden master zero-diff on the base blend runs (fixtures 24-29).
- AI-absent proof: with `config.AI_ENDPOINT = null`, the served DOM has no `#liveread`, no key field, no copilot gear entry, and a full draft runs with no network calls beyond the user's own Sleeper/import fetches.

**Human-in-browser gauntlet (the M5 gate, not yet run):**
1. Airplane-mode full draft, start to finish, on a fresh install.
2. Tab-kill mid-draft, reopen, board is byte-identical.
3. Delete site data, then import the JSON backup file, board is byte-identical.
4. Two differently-shaped fictional leagues (one Yahoo, one ESPN; different team counts, budgets, scoring) run correct side by side.

All four must pass on the frozen build. A failure is a v1.0 bug fix, not a scope change.

## Open items that must close before the freeze is real

The freeze is DRAFT until these are resolved. None is a feature addition; each is a
loose end that would otherwise make "frozen" untrue.

- [ ] Levi signs off on this scope line.
- [x] Reconcile `PRODUCT-SCOPE.md` themes row (4 -> light+dark, frozen at `1669bc2`) and confirm the tags-cut rows read as frozen, so the two docs agree. Done 2026-08-27; MASTER-PLAN learnings note added.
- [x] Run the gauntlet. Executed 2026-08-27 in real headless Chromium; results in `GAUNTLET-v1.md`. Re-run 2026-08-29 against the live Cloudflare deployment (https://liquid-sheets.pages.dev/app/), 15/15.
- [ ] Human wizard pass on the live site: build two differently-shaped leagues end to end, confirm both boards. Deferred to the live site per Levi's "get it live and test there" call.

Phase 4B (brand) and the post-Sept harvest are deferred by this doc and do NOT block
the freeze; they are v1.1 inputs.

## Sign-off

- [ ] Levi has reviewed the v1.0 line and confirms what ships versus what waits.
