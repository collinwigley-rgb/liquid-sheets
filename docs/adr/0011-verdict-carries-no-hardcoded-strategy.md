---
status: accepted
date: 2026-09-01
decision-makers: Levi Zortman
consulted: []
informed: []
related: "[ADR-0010](0010-roster-aware-verdict-scarcity.md), app/app.js advise(), app/plan.js"
---

# The verdict carries no hardcoded strategy: K/DEF spend is set by the budget plan

## Decision

The Call verdict does not assert draft strategy of its own. The special case that forced kickers and defenses to a $1 ceiling with a "never bid $2" bullet is removed. A K or DEF is now valued at the budget plan's own allocation for that slot (the purse spread that already sets DEF ~$3, K ~$1, both editable), shown as a neutral FAIR VALUE with the reason "your budget plan sets ~$X here". When no budget plan exists, the verdict falls back to a soft $1 suggestion ("late-round spot; ~$1 is typical unless your plan says otherwise"), never an emphatic rule.

## Context and Problem Statement

`advise()` had a hardcoded branch: for K/DEF it set `max = 1`, `planCap = 1`, labelled the chip "$1 RULE", and pushed the bullet "kickers and defenses are $1 players; never bid $2". This is a strategy opinion, and it overrode the tool's own budget plan. The plan layer (`app/plan.js`) already allocates K and DEF through its purse bucket, defaulting DEF up to ~$3 and K ~$1 and letting the user edit both. The hardcode ignored that allocation and spoke over it. In a bring-your-own-strategy tool that separates the model's value from the user's plan (ADR-0009), asserting a fixed dollar rule in the verdict is out of place: how much to spend on K/DEF is the owner's call, and the place that call is expressed is the budget plan.

## Decision Drivers

* The verdict should report the numbers (value, plan, market), not impose a strategy the owner did not choose
* The budget plan is the single home for spend strategy; the verdict must defer to it, not contradict it
* Removing the branch naively would misroute K/DEF into the BENCH ONLY path (K/DEF are not "starters" in the plan model; they live in the purse), so they must be explicitly routed to their own plan allocation
* Keep a sensible, non-preachy default for the rare no-plan state

## Considered Options

* Keep the hardcoded $1 rule (asserts strategy, overrides the plan)
* Delete the branch (misroutes K/DEF to BENCH ONLY)
* Route K/DEF to their budget-plan slot allocation, neutral label, soft $1 only when no plan is set

## Decision Outcome

Chosen option: **plan-driven, neutral.** The K/DEF branch looks up the open plan slot for that position and uses its effective envelope (`slot.eff`) as both `worth` and the ceiling, with `planCap = min(envK, myMax)`, a FAIR VALUE label, and the reason "your budget plan sets ~$X here". If market values are imported, the existing "room bids ~$X" line still appears. With no plan (`ps.hasPlan` false) it shows a soft $1 and the "typical unless your plan says otherwise" nudge. Because a default plan auto-seeds as soon as projections load (`app/app.js`), the plan-driven path is what users actually see; the soft-$1 fallback is a safety net for the pre-projections state, when K/DEF are not nominatable anyway.

To support this, `advise()` gained a `worth` variable (defaulting to the model value `val`, overridden by K/DEF to the plan number) so the displayed value can differ from the skill-position model value. The "spend up to" ceiling reason was also generalized to name the binding constraint (budget vs roster vs plan) rather than excluding K/DEF.

### Consequences

* Good, because spend strategy lives in one place (the budget plan) and the verdict stops contradicting it
* Good, because a user who budgets $4 for a defense is no longer told "never bid $2"
* Good, because the K/DEF ceiling now reacts to the user's edits to their plan
* Neutral, because the default plan still seeds DEF ~$3 / K ~$1, so out of the box the guidance is similar in spirit, just no longer a hard rule and now editable
* Bad, because the private predecessor keeps the old "$1 RULE" (it is intentionally untouched), so the two tools differ here by design

### Confirmation

Verified live against the 1/3-draft mock (`mock-draft-1-3.json`): nominating the Rams and Texans defenses now reads FAIR VALUE, worth $3, "your budget plan sets ~$3 here", with no "$1 RULE" chip or "never bid $2" bullet anywhere. The acceptance gauntlet passed 20/20 with no console errors. The valuation engine is untouched, so the golden master is unaffected (the verdict lives in `app/app.js`, not `engine/engine.js`).

## Approval Checklist

- [x] Reviewed by: Levi Zortman (working session, 2026-09-01)
- [x] Approved by: Levi Zortman
- [x] Status updated to accepted
