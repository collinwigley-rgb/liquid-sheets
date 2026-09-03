# Fixes log (streaming)

Append-only running record of changes made to this fork during the
Friday-draft build, and why -- not a duplicate of GitHub issue history,
but the place to see reasoning that evolved across the build (a decision
made, then revised) in one place without digging through commit messages.
Newest entry at the bottom. Don't edit past entries; add a new one that
supersedes it and say so.

---

## 2026-09-02 -- Superflex/IDP pricing: evaluated two methods, blended them

**Starting point (commit e5c133a, issue #1):** engine.js added
`superFlexShares()` (a formulaic 60/40 QB/skill-position split for the
SUPER_FLEX slot) and continuous IDP VBD (`scoreIdpStatLine` +
`idpFlexShares()`, an even 1/3 DL/LB/DB split) so the engine could price
a superflex + 2-IDP-flex roster at all.

**Evaluation:** two valuation approaches exist for this league --
engine.js's general formula (above), and FantasyEngine's separate
pipeline for this same league (`config/vorp_baselines.R`,
`scripts/calculate_vorp.R`). Comparing them:

1. **Offense baselines (QB/RB/WR/TE):** `config/vorp_baselines.R` takes a
   measured approach -- Money_Talks' replacement ranks come directly from
   3 real seasons (2023-2025) of this league's own draft/spend history --
   QB 32, RB 39, WR 54, TE 15 ("VOND": 1 + the real count of players
   actually paid above the $1 floor). engine.js's formula takes a
   general approach, useful for a league without that history available.
   Different tools for different situations, not a better/worse call.
2. **IDP:** `calculate_vorp.R` takes a different shape here too --
   two-tier fixed pricing (top 24 by raw production get $3, everyone
   else gets $1) plus a separate smash-score composite for tiering
   (`calculate_idp_smash_tiers.R`), rather than continuous VBD. engine.js
   had built continuous IDP VBD as its own approach. Two different ways
   to handle the same real gap (IDP production doesn't cleanly support
   the same kind of per-player VBD math offense does).

**Determination:** blend the two rather than replace one with the other --
use measured history where it exists, keep the general formula as a
fallback where it doesn't. engine.js now supports both as opt-in config:
- `baselines()` accepts `mp.measured_baselines` (e.g.
  `{QB:32, RB:39, WR:54, TE:15}`) and uses it directly per position when
  present. The formula remains the default for any league/position
  without measured history.
- `valueBoard()` accepts `mp.idp_pricing = {slots_per_team, top_value,
  rest_value}`; when set, IDP is priced with the same two-tier scheme as
  `calculate_vorp.R` (ranked by raw production, top `teams *
  slots_per_team` get `top_value`, rest get `rest_value`) instead of VBD,
  and the offense dollar pool is reduced by IDP's real fixed spend first
  (mirroring `offense_auction_pool`'s exact construction).

**Why both paths still exist:** this fork may see other leagues or
seasons without measured history available; the formula stays as a
documented fallback rather than being removed. For Money_Talks, both
`measured_baselines` and `idp_pricing` are set from the real config
below, so the fallback path doesn't run for the real draft.

**Money_Talks' real config now wired into the app (from
`config/vorp_baselines.R` and `calculate_vorp.R`):**
```
measured_baselines: { QB: 32, RB: 39, WR: 54, TE: 15 }
idp_pricing: { slots_per_team: 2, top_value: 3, rest_value: 1 }
```

**Verification:** with the config above, the top 24 IDP players by raw
projected production receive exactly $3, and the 25th and beyond receive
exactly $1 (checked directly against a synthetic 180-player IDP pool).

---

## 2026-09-02 -- Real Sleeper scoring/IDP data wired in; two issues found by testing live in a browser

**Scope:** issues #2 (pull league scoring from Sleeper) and #4 (re-score
projections under Money_Talks' scoring). `scripts/generate_money_talks_config.mjs`
pulls the real league config from the Sleeper API and writes
`app/money_talks_config.js`; a "Quick start: Money_Talks" button loads it
directly, skipping the generic wizard (which has no UI for
superflex/IDP at all). `app/sleeper.js` now fetches DL/LB/DB projections
alongside offense.

**Checked before wiring anything up, not assumed:**
- The generator's first pass wrote Sleeper's raw scoring weights straight
  into the config, including float32 storage noise (`0.03999999910593033`
  instead of `0.04`). Caught by reading the generated file before using
  it -- rounded to 4 decimals.
- `pass_2pt`/`rush_2pt`/`rec_2pt` all happen to be `2` in this league,
  which the engine's single `two_pt` stat can only represent correctly
  because they agree. Added an explicit check that throws if they ever
  diverge, instead of silently picking one and hoping.
- `scoreIdpStatLine`'s stat-key names (added in the first IDP pass) had
  never actually been checked against Sleeper's real projection field
  names. A live pull turned up two real gaps: `player.position` is the
  raw NFL position (DT/DE/CB/SS/...), not the DL/LB/DB fantasy bucket
  used for roster eligibility -- that only exists in
  `player.fantasy_positions`; and the existing `pts_half_ppr` inclusion
  gate would have silently dropped about a third of real IDP
  projections, since standard PPR scoring doesn't award IDP stats at
  all. Both fixed in `app/sleeper.js` (bucket comes from
  `fantasy_positions`; IDP inclusion gates on having any real idp_* stat
  instead).
- Sleeper's IDP projections only ever populate 8 of the 14 idp_* stat
  categories Money_Talks' scoring actually uses (no tackles-for-loss, QB
  hits, return yards, pass-defenses, or defensive TDs). Not a bug --
  verified directly against a live pull -- and the same kind of gap
  FantasyEngine's own IDP pipeline already documents for its data
  source. IDP dollar values are therefore real but necessarily
  incomplete on those categories; noted in `app/sleeper.js` rather than
  left implicit.

**Found by testing the actual quick-start flow in a browser, not by
reading the code:** the first working version crashed on load with
`team_names` left empty -- code elsewhere assumes `team_names.length`
matches the real team count and reads a per-owner roster shape off each
entry, which broke for the unfilled slots. Fixed by having the generator
pull Money_Talks' real 12 team names from Sleeper (same source as
`sleeper.md`) instead of leaving them blank.

**Verification:** ran the real generator against the live Sleeper API,
loaded the quick-start flow in a clean browser session (fresh tab, fresh
storage) end to end, and confirmed a real board with real team names,
real dollar values, and correct owner budgets, with no errors beyond a
pre-existing, unrelated service-worker warning under the local dev
server.

---

## 2026-09-02 -- Live Sleeper draft sync (issues #5, #6): one mechanism covers keepers too

**Scope:** read-only poll of Sleeper's draft picks, for both the real
Friday draft (#5) and a Sleeper mock (#6). `app/live_draft.js` mirrors
FantasyEngine's own `api/lib/live-draft.ts` pattern -- it only ever reads
Sleeper's state, no write path back, ever. A "Live sync" toggle in the
board header polls every 5s and appends any pick Sleeper has recorded
that isn't already on the board as a sale.

**A design choice worth naming:** this ingests every pick Sleeper
returns, keepers included, since a keeper is just a pick with a real
dollar amount already spent. That means this one mechanism also covers
issue #3 (mark kept players unavailable, deduct their real cost from
budget) -- verified live against the real Money_Talks draft board: all
11 real keepers landed as sales with their exact real costs, matching
`sleeper.md`'s table exactly.

**Checked live before trusting it, not assumed from the picks endpoint's
shape:** Sleeper mock drafts leave `roster_id` null on every pick --
only the real, league-attached draft populates it directly. Mocks
identify teams by `draft_slot` instead, translated through the draft
object's own `slot_to_roster_id` map. `fetchDraftStatus()` now reads
that map and `fetchDraftPicks()` falls back to it only when `roster_id`
is null, so the real draft (which always has it) is unaffected either
way.

**A related mock-draft-specific note, not a bug:** testing this against
a live mock surfaced that a mock's seat assignments don't correspond to
real league ownership -- Collin's own keeper (Colston Loveland) landed
under a different seat number in the mock than his real roster_id (2) in
the league. That's expected: Sleeper mocks are practice runs with
independent, often CPU-assigned seating, not a mirror of real team
ownership. Mocks are a great way to test that the polling/sync mechanism
itself works end to end (and it does); they're not the way to validate
real per-team budget outcomes -- that only means something against the
real draft, where roster_id is always correct.

**Verification:** polled a live Sleeper mock draft end to end and
confirmed all 12 of its recorded picks (11 keepers + one earlier
non-keeper pick already on the board) landed correctly as journal sales
with real dollar amounts, via direct inspection of the saved doc, not
just the rendered UI.

---

## 2026-09-02 -- Live sync UI needs a way to point at a mock; two deploy issues caught testing the real site

**Draft-ID override:** the live-sync toggle only ever pointed at the real
draft (hardcoded in `money_talks_config.js`) -- testing against a mock
meant editing that file and reverting it. Added an input next to the
toggle: blank uses the real Money_Talks draft, filled in points sync at
any other draft_id for rehearsal, no code edit needed.

**A stale service worker hid every change made this session from the
live deployed site.** `RUNBOOK.md` has an explicit rule: any shell
change bumps the masthead version and the service-worker cache name
together, since a stale service worker is the number-one source of "my
change did not show up." This session's changes never did that. It went
unnoticed until testing the real deployed GitHub Pages URL directly: the
GitHub Pages build and CDN were both serving the latest code, but a
browser that had visited the site earlier in the session kept running
the old cached shell regardless, because the already-installed service
worker doesn't re-check its own script for changes on every visit. Fixed
by bumping V55 -> V56 (masthead + cache name together, matching the
rule). This only affects browsers that visited the site during the
stale window -- a device visiting for the first time gets the current
code from a clean install.

**Verification:** with the version bump live and confirmed on the CDN,
ran the full quick-start + live-sync flow against a live Sleeper mock
end to end on a clean origin (no prior service-worker history). Caught a
real pick (Jahmyr Gibbs, $80) happen live in the mock during the test
and watched it sync onto the board automatically within one 5-second
poll -- correct player, correct price, correct owner, board totals and
inflation recalculated correctly. Also reconfirmed the mock-seating
caveat from the previous entry using real data: Jaxon Smith-Njigba's
keeper landed under a different owner in this mock than his real
roster_id 1 (LaPorta Potty) in the league -- expected mock behavior, not
a defect, and does not affect the real draft.

---

## 2026-09-02 -- Mock ownership resolution was wrong; the previous entry's "expected mock behavior" conclusion doesn't hold

**What Collin caught:** checking the same mock directly in Sleeper's own
UI, his real keeper (Colston Loveland) shows correctly under his real
team there. That's a different finding than the previous entry recorded
-- worth tracing rather than reconciling by assumption.

**What was actually happening:** a Sleeper mock's own `slot_to_roster_id`
map turns out to be a meaningless identity placeholder (`1:1, 2:2, ...`),
not a real crosswalk to league ownership -- confirmed by comparing it
against the REAL draft's own `slot_to_roster_id`, which is a real,
non-identity mapping (e.g. slot 10 -> roster_id 2, Collin's actual
team). A mock built "from league settings" reuses the real league's
actual seating (same `draft_order`: a real user sits at the same slot
number in the mock as in the real draft), so the real draft's map is
what correctly resolves ownership for either draft's picks -- the mock
just doesn't expose a usable version of that map itself.

**Fix:** `pollDraft()` now takes `rosterMapDraftId`, and the app always
passes the real Money_Talks draft_id there, regardless of which draft_id
is actually being polled for picks.

**Verification:** re-ran the same live mock's 11 keepers through the
fix and checked every one against `sleeper.md`'s table directly. All 11
now resolve to their correct real team (previously only 1 of 11 -- Kyle
Pitts -- happened to land correctly, apparently by coincidence of the
identity map lining up for that particular slot).

---

## 2026-09-02 -- My$ range on hover

Collin asked to see a projected cost range, not just the single My$
point estimate, when a player is on the board. Added a hover tooltip on
the My$ cell: `My$ range: $45-$61 (+/-15% band around $53)`. The board's
grid columns are fixed-width and tight across hundreds of rows, so a
tooltip fits without redesigning the layout -- same pattern the existing
Bid$/+/- cells already use.

Used FantasyEngine's own auction-value band convention (`BAND_PCT = 0.15`
in `calculate_vorp.R`) for the spread rather than inventing a different
one, so the two projects describe uncertainty around a value the same
way. Bumped V57 -> V58 (masthead + service-worker cache) with the change,
per the shell-change rule.

---

## 2026-09-02 -- Flag actual sale price vs projected My$

Collin asked: when a price is made, flag whether it landed above or
below the projected price, and by how much. Once a player is sold, the
existing +/- column (previously "deal vs the market," which stops being
the live question once a player is off the board) switches to "actual
price vs projected My$" -- e.g. `-21` in green for $21 under projection
(a deal), `+44` in red for $44 over. The usd cell switches from the
pre-sale My$ estimate to the real price paid, with the projection kept
in the hover tooltip.

Verified against real synced sale data from a live mock, not synthetic
numbers: correct deltas, correct color direction (green = under/deal,
red = over), tooltips read correctly. Bumped V58 -> V59 with the change.

---

## 2026-09-02 -- Global price bands across position columns

Reviewed DraftKick's auction/draft tool for UX ideas worth adapting (not
copying -- see `docs/ux-influences-draftkick.md`). Its Positions view
aligns tier breaks horizontally across every position column at once, so
you can see what else is available in the same price range at a
different position -- something the board didn't have, since each
column's tier line only reflects that position's own value gaps.

Added `p.gtier`: the same `gapTiers()` function already used per-position
(`engine.js`, unmodified), applied once to the combined pool of all
rosterable players (usd >= 2) sorted by My$, instead of one position's
values at a time. `skillCol`'s row loop now marks a second, dashed
divider (`.g-open`, using the existing `--gold` accent) wherever the
global tier changes, alongside the existing solid per-position tier line
(`.t-open`) -- additive, not a replacement; the local tier's own
semantics, number, and tooltip are untouched.

Trade-off, left as-is for now: bands are dense at the bottom of the board
(many players a dollar or two apart there means frequent breaks -- the
same "no single $3-6 step is a cliff, but forty of them are" effect the
local tiers already show), and most useful at the top, where it matters
most for a bid decision.

Verified visually against the real Money_Talks board in both dark and
light themes. `engine.js`'s own logic was not touched (`gapTiers` reused
unmodified), so no golden-master re-run applies here.

---

## 2026-09-02 -- THE BLOCK: a nomination banner with a live headshot

Collin asked for a full-width banner, visible while a player is
staged/nominated, to see "the scope of prices" at a glance -- influenced
by Sleeper's own player card and DraftKick's information density, but
built on this app's own numbers (My$, tier, hot/cold) rather than raw
stat cards.

Added `#theblock` between the masthead and the board+rail layout: shown
only while a player is staged (pushes the layout down; costs nothing
otherwise). Shows a live headshot from
`sleepercdn.com/content/nfl/players/<id>.jpg`, keyed off the `sl:<id>`
ids the app already uses internally (falls back to an empty placeholder
if a player has no Sleeper id, or the image 404s); his tier's My$ range
as a horizontal scale with target (My$) and live-bid ticks; and a
hot/cold heat readout comparing already-sold players at that tier
(falling back to the whole position when the tier has no sales yet)
against their own My$ targets, reusing the same paid-vs-projected math
the sold rows on the board already show.

Built deliberately as a small harness, not a one-off: `#theblock` is
`[.blk-photo, .blk-body]`, and `.blk-body` is a vertical stack of
`.blk-row`s, each a self-contained box (no absolutely-positioned content
that overflows its own row) so more can be stacked in later without
redoing the layout. Documented inline in `index.html`. Named "THE BLOCK"
to match the existing "THE CALL" convention.

Verified live against the real Money_Talks board via the local dev
server: headshot loads with no CORS/hotlink issue, banner shows/hides
correctly on stage and on Escape, price tick tracks live typing.
Process note for next time: local testing was initially blocked by the
app's own service worker serving a stale cached bundle from before these
edits -- had to unregister it manually to see changes; not a bug in the
change itself, just a wrinkle of iterating locally on an app that
caches itself for offline use. Bumped V59 -> V60 with the change, per
the shell-change rule.

---

## 2026-09-02 -- Fixed: XSS in THE BLOCK's headshot URL

Post-push security review flagged `headshotUrl()`: `p.id` is trusted as a
clean `sl:<sleeper_id>` string, but that field is only guaranteed clean
for Sleeper-sourced projections. A manually pasted/matched import
(`importers.js`) can leave `p.id` as whatever string ended up in that
pasted file, and it was being interpolated unescaped into
`src="${photo}"` -- a crafted id could break out of the attribute and
inject markup into the page.

Fixed by requiring the id to match `^sl:(\d+)$` before building the URL;
anything else now returns `null` (the existing placeholder-box fallback),
same as a player with no Sleeper id at all. No behavior change for real
Sleeper data, since every real Sleeper id is already digits-only.
Verified: the exact URL still resolves for a real id, and a crafted id
with an embedded `"><script>` now returns `null` instead of building a
breakout string.

---

## 2026-09-02 -- THE BLOCK becomes the decision cockpit (merged THE CALL in)

Collin: "I want a better UX representation of ALL the decision points and
inputs to make an educated decision." Before this, making one bid
decision meant reading four separate places on screen: THE CALL's
verdict panel (rail), THE BLOCK's price/tier context (banner), the
inflation gauge (masthead), and the owner ledger (rail, below the fold).

Folded THE CALL entirely into THE BLOCK rather than duplicating it: the
old `#call`/`#picked` rail panels are gone, and `renderCall()` no longer
exists -- its markup (verdict badge, worth $, spend-up-to ceiling, room
bid estimate, roster-fit slots, reasons list) now renders inside
`renderBlock()`, using the same unmodified `advise()` logic. The rail
keeps only the actual controls (search, price entry, owner picker, DRAFT
button, ledger) -- mechanics, not decision inputs.

Fixed a real gap while merging: THE BLOCK previously hid itself entirely
for a K/DEF pick (`picked.usd == null` guard), which would have silently
dropped the verdict/reasons for K/DEF too once `#call` was removed --
K/DEF has no `usd`/tier (fixed $1 pricing), so it never had a price-scale
row to show, but it still needs the verdict. Guard now only gates the
price-scale row, not the whole block; verified live that a DEF pick shows
verdict + worth + reasons with no photo (no Sleeper id path for
team defenses) and no price scale, cleanly.

Verified live against the real Money_Talks board: RB pick shows the full
merged layout (photo, verdict, worth, roster-fit, reasons, price scale
with heat); DEF pick degrades correctly; Escape still hides the whole
block; no console errors.

---

## 2026-09-02 -- Fixed: V60 shipped without its service-worker cache bump

Caught while making the change above: V59 -> V60 (the price-bands +
original THE BLOCK commit) bumped the masthead in `index.html` but never
bumped `CACHE` in `sw.js`, breaking the exact mechanism the shell-change
rule exists to protect. Since `sw.js`'s own bytes hadn't changed, a
browser with an already-registered service worker from before that
commit would never even detect a new service worker to install --
`sw.js`'s fetch handler serves same-origin files cache-first with no
expiry, so anyone who had loaded the app before today would keep getting
the stale pre-V60 shell indefinitely, silently. A first-time visitor
(no existing registration) was unaffected -- they'd install fresh and
get current content regardless of the cache's name.

Fixed by bumping `CACHE` to `liquid-sheets-v61` (paired with the masthead
going V60 -> V61 for the decision-cockpit merge above), which changes
`sw.js`'s bytes and forces the update-detect -> install -> activate ->
delete-old-caches cycle to actually run. Lesson for next time: the
shell-change rule means bump both files in the SAME commit as the
triggering change, not just the masthead -- worth double-checking `git
diff --stat` includes `sw.js` before pushing any shell-affecting commit.

---

## 2026-09-02 -- THE BLOCK now auto-stages from live sync (undocumented Sleeper field)

Collin, live: "THE BLOCK is not showing up during a live draft." Root
cause: THE BLOCK only ever renders for whoever `pick()` has staged, and
live sync (`syncDraftPicks`, built well before today under #5/#6) only
ever calls `appendSale` for a *completed* pick -- it never staged anyone.
That's because `fetchDraftPicks` filters out any pick without a
`player_id`, and the code's own comment already suspected why: "a pick
can be null while a nomination is mid-bid."

Verified live against Collin's actual running mock (draft
1400887695084953600) rather than guessing: fetched
`/v1/draft/<id>/picks` mid-nomination and confirmed zero null-`player_id`
rows exist at all -- the current nomination is completely invisible in
that feed, matching-or-worse than the old comment assumed. Then checked
`/v1/draft/<id>` (the status endpoint `fetchDraftStatus` already calls
for `slot_to_roster_id`) and found it: `metadata.nominated_player_id` and
`metadata.highest_offer` are live, current, and exactly what's needed.
Not in Sleeper's public API docs -- found by inspecting a real response
during an actual live nomination. Collin approved using it anyway: this
is a private one-off tool, never redistributed, read-only.

`fetchDraftStatus` now also returns `nominatedPlayerId`/`highOffer`.
`pollDraft` computes the nomination from `draftId` itself (never
`rosterMapDraftId` -- a mock's own live nomination is what's live when
watching a mock, unlike its untrustworthy roster map), cross-checked
against `picks` so metadata left over from a just-completed sale doesn't
re-surface an already-sold player as still nominated. New
`onNomination(nom)` callback fires every tick with `{playerId, highOffer}`
or `null`.

`app.js`'s new `syncNomination()` stages the nominee via the existing
`pick()` only when it actually changes (never re-stages the same
nominee every 5s tick -- that would have stolen focus from `#price` on
every poll, breaking anyone mid-interaction) and live-updates the price
field with `highOffer` while that nominee remains staged. Only
auto-clears staging when the specific player live sync itself staged
is the one leaving the block -- never a player staged manually for
research between nominations.

Verified live end-to-end against the real running mock: THE BLOCK
correctly showed the actual live nominee (Zay Flowers, WR, injury flag,
verdict, roster-fit, reasons, tier heat) with the real $24 offer synced
into the price field automatically; confirmed across a full poll
interval that focus stayed wherever the user had clicked (not stolen
back to `#price`) since the nominee hadn't changed. No console errors.
Bumped V61 -> V62 with the change.

---

## 2026-09-02 -- Fixed: mock rehearsal was corrupting the real journal; live sync was reading stale Sleeper data

Collin, live, right after V62 shipped: "the current roster and picked
players is totally messed up." Root cause, found by reading his actual
saved doc (read-only, via IndexedDB) rather than guessing: `doc.journal`
had 216 "sale" entries, every one timestamped 2026-09-02, while the real
Sleeper draft's own status was still `pre_draft` -- meaning every single
entry was contamination from testing live sync against a mock, not real
data. `syncDraftPicks()` had no concept of "this poll is a rehearsal" --
it called `appendSale`/`saveDoc` identically whether polling the real
draft_id or the "draft/mock ID" override field. Recovery: Collin used
the existing "Clear all sales" control himself (nothing here needed a
destructive write from this session).

The actual fix: `toggleLiveSync()` now treats a non-empty "draft/mock ID"
override as `isMock`, passed through to `syncDraftPicks(picks, isMock)`.
When true, picks rebuild an ephemeral `mockSales` array (module-level,
never in `doc.journal`) instead of calling `appendSale`/`saveDoc`;
`buildModel()`'s `curSales` now reads
`activeSales(doc.journal.concat(mockSales))` -- concatenating before the
active-sales filter, not after, so mockSales' negative seq numbers never
collide with a real unsale's `ref`. Every existing read path (board,
roster, ledger, THE BLOCK) already consumes `curSales`, so a full mock
rehearsal now renders live and correctly, and reverts instantly the
moment live sync stops or points back at the real draft_id -- nothing
persisted, nothing to clean up after. This is what issue #6 ("Mock draft
room support for pre-Friday rehearsal") should have guaranteed from the
start; it never actually isolated the two.

Second, independent bug in the same report ("it's also behind the
polling, showing Puca when Amon is on the board"): checked Sleeper's own
response headers and found both endpoints this app polls sit behind a
CDN serving `stale-while-revalidate=300s` -- a plain `curl` came back
159 seconds stale. `fetch()`'s `cache` option only controls the
*browser's* cache, not that CDN edge; confirmed live that only a
cache-busting query param actually forces a fresh `MISS`. Added
`noCacheFetch()` in `live_draft.js` (append `?_=Date.now()`, plus
`cache: "no-store"` for the browser layer too) and use it for both the
status and picks fetches.

Verified live against a second real mock (draft 1401019314483539968):
watched the board fully rehearse (roster panel, struck-through picks,
nomination banner) while confirming via direct IndexedDB read that
`doc.journal`'s length never moved from its 57-entry baseline throughout
-- the mock only ever touched the ephemeral overlay. Confirmed via the
browser's own network log that every poll now carries a unique
cache-busting param. The remaining few seconds of visible lag against a
bot-driven mock nominating rapidly is normal 5s-polling granularity, not
the 159s CDN staleness bug -- a materially different, expected latency.
No console errors. Bumped V62 -> V63 with the change.

---

## 2026-09-02 -- Force-refresh button, and a big color-graded current-bid number

Two small asks in a row while Collin kept testing live:

**"I need a force refresh button for stale."** `pollDraft()`'s returned
stop function now also carries `.refresh()`: clears the existing
interval, fires an immediate tick, then reschedules from that point (not
a bonus tick squeezed in on top). New "Refresh" button next to "Live
sync: ON/OFF" in the masthead, disabled whenever sync is off. Verified
live: clicked partway through a 5s interval and confirmed via the
network log that the request fired at the exact click timestamp, then
resumed a clean 5s cadence from there -- no drift, no duplicate overlap.

**"Current Bid value very large, alongside a reasonable sized fair
value, peak value, gradient if we're getting HOT."** Added a hero row to
THE BLOCK: the live bid at 46px, bold, color-graded continuously from
green (deal) through amber (right at value) to red (overpay) by
`current / target` -- reusing `surplusBg`'s exact per-theme RGB triples
for the green/red ends, `--warn`'s RGB as the ratio=1.0 midpoint, linear
interpolation between them (`bidHeat()`). Beside it, smaller: FAIR
(target/My$) and PEAK (the top of his own tier's My$ range -- the one
guess in this change, since "peak value" wasn't otherwise specified;
flagged to Collin as a one-line swap if he meant something else).
Verified live at three checkpoints against a real My$ value ($39):
bid $50 (ratio 1.28) rendered essentially the theme's full "bad" red,
bid $28 (ratio 0.72) essentially full "good" green, bid $39 (ratio 1.0)
exactly the theme's `--warn` RGB -- confirms the gradient is centered
and scaled correctly, not just directionally right. Bumped V63 -> V64.

---

## 2026-09-02 -- Confirmed roster tracking was correct; the old contamination was never actually cleared on this browser; Refresh got visual feedback

Two reports in a row: "the current roster and picked players is totally
messed up" (again) and "the refresh button is there just not working."

**Roster tracking:** checked the live site's real IndexedDB directly and
found the SAME 216-entry contaminated journal from the earlier incident,
byte-identical (same first/last entries, same timestamps) -- the
previous "cleared" never took effect on this particular browser/device.
Cleared it properly this time (the app's own two-click "Clear all
sales" confirm, verified via a fresh IndexedDB read: 216 -> 0). With a
genuinely clean board, re-verified roster/owner attribution three
separate ways against hand-computed expected values (using the real
draft's slot_to_roster_id map): three individual sale-attribution
lookups (Jaxon Smith-Njigba -> LaPorta Potty, Colston Loveland -> Back
Akers, Chris Olave -> Peekegbuka, all exactly matching manual
calculation) plus the aggregate roster panel (budget math for "my
roster" summed correctly against players shown). The mapping logic
itself was never broken -- this was the same stale-data issue as
before, just not actually resolved on this browser/device the first
time. If testing from more than one browser or device, each one has its
own separate saved league (IndexedDB doesn't sync) -- clear each one
that's touched a mock.

**Refresh button:** verified via network-log timestamps (not just
"looks fine") that clicking it does fire an immediate extra poll --
caught one at 168ms after the prior natural tick, clearly not waiting
out the remaining ~4.8s. The button was working the whole time; it just
gave zero visual acknowledgment of the click, so it looked broken
whenever the poll happened to return unchanged data. Added a feedback
pulse: button reads "..." and disables for 700ms after every click, an
honest "your click registered" signal, not a claim about the fetch's
real completion (which isn't awaited here). Bumped V64 -> V65.

---

## 2026-09-02 -- Mock mode no longer blends with the real journal

Collin, with a screenshot: the same WR showed up twice in one roster at
two different prices, and nearly the whole QB list was crossed out
against only 13 real Sleeper picks. Stated the actual principle this
violated: "the app should sync to EXACTLY the sleeper board. it should
not try and retain out of band."

Root cause: mock mode's fix from earlier today (the mockSales overlay)
still concatenated with `doc.journal` before the active-sales filter --
`activeSales(doc.journal.concat(mockSales))`. That was meant to let real
keepers coexist with a mock rehearsal, but it meant ANY leftover entry
in the real journal for a player the mock also shows would double him
up, and any real journal entry the mock's board doesn't currently
reflect would show as phantom-sold. Collin, asked why the blend was
even there: no good reason survived -- a mock rehearsal should be a
clean, isolated mirror of that one Sleeper board, full stop.

Fixed: new `mockActive` flag (true only while polling a mock override).
`buildModel()` now reads `activeSales(mockActive ? mockSales : doc.journal)`
-- mock mode shows ONLY the mock's current live picks, real mode is
unchanged. Also satisfies "if I put a new ID in, it should just align
with current": since mockSales already fully rebuilds from scratch every
poll (never appended to), and now nothing else blends in, pointing at a
new draft or a reset mock self-corrects on the very next tick.

Verified by deliberately reproducing the exact reported bug: manually
injected a stale `doc.journal` entry for a player also active in a real
running mock (same pid, an obviously-wrong $999 price), confirmed it
showed correctly in real mode (sanity check), then enabled mock sync and
confirmed exactly one row at the mock's real price ($26) -- no
duplicate, stale entry completely excluded. Confirmed the switch is
clean both directions (toggling sync off reverts to showing the real
journal's $999 again) and that `doc.journal` never moved (mock mode
still writes nothing, ever). Bumped V65 -> V66.

---

## 2026-09-02 -- Recent Bids feed, and parked: Sleeper's own player value

**Parked, not built:** Collin wants Sleeper's own per-player auction
value ("$PROJ" in their draft room -- confirmed by looking directly at
Sleeper's UI) shown alongside My$, since it's "always way wrong" for
this league. Investigated with two separate attempts (network tracking
armed BEFORE navigation both times, per usual): confirmed it's not a
simple stat conversion (two players with nearly identical projected
points, 139.8 vs 139.9, showed $17 vs $12 -- a position-relative VBD
calc, not points-to-dollar), found no REST endpoint or field carrying
it, and saw zero relevant XHR/fetch traffic even with tracking correctly
armed -- strongly suggesting Sleeper's draft room loads this over a
WebSocket, which is invisible to this project's network-inspection
tools. Collin: park it, he'll look into it himself. Likely explanation
for "always wrong" either way: Sleeper's number almost certainly assumes
a generic standard roster (no IDP, no superflex), not Money_Talks' real
shape.

**Built: Recent Bids.** New rail panel, always visible (unlike THE
BLOCK, which only shows while a player is staged -- an activity feed
disappearing along with staging would defeat the point). Shows the last
20 live bids seen -- team, player, amount, newest on top -- across the
whole draft, not just the current nominee. Sourced from the same
undocumented `metadata.offering_slot` field alongside
`nominated_player_id`/`highest_offer` (`fetchDraftStatus` and
`pollDraft`'s `onNomination` now also resolve and pass `ownerIdx`,
through the same real-draft slot map already used for pick ownership).
Honest limit, stated to Collin up front: this can only see whatever
changed *between* polls (5s, or on-demand via Refresh) -- not every
single increment if several bids land inside one window.

Collin: "retain the top 20 bid events in a local store/cache" -- this is
NOT staged like THE BLOCK's per-nominee data; it's a standing,
cross-nomination log, persisted to `localStorage` (`ls-bidfeed`) so it
survives a reload. Deliberately never cleared on live-sync stop/start
(explicit "retain," not ephemeral like `mockSales`) and never written to
`doc.journal` (activity-log flavor, not part of the league's real
recorded state).

Verified live against the real running mock (paused mid-nomination, so
only one frozen bid to check, not a live sequence): captured "ME bid $18
on Terry McLaurin" exactly matching Sleeper's own UI (`$18 @mondo_duke`
on that same nomination), confirmed it round-trips through
`localStorage` correctly across a full page reload with live sync off,
no console errors. Bumped V66 -> V67.

---

## 2026-09-02 -- Fixed: XSS in Recent Bids' team/player interpolation

Post-push security review caught `renderBidFeed()`: `b.team`
(derived from `doc.league.team_names`, ultimately a Sleeper user's own
display name) and `b.player` were interpolated unescaped, `b.player`
inside a `title="..."` attribute -- the same attribute-breakout class
already fixed once today in `headshotUrl()`. A crafted team/player
string could break out of the attribute and inject markup.

Fixed using the escHtml() helper that already existed elsewhere in this
file (app.js:152) but wasn't applied here -- wrapped both `b.team` and
`b.player` in `escHtml()`. `b.amount` is left as-is: it's always a
`Number(...)` from live_draft.js, not a string, so it can't carry markup.
No behavior change for real data. Bumped V67 -> V68.

---

## 2026-09-02 -- Fixed: target/bid label crowding at a tier's edge (issue #9)

The known cosmetic gap from THE BLOCK's original ship: when a player's
My$ IS his tier's min or max, the "target $X"/"bid $X" label sat right
on top of the scale's own $lo/$hi end-label, since both used the exact
same position. Fixed with a `labelPct()` clamp (7%-93%) applied only to
the label text's position -- the tick mark itself still sits at the
exact true value via the unclamped `pct()`, so the visual read (where
this price truly falls in the range) doesn't change, only the label
text nudges inward enough to stop colliding with $lo/$hi.

Verified the clamp math directly against the exact repro case (target
at tier max): label lands at 93% (not 100%), tick mark stays at exactly
100%. Bumped V68 -> V69.

---

## 2026-09-02 -- Tier-price recalibration actually feeds the verdict

Collin: "if players go for $42 in a tier, and the next player goes for
$38, we have an idea of the tier price, and we can make adjustments."
Asked directly whether this should just be shown alongside the existing
numbers, or actually change the verdict itself -- he chose the latter,
explicitly, so this changes `advise()`, the exact function ADR-0010/
ADR-0011 protect from hardcoded strategy. Neither ADR guards against
recalibrating from *real observed sales in this draft* -- they guard
against ungrounded, hardcoded dollar rules -- so this doesn't violate
their intent, but it's the first time `advise()`'s core `worth` number
moves from something other than the pre-draft model or the user's own
plan.

Extracted `tierDrift(pos, tier)` (shared by `advise()` and THE BLOCK's
heat readout, replacing what used to be duplicated inline logic in
each): average (actual sale price - My$) for sold comps, same-tier
preferred, whole-position fallback, `null` on zero comps (never invents
a drift). `advise()` now computes `val = rawVal + tierDrift`, and
`worth`/`max`/`planCap`/the deal threshold that picks LAST CHANCE vs
TARGET vs FAIR VALUE vs LET HIM GO all flow from that adjusted `val` --
not just a displayed side number. K/DEF is unaffected (still plan-driven
only, per ADR-0011 -- `td` is gated by the same `POSITIONS.includes`
check `comparable`/`drop` already used). The board's own My$/Bid$/+/-
columns are untouched; this only feeds the verdict inside THE BLOCK.
Every adjustment says why in plain language (the existing ADR-0011
principle): "tier running cold -$32 vs My$ (9 sold QBs) -- worth
adjusted from $39 to $7."

Caught and fixed my own inconsistency while verifying: THE BLOCK's price
scale (target tick, and the lo/hi range around it) still used the raw
pre-draft numbers even after the verdict above it was adjusted -- e.g.
"worth $7" at the top while the scale below still showed "target $39" in
a $36-$42 range. Fixed by having `advise()` return `td` alongside
`worth`, and having the scale use `a.worth` for the target and shift
`lo`/`hi` by the same drift, so the whole scale moves together instead
of just the headline number.

Verified live end-to-end against real recorded sales (9 sold QBs
averaging $32 under their My$): worth, the reason text, the scale's
target tick, and the shifted $4-$10 range all agreed exactly ($39 ->
$7). Separately confirmed K/DEF picks up zero tier-drift reasoning and
stay exactly plan-driven, matching pre-existing ADR-0011 behavior. No
console errors. Bumped V69 -> V70.

---

## 2026-09-02 -- AVG TIER as its own number in THE BLOCK

Collin: "avg Tier price should be a value in THE BLOCK." The hero row
already had FAIR (adjusted worth) and PEAK (tier ceiling), but neither
is literally "what did this tier actually sell for" -- FAIR is the
model's recalibrated estimate, not the raw observed number. Added
`avgPrice` to `tierDrift()`'s return (the plain average of the sold
comps' actual sale prices, alongside the existing drift-vs-My$ average)
and a third hero-row line, "AVG TIER $X", shown whenever there are
comps.

Verified live: 9 sold QBs averaging $32 under their own My$ (the
existing drift) resolved to AVG TIER $8, consistent with those same
comps having averaged roughly $40 My$ themselves ($8 - (-$32) = $40,
in the right range for mid-tier QBs) -- not just plausible-looking, the
arithmetic actually ties out. Three stacked hero-row lines render
cleanly with no layout break, no console errors. Bumped V70 -> V71.

---

## 2026-09-02 -- Fixed: sw.js's own install step was as vulnerable to CDN staleness as the Sleeper fix from earlier today

Collin, on mobile, asked me to verify V71 myself. Did: checked the live
site's service worker directly and found something worse than a normal
lag -- `caches.keys()` showed the cache correctly renamed to
`liquid-sheets-v71` (the version-bump mechanism itself worked), but the
gear menu still read "V64" and the board showed pre-V65 layout. The
cache had the right NAME but stale CONTENTS.

Root cause: `install`'s `c.add(u)` is a plain `fetch(u)` with no
cache-busting, exactly as vulnerable to GitHub Pages' own CDN (Fastly)
serving a stale edge copy as the Sleeper API calls were before today's
earlier fix (`live_draft.js`'s `noCacheFetch`) -- confirmed live: a
fresh `curl` of the same URL right now correctly returns V71 content, so
the origin is fine; it's specifically what the service worker's install
fetch received, whenever that install ran, that was stale. Bumping
`CACHE` guarantees a new install cycle starts; it never guaranteed that
cycle's own fetches would get fresh bytes.

Fixed the same way as the Sleeper case: added a cache-busting query
param to each shell file's install-time fetch. `CACHE` itself doubles as
the buster (already unique per deploy) -- fetched with `?_sw=<CACHE>`,
stored under the clean URL, so the fetch handler's `caches.match(req)`
still finds it on normal requests. `{cache: "no-store"}` added too, same
belt-and-suspenders as the Sleeper fix.

Real-world impact: anyone who loaded the app during an unlucky CDN
window could be stuck on old content indefinitely, with no way to tell
from the app itself (the gear menu's version number IS the file that
was stale). Recovery for anyone already stuck: clear that site's
browser data (works without devtools, including on mobile) and reload
-- the fixed install logic then runs clean. Bumped V71 -> V72.

---

## 2026-09-02 -- Recent Bids moved into THE BLOCK, right-aligned

Collin: "the bids are supposed to be embedded in THE BLOCK on the right
side, right aligned. Is that not what's happening?" It wasn't -- I'd put
it in the rail instead, on my own judgment (reasoning that an
always-visible activity log made more sense than one that disappears
with staging). That was my call to make differently than asked; checked
back and he confirmed he wants it in THE BLOCK regardless of that
tradeoff.

Moved it: removed the rail panel entirely, added `.blk-bidfeed` as a
third column inside `#theblock` (alongside the photo and body), right-
aligned text, narrow fixed width. `renderBidFeed()` (used to target the
rail's `#bidfeedlist` directly) became `bidFeedHtml()`, a pure markup
generator `renderBlock()` calls -- no separate render pass needed, since
`renderBlock()` already re-runs via `updateSummary()` every time a bid
lands. The underlying feed itself (global, persisted to localStorage) is
unchanged; only where it's visible changed -- it now shows only while a
player is staged, same as the rest of THE BLOCK, which is the accepted
tradeoff.

Verified live: "RECENT BIDS" renders top-right of THE BLOCK correctly
right-aligned, confirmed the rail's old panel and `#bidfeedlist` element
are both gone, confirmed the feed still reads its existing persisted
data correctly, confirmed THE BLOCK (and the feed with it) fully hides
on Escape/unstaging as expected. No console errors. Bumped V72 -> V73.

---

## 2026-09-02 -- New PLAYER tab: the roto stat line behind My$

Grew out of the Sleeper-value investigation above: Collin asked to pull
the roto projections into a table. Considered putting it inside THE
BLOCK (a row, or a literal middle column), but recommended against it --
THE BLOCK already has a lot competing for attention (verdict, hero
number, roster-fit, reasons, scale, bid feed) and a real stat table
needs room a squeezed row/column can't give it. Collin proposed a third
tab instead, which is what got built: a "PLAYER" tab next to BOARD/
TEAMS, showing whoever is currently staged. Confirmed with two quick
questions rather than assuming: empty state (not last-viewed player)
when nothing's staged, and manual tab switching only (staging never
auto-jumps you off the board mid-auction).

New `rawStatsFor(pid, pos)` looks up the raw roto stat line from
`doc.sources` -- the same numbers My$ is scored from, just not yet
converted to points/dollars (engine.js's own output deliberately doesn't
carry `stats` forward, so this reads from the source data directly
rather than touching the engine). Position-appropriate columns fall out
for free: `sleeper.js` only ever writes a stat key when Sleeper actually
projected it for that position, so there's no per-position column list
to maintain -- a QB's line simply never has receiving keys and vice
versa.

Verified live: staged a QB (Brock Purdy) and confirmed a full passing +
rushing table with no receiving row; staged a WR (Garrett Wilson) and
confirmed the reverse (receiving + a small rushing package, no passing);
confirmed the empty state shows correctly with nothing staged; confirmed
switching to BOARD/TEAMS and back doesn't disturb THE BLOCK above it.
No console errors. Bumped V73 -> V74.
