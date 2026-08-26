---
status: accepted
date: 2026-08-25
decision-makers: Levi Zortman
consulted: []
informed: []
related: "[ADR-0004](0004-one-app-plus-post-launch-power-kit.md), [PRODUCT-SCOPE](../../PRODUCT-SCOPE.md)"
---

# The AI live read ships as an optional self-hosted companion server, not in the hosted app

## Decision

The hosted browser app contains zero AI: no API-key field, no toggle, no live-read element, and no AI network call. The "reading the room" copilot instead ships in the open-source repo as an optional companion server (`copilot-server/`) that a developer runs against their own AI; the static app lights it up only when a self-hoster sets `AI_ENDPOINT` in `app/config.js`. We chose this over an in-app bring-your-own-key path because requiring end users to paste an API key is a worse product than shipping no AI at all.

## Context and Problem Statement

The predecessor's copilot is server-mediated: the browser posts to a local server that shells out to the author's own Claude access. A static, browser-only app has no server. The open question from [ADR-0004](0004-one-app-plus-post-launch-power-kit.md) and PRODUCT-SCOPE was how (or whether) to bring the live read across. The candidate was an in-app BYO-key call direct from the browser.

Levi's call: if the only way to offer AI is to make users bring a key, drop the feature from the app entirely and give developers a self-host path instead.

## Decision Drivers

* A pasted-API-key UX is friction and a support burden for a free, offline-first tool
* The hosted app's identity is "nothing leaves your browser but the data you fetch yourself"; default-on AI would break that promise
* The predecessor's copilot is already a server + prompts, which ports cleanly to a self-hostable companion
* Publishing the server and prompts is portfolio material, consistent with ADR-0004's power-kit spirit
* One hosted build to test and keep honest, with the AI surface fully absent from it

## Considered Options

* In-app BYO-key AI, default off
* No AI anywhere
* No AI in the hosted app; an optional self-hosted companion server in the repo

## Decision Outcome

Chosen: no AI in the hosted app; an optional self-hosted companion server. The app guards every AI code path on `config.AI_ENDPOINT`; when null (the hosted default), `copilot.js` is never imported, `#liveread` never renders, and no gear control appears. A self-hoster runs `copilot-server/` (a database-free port of the predecessor's copilot slice) against their own `claude` CLI or API key and points the app at it. This resolves the DEFERRED "live reading the room (BYO API key in-app)" row in PRODUCT-SCOPE.

### Consequences

* Good, because the hosted app keeps its no-data-leaves-your-browser promise and its offline identity intact
* Good, because the copilot, its prompts, and its two modes are published for developers to run and study
* Bad, because only developers who can run a small server get the live read
* Neutral, because the deterministic flow strip (no AI) still ships and gives the room-currents value to everyone

### Confirmation

Grep the hosted build with `AI_ENDPOINT = null`: no `#liveread` in the served DOM, no key field, no copilot gear entry, and a full draft runs with no network calls beyond the user's own Sleeper/import fetches. With `AI_ENDPOINT` set to a running `copilot-server/`, staging a player populates `#liveread`.

## Approval Checklist

- [x] Reviewed by: Levi Zortman (working session, 2026-08-25)
- [x] Approved by: Levi Zortman
- [x] Status updated to accepted
