# Availability prior: method and reproduction

How `app/prior_2026.js` (expected games missed per positional draft slot) is
built, and how its uncertainty was measured. Same pattern as the golden master:
**the method is public here; the licensed raw data is not.**

Decision record: [ADR-0008](../../docs/adr/0008-regularize-availability-prior.md).

## What the prior is

For each position and preseason ADP slot, an expected number of games missed
(of 17). The engine fades each projection by `(17 - expected_missed) / 17`, so a
slot expected to miss more games is discounted more. It is by *slot*, not by
player; no individual's medical history is in it.

## Sources (bring your own; gitignored)

Put the cached CSVs in `verify/prior/data/` (gitignored, not redistributed):

- `ffc_adp_<year>.csv` - FantasyFootballCalculator 12-team ADP, columns
  `name,position,adp,fmt`, one file per year 2015-2025.
- `nflverse_games_<year>.csv` - nflverse games played, columns
  `name,position,games`, one per year.

These are openly licensed but are not committed, consistent with the project's
no-data-redistribution constraint. Pull them yourself to reproduce.

## Build

1. `bootstrap_availability.py` - reconstructs the raw per-(position, slot, year)
   missed-rate table, smooths it (5-slot centered rolling mean), and runs a
   **season-cluster bootstrap** (5000x, resampling the 11 seasons with
   replacement) to get a 90% band per slot and per tier. Writes
   `out/availability-bootstrap.{html,json}` and prints the tier confidence
   intervals. This is the honesty check: it shows the slot gradient is
   underpowered (RB1-3 vs RB5-10 is ~2 games but p~0.13 two-sided).

2. `shrink_prior.py` - reproduces the smoothed curve, then **regularizes** it:
   shrinks each position's per-slot curve 50% toward that position's top-24
   level (see ADR-0008 for why 50%), and writes `app/prior_2026.js`.

```
/usr/bin/python3 verify/prior/bootstrap_availability.py   # uncertainty + chart
/usr/bin/python3 verify/prior/shrink_prior.py             # regenerate the prior
```

Both need `numpy` and `pandas`. Fixed random seed, so the band and the shrunk
values are reproducible.

## Why regularized

The position-level effect (RBs miss more games than WRs) replicates across
independent analyses and is kept in full. The slot-by-slot gradient (which RB is
riskiest) is underpowered on ~11 noisy seasons, so half of it is shrunk away
rather than asserting precision the data does not support. Full rationale,
alternatives, and the statistics: [ADR-0008](../../docs/adr/0008-regularize-availability-prior.md).
