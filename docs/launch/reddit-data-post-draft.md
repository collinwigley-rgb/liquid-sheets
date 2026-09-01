# Reddit DATA post - DRAFT (not posted)

Status: draft for Levi's review. Not posted anywhere.

## Strategy

r/fantasyfootball gates "here's my tool" posts hard, but welcomes real data
analysis. This post leads with genuinely useful original analysis (your games-
missed-by-ADP-slot breakdown, which you already posted as a comment) and mentions
the tool only as a footnote at the very end. The numbers in the table are the
EXACT values the app uses (app/prior_2026.js), so the data and the tool are the
same thing, which is the authentic hook.

The original thread you contributed to:
https://www.reddit.com/r/fantasyfootball/comments/1vwwqxa/

Notes:
- Reddit tables render with pipes; the block below is ready to paste.
- Check the sub's self-promotion rules; a single link to a free, open-source tool
  at the end of a data post is usually tolerated, but when in doubt, message the
  mods or drop the link and put it in a comment/reply if asked.
- Swap the link for https://sheets.liquidworkflows.com/ (final URL).

---

## Title options (pick one)

1. Games missed by ADP slot, 10 years: the RB injury tax is almost entirely an RB1-3 thing
2. Follow-up to the games-missed post, broken out by draft slot. The shape wasn't what I expected.
3. RB1-3 miss way more games than RB5-8. WRs are flat. 10 years of data, by ADP slot.

## Body

There was a good post here recently on RB/WR games missed over the last 10 years. I had run a similar thing but keyed to preseason ADP slot instead of pooling the whole top 24, and the shape was different enough that a couple people asked for it, so here is the dedicated version.

Same source (nflverse games and injury data), anchored to FantasyPros preseason ADP, 2015 to 2025, corrected for the 16 to 17 game change. "Missed" includes injury, suspension, and holdouts (same caveat as the original: it muddies "injury," I kept it).

**Expected games missed, by draft slot:**

| ADP slot | RB | WR |
|---|---|---|
| 1 | 4.4 | 2.2 |
| 2 | 3.8 | 2.2 |
| 3 | 3.6 | 2.4 |
| 5 | 2.2 | 2.3 |
| 6 | 2.2 | 2.3 |
| 8 | 2.3 | 2.0 |
| 12 | 3.1 | 2.6 |
| 17 | 3.7 | 1.8 |
| 24 | 4.2 | 3.2 |

The part that surprised me: the RB injury tax is not spread across the position, it is concentrated. RB1-3 miss about 3.6 to 4.4 games, roughly a quarter of the season. RB5-8 miss about 2.2, basically the same as a WR. Then it climbs again at the back end (committee backs, handcuffs, older guys). So RB games-missed is U-shaped by slot.

WRs are flat. About 2.0 to 2.6 games missed almost the whole way down, until the very late fliers.

So "RBs get hurt more" is real, but it is an elite-RB and late-RB story, not a whole-position story. If you are paying up for a top-3 back, you are buying roughly a game and a half more expected absence than the field. The RB5-8 range is the safest tier on the board by this measure, which is a point in favor of the "wait on RB, take two mid-tier backs" builds.

(Full disclosure on why I have these handy: I built these exact numbers into my personal auction draft tool I made. It fades each player's projection by their slot's expected games missed, with a toggle to turn it off if you think the injury adjustment is overfit. I won't link my tool here but you can check it our in  https://www.reddit.com/r/FFCommish/comments/1w2k0cm/i_built_my_dream_draftday_weapon_it_wasnt_for_you/ (But mostly I wanted to share the by-slot cut, because the concentration at the top was the part I did not expect.)
