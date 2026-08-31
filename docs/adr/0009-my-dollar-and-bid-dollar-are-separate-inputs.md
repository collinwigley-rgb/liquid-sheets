---
status: accepted
date: 2026-08-30
decision-makers: Levi Zortman
consulted: []
informed: []
related: "[ADR-0003](0003-first-class-yahoo-and-espn.md), [PRODUCT-SCOPE](../../PRODUCT-SCOPE.md)"
---

# My$ and Bid$ are separate inputs; market values never enter the My$ blend

## Decision

Projections feed My$ (the model's own value). Yahoo and ESPN auction values are a separate "market values" import that becomes Bid$ (rescaled to the room's money supply) and the +/- deal column. Market values never enter the My$ blend. The import UI and the wizard make the user choose which of the two they are adding, and the chosen target overrides format auto-detection.

## Context and Problem Statement

The whole point of the tool is to compare *your* value (My$) against what the *room* will pay (Bid$) and surface the gap (the deal). Early on, a single "add data" flow auto-detected the format and could route pasted auction values into the projection blend. That quietly destroys the deal signal: if the market's prices become part of your value, you can no longer see where your value and the market disagree. Users also conflated the two conceptually.

## Decision Drivers

* My$ must be an *independent* estimate of value; contaminating it with market prices collapses the deal (the reason to use the tool)
* Yahoo/ESPN values are auction dollars, not projections; they are not a source of point projections at all
* Format auto-detection is convenient but must not silently choose the wrong bucket
* First-class Yahoo/ESPN support (ADR-0003) means the market path deserves its own clear place in the flow

## Considered Options

* One import that auto-detects and routes (convenient, but silently mixable)
* Two explicit targets chosen up front: My$ projections vs Market values (Bid$)

## Decision Outcome

Chosen option: **two explicit targets.** The Add-data panel opens with two cards ("My$ projections" and "Market values (Bid$)"), and the setup wizard has a dedicated Projections step and a separate optional Market step. The chosen target overrides detection so a values file can never slip into the blend and a projections file can never be treated as market. Market values live in `doc.market`, shown as mkt$ / bid$ / +/-; they are rescaled to the league's money supply so the comparison is apples to apples regardless of the pasted scale.

### Consequences

* Good, because the deal signal stays clean: My$ is always the user's independent value, Bid$ is always the market
* Good, because the split is teachable and shows up in the flow (a Market step, a Market card), so users understand there are two different things
* Bad, because it is one more decision at import time instead of a single paste-and-go
* Bad, because a user who genuinely wants to blend a platform's *projections* (not its auction values) must pick the projections target explicitly

### Confirmation

The wizard has separate Projections and Market steps; the Add-data panel has two target cards; the "values from" run selector's add path defaults to a projections source. The deal column (+/-) only appears once market values are imported, and it reads My$ minus Bid$.

## Approval Checklist

- [x] Reviewed by: Levi Zortman (working session, 2026-08-30)
- [x] Approved by: Levi Zortman
- [x] Status updated to accepted
