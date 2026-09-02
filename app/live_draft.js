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

/* Sleeper's API sits behind a CDN that serves cached responses well past
 * their own stated freshness window -- verified live 2026-09-02: both
 * endpoints returned a response already 159s old (Age: 159) under
 * `cache-control: s-maxage=15..30, stale-while-revalidate=300`, meaning a
 * client can be reading nomination/pick state that is minutes behind
 * real life, right when a 30s-nomination-timer auction most needs it
 * fresh. `cache: "no-store"` only stops the browser's own cache, not the
 * CDN edge in front of Sleeper -- confirmed a cache-busting query param
 * is what actually forces a MISS (fresh origin read) past that edge. */
function noCacheFetch(url) {
  const bust = url.includes("?") ? "&" : "?";
  return fetch(`${url}${bust}_=${Date.now()}`, { cache: "no-store" });
}

/* Returns {status, type, slotToRosterId, nominatedPlayerId, highOffer}.
 * Throws on network failure.
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
 * picks -- see pollDraft's rosterMapDraftId.
 *
 * Undocumented, verified live 2026-09-02 against an active mock
 * (draft 1400887695084953600): while a player is nominated and being
 * bid on, that pick never appears in /picks at all (confirmed zero
 * null-player_id rows in a real response) -- the ONLY place the current
 * nomination shows up is this endpoint's own `metadata.nominated_player_id`
 * / `metadata.highest_offer`. Not in Sleeper's public API docs; this is
 * exactly why THE BLOCK never showed during live sync before this fix.
 * Collin: private one-off tool, not redistributed -- using an
 * undocumented-but-observed field here is an accepted tradeoff. */
export async function fetchDraftStatus(draftId) {
  const resp = await noCacheFetch(draftUrl(draftId));
  if (!resp.ok) throw new Error(`Sleeper responded ${resp.status}`);
  const d = await resp.json();
  const m = d.metadata ?? {};
  return { status: d.status, type: d.type, slotToRosterId: d.slot_to_roster_id ?? {},
    nominatedPlayerId: m.nominated_player_id || null,
    highOffer: m.highest_offer != null ? Number(m.highest_offer) : null };
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
  const resp = await noCacheFetch(picksUrl(draftId));
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
 * trusted for this.
 *
 * onNomination(nom): optional. Called each tick with either
 * {playerId, highOffer} for whoever is currently nominated/being bid on
 * (playerId as "sl:<id>", matching every other id in this app), or null
 * when nobody is actively nominated. Nomination metadata always comes
 * from draftId itself (the draft actually being watched), never
 * rosterMapDraftId -- a mock's own nomination is what's live when
 * watching a mock, even though its roster map is untrustworthy (see
 * fetchDraftStatus). Cross-checked against picks so stale metadata left
 * over after a sale completes doesn't re-surface an already-sold
 * player. */
export function pollDraft(draftId, { onPicks, onError, onNomination,
  intervalMs = 5000, rosterMapDraftId = draftId }) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      /* Re-read every tick, not just once -- cheap, and avoids trusting a
       * mapping fetched before the draft was fully set up. */
      const draftStatus = await fetchDraftStatus(draftId);
      const { slotToRosterId } = rosterMapDraftId === draftId
        ? draftStatus : await fetchDraftStatus(rosterMapDraftId);
      const picks = await fetchDraftPicks(draftId, slotToRosterId);
      if (!stopped) onPicks(picks);
      if (!stopped && onNomination) {
        const nomId = draftStatus.nominatedPlayerId;
        const playerId = nomId ? `sl:${nomId}` : null;
        const alreadySold = playerId && picks.some((p) => p.playerId === playerId);
        onNomination(playerId && !alreadySold
          ? { playerId, highOffer: draftStatus.highOffer } : null);
      }
    } catch (e) {
      if (!stopped && onError) onError(e);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}
