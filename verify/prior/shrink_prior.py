"""Regularize the availability prior: shrink each position's per-slot curve
toward that position's own level, so the tool keeps the robust part (RBs miss
more than WRs, a position-level effect) and stops asserting the underpowered
part (the exact slot-to-slot gradient, ~11 noisy seasons, p~0.13).

shrunk[pos][slot] = mu[pos] + K * (smoothed[pos][slot] - mu[pos])

- mu[pos] = pooled top-24 missed rate for the position (the robust "level").
  Shrinking toward it PRESERVES the cross-position difference (kept) and damps
  the within-position slot gradient (uncertain). Because dollar values are
  relative, a uniform position discount mostly cancels; the board effect of the
  fade comes almost entirely from the gradient, so K directly sets how much of
  the unproven gradient we apply.
- K chosen at 0.5: per-slot empirical Bayes says the slot detail is mostly
  noise (k ~ 0.1), while the coarse tier tilt is marginally real (RB1-3 vs
  RB5-10 one-sided p ~ 0.05, posterior effect-keep ~ 0.7). 0.5 is a transparent
  middle: it halves the slot precision we can't defend while keeping the
  tier-level tilt the data does support.

Writes ../../app/prior_2026.js (this repo). Prints the EB context and
before/after so the choice is auditable.
Usage: /usr/bin/python3 shrink_prior.py
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bootstrap_availability as ba

K = 0.5
MAX_SLOT = 100
OUT = (Path(__file__).resolve().parents[2]
       / "app" / "prior_2026.js")


def smoothed_curve(all_df, pos):
    d = all_df[all_df.position == pos]
    curve = d.groupby("slot")["missed_rate"].agg(["mean", "count"])
    curve = curve[curve["count"] >= 4]["mean"]
    sm = curve.rolling(5, center=True, min_periods=1).mean()
    return sm            # index = slot, value = smoothed rate


def eb_k(all_df, pos, sm):
    """Per-slot empirical-Bayes shrinkage factor, for transparency/logging.
    noise per smoothed slot from the season-resample bootstrap; signal = the
    between-slot variance left after removing noise."""
    res = ba.boot_position(all_df, pos)
    se_rate = (np.array(res["p95"]) - np.array(res["p5"])) / (2 * 1.645) / 17.0
    vbar = float(np.mean(se_rate ** 2))
    slots = res["slots"]
    m = np.array([sm.get(s, sm.iloc[-1]) for s in slots])
    mu = m.mean()
    between = float(np.mean((m - mu) ** 2))
    tau2 = max(0.0, between - vbar)
    return tau2 / (tau2 + vbar), vbar, between


def main():
    all_df = ba.build_all()
    lines = []
    print(f"K = {K} (shrink toward top-24 position level)\n")
    print(f"{'pos':>3}  {'mu(top24)':>9}  {'EB k':>6}  before -> after (games, key slots)")
    for pos in ("QB", "RB", "WR", "TE"):
        d = all_df[all_df.position == pos]
        mu = d[d.slot <= 24]["missed_rate"].mean()      # robust position level (rate)
        sm = smoothed_curve(all_df, pos)
        last = sm.iloc[-1]
        k_eb, vbar, between = eb_k(all_df, pos, sm)
        key = {"RB": (1, 3, 6, 14, 24), "WR": (1, 6, 17, 24),
               "QB": (1, 6, 12), "TE": (1, 6, 12)}[pos]
        shown = []
        for slot in range(1, MAX_SLOT + 1):
            m = sm.get(slot, last)
            shrunk = mu + K * (m - mu)
            lines.append(f'  ["{pos}", {slot}, {round(shrunk * 17, 3)}],')
            if slot in key:
                shown.append(f"#{slot} {m*17:.1f}->{shrunk*17:.1f}")
        print(f"{pos:>3}  {mu*17:>9.2f}  {k_eb:>6.2f}  " + "  ".join(shown))

    header = (
        "/* Availability prior: expected games missed per positional draft slot.\n"
        " * Slot-level aggregate from nflverse injury/games data (openly licensed)\n"
        " * crossed with FantasyFootballCalculator ADP, seasons 2015-2025, then\n"
        " * REGULARIZED: each position's per-slot curve is shrunk 50% toward that\n"
        " * position's top-24 level. The cross-position effect (RBs miss more than\n"
        " * WRs) is well supported and kept; the slot-by-slot gradient is\n"
        " * underpowered on ~11 seasons (p~0.13), so half of it is shrunk away.\n"
        " * See ingest/shrink_prior.py. Attribution: nflverse.com,\n"
        " * fantasyfootballcalculator.com. */\n"
        "export const PRIOR_SEASON = 2026;\n"
        "export const PRIOR = [\n")
    OUT.write_text(header + "\n".join(lines) + "\n];\n")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
