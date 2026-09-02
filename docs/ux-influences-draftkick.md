# UX influences: DraftKick (draftkick.com/football)

Working notes from a walkthrough of DraftKick's free web app on 2026-09-02,
looking specifically at how it structures its player dataset and draft-room
views. This is **influence, not source**: nothing here is copied text,
markup, or assets, and DraftKick is a different (snake-draft-first,
freemium) product with a different scope. The point of this doc is to name
patterns worth adapting to Liquid Sheets' own auction-only, single-league,
Sleeper-first design (see `AGENTS.md`, ADR-0001, ADR-0002, ADR-0009), and to
say plainly where their patterns do not fit us.

Treat this as a reference doc, not a plan. If an idea below gets picked up
for real, it should get its own ADR or plan entry, not be implemented
straight out of this file.

## What DraftKick is, in one line

A rankings/cheatsheet tool with an optional live draft-room sync (Yahoo,
ESPN, CBS, Sleeper) and an AI opponent draft simulator. Supports both
snake and auction, and a full IDP position set (DL/DE/LB/CB/S/DB/DP)
alongside Superflex. Free tier works fully but doesn't persist state across
page loads (upgrade required to save leagues or auto-sync a live room).

## Patterns worth adapting

### 1. One dataset, multiple render lenses, not multiple datasets

The same underlying player table is exposed through four toggled views:
**List** (flat sortable table), **Positions** (columns per position,
side-by-side), **Cheatsheet** (print-oriented, same grouping as Positions),
**Keepers** (a filtered subset). Nothing about the data changes between
views, only the layout. That's a cleaner mental model than maintaining
separate "board" and "list" data paths, so it's worth checking that Liquid
Sheets' own board/list rendering already shares one source of truth, and
keeping any future views (e.g. a printable pre-draft cheatsheet) as pure
render variants of the existing player/verdict data rather than a parallel
computation.

### 2. Tiers as a horizontal structural device, not just a badge

In the Positions/Cheatsheet views, tier boundaries are drawn as full-width
row bands that align *across* every position column at once, so row-band
2 shows "every WR, RB, TE, etc. still in tier 2" side by side. That answers
a question a flat per-position list doesn't: "if I pass on this tier at
position X, what am I giving up at position Y in the same tier band?" For
an auction (not pick-order) context this maps more naturally to *price*
bands than pick bands, which Liquid Sheets is arguably better positioned
for already given My$/Bid$ (ADR-0009) than a snake-draft tool is.

### 3. Every value column is a delta, not a raw number

Consistently, the numbers that matter most are shown as deltas against a
baseline, colored green/red, rather than absolute values the user has to
compare mentally:

- `$` = projected auction value **minus** what ADP/market implies (e.g.
  "-$52" flags a player the market is overvaluing relative to points).
- `Impact` = marginal standings-impact of that player **vs. replacement**
  for your specific roster, not raw projected points.
- Rank-vs-ADP cells are colored by the sign of the gap (reach vs. value),
  not just displayed as two adjacent numbers.

This is close in spirit to Liquid Sheets' own verdict/scarcity work
(ADR-0010, ADR-0011) and the recently-shipped actual-vs-projected price
flag: the throughline worth stating explicitly as a house style is to
**default
to showing a comparison, not a magnitude**, whenever the raw number alone
would require the user to hold a second number in their head to interpret
it.

### 4. A persistent, always-visible roster-need rail

A fixed right-hand rail lists the selected team's roster slots (starters
then bench) and fills in names as they're drafted, visible no matter which
main view or filter is active. It's small, but it means "what do I still
need" never requires a tab switch or scroll. Worth checking this against
Liquid Sheets' current draft-room layout: if roster state currently lives
inside a tab/modal, a persistent rail is a cheap, high-value change.

### 5. Settings taxonomy separates "what changes rarely" cleanly

Their settings are split into Basics / Teams / Scoring / Positions /
Projections / Draft Picks / Site Ranks & ADP / Tags, each a single-purpose
page rather than one long settings form. Directly relevant to two of this
fork's open goals: pulling real scoring from Sleeper (AGENTS.md item 2) and
keeper handling (item 3) each map cleanly to their own settings page rather
than being bolted onto a general settings screen. Also notable: Positions
settings offer per-league-site presets (Yahoo/Sleeper/ESPN/CBS/Fantrax/
Underdog/NFFC) that pre-fill slot counts: a nice affordance if Liquid
Sheets ever needs to support a second platform's default roster shape, but
low priority given ADR-0003 already commits to Yahoo/ESPN as first-class
and this fork is Sleeper-only per AGENTS.md.

### 6. Auction gets its own ordering concept, not snake's leftovers

Switching their Draft Type to Auction swaps "Draft Order: Snake/Straight"
for "Nomination Order: Snake/Straight/Third-Round-Reversal" plus a
"switch to snake in round N" escape hatch. Small, but it signals that
auction nomination order was treated as a first-class setting, not just
disabled snake-order logic. Since ADR-0002 already commits Liquid Sheets to
auction-only, there's no snake-order code to confuse this with, but it's a
reminder to keep nomination-order (who nominates next, and in what pattern)
modeled as its own concept if that isn't already explicit.

### 7. Injury and multi-year context inline, not on hover only

An injury glyph sits directly in the name cell (not tucked behind a
tooltip), and a `Yr` (NFL experience) column sits next to rank on every
position table. Cheap, always-visible context that doesn't cost a click.

## What doesn't transfer (don't import these)

- **The snake-draft board grid** (team-by-team pick-slot grid): explicitly
  out of scope per ADR-0002. Not relevant even as inspiration.
- **Freemium save-gating** ("upgrade to save your league"): Liquid Sheets
  is a single-purpose, single-league, already-persisted tool (ADR-0005,
  ADR-0007); there's no analogous gate to design around.
- **AI opponent draft simulator**: a distinct feature for practicing
  against bots, not related to the real-draft-day live-read goal in
  AGENTS.md item 5. Different problem (simulate a fake draft vs. read a
  real one).
- **Branding, copy, iconography, layout code**: none of it was copied
  into this doc or should be copied into the app. This doc is observations
  about structure only.

## Open threads to follow up on (not decided, just flagged)

- Does Liquid Sheets' board/list already share one data source the way
  DraftKick's four views do, or would a print/cheatsheet view need its own
  data path today? Worth a quick look before anyone proposes a cheatsheet
  view.
- Is roster-need state (what slots remain) currently always-visible during
  a live draft, or does it require navigating away from the board? If the
  latter, a persistent rail (pattern 4) is a small, high-value change.
- If price-banded tiers (pattern 2) get pursued, that's a real design
  question (how are price bands computed, do they move live during the
  draft) and should go through `brainstorming` / get its own ADR, not be
  built ad hoc from this note.
