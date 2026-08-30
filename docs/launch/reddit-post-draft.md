# Reddit post - DRAFT (not posted)

Status: draft for Levi's review, 2026-08-29. Not posted anywhere.

Notes before posting:
- MASTER-PLAN.md targets a public beta for the 2027 season; the README still
  says "in build." Posting now means framing it as an early look, not a launch.
  The draft below is written that way.
- r/fantasyfootball is strict on self-promotion (tool posts usually need mod
  approval or the weekly tools thread); r/FFCommish and r/DynastyFF are friendlier
  to open-source tools. Read the current rules of whichever sub before posting.
- Swap `<URL>` for the live link (currently https://liquid-sheets.pages.dev/app/,
  or the custom domain once wired).
- Keep it ASCII (no em dashes) if pasted from here; Reddit does not care, but
  the project rule does.

---

**Title options (pick one):**

1. I built a free auction draft tool that runs entirely in your browser (no account, nothing uploaded). Here is how it works.
2. Open-source auction draft tool: bring your own projections, it does the math, everything stays in your browser
3. A BeerSheets-style auction board that can't get killed by data licensing (because it never hosts any data)

---

**Body:**

I run an auction league and have spent years patching together spreadsheets. This offseason I turned my private draft tool into a free, open-source web app. It is early (aiming for a proper release next season) but it works, and I would rather get feedback from people who actually auction draft than build in a vacuum.

Link: `<URL>` (nothing to install, no account, no cost)

**What it is, in one paragraph**

You give it your league settings and your own projections. It turns them into auction dollar values scaled to your exact budget and roster, then runs the whole draft: a live board, a verdict on every player nominated, a budget plan that adjusts as you spend, and a ledger of what every team has left. All of it is math in your browser; nothing is uploaded anywhere.

**How the values are built (the whole model, four steps)**

1. **Bring your own projections, blend them.** One click pulls Sleeper's public projections. You can paste in more (Yahoo, ESPN, FantasyPros, any rankings list). With more than one source, the board averages them, because a blend beats any single forecaster.

2. **Re-scored under YOUR rules.** Points are recomputed from raw stats using the scoring you entered. This is why the numbers differ from any public sheet: they are for your league, not a generic one.

3. **Availability discount.** Each projection is trimmed by the games players at that draft slot historically miss. Elite RBs miss the most, and that is baked in rather than left for you to remember.

4. **Points above a free player.** When the draft ends, a replacement-level player at every position is still free on waivers. Points that free player would also score are worth $0. A player is only worth his points above that line. Tiers mark real value cliffs.

Then points become dollars: the room holds (teams x budget). After $1 minimums for every roster spot, the rest splits among players in proportion to surplus. Every value sums back to the room's money, so if one player is overpriced, someone else is underpriced.

That is the entire model. There is no hidden sauce, and every number on the board traces back to that calculation. You can open "under the hood" in the app and read it.

**What happens in the draft room**

- **Nominate a player, get a verdict instantly.** Double-click a row (or type a name and hit Enter) and The Call fires: a verdict (TARGET, FAIR VALUE, LAST CHANCE, or LET HIM GO), the most you should bid, which of your open slots he fits, and how much comparable supply is left. It is arithmetic over what is already on screen, so it works offline.
- **A budget plan that breathes.** You set target envelopes per slot (RB1, WR1, etc). As the draft unfolds they water-fill to your remaining money: bank a deal and your other envelopes grow; overpay and they shrink. A reserve is held for bench, K and DEF so a run never strands you with $3 for five spots.
- **A pressure strip** across the top: per position, starter slots still needed league-wide vs startable players left. Amber means the window is closing, red means crunch. It flags positional runs as they happen.
- **A deal column** if you paste a market source (Yahoo/ESPN values): my value vs the market, rescaled to your league's money supply, so you can see who the room is likely to underprice.
- **My Calls**: if you disagree with the model on a player, nudge his dollar value up or down. It lives in a separate run so the base numbers are never touched, and you can flip between them.

**Built for speed at the table**

Auction drafts move fast, so data entry was designed to get out of the way:

- Setup is a five-step wizard with defaults filled in. Most people change three or four numbers.
- Projections are one click (Sleeper) or paste-anything: it detects the format, guesses the column mapping, and you confirm two dropdowns. When a site changes its export next August, you fix a dropdown instead of waiting on an app update.
- Logging a sale is: nominated player is already staged, type the price, pick the team, Enter. Undo is a double-tap of Escape.
- Keyboard everywhere: search-and-Enter to stage, arrow keys across the team grid, no mouse required mid-draft.
- Everything saves on every action to your browser. Close the tab, reopen, you are exactly where you were. "Save to file" gives you a copy you own (on Chrome/Edge it re-saves to the same file silently), and that file is how you move to another device.

**What it deliberately does not do**

- It does not host, ship, or redistribute anyone's projections or rankings. This is the thing that killed the great sheet tools of the past. You bring your data; the tool is the engine and the room.
- No accounts, no server, no tracking. Nothing you enter leaves your device.
- No AI in the app. (There is an optional self-hosted companion for developers, but the hosted app has none.)
- Auction only. No snake support, on purpose.

**Ask**

If you auction draft and try it in a mock, I want to know where it slowed you down or where a number looked wrong. It is MIT licensed and the repo is public, including the planning docs and the test harness that proves the engine matches the original to the dollar.

Repo: https://github.com/liquid-workflows/liquid-sheets
