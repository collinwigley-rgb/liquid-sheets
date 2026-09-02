/* Read-only Sleeper live draft poll (issues #5/#6). Mirrors FantasyEngine's
 * own api/lib/live-draft.ts pattern: this module only ever reads Sleeper's
 * draft state -- it never creates, edits, or simulates a pick. It has no
 * write path back to Sleeper at all.
 *
 * The real Friday auction and Sleeper mock drafts share the exact same
 * endpoint shape (a mock just has a different draft_id, not a different
 * API) -- one function serves both #5 and #6. */

export function draftUrl(draftId) {
  return `https://api.sleeper.app/v1/draft/${draftId}`;
}
export function picksUrl(draftId) {
  return `https://api.sleeper.app/v1/draft/${draftId}/picks`;
}

/* Returns {status, type, slotToRosterId}. Throws on network failure.
 *
 * Corrected 2026-09-02 (see docs/FIXES_LOG.md): a Sleeper mock draft
 * leaves `roster_id` null on every pick and reports its own
 * `slot_to_roster_id` as a meaningless identity map (1:1, 2:2, ... --
 * verified live, and confirmed wrong by checking a real keeper against
 * the actual Sleeper mock UI). A mock created "from league settings"
 * reuses the real league's seating (same `draft_order` -- verified: a
 * real user sits at the same slot number in the mock as in the real
 * draft), so the REAL draft's own `slot_to_roster_id` is the map that
 * actually resolves ownership correctly, for either draft. Callers
 * should fetch this against the REAL draft_id even when polling a mock's
 * picks -- see pollDraft's rosterMapDraftId. */
export async function fetchDraftStatus(draftId) {
  const resp = await fetch(draftUrl(draftId));
  if (!resp.ok) throw new Error(`Sleeper responded ${resp.status}`);
  const d = await resp.json();
  return { status: d.status, type: d.type, slotToRosterId: d.slot_to_roster_id ?? {} };
}

/* Returns every pick Sleeper has recorded so far, oldest first, each as
 * {pickNo, rosterId, playerId, name, pos, team, amount, isKeeper}. Amount
 * and player identity come straight from Sleeper's own pick metadata --
 * no separate player lookup needed, and the player_id matches the same
 * `sl:<id>` scheme app/sleeper.js's projections use, so picks join
 * directly onto the board. `slotToRosterId` (from fetchDraftStatus) is
 * required to resolve rosterId on a mock draft, where Sleeper leaves the
 * pick's own roster_id null. Throws on network failure; the caller owns
 * the offline/paused message (same convention as fetchSleeper). */
export async function fetchDraftPicks(draftId, slotToRosterId = {}) {
  const resp = await fetch(picksUrl(draftId));
  if (!resp.ok) throw new Error(`Sleeper responded ${resp.status}`);
  const picks = await resp.json();
  return picks
    .filter((p) => p.player_id) // a pick can be null while a nomination is mid-bid
    .map((p) => ({
      pickNo: p.pick_no,
      rosterId: p.roster_id ?? slotToRosterId[p.draft_slot] ?? null,
      playerId: `sl:${p.player_id}`,
      name: `${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim(),
      pos: p.metadata?.position ?? null,
      team: p.metadata?.team ?? null,
      amount: p.metadata?.amount != null ? Number(p.metadata.amount) : null,
      isKeeper: !!p.is_keeper,
    }))
    .sort((a, b) => a.pickNo - b.pickNo);
}

/* Polls fetchDraftPicks on an interval and calls onPicks(picks) each time
 * the fetch succeeds (even if unchanged -- the caller decides what's new).
 * A fetch failure calls onError(e) and keeps polling; it does not stop on
 * a single dropped request, since draft night is exactly when a flaky
 * connection matters most. Returns a stop() function.
 *
 * rosterMapDraftId: which draft's slot_to_roster_id to use for resolving
 * ownership on picks that lack a direct roster_id (mocks). Defaults to
 * draftId itself (correct when polling the real draft), but callers
 * polling a MOCK should pass the real Money_Talks draft_id here instead
 * -- see fetchDraftStatus's comment for why the mock's own map can't be
 * trusted for this. */
export function pollDraft(draftId, { onPicks, onError, intervalMs = 5000,
  rosterMapDraftId = draftId }) {
  let stopped = false;
  let slotToRosterId = {};
  const tick = async () => {
    if (stopped) return;
    try {
      /* Re-read every tick, not just once -- cheap, and avoids trusting a
       * mapping fetched before the draft was fully set up. */
      ({ slotToRosterId } = await fetchDraftStatus(rosterMapDraftId));
      const picks = await fetchDraftPicks(draftId, slotToRosterId);
      if (!stopped) onPicks(picks);
    } catch (e) {
      if (!stopped && onError) onError(e);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}
