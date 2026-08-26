# Product Scope - Feature Triage

Status: **RATIFIED** (2026-08-18, by Levi). Amendments at ratification: my_calls moved to DEFERRED; co-pilot resolved as one app plus a post-launch power kit ([ADR-0004](docs/adr/0004-one-app-plus-post-launch-power-kit.md)). This is now the single source of truth; changes require a note in the MASTER-PLAN.md learnings log.

Framing: every call below cites the audience from [ADR-0001](docs/adr/0001-serious-hobbyist-auction-drafter-audience.md) (serious-hobbyist auction drafter), the auction-only stance ([ADR-0002](docs/adr/0002-auction-only-no-snake.md)), and the platform posture ([ADR-0003](docs/adr/0003-first-class-yahoo-and-espn.md)). The inventory is the full feature set of the private predecessor.

Buckets: **AS-IS** (port faithfully) / **GENERALIZED** (survives, reshaped for any league or platform) / **CUT** (not in this product) / **DEFERRED** (post-v1; v1 must not foreclose it).

## Engine

| Feature | Bucket | Rationale |
|---|---|---|
| VBD core (scoring, flex shares, shallow baseline) | AS-IS | The product's spine; hobbyists come exactly for this |
| Tremblay dollar conversion | AS-IS | Auction-native pricing; no platform in it |
| Availability discount (per-slot expected missed games) | GENERALIZED | Survives as a shipped slot-level aggregate prior; whether shipping that aggregate is licensing-clean is a named Phase 2 check |
| Multi-source blend | GENERALIZED | From five hardcoded sources to N user-provided sources (1 to many); the one-source floor must be first-class |
| Rank-implied stat lines for rankings-only sources | GENERALIZED | The Dell-loader trick becomes a generic "import a rankings list" path |
| Runs immutability (every number traces to a run) | AS-IS | Doctrine R1; also the debugging story when a stranger reports wrong numbers |
| my_calls named bets (clamped, thesis required, off by default) | DEFERRED | Ratification call by Levi: v1 surface stays lean; the engine and schema keep room for it so a later version only adds UI |
| Toggle discipline (adjustments off by default) | AS-IS | Doctrine R2, product identity |
| Levi-league priors (WR overspend, QB anchor gap, etc.) | CUT | League-specific by definition; the *mechanism* for users to encode their own league reads is DEFERRED |
| Post-season evaluation views (calibration, market_vs_me) | DEFERRED | High value, zero draft-day value; needs season-end actuals design |
| Mock draft simulator | DEFERRED | Beloved practice feature but needs an opponent model that generalizes; v1.1 candidate |

## Data-in (details are Phase 2's whole job)

| Feature | Bucket | Rationale |
|---|---|---|
| Yahoo player/value paste parser | GENERALIZED | First-class per ADR-0003; hardened for format drift |
| ESPN data-in (values, players) | GENERALIZED | New build, first-class per ADR-0003 |
| Generic projections CSV import | GENERALIZED | The universal floor: any source the user can export |
| Sleeper client-side fetch | GENERALIZED | Only if fetchable from the user's own browser (CORS check in Phase 2); otherwise falls to generic CSV |
| Server-side scrapers (ESPN kona, CBS read_html) | CUT | No server exists; replaced by user-side export/paste |
| Yahoo API integration | CUT | Requires backend and app approval; against the no-backend constraint |
| AI news sweep + generated opinions | CUT | We do not ship AI-generated content about real players to the public; see co-pilot row |
| Player tags / flagged players | GENERALIZED | Survives as user-entered tags and notes; the UI stays, the shipped content goes |

## Draft room

| Feature | Bucket | Rationale |
|---|---|---|
| Board tab (position columns, tier cliffs, surplus gradient, staged pulse) | AS-IS | The product |
| The Call (verdict + max bid on staged player) | AS-IS | The draft-day heartbeat; pure engine math |
| Sale flow, undo, append-only journal | AS-IS | Battle-tested; journal becomes the in-browser recovery story |
| Owner ledger + max-bid tracking | GENERALIZED | Any team count and names, from wizard config |
| TEAMS tab (draft grid) | GENERALIZED | N-team grid instead of hardcoded 12 |
| Deal column (our value vs. platform value, rescaled to league money supply) | GENERALIZED | The rescaling insight is platform-agnostic; anchor is whichever platform's values the user pasted |
| Plan envelopes + stars-and-scrubs flexing | GENERALIZED | Ships as editable templates (default: stars-and-scrubs) instead of Levi's hand-tuned envelope file |
| Inflation gauge, sold bar, heat, last-sale chips | AS-IS | Compact and universal |
| Rosters dropdown (view any team) | AS-IS | No league-specific logic |
| Print backup sheet | AS-IS | Offline-first identity; the paper fallback |
| Themes (light/focus/dark/inverted) | AS-IS | Token architecture already clean |
| Position colors | GENERALIZED | Yahoo and ESPN scheme variants, tied to a platform setting |
| Under-the-hood explainer | GENERALIZED | Identity feature for this audience; content rewritten for strangers |
| League setup wizard | GENERALIZED | New build; replaces hand-written league JSON. Scope: budget, team count, roster shape, scoring rules, platform |
| Draft state export/import (file backup) | GENERALIZED | New build; replaces the server's snapshot backups as the recovery path |
| Local server, launcher, DB snapshots | CUT | The browser is the runtime; storage moves client-side (Phase 3 decision) |

## AI co-pilot

Resolved at ratification via [ADR-0004](docs/adr/0004-one-app-plus-post-launch-power-kit.md): one app, never two versions; the AI-savvy path ships as a post-launch "power kit" in the same repo. Refined 2026-08-25 by [ADR-0006](docs/adr/0006-ai-copilot-self-hosted-companion-not-in-app.md): the live read is NOT an in-app BYO-key feature; it ships as an optional self-hosted companion server, and the hosted app stays AI-free.

| Feature | Bucket | Rationale |
|---|---|---|
| Deterministic flow read (runs, temperature, crunch, hoarders, pace) | SHIPS | Contains no AI; pure ledger heuristics, ported as ordinary code. Lives in the top-bar pressure strip and needs no key |
| Pre-computed AI opinions shipped in-app | CUT | We never ship AI-generated takes on real players; users generate their own and import them via the tags/opinions hook |
| Opinions/tags import hook | SHIPS | Path E writes to `doc.tags`, which feeds the Flagged Players panel, the player modal profile block, and The Call's tag chips; the app ships none of its own |
| Live "reading the room" | SELF-HOST ONLY | Resolved by [ADR-0006](docs/adr/0006-ai-copilot-self-hosted-companion-not-in-app.md): no in-app key UX. The hosted app is AI-free; developers run `copilot-server/` against their own AI and set `app/config.js` `AI_ENDPOINT` |
| Power kit (published copilot server + prompts, personal-use ingestion scripts) | PARTIAL | `copilot-server/` (server + the synthesize/complement prompts) now ships in-repo; the ingestion scripts remain a post-launch encore per [ADR-0004](docs/adr/0004-one-app-plus-post-launch-power-kit.md) |

## What the wizard must therefore cover (input to Phase 2)

Budget, team count, roster shape (starters, bench, flex definitions), scoring rules (at minimum: the knobs the engine's scorer actually uses), platform selection (Yahoo/ESPN/other, driving parsers and colors), and team/owner names. Nothing else. Anything the wizard does not need is a knob the engine should default sensibly.

## Ratification

- [x] Levi has reviewed every row, amended where needed, and ratified (2026-08-18).
