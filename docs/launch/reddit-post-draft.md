# Reddit post - DRAFT (not posted)

Status: draft for Levi's review. Not posted anywhere. Framed for a live launch
(the app is public at https://sheets.liquidworkflows.com/).

## How to think about this draft

The goal is hook fast, then SHOW, don't tell. Put the reader inside a draft and
let the screenshots do the talking. Nobody reads a wall of text about why a
feature is good; they believe a picture of the feature doing the thing. The copy
below is deliberately short and exists mostly to frame two screenshots.

Screenshots to attach (already generated, in the scratchpad; regenerate with your
own scoring/values any time):
- `shot_call.png` - The Call on a staged player (the hero image). Goes right
  after the "four seconds" paragraph.
- `shot_board.png` - the full board (your custom values, tiers, plan, ledger).
  Goes after the "every value is built from projections you bring" paragraph.
- Optional third: a board with your real Yahoo/ESPN values pasted, so the Bid$
  and +/- columns light up with green deals. I did not fake those numbers; paste
  your league's and screenshot it if you want the "find the deals" shot.

Posting notes:
- Post as an image/gallery post (or a text post with the images inline). Reddit
  rewards a strong first image.
- Swap the link for your final URL (the custom subdomain once it is wired, else
  https://sheets.liquidworkflows.com/).
- r/fantasyfootball is strict on tool self-promo (often needs mod approval or the
  weekly tools thread). r/FFCommish and r/DynastyFF are friendlier to open-source
  tools. Read the current rules of whichever sub before posting.
- The app is live; this is framed as a real launch asking for feedback.

---

## Title options (pick one)

1. I'm a data engineer who got tired of BeerSheets, so I spent a month building my own auction draft tool. It's free, no login, and it never leaves your browser.
2. I built the auction draft tool I always wished BeerSheets was. Free, private, runs entirely in your browser.
3. I'm a data engineer that reverse-engineered beersheets etc, and built my dream draft-day weapon. It wasn't for you, it's for me. But it's amazing so I want to share. went ahead and made a public version. you should check it out. Auction draft only for now. Free, open source, no account, nothing uploaded.

## TL;DR (put this line at the very top of the body)

It does the calculations no human could do in the seconds after a player is nominated so you can actually use those insights to make a decision.

Bring your own data. No login, runs entirely in your browser (nothing uploaded, nothing saved on a server). Bring your own projections, it does the draft-day math. Link at the bottom.**

## Body

I am a data engineer. I have drafted off BeerSheets for years, and every year I wanted it to do more, so about a month ago I started building my own. I only meant to give myself an edge in my own league. It came out better than I expected, so here it is.

Here is the thing it does that I cannot do in my head at the table.

It is early in your auction and someone nominates Bijan Robinson. You have about four seconds. The tool already knows: he is worth $68 to your roster, only one comparable back is left before the tier falls off an $8 cliff, and eleven other funded teams still need a starting RB. The read: this is your last real shot at that tier, so pay full value.

[SCREENSHOT: shot_call.png]

That is not a ranking. It is a read on scarcity, your budget, and the room, done in the half second between the nomination and your bid. Nominate a player (type his name, hit enter) and it fires instantly.

And the value it is reading from is yours, not a generic sheet. Every number is built from projections you bring (one click pulls Sleeper's, or paste FantasyPros, CBS, or your own), re-scored under your league's exact settings, and scaled to your budget and roster. Paste your league's Yahoo or ESPN values on top and it shows you which players the room is about to underpay for.

[SCREENSHOT: shot_board.png]

A few things that mattered to me, since I did not want to build another account to manage:

- **Free.** No login, no paywall, nothing to sign up for.
- **It lives only in your browser.** Nothing is uploaded, nothing is stored on a server, no tracking. Close the tab and your draft is right where you left it.
- **Open source.** Every value traces back to a calculation you can open and read; there is no black box.

I built it for myself, so it is auction-only and a little opinionated. If you auction draft, take it into a mock and tell me where it is wrong or where it slowed you down. That feedback is the only thing I want out of this.

Link: https://sheets.liquidworkflows.com/

---

## A shorter alternative body (if you want the leanest possible version)

I am a data engineer and a longtime BeerSheets user. I spent a month building the auction draft tool I always wanted, and it is free.

The point of it: someone nominates a player, and in the four seconds you have, it tells you what he is worth to YOUR roster, whether the tier is about to fall off a cliff, and how many other teams still need that position. A read you cannot do in your head at the table.

[SCREENSHOT: shot_call.png]

The values are built from projections you bring, re-scored under your league's rules and budget, so they are for your league, not a generic sheet.

[SCREENSHOT: shot_board.png]

No login, no cloud, nothing uploaded. It runs entirely in your browser and it is open source. Auction-only, built for myself, sharing it in case it helps you too. Tell me where it breaks.

Link: https://sheets.liquidworkflows.com/
