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
