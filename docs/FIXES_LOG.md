# Fixes log (streaming)

Append-only running record of real fixes/corrections made to this fork
during the Friday-draft build, and why -- not a duplicate of GitHub issue
history, but the place to see *reasoning that changed* across the build
(a decision made, then revised) in one place without digging through
commit messages. Newest entry at the bottom. Don't edit past entries;
add a new one that supersedes it and say so.

---

## 2026-09-02 -- Superflex/IDP baseline methodology, corrected after comparing against FantasyEngine's own measured data

**What shipped first (commit e5c133a, issue #1):** engine.js gained
`superFlexShares()` (a guessed 60% QB / 40% skill-position split for the
SUPER_FLEX slot) and continuous IDP VBD (`scoreIdpStatLine` +
`idpFlexShares()`, an even 1/3 DL/LB/DB split), both formulaic
approximations with no measured basis.

**What was wrong with it:** Collin asked for a direct comparison against
Levi's (upstream) methodology, suspecting it was better. The real answer
turned out to be more specific than that:

1. **Offense baselines (QB/RB/WR/TE):** FantasyEngine's own
   `config/vorp_baselines.R` already has Money_Talks' replacement ranks
   **measured from 3 real seasons (2023-2025) of this exact league's
   draft/spend history** -- QB 32, RB 39, WR 54, TE 15 ("VOND": 1 + the
   real mean count of players actually paid above the $1 floor). Money
   Talks is already a superflex + 2-IDP-flex league in that data. My
   `superflex_qb_share = 0.6` was a plausible-sounding guess at the exact
   effect this measurement already captures directly. Real measured data
   beats a formula guessing at the same thing.
2. **IDP:** FantasyEngine's `calculate_vorp.R` explicitly does **not**
   compute continuous VBD for IDP -- a documented standing decision
   (comment in that file: "VORP is deliberately not computed for IDP...
   not a bug"), because there's no validated confidence for that kind of
   precision on IDP production. It uses simple two-tier fixed pricing
   instead ($3 for the top 24 IDPs by raw production, $1 for the rest),
   and a separately validated "smash-score" composite for IDP *tiering*
   (`calculate_idp_smash_tiers.R`, weights grounded in a real correlation
   analysis, not guessed). What I built was a third approach nobody had
   actually validated -- weaker than both real precedents, not stronger
   than either.

**Fix:** replaced both in engine.js --
- `baselines()` now accepts `mp.measured_baselines` (e.g.
  `{QB:32, RB:39, WR:54, TE:15}`) and uses it directly per position when
  present, instead of the formulaic superflex-share calculation. The
  formula stays as the fallback for a league with no measured data.
- Continuous IDP VBD/tiering removed from the dollar-value path.
  `valueBoard()` now takes `mp.idp_pricing = {slots_per_team, top_value,
  rest_value}` and prices IDP the same way `calculate_vorp.R` does: rank
  by raw production, top `teams * slots_per_team` get `top_value`,
  everyone else gets `rest_value`. The offense dollar pool is reduced by
  the real IDP spend first (mirrors `offense_auction_pool` in
  `calculate_vorp.R`), not silently split as if IDP were VBD-priced.

**Why keep the formula/VBD paths at all instead of just hardcoding
Money_Talks' numbers:** this fork may still see other leagues/seasons
without measured history; falling back to the formula (documented as an
assumption, not asserted as fact) is better than deleting the general
case. For Money_Talks specifically, `mp.measured_baselines` and
`mp.idp_pricing` are always set from the real config below, so the
fallback path never actually runs for the real draft.

**Money_Talks' real config now baked into the app (from
`config/vorp_baselines.R` and `calculate_vorp.R`):**
```
measured_baselines: { QB: 32, RB: 39, WR: 54, TE: 15 }
idp_pricing: { slots_per_team: 2, top_value: 3, rest_value: 1 }
```
