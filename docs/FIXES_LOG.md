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
