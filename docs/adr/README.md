# Architecture Decision Records

Decision records for Liquid Sheets (public). These record the *why* and the alternatives rejected. The first ADRs land in Phase 1 (audience and feature triage).

The private predecessor's ADRs are not copied here, but the practice is inherited from it.

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-0001](./0001-serious-hobbyist-auction-drafter-audience.md) | Build for the serious-hobbyist auction drafter, not the casual mass market | Accepted | 2026-08-18 |
| [ADR-0002](./0002-auction-only-no-snake.md) | Auction drafts only, stated proudly; snake drafts are explicitly out of scope | Accepted | 2026-08-18 |
| [ADR-0003](./0003-first-class-yahoo-and-espn.md) | Platform-agnostic core with first-class Yahoo and ESPN support | Accepted | 2026-08-18 |
| [ADR-0004](./0004-one-app-plus-post-launch-power-kit.md) | One app for everyone; the AI-savvy path ships as a post-launch power kit, not a second version | Accepted | 2026-08-18 |
| [ADR-0005](./0005-plain-structures-indexeddb-storage.md) | Store state as plain JS structures persisted to IndexedDB; no in-browser SQL | Accepted | 2026-08-18 |
| [ADR-0006](./0006-ai-copilot-self-hosted-companion-not-in-app.md) | The AI live read ships as an optional self-hosted companion server, not in the hosted app | Accepted | 2026-08-25 |

## Status Legend

| Status | Meaning |
|--------|---------|
| Proposed | Under review, not yet approved |
| Accepted | Approved and active |
| Rejected | Considered and declined |
| Deprecated | No longer applicable |
| Superseded | Replaced by a newer ADR |
