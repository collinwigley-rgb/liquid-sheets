# sleeper.md -- Money_Talks Sleeper data (read this before asking Collin anything)

Pulled live from the public Sleeper API on 2026-09-02. No auth needed --
Sleeper's API is fully public/unauthenticated for read access. If a fact
below looks stale (rosters/keepers can change before Friday), re-fetch the
relevant endpoint rather than asking Collin to re-paste it.

**Everything an agent needs to unlock all of this starts from one fact:**
Collin's Sleeper username is `mondo_duke`.

```
GET https://api.sleeper.app/v1/user/mondo_duke
-> user_id: 462234296409649152

GET https://api.sleeper.app/v1/user/462234296409649152/leagues/nfl/2026
-> lists both of Collin's 2026 leagues, including Money Talks
```

## Money_Talks league identity

| Field | Value |
|---|---|
| league_id (2026) | `1389342583871766528` |
| previous_league_id (2025 season) | `1255739715391324161` |
| draft_id | `1389342583871766529` |
| name | Money Talks |
| status | `pre_draft` |
| season | 2026 |
| Collin's roster_id | 2 (team name "Back Akers", owner_id `462234296409649152`) |

## Draft facts (from `GET /v1/league/1389342583871766528/drafts`)

| Field | Value |
|---|---|
| type | **auction** |
| budget | **$200** per team |
| teams | 12 |
| rounds (= total roster spots incl. bench) | 18 |
| slots_bn (bench) | 8 |
| nomination_timer | 30s |
| pick_timer | 15s |
| enforce_position_limits | true |
| **start_time** | `1788564600000` ms epoch = **Friday, 2026-09-04, 6:30 PM America/Chicago** |
| status | `pre_draft` |

Re-fetch `GET /v1/league/1389342583871766528/drafts` close to Friday --
this is where you'd also find a live/in-progress draft object with
picks once the auction starts (see "Live draft read" below).

## Roster shape (`roster_positions` on the league object)

```
QB, RB, RB, WR, WR, TE, FLEX, SUPER_FLEX, IDP_FLEX, IDP_FLEX,
BN, BN, BN, BN, BN, BN, BN, BN
```

18 slots total: 6 offense starters (QB/RB/RB/WR/WR/TE) + 1 FLEX (offense
skill positions) + 1 SUPER_FLEX (QB/RB/WR/TE) + 2 IDP_FLEX (any IDP
position) + 8 bench. This is the real, authoritative shape for issue #1
(superflex + 2 IDP-flex auction math) -- no further confirmation needed
from Collin, it's already a live read.

## League settings of note

| Field | Value |
|---|---|
| max_keepers | **1** (one keeper per team) |
| keeper_deadline (league metadata, raw value) | `"14"` -- meaning unconfirmed (could be a week number or day-of-month code); ask Collin only if the exact deadline date actually matters for something you're building |
| waiver_budget (FAAB) | 100 -- irrelevant to the auction sheet, don't confuse with the $200 draft budget above |
| trade_deadline | week 13 |
| playoff_teams | 6, starting week 15 |
| scoring_type (draft metadata) | `"idp"` |

## Scoring settings -- FULL, authoritative (`GET /v1/league/1389342583871766528`, `.scoring_settings`)

This is the real answer to issue #2 (pull league scoring from Sleeper) and
the source for issue #4's per-stat weights. Non-zero/non-default values
only shown below with a name; anything not listed is 0 in this league.
Refetch the same endpoint for the raw JSON if a field's exact float
matters (a couple are stored as `0.10000000149011612` etc. due to
float32 -- round to 2 decimals when displaying, don't hardcode the raw
float).

**Passing:** pass_yd 0.04/yd, pass_td 4, pass_int -1, pass_int_td -2,
pass_2pt 2

**Rushing:** rush_yd 0.10/yd, rush_td 6, rush_2pt 2

**Receiving (full PPR):** rec 1.0, rec_yd 0.10/yd, rec_td 6, rec_2pt 2

**Fumbles:** fum_lost -2, fum_rec_td 6

**IDP (this league is IDP-scored -- draft metadata literally says
`scoring_type: "idp"`):**
- idp_tkl_solo 1.5, idp_tkl_ast 1.0, idp_tkl_loss 1.0 (idp_tkl itself is 0
  -- solo/assist/loss are what actually score, not a flat tackle number)
- idp_sack 3.0, idp_qb_hit 1.0
- idp_int 5.0, idp_int_ret_yd 0.10/yd
- idp_ff (forced fumble) 3.0, idp_fum_rec 2.0, idp_fum_ret_yd 0.10/yd
- idp_pass_def 2.0, idp_blk_kick 2.0, idp_safe 2.0, idp_def_td 6.0

**Special teams:** st_td 6.0, st_fum_rec 1.0, st_ff 1.0

**Kicking:** every fgm_* and xpm/xpmiss field is **0** -- this league does
not roster/score kickers via the standard fields (consistent with no `K`
slot in roster_positions above). Don't build kicker-value logic for this
league.

**Team defense (`pts_allow_*`, `def_td`, `def_st_*`):** all **0** -- this
league does not use the DEF-as-a-position scoring model either (again
consistent with no `DEF` slot in roster_positions; IDP replaces it).

## Owners / teams (roster_id is the stable join key)

| roster_id | Sleeper username | Team name | user_id |
|---|---|---|---|
| 1 | bartbeck507 | LaPorta Potty | 715419267251658752 |
| 2 | **mondo_duke (Collin)** | Back Akers | 462234296409649152 |
| 3 | ajp13 | Pacheckin her out | 600201553692925952 |
| 4 | lukelangan | lukelangan | 463524879375790080 |
| 5 | brycemalecha | Jettin' Magic | 718711016963280896 |
| 6 | millerjtm | Blood, Sweat and Beers | 718827614227214336 |
| 7 | abecker7 | Game of Mahomes | 558198757760806912 |
| 8 | JackM76 | Peekegbuka | 374399904665374720 |
| 9 | csweeney311 | Lights Out | 719654604589060096 |
| 10 | MNDodger | Skol | 652940310254526464 |
| 11 | mhauck | Gibb Me My Money | 615985314078748672 |
| 12 | MoNami21 | (no custom team name) | 1389753365591777280 |

## Keepers -- authoritative cost is in the DRAFT, not the roster

`.keepers` on each roster (`GET /v1/league/.../rosters`) only tells you
*who* is kept. The real keeper **cost** lives as pre-filled `is_keeper:
true` picks on the actual draft board itself:

```
GET https://api.sleeper.app/v1/draft/1389342583871766529/picks
```

Each keeper pick's `metadata.amount` is the real $ cost, already
deducted from that team's $200 budget for the real draft. Ignore the
roster `p_nick_<player_id>` metadata entirely for cost purposes -- it's
an unrelated, informally-set nickname field (only 5 of 11 had one, and
even those turned out to just coincidentally match, not the source of
truth). **This table is now complete and authoritative** -- issue #3 no
longer needs anything further from Collin.

| roster_id | Team | Kept player | Real cost (`metadata.amount`) |
|---|---|---|---|
| 1 | LaPorta Potty | Jaxon Smith-Njigba (WR, SEA) | $26 |
| 2 | Back Akers (Collin) | Colston Loveland (TE, CHI) | $4 |
| 3 | Pacheckin her out | Jaxson Dart (QB, NYG) | $3 |
| 4 | lukelangan | Kyle Pitts (TE, ATL) | $1 |
| 5 | Jettin' Magic | Romeo Doubs (WR, NE) | $1 |
| 6 | Blood, Sweat and Beers | Jaylen Waddle (WR, DEN) | $7 |
| 7 | Game of Mahomes | George Pickens (WR, DAL) | $10 |
| 8 | Peekegbuka | Chris Olave (WR, NO) | $3 |
| 9 | Lights Out | Rico Dowdle (RB, PIT) | $1 |
| 10 | Skol | Javonte Williams (RB, DAL) | $1 |
| 11 | Gibb Me My Money | (none) | -- |
| 12 | (MoNami21) | Cam Skattebo (RB, NYG) | $4 |

For each team, **remaining draft budget = $200 - keeper cost** (or $200
flat for roster 11, no keeper). This is exactly what issue #3's "deduct
keeper cost from budget" behavior should compute from.

Note: the same picks endpoint also has one **non-keeper** pick already
present -- `pick_no 11`, Travis Etienne to roster 11 (mhauck), `is_keeper:
false`, `amount: "2"`. That looks like a real completed pick already on
the board (possibly from Collin's mock-draft testing bleeding into this
data, or an actual pre-draft board seed) -- worth a sanity check with
Collin rather than assumed to be a second keeper for that team.

Re-fetch the picks endpoint close to Friday -- keeper amounts could
still be corrected before the deadline.

## Traded picks (`GET /v1/league/1389342583871766528/traded_picks`)

Two rosters have swapped their entire future first-through-seventeenth
round pick sets both ways: roster 3 (ajp13) <-> roster 8 (JackM76), for
both 2026 and 2027. This is snake-draft-style pick trading Sleeper still
tracks even in an auction league; almost certainly irrelevant to the
auction sheet itself (auction drafts don't use draft-round picks the same
way), but noted here so nobody is confused if it shows up in a raw API
pull. Skip unless a real need for it turns up.

## Live draft read / mock draft room (issues #5, #6)

- Real draft: poll `GET /v1/draft/1389342583871766529` (status flips from
  `pre_draft` to `drafting` to `complete`) and
  `GET /v1/draft/1389342583871766529/picks` for the live pick list once
  it starts. This mirrors the read-only pattern FantasyEngine's own
  `api/lib/live-draft.ts` already uses against Sleeper.
- **Mock draft, live now (as of 2026-09-02): `draft_id 1400867924423528448`.**
  Started by Collin from the Sleeper app (`type: "league_mock"`,
  `metadata.league_id` points back at the real Money_Talks league),
  `status: "drafting"`. Same endpoints as the real draft, just a
  different draft_id:
  `GET /v1/draft/1400867924423528448` and
  `GET /v1/draft/1400867924423528448/picks`. CPU-drafts the other 11
  teams automatically (`draft_order` only lists Collin's user_id), so
  it's a good target to build/test the live-read polling code against
  right now without waiting for Friday.
- The mock's first 11 picks are byte-for-byte the same 11 keepers as the
  real draft (same amounts, same players), **including the Travis
  Etienne / roster 11 anomaly noted above at the same slot** -- since the
  mock is seeded from the real league's board, this confirms that pick
  already existed on the real draft before the mock was started, not
  caused by it. Still worth Collin double-checking directly in Sleeper,
  but it's not mock-bleed-through.
- This mock draft_id is temporary/session-specific -- don't hardcode it
  as a permanent fixture; treat it as a live example to build the
  polling logic against, and expect Collin to start fresh ones as
  needed.

## Full player database (names, positions, teams)

`GET https://api.sleeper.app/v1/players/nfl` returns ~14 MB of every NFL
player Sleeper knows, keyed by player_id (the same IDs used in
`rosters[].players` / `.keepers` above). Sleeper's own guidance is to
call this **at most once per day** and cache the result -- don't refetch
it inside a loop or on every page load. It has no query/filter
parameters; fetch once, keep the file, look up by player_id locally.

## API etiquette

Sleeper's API has no published hard rate limit but their own guidance is
to stay under roughly 1000 calls/minute and to cache aggressively
(especially the players endpoint above). Nothing in this project comes
close to that ceiling under normal use -- just don't poll the live-draft
endpoints faster than once every few seconds during the real draft.
