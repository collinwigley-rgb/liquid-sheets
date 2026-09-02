/* Liquid Sheets valuation engine (JS port of the proven Python engine).
 *
 * Pure functions, no DOM, no storage, no dependencies. Pipeline:
 * projections -> scored points -> availability discount -> shallow-baseline
 * VBD -> auction dollars -> gap tiers. Verified against the predecessor's
 * Python engine by the golden-master harness in verify/.
 *
 * Faithfulness notes (do not "fix" these):
 * - pyRound replicates Python's round-half-to-even; Math.round would drift
 *   baselines on exact halves.
 * - Sorts rely on Array.prototype.sort stability (guaranteed since ES2019)
 *   to preserve tie order exactly as the Python engine's stable sorts do.
 * - baselines() takes the run's model params so a baseline_bench_share
 *   override takes effect (both engines fixed 2026-08-18; the Python
 *   original silently ignored the override. All recorded runs used
 *   defaults, so golden-master agreement is unaffected).
 */

export const POSITIONS = ["QB", "RB", "WR", "TE"];
export const IDP_POSITIONS = ["DL", "LB", "DB"];
export const ALL_POSITIONS = [...POSITIONS, ...IDP_POSITIONS];

export function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return d > 0.5 ? f + 1 : f;
}

/* Python's round(x, 1) rounds the EXACT binary value with ties-to-even.
 * toFixed is also correctly rounded from the exact value but breaks ties
 * upward. The only values exactly halfway between tenths that a binary
 * float can represent are the x.25 / x.75 family (odd multiple of 1/4),
 * so detect that case and apply ties-to-even; everywhere else toFixed
 * agrees with Python. The golden master caught real .25 ties in spreads. */
export function round1(x) {
  if (Number.isInteger(x * 4) && !Number.isInteger(x * 2)) {
    const f = Math.floor(x * 10);
    return (f % 2 === 0 ? f : f + 1) / 10;
  }
  return Number(x.toFixed(1));
}

export function scoreStatLine(pos, st, scoring) {
  if (IDP_POSITIONS.includes(pos)) return scoreIdpStatLine(st, scoring.idp);
  const g = (k) => st[k] ?? 0;
  const p = scoring.pass ?? {};
  const r = scoring.rush ?? {};
  const c = scoring.rec ?? {};
  const m = scoring.misc ?? {};
  let pts = 0;
  pts += g("pass_yds") * (p.yd ?? 0) + g("pass_tds") * (p.td ?? 0);
  pts += g("ints") * (p.int ?? 0);
  pts += g("rush_yds") * (r.yd ?? 0) + g("rush_tds") * (r.td ?? 0);
  pts += g("rec_yds") * (c.yd ?? 0) + g("rec_tds") * (c.td ?? 0);
  pts += g("receptions") * ((c.ppr_by_pos ?? {})[pos] ?? 0);
  pts += g("fumbles_lost") * (m.fumble_lost ?? 0);
  pts += g("two_pt") * (m.two_pt ?? 0);
  return Math.max(pts, 0);
}

/* IDP scoring (DL/LB/DB) -- a wholly separate stat vocabulary from
 * offense, so it gets its own scorer rather than overloading the offense
 * one. scoring.idp keys mirror Sleeper's own idp_* scoring_settings names
 * (see sleeper.md) so a league's raw Sleeper scoring config can be passed
 * through close to verbatim. */
export function scoreIdpStatLine(st, idp = {}) {
  const g = (k) => st[k] ?? 0;
  let pts = 0;
  pts += g("tkl_solo") * (idp.tkl_solo ?? 0);
  pts += g("tkl_ast") * (idp.tkl_ast ?? 0);
  pts += g("tkl_loss") * (idp.tkl_loss ?? 0);
  pts += g("sacks") * (idp.sack ?? 0);
  pts += g("qb_hits") * (idp.qb_hit ?? 0);
  pts += g("def_ints") * (idp.int ?? 0);
  pts += g("int_ret_yds") * (idp.int_ret_yd ?? 0);
  pts += g("forced_fumbles") * (idp.ff ?? 0);
  pts += g("fum_rec") * (idp.fum_rec ?? 0);
  pts += g("fum_ret_yds") * (idp.fum_ret_yd ?? 0);
  pts += g("pass_def") * (idp.pass_def ?? 0);
  pts += g("blocked_kicks") * (idp.blk_kick ?? 0);
  pts += g("safeties") * (idp.safe ?? 0);
  pts += g("def_tds") * (idp.def_td ?? 0);
  return Math.max(pts, 0);
}

export function flexShares(slots) {
  const fRb = Math.min(0.25 + (slots.WR - slots.RB) / 3.0, 0.8);
  const fTe = slots.TE === 0 && (slots.FLEX ?? 0) > 0 ? 0.4 : 0.1;
  return { RB: fRb, TE: fTe, WR: 1.0 - fRb - fTe, QB: 0.0 };
}

/* SUPER_FLEX is eligible for QB/RB/WR/TE. In a 1-QB-start league the slot
 * goes to a 2nd/3rd QB far more often than a skill player -- backup QBs
 * clear replacement-level RB/WR/TE by enough margin that this is the
 * dominant real-draft pattern, not just a guess, but there is no
 * league-specific measured history to pin the exact split the way
 * FantasyEngine's vorp_baselines.R does for offense. superflex_qb_share is
 * therefore a labeled, overridable model param rather than a silent
 * hardcode (this repo's own ADR-0011: no unlabeled strategy opinions) --
 * default 0.6, override via cfg.model_params.superflex_qb_share. */
export function superFlexShares(mp) {
  const qbShare = mp.superflex_qb_share ?? 0.6;
  const rest = (1 - qbShare) / 3;
  return { QB: qbShare, RB: rest, WR: rest, TE: rest };
}

/* IDP_FLEX is eligible for any IDP position (DL/LB/DB). No measured split
 * exists for this league either -- defaults to an even split, override via
 * cfg.model_params.idp_flex_shares. */
export function idpFlexShares(mp) {
  return mp.idp_flex_shares ?? { DL: 1 / 3, LB: 1 / 3, DB: 1 / 3 };
}

/* Replacement rank (baseline) per position. Prefers REAL measured history
 * over a formula wherever it exists: mp.measured_baselines (e.g.
 * {QB:32, RB:39, WR:54, TE:15}) overrides the formulaic superflex-share
 * calculation for any position it lists, because a league's own real
 * draft/spend history (FantasyEngine's VOND methodology,
 * config/vorp_baselines.R -- 1 + the real mean count of players actually
 * paid above the $1 floor, measured over multiple real seasons) is a
 * better answer than a plausible-sounding split of the SUPER_FLEX slot.
 * Corrected 2026-09-02 after comparing this fork's first pass (a guessed
 * superflex_qb_share formula) against FantasyEngine's real measured
 * Money_Talks data -- see docs/FIXES_LOG.md. The formula remains the
 * fallback for any position/league without measured history. IDP baselines
 * are not computed here at all when mp.idp_pricing is set -- IDP is priced
 * by valueBoard()'s two-tier fixed pricing instead, not VBD (see there). */
export function baselines(cfg, mp = cfg.model_params) {
  const slots = cfg.roster_slots;
  const share = mp.baseline_bench_share;
  const f = flexShares(slots);
  const sf = superFlexShares(mp);
  const idpF = idpFlexShares(mp);
  const flex = slots.FLEX ?? 0;
  const superflex = slots.SUPER_FLEX ?? 0;
  const idpFlex = slots.IDP_FLEX ?? 0;
  const measured = mp.measured_baselines ?? {};
  const out = {};
  for (const pos of POSITIONS) {
    if (measured[pos] != null) { out[pos] = measured[pos]; continue; }
    const eff = (slots[pos] ?? 0) + f[pos] * flex + (sf[pos] ?? 0) * superflex;
    out[pos] = Math.max(pyRound(cfg.teams * eff * (1 + share)), 1);
  }
  if (mp.idp_pricing) return out; // IDP priced separately, no VBD baseline needed
  for (const pos of IDP_POSITIONS) {
    const eff = (slots[pos] ?? 0) + (idpF[pos] ?? 0) * idpFlex;
    out[pos] = Math.max(pyRound(cfg.teams * eff * (1 + share)), 1);
  }
  return out;
}

/* A tier is "players within noise of each other": it ends once value has
 * fallen theta (cumulative) below the TIER'S OWN TOP. Adjacent-gap rules
 * can never break a smoothly declining position (every RB sat in tier 1:
 * no single $3-6 step is a cliff, but forty of them are). Ported from the
 * predecessor's 2026-08-19 fix; verified against its regenerated runs. */
export function gapTiers(vbds, theta) {
  if (!vbds.length) return [];
  const tiers = [1];
  let t = 1;
  let tierTop = Math.max(vbds[0], 1e-9);
  for (let i = 1; i < vbds.length; i++) {
    if (tierTop - vbds[i] > theta * tierTop) {
      t += 1;
      tierTop = Math.max(vbds[i], 1e-9);
    }
    tiers.push(t);
  }
  return tiers;
}

/* sourcesMap: ordered {name: {as_of, players: [{player_id,pos,team,stats}]}}.
 * Averages each stat across sources; records per-player source spread
 * (max minus min of per-source scored points). */
export function blendProjections(sourcesMap, scoring, exclude = []) {
  const perPlayer = new Map();
  const dates = [];
  for (const [src, data] of Object.entries(sourcesMap)) {
    if (exclude.includes(src)) continue;
    dates.push(`${src}@${data.as_of}`);
    for (const p of data.players) {
      if (!perPlayer.has(p.player_id)) {
        perPlayer.set(p.player_id, { pos: p.pos, team: p.team, lines: [] });
      }
      perPlayer.get(p.player_id).lines.push(p.stats);
    }
  }
  const out = [];
  for (const [pid, d] of perPlayer) {
    const keys = new Set();
    for (const l of d.lines) for (const k of Object.keys(l)) keys.add(k);
    const avg = {};
    for (const k of keys) {
      let s = 0;
      for (const l of d.lines) s += l[k] ?? 0;
      avg[k] = s / d.lines.length;
    }
    const pts = d.lines.map((l) => scoreStatLine(d.pos, l, scoring));
    out.push({
      player_id: pid, pos: d.pos, team: d.team, stats: avg,
      spread: pts.length > 1
        ? round1(Math.max(...pts) - Math.min(...pts))
        : null,
    });
  }
  return { asOf: dates.join(" + "), players: out };
}

/* cfg: {season, teams, budget, weeks, roster_slots, scoring, model_params}.
 * players: [{player_id, pos, team, stats, spread?}] (from blendProjections or
 * a single source). prior: [[pos, rank_slot, exp_games_missed], ...].
 * mp: the run's model params (defaults to cfg.model_params; a caller may pass
 * overridden values, recorded in the run for traceability). */
export function valueBoard(cfg, players, prior, mp = cfg.model_params) {
  const weeks = cfg.weeks;
  const priorMap = new Map(prior.map(([pos, slot, m]) => [`${pos}|${slot}`, m]));

  const ps = players.map((p) => ({
    ...p, raw_pts: scoreStatLine(p.pos, p.stats, cfg.scoring),
  }));

  /* IDP has no per-rank games-missed prior (unlike offense's `prior`
   * table) -- priorMap.get() falls through to 0 for DL/LB/DB, i.e. no
   * availability discount applied to IDP. Reasonable default until a
   * real IDP prior exists; not a silent gap since it's documented here. */
  for (const pos of ALL_POSITIONS) {
    const group = ps.filter((p) => p.pos === pos)
      .sort((a, b) => b.raw_pts - a.raw_pts);
    group.forEach((p, i) => {
      const missed = priorMap.get(`${pos}|${Math.min(i + 1, 100)}`) ?? 0;
      p.proj_pts = (p.raw_pts * (weeks - missed)) / weeks;
    });
  }

  const nBase = baselines(cfg, mp);
  const f = flexShares(cfg.roster_slots);
  const sf = superFlexShares(mp);
  const idpF = idpFlexShares(mp);
  const flex = cfg.roster_slots.FLEX ?? 0;
  const superflex = cfg.roster_slots.SUPER_FLEX ?? 0;
  const idpFlex = cfg.roster_slots.IDP_FLEX ?? 0;
  const nVols = {};
  for (const pos of POSITIONS) {
    nVols[pos] = Math.max(pyRound(cfg.teams * ((cfg.roster_slots[pos] ?? 0) +
      f[pos] * flex + (sf[pos] ?? 0) * superflex)), 1);
  }
  /* When mp.idp_pricing is set, IDP is priced by fixed tiers below, not
   * VBD -- no vols baseline needed for it either. */
  if (!mp.idp_pricing) {
    for (const pos of IDP_POSITIONS) {
      nVols[pos] = Math.max(pyRound(cfg.teams * ((cfg.roster_slots[pos] ?? 0) +
        (idpF[pos] ?? 0) * idpFlex)), 1);
    }
  }
  const alpha = mp.vols_blend_alpha ?? 0;

  /* IDP is excluded from the VBD/tier loop entirely when priced by fixed
   * tiers (see below) -- VBD assumes a continuous, roughly linear dollar
   * relationship between value and price that neither this fork nor
   * FantasyEngine has validated for IDP production (see docs/FIXES_LOG.md,
   * 2026-09-02). Skipping the loop leaves p.vbd/p.tier undefined for IDP
   * players; the fixed-pricing block below sets p.dollar directly instead. */
  const vbdPositions = mp.idp_pricing ? POSITIONS : ALL_POSITIONS;
  for (const pos of vbdPositions) {
    const group = ps.filter((p) => p.pos === pos)
      .sort((a, b) => b.proj_pts - a.proj_pts);
    const ptsAt = (rank) =>
      group.length ? group[Math.min(rank, group.length) - 1].proj_pts : 0;
    const basePts = alpha * ptsAt(nVols[pos]) + (1 - alpha) * ptsAt(nBase[pos]);
    for (const p of group) p.vbd = p.proj_pts - basePts;
    const tiers = gapTiers(group.map((p) => p.vbd), mp.tier_gap_theta);
    group.forEach((p, i) => { p.tier = tiers[i]; });
  }

  /* Dollar pool: with mp.idp_pricing set, IDP's real fixed spend is carved
   * out first (mirrors FantasyEngine's calculate_vorp.R offense_auction_pool
   * exactly: total cash minus idp_starter_spend minus offense's own $1-floor
   * reservation), and only the remaining offense-only pool is split by VBD.
   * Without mp.idp_pricing, falls back to the original single-pool formula
   * (a league with no IDP at all). */
  let premium, idpTopN = 0;
  if (mp.idp_pricing) {
    const { slots_per_team, top_value, rest_value } = mp.idp_pricing;
    idpTopN = cfg.teams * slots_per_team;
    const idpStarterSpend = idpTopN * top_value;
    const offenseSlotsPerTeam = mp.dollar_slots_per_team - slots_per_team;
    const offenseMinSpend = cfg.teams * offenseSlotsPerTeam * rest_value;
    premium = cfg.budget * cfg.teams - idpStarterSpend - offenseMinSpend;
  } else {
    premium = cfg.budget * cfg.teams - mp.dollar_slots_per_team * cfg.teams;
  }
  let totalPosVbd = 0;
  for (const p of ps) {
    if (IDP_POSITIONS.includes(p.pos) && mp.idp_pricing) continue;
    if (p.vbd > 0) totalPosVbd += p.vbd;
  }
  for (const p of ps) {
    if (IDP_POSITIONS.includes(p.pos) && mp.idp_pricing) continue; // priced below
    p.dollar = totalPosVbd > 0
      ? Math.max((p.vbd * premium) / totalPosVbd + 1, 1.0)
      : 1.0;
  }

  /* Fixed two-tier IDP pricing, matching calculate_vorp.R exactly: rank by
   * raw projected production (not VBD -- there is no IDP replacement
   * baseline in this mode), top (teams * slots_per_team) get top_value,
   * everyone else gets rest_value. */
  if (mp.idp_pricing) {
    const { top_value, rest_value } = mp.idp_pricing;
    const idpPlayers = ps.filter((p) => IDP_POSITIONS.includes(p.pos))
      .sort((a, b) => b.proj_pts - a.proj_pts);
    idpPlayers.forEach((p, i) => {
      p.dollar = i < idpTopN ? top_value : rest_value;
      p.vbd = 0;
      p.tier = null;
    });
  }

  return {
    meta: { baselines: nBase, vols_baselines: nVols, premium },
    players: ps.map((p) => ({
      player_id: p.player_id, pos: p.pos, team: p.team,
      proj_pts: round1(p.proj_pts), vbd: round1(p.vbd),
      dollar: round1(p.dollar), tier: p.tier, spread: p.spread ?? null,
    })),
  };
}
