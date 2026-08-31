"""Bootstrap confidence band for the availability prior.

Answers the "that's just small-sample noise" objection quantitatively: resample
the 11 seasons WITH REPLACEMENT (a season-cluster bootstrap), recompute the whole
curve each time, and report the 90% band per slot plus tier confidence intervals.

Mirrors build_availability_prior.py exactly: same FFC-ADP -> nflverse join, same
window (w1-16 pre-2021 / w1-17), same unmatched-as-missed rule, same 5-slot
centered rolling smooth. Reads the cached CSVs in ../data/raw/. Writes an SVG
chart to ../research/availability-bootstrap.html and prints the tier table.

Usage: /usr/bin/python3 bootstrap_availability.py
"""
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

RAW = Path(__file__).resolve().parent / "data"   # gitignored: bring your own FFC+nflverse cache
OUT = Path(__file__).resolve().parent / "out"
YEARS = list(range(2015, 2026))
POSITIONS = ("QB", "RB", "WR", "TE")
SUFFIX_RE = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv|v)$", re.I)
MAX_SLOT = 40
B = 5000
rng = np.random.default_rng(20260831)   # fixed seed: reproducible band


def norm(name):
    n = str(name).lower().strip()
    n = SUFFIX_RE.sub("", n)
    n = re.sub(r"[^a-z0-9 ]", "", n)
    return re.sub(r"\s+", " ", n)


def build_all():
    """Per (position, slot, year) missed_rate, identical to the prior build."""
    frames = []
    for year in YEARS:
        adp = pd.read_csv(RAW / f"ffc_adp_{year}.csv")
        games = pd.read_csv(RAW / f"nflverse_games_{year}.csv")
        games["key"] = games["name"].map(norm) + "|" + games["position"]
        gmap = dict(zip(games["key"], games["games"]))
        max_games = 15 if year < 2021 else 16
        adp = adp[adp["position"].isin(POSITIONS)].sort_values("adp")
        adp["slot"] = adp.groupby("position").cumcount() + 1
        adp["games"] = (adp["name"].map(norm) + "|" + adp["position"]).map(gmap)
        adp["games"] = adp["games"].fillna(0).clip(upper=max_games)
        adp["missed_rate"] = ((max_games - adp["games"]) / max_games).clip(0, 1)
        adp["year"] = year
        frames.append(adp[["position", "slot", "missed_rate", "year"]])
    return pd.concat(frames)


def smooth_matrix(n):
    """Centered 5-slot moving-average operator, min_periods=1 (edge-safe),
    matching pandas rolling(5, center=True, min_periods=1)."""
    S = np.zeros((n, n))
    for i in range(n):
        lo, hi = max(0, i - 2), min(n, i + 3)
        S[i, lo:hi] = 1.0 / (hi - lo)
    return S


def boot_position(all_df, pos):
    d = all_df[all_df.position == pos]
    M = d.pivot(index="slot", columns="year", values="missed_rate").sort_index()
    M = M[M.index <= MAX_SLOT]
    M = M[M.notna().sum(axis=1) >= 4]        # slots seen in >= 4 seasons
    slots = M.index.values
    Mv = M.values                             # [slots x years]
    nyears = Mv.shape[1]
    rowmean = np.nanmean(Mv, axis=1)          # point-estimate fill for empty resamples
    S = smooth_matrix(len(slots))
    cols = rng.integers(0, nyears, size=(B, nyears))   # resample seasons w/ replacement
    samp = Mv[:, cols]                        # [slots x B x nyears]
    perslot = np.nanmean(samp, axis=2).T      # [B x slots]
    perslot = np.where(np.isnan(perslot), rowmean[None, :], perslot)
    with np.errstate(all='ignore'):
        boot = perslot @ S.T                  # smoothed [B x slots]
    p5, p50, p95 = np.percentile(boot, [5, 50, 95], axis=0)
    return {"slots": slots, "M": M, "cols": cols,
            "p5": p5 * 17, "p50": p50 * 17, "p95": p95 * 17}


def tier_means(M, cols, lo, hi):
    sub = M[(M.index >= lo) & (M.index <= hi)].values      # [tierslots x years]
    samp = sub[:, cols]                                     # [tierslots x B x nyears]
    return np.nanmean(samp, axis=(0, 2)) * 17               # [B] mean games missed


def main():
    all_df = build_all()
    res = {p: boot_position(all_df, p) for p in POSITIONS}

    tiers = [(1, 3), (5, 10), (11, 24)]
    print(f"\nBootstrap: {B} season-resamples, 11 seasons (2015-2025), "
          "5-slot centered smoothing. Games missed of 17.\n")
    print(f"{'pos':>3}  {'tier':>7}  {'median':>6}  {'90% CI':>14}")
    tier_out = {}
    for p in POSITIONS:
        M, cols = res[p]["M"], res[p]["cols"]
        tier_out[p] = {}
        for lo, hi in tiers:
            m = tier_means(M, cols, lo, hi)
            q5, q50, q95 = np.percentile(m, [5, 50, 95])
            tier_out[p][f"{lo}-{hi}"] = m
            print(f"{p:>3}  {lo:>2}-{hi:<3}  {q50:>6.2f}  [{q5:>5.2f}, {q95:>5.2f}]")
    # the headline contrast: is the top-RB tier really riskier than the mid?
    rb_top, rb_mid = tier_out["RB"]["1-3"], tier_out["RB"]["5-10"]
    p_gt = float(np.mean(rb_top > rb_mid))
    diff = np.percentile(rb_top - rb_mid, [5, 50, 95])
    print(f"\nRB elite (1-3) vs trough (5-10): P(elite > trough) = {p_gt:.3f}; "
          f"difference median {diff[1]:.2f} games, 90% CI [{diff[0]:.2f}, {diff[2]:.2f}]")
    wr_top, wr_mid = tier_out["WR"]["1-3"], tier_out["WR"]["5-10"]
    wd = np.percentile(wr_top - wr_mid, [5, 50, 95])
    print(f"WR elite (1-3) vs trough (5-10): P(elite > trough) = {float(np.mean(wr_top > wr_mid)):.3f}; "
          f"difference median {wd[1]:.2f} games, 90% CI [{wd[0]:.2f}, {wd[2]:.2f}]")

    # emit the chart data + render an SVG
    chart = {p: {"slots": res[p]["slots"].tolist(),
                 "p5": res[p]["p5"].round(3).tolist(),
                 "p50": res[p]["p50"].round(3).tolist(),
                 "p95": res[p]["p95"].round(3).tolist()} for p in ("RB", "WR")}
    OUT.mkdir(exist_ok=True)
    (OUT / "availability-bootstrap.json").write_text(json.dumps(chart))
    (OUT / "availability-bootstrap.html").write_text(render_svg(chart))
    print(f"\nchart -> {OUT/'availability-bootstrap.html'}")


def render_svg(chart):
    W, H = 1120, 620
    pad_l, pad_r, pad_t, pad_b = 56, 24, 118, 70
    gap = 60
    pw = (W - pad_l - pad_r - gap) / 2
    ph = H - pad_t - pad_b
    xmax = 36
    ymax = 6.0
    colors = {"RB": ("#1a7a5a", "#1a7a5a"), "WR": ("#b3541a", "#b3541a")}

    def panel(px0, pos):
        d = chart[pos]
        slots, p5, p50, p95 = d["slots"], d["p5"], d["p50"], d["p95"]
        def X(s): return px0 + (min(s, xmax) - 1) / (xmax - 1) * pw
        def Y(v): return pad_t + ph - min(v, ymax) / ymax * ph
        parts = []
        # y gridlines + labels
        for g in range(0, int(ymax) + 1):
            y = Y(g)
            parts.append(f'<line x1="{px0}" y1="{y:.1f}" x2="{px0+pw}" y2="{y:.1f}" '
                         f'stroke="#e3ddd0" stroke-width="1"/>')
            parts.append(f'<text x="{px0-8}" y="{y+4:.1f}" text-anchor="end" '
                         f'font-size="12" fill="#8a8170">{g}</text>')
        # x ticks
        for s in (1, 6, 12, 18, 24, 30, 36):
            x = X(s)
            parts.append(f'<line x1="{x:.1f}" y1="{pad_t+ph}" x2="{x:.1f}" y2="{pad_t+ph+5}" stroke="#8a8170"/>')
            parts.append(f'<text x="{x:.1f}" y="{pad_t+ph+20}" text-anchor="middle" '
                         f'font-size="12" fill="#8a8170">{pos}{s}</text>')
        # band
        pts_top = " ".join(f"{X(s):.1f},{Y(v):.1f}" for s, v in zip(slots, p95) if s <= xmax)
        pts_bot = " ".join(f"{X(s):.1f},{Y(v):.1f}" for s, v in zip(slots, p5) if s <= xmax)
        band = pts_top + " " + " ".join(reversed(pts_bot.split(" ")))
        c = colors[pos][0]
        parts.append(f'<polygon points="{band}" fill="{c}" fill-opacity="0.16" stroke="none"/>')
        # median line
        med = " ".join(f"{X(s):.1f},{Y(v):.1f}" for s, v in zip(slots, p50) if s <= xmax)
        parts.append(f'<polyline points="{med}" fill="none" stroke="{c}" stroke-width="2.5"/>')
        # panel title
        parts.append(f'<text x="{px0}" y="{pad_t-12}" font-size="15" font-weight="700" '
                     f'fill="{c}">{pos}</text>')
        return "".join(parts)

    body = panel(pad_l, "RB") + panel(pad_l + pw + gap, "WR")
    return f'''<!doctype html><html><head><meta charset="utf-8">
<style>body{{margin:0;background:#faf6ee;font-family:-apple-system,Segoe UI,Roboto,sans-serif}}</style>
</head><body>
<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">
<rect width="{W}" height="{H}" fill="#faf6ee"/>
<text x="{pad_l}" y="34" font-size="20" font-weight="700" fill="#2a2620">Expected games missed by preseason ADP slot</text>
<text x="{pad_l}" y="56" font-size="13" fill="#6c6353">nflverse games x FantasyFootballCalculator ADP, 2015-2025. Line = median, shaded = 90% band from a 5000x season-resample bootstrap.</text>
<text x="{pad_l}" y="74" font-size="13" fill="#6c6353">RB: elite (1-3) miss ~2 more games than the 5-10 trough (paired 90% CI [0.0, 3.8], P=95%), rising again late. WR: flat, no top-tier bump. y-axis: games missed of 17.</text>
{body}
</svg></body></html>'''


if __name__ == "__main__":
    main()
