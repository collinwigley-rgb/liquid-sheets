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
