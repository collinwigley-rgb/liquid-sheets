---
status: accepted
date: 2026-09-01
decision-makers: Levi Zortman
consulted: []
informed: []
related: "[ADR-0009](0009-my-dollar-and-bid-dollar-are-separate-inputs.md), app/app.js advise(), app/plan.js planFit()"
---

# The verdict is roster-aware: position scarcity does not force LAST CHANCE for a slot you no longer need

## Decision

When the nominated player's own starter slot is already filled on the user's roster and the only open slot he can take is the FLX, the LAST CHANCE cliff (position-market scarcity plus rival demand) is suppressed. The player is judged on the deal instead (TARGET / FAIR VALUE / LET HIM GO), a plain reason states that his position is filled and he only fits the FLX or bench, and the actionable ceiling is capped at that FLX envelope plus the reserve. The player's `worth` is never reduced: it stays his full model value. The ceiling, when it sits below `worth`, is shown as a separate "spend up to $X" line with a plain-language reason, not a bare "capped."

## Context and Problem Statement

The Call verdict (`advise()`) computed the LAST CHANCE label from `comparable` (unsold same-position peers within $5) and `contest` (funded rival owners still needing the position or a FLX). Neither term looks at the user's own roster; `contest` explicitly excludes the user. So a user whose TE starter was already filled (say Kelce) could nominate a second premium TE (McBride) and be told LAST CHANCE at full value, purely because the TE market was thin and rivals still needed one. That is the wrong signal for that user: they do not need a TE, their only open slot is FLX, and an RB or WR fills FLX just as well. The urgency was real for the room, not for the user's needs. Worse, the LAST CHANCE branch set `max = val`, bypassing the plan envelope, so it pushed full position value for what was, to the user, a FLX luxury.

The audit confirmed the private predecessor (`levi-sheet/draftroom/app.html`) has the identical behavior; this is a shared design flaw, not a porting regression. A second, smaller divergence surfaced: the public port had dropped the `Math.min(val, envMax)` ceiling on the TARGET / FAIR VALUE / LET HIM GO branches that the predecessor kept.

## Decision Drivers

* The verdict must answer "should I buy him, for my roster" not "is his position scarce in the abstract"
* A scarcity cliff only creates urgency for a slot the user still needs; when the user has substitutes (FLX fillable by RB/WR/TE), the single-position run is not their cliff
* `worth` stays the user's independent value for the player (ADR-0009 lineage: My$ is never bent by roster or market); only the actionable ceiling reflects roster fit and budget
* The ceiling's explanation must be legible to a stranger; "capped" is jargon that hides the reason

## Considered Options

* Leave as-is (LAST CHANCE as a pure position-market signal regardless of the user's roster)
* Price-cap only: keep the LAST CHANCE label but stop that branch from bypassing the envelope cap
* Roster-aware: suppress the cliff when the player is FLX-only for this user, judge on the deal, cap the price, and explain it in plain words

## Decision Outcome

Chosen option: **roster-aware.** A `flexOnly` flag (the player's eligible open starter slots are all FLX) suppresses `cliffPressure`, so the verdict falls through to the deal-based labels; a reason line names the filled position and the RB/WR substitute; and the `Math.min(val, envMax)` ceiling is restored on all deal branches (fixing the port divergence too). The Call card now shows `worth` as the full model value and, only when the ceiling is lower, a separate "spend up to $X" line whose small-print reason is one of: "FLX and reserve money, hold your RB and WR options", "bench only, no starter slot open", "the budget you have left", or "your plan's room for this slot".

### Consequences

* Good, because a filled-position user is no longer told to overpay for a positional need they have already met
* Good, because `worth` and the actionable ceiling are now two clearly labeled numbers with a plain reason, not one conflated figure
* Good, because it repairs the dropped envelope cap on the TARGET / FAIR VALUE / LET HIM GO branches
* Neutral, because a genuine cliff still fires LAST CHANCE whenever the user's own direct starter slot is still open
* Bad, because the private predecessor keeps the old behavior (it is intentionally untouched), so the two tools now differ here by design

### Confirmation

Verified live against the 1/3-draft mock (`mock-draft-1-3.json`), where "me" holds Kelce at TE with FLX open: Trey McBride and George Pickens now read FAIR VALUE with the roster reason instead of LAST CHANCE; a forced BENCH ONLY case renders "spend up to $2, bench only, no starter slot open" while `worth` stays $38. The acceptance gauntlet passed 20/20 with no console errors. The valuation engine is untouched, so the golden master is unaffected (the verdict lives in `app/app.js`, not `engine/engine.js`).

## Approval Checklist

- [x] Reviewed by: Levi Zortman (working session, 2026-09-01)
- [x] Approved by: Levi Zortman
- [x] Status updated to accepted
