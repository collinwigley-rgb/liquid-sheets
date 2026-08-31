---
status: accepted
date: 2026-08-31
decision-makers: Levi Zortman
consulted: ["r/fantasyfootball commenters (public skepticism prompted the check)"]
informed: []
related: "[verify/prior/](../../verify/prior/README.md), app/prior_2026.js"
---

# Regularize the availability prior: shrink the underpowered slot gradient

## Decision

The shipped availability prior shrinks each position's per-slot games-missed curve 50% toward that position's top-24 mean. The engine still fades projections by `(17 - expected_missed) / 17`; the values it reads are now regularized so the tool asserts only the amount of slot-level structure the data supports.

## Context and Problem Statement

The availability fade discounts each projection by its draft slot's expected games missed, built from nflverse games x FantasyFootballCalculator ADP over 11 seasons (2015-2025). Public skepticism (a Reddit thread) claimed it was small-sample noise. A season-cluster bootstrap (`verify/prior/bootstrap_availability.py`, 5000x) tested it honestly and confirmed a real tension: the **position-level** effect (RBs miss more games than WRs) is robust and replicates across independent analyses (~19% RB from two analysts), but the **slot-by-slot gradient** (which RB is riskiest) is underpowered. RB1-3 vs the RB5-10 trough is ~2 games, but two-sided p ~ 0.13 and per-slot empirical Bayes puts the shrinkage factor near 0.2-0.3. The tool was asserting more per-slot precision than 11 noisy seasons can support, which violates the parsimony doctrine (do not put unsupported precision inside the number).

## Decision Drivers

* Match the treatment to the evidence: keep what replicates (position level), damp what does not (slot gradient), drop what is noise (exact per-slot decimals)
* Because dollar values are relative, a uniform position-level discount largely cancels; the board effect of the fade comes almost entirely from the *gradient*, so the shrink factor is effectively "how much of the unproven gradient to apply"
* Honesty over feature strength: a plausible-but-unconfirmed effect should be applied modestly, not asserted
* Keep it a toggle either way (ADR-0006 lineage: adjustments are inspectable and optional)

## Considered Options

* Keep the full per-slot curve (asserts precision the data lacks)
* Drop the fade / default it off (loses the robust position-level effect too)
* Shrink each position's curve toward its own top-24 mean, by a fixed fraction
* Full per-slot empirical Bayes (factor ~0.2, leaving the curve nearly flat)
* Collapse to explicit tier means (introduces step discontinuities)

## Decision Outcome

Chosen option: **shrink 50% toward the top-24 position mean.** Per-slot empirical Bayes alone would shrink harder (~0.2-0.3: the slot detail is mostly noise), but it treats each slot independently and under-credits the coarse tier structure, which is marginally real (RB1-3 vs RB5-10 one-sided p ~ 0.05; a posterior effect-keep of ~0.7). K = 0.5 is the transparent middle: it halves the slot precision that cannot be defended while preserving the tier-level tilt the data does support. Shrinking toward each position's own mean preserves the cross-position difference (kept) and compresses the within-position gradient (damped). The method lives in `verify/prior/` and regenerates `app/prior_2026.js`; the fade remains a toggle, on by default.

### Consequences

* Good, because the shipped values now match the strength of the evidence, and the in-app explanation can be honest ("position level solid, slot level shrunk, still optional")
* Good, because elite RBs are no longer over-penalized or over-separated on injury risk the model cannot actually distinguish (e.g. RB1 fade ~26% -> ~22%; the top backs rise and compress)
* Bad, because K = 0.5 is a judgment call, not a formal optimum; it is documented and auditable rather than derived
* Bad, because the raw licensed data stays private, so a full re-run needs bring-your-own data (the method is public in `verify/prior/`, the data is gitignored, same split as the golden master)

### Confirmation

The golden master is unaffected because it reads the prior from its fixture, not from `app/prior_2026.js` (it tests engine correctness, not the prior values); it still passes zero-diff. The gauntlet passed 20/20 on the regenerated prior. The before/after fade percentages and the top-RB compression were verified on the live board. The uncertainty that motivated this is reproduced by `verify/prior/bootstrap_availability.py`.

## Approval Checklist

- [x] Reviewed by: Levi Zortman (working session, 2026-08-31)
- [x] Approved by: Levi Zortman
- [x] Status updated to accepted
