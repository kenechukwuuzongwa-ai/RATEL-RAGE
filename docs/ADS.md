# Ratel Rage: billboard ads

Built 2026-10-23 (request 446). The plan it follows is `LAUNCH_ADS_STATS_PLAN.md` (phases 1 and 2).

## What advertisers do

1. Open **https://rr-ads.kenechukwuuzongwa.workers.dev**. It lists every board with its size, price and free dates.
   - In the game, pausing near a board shows **ADVERTISE ON THIS BOARD**, which opens that board's page.
   - Each house board's QR code opens the same page. Players can't scan their own screen, so the QR is for screenshots, streams and in-person pitches.
2. On a board's page (`/b/board-3`, for example) they:
   - upload their artwork, then fit, zoom and position it while watching it on the real board art
   - download a template if they need one
   - fill in their business, brand and contact details, a tap link, a start date and the number of months
   - send the booking
3. They get a private status page (`/status/<token>`). It shows review and payment state, dates, the artwork on the board, and views and taps once it is live.

## Advertising policy (request 590)

The game is for everyone (request 580, no age gate), so every advert must suit players of any age.

- **Where:** `/policy` on the ads server. The text lives in one place, `POLICY` in `ads/pages.js`. Change it there, bump `version` and `updated`, and redeploy.
- **Agreement:** the booking form has a required box: "My advert and its tap link follow the advertising policy, and I accept its refund terms". The server refuses bookings that don't send `agree: true`. Each booking stores the policy version it agreed to (`policy` column, request 593).
- **Welcome:** food and soft drinks, shops and fashion, phones and telecoms, all-ages apps, games, music, films and events, schools and courses, local services, sports, banks and licensed payment services, and charities that don't campaign politically.
- **Not allowed:** betting and gambling, alcohol, tobacco, vapes and drugs, sexual content and dating services, weapons and fireworks, get-rich-quick schemes (investment offers, crypto/forex trading, pyramid schemes, unlicensed loan apps), politics, health claims (medicines, miracle cures, slimming products), hate and shock images, lies and scams, other people's brands, and anything illegal.
- **Artwork:** the advertiser's own, with their brand name on it, and nothing that looks like part of the game (no fake buttons, fake warnings or "tap to win").
- **Tap link:** opens the advertiser's own page, matching the advert. No automatic downloads, no pop-ups, and no collecting children's details.
- **Review terms:** a live advert that breaks the policy comes down. The advertiser is responsible for any legal approval their advert needs, such as ARCON vetting. Refunds follow the fixed terms below.
- **On /admin:** a reminder at the top tells you to check the artwork **and open the tap link** against the policy before approving.

## Refund terms (request 593)

Policy version 2 replaced "refunds for unused time are at our discretion" with fixed rules. The wording is `POLICY.refunds` in `ads/pages.js` (shown at `/policy#refunds`), and `refundFor()` in `ads/worker.js` does the same sums. Change both together.

| Case | Refund |
|---|---|
| Not approved (rejected) | everything paid |
| Advertiser cancels before the start date | everything paid |
| Advertiser cancels after it starts | the days left after the cancel day, day by day (30-day booking, 12 left: 12/30 back), rounded down to whole naira |
| Owner takes it down for a policy breach (advert or link page) | nothing (confirmed by the owner, request 594) |
| Owner takes it down for any other reason | as an advertiser cancel |
| Game or board broken by our fault for 2+ days in a row | those days (set by hand with **Set refund**) |
| Low views or taps | nothing: numbers are not promised |
| Unpaid booking | cancel any time, nothing owed |
| Money that arrives after a booking was closed | everything paid |

Refunds go back to the card or account paid with (Paystack dashboard: Transactions > Refund) or by bank transfer for invoices, within 10 working days, with no fees taken. Bookings record the policy version agreed to (`policy` column; earlier bookings show 1).

**Advertiser:** the status page has **Cancel booking**. It shows what they get back before they confirm, then shows the refund owed and, once sent, the reference.

**Owner, on /admin:**
- A booking with money owed shows a red **REFUND OWED** pill and stays listed until the refund is marked sent, even when it is closed.
- Paid bookings have two take-down buttons: **Cancel, not their fault (refund ...)** and **Take down: broke the policy (no refund)**. Unpaid ones have a plain **Cancel**.
- **Reject** on a paid booking owes everything back. Reopening it for review clears a refund not yet sent.
- **Set refund** changes the amount owed by hand, with a reason shown to the advertiser.
- **Mark refund sent** records the refund reference once you have sent the money. The server does not move money itself.
- A cancelled booking cannot be approved again; the advertiser books afresh.

**Database change:** `migrations/0003_refunds.sql` adds `refund_due`, `refunded`, `refund_ref`, `refund_note`, `cancelled_by` and `policy`.

## What you do (the owner)

**https://rr-ads.kenechukwuuzongwa.workers.dev/admin**. The user name can be anything; the password is the `ADMIN_PASSWORD` secret.

- **Review:** look at the artwork and press **Approve** or **Reject** (the reason is shown to the advertiser). Approving refuses dates that clash with another approved booking on the same board.
- **Payment:** without Paystack, send an invoice yourself, then press **Mark paid** and enter the reference.
- **Live rule:** a board shows the advert only when it is **approved + paid + today is inside its dates**. Otherwise it shows the house art. Players pick up changes within about 5 minutes: at the next level start, or the next page load.
- **Boards:** edit each board's price per month and whether it is open for booking. Board 1, the Ratel Open University board, is reserved.
- **Numbers:** views and taps per board for the last 30 days, and running totals per booking.
- **Cancel / Delete:** cancelling works out the refund under the terms above; delete removes the booking and its artwork for good.

Nothing emails you or the advertiser yet. Check `/admin` for new bookings, and email advertisers yourself.

## Turning on Paystack

```
cd "RAGE OF RATELS/ads"
npx wrangler secret put PAYSTACK_SECRET        # sk_live_... (or sk_test_... to try it)
```

In the Paystack dashboard, set the webhook URL to `https://rr-ads.kenechukwuuzongwa.workers.dev/api/paystack`.

Once that's done:
- bookings and status pages show **Pay with Paystack**
- the signed `charge.success` webhook marks a booking paid, but only for the full amount
- you still have to approve the artwork

## Rotation: sharing a board (request 448)

Each board is sold in **shares**: 3 by default, from 1 to 6, set on /admin.

**Booking shares**
- An advertiser books 1 to 3 shares.
- Booking every share gives them the whole board: their advert is the only one on it.
- The board's price on /admin is for the **whole board**. One share costs its fraction (₦80,000 / 3 = ₦26,667 a month on board 3).

**Approval limits**
- Approved bookings on one board may overlap in time.
- Their shares can't add up past the board's on any single day.
- Booking and approving both refuse anything that would.
- You can't lower a board's shares below what approved bookings already hold.

**In the game**
- The game lists every live booking for a board in a cycle weighted by shares. A 1+2 board cycles B, A, B.
- The board shows the next advert only once a counted pass is over **and** the board is completely off screen, so an advert never changes in front of the player.
- Each session starts the cycle at a random point, so across all players each booking gets about its share of the views.
- Views and taps are credited to the advert that was on the board at that moment.

**The status page** tells a sharing advertiser what share of the views to expect.

**Database change:** `migrations/0002_rotation.sql` added the columns. Bookings made before rotation were given every share, so each keeps its whole board.

## Rotation vs targeting

| | Rotation (built) | Targeting (not built) |
|---|---|---|
| Who sees what | Everyone sees the same cycle; it advances per pass | Each player is matched to adverts by city, device, time of day, or age/gender from the opt-in profile |
| What the advertiser buys | A share of a board's views for set dates | An audience, with a budget spread across dates |
| Price | Flat, per share per month | Per view or per tap, once view numbers are steady |
| Server work per request | None: one list for everyone, cached for 60 s | A decision per player: campaign matching, pacing and a frequency cap |
| Data needed | None about the player | Location from the connection, plus profile data only for players who chose to give it |
| Fairness | Guaranteed by the weighted cycle | Depends on how much each audience plays; small audiences may under-deliver |

## What counts

- **View:** at least half of a board's face on screen for at least one second, once per pass. This is the industry standard.
- **Tap:** the pause-menu row for that board was opened.
- **No personal data:** only totals per day, per board and per booking are stored. The privacy page says so.
- **Origin check:** counts are accepted only from the game's own web address (`ALLOWED_ORIGINS`).

## Where things are

| Part | File |
|---|---|
| Board register (face and QR rectangles, seed prices) | `ads/boards.js`. Keep it in step with `ADVERT_SLOTS` in `src/game.js` |
| Server (API, artwork, counts, admin, Paystack) | `ads/worker.js` |
| Pages (list, board, status, admin) | `ads/pages.js` |
| Database | D1 `rr-ads` (`ads/schema.sql`); artwork is stored base64 in `creatives`, because R2 is not enabled on this account |
| Game side | `src/game.js`: `ADS`, `refreshAds`, `drawAdvertFace`, `updateAds`, `pauseAdRow`; `ads-config.js`; `frontend/vendor/qrcode/` (MIT) |
| Web build | `deploy/build-web.js` writes the endpoint into `dist/ads-config.js` (`--no-ads` leaves it off) |

The source tree, the editor and the APK keep `ads-config.js` empty. So they show the house art, fetch nothing and count nothing. Turning ads on in the APK would mean setting the endpoint in `mobile/build-demo.js` and rebuilding.

## Tests

- `node ads/test/ads.test.mjs`: the Worker against a local SQLite D1 (92 checks).
- `node _chromakey/ads/e2e.js`: against the **live** server. It books, approves, pays, checks the game draws and counts it, opens the pause link, then deletes the booking.
- `node _chromakey/ads/pagesmoke.js`: the live advertiser pages in a real browser (upload, preview, submit, status, admin), then deletes the booking.

## Deploy

```
cd "RAGE OF RATELS/ads"
npx wrangler deploy
npx wrangler d1 execute rr-ads --remote --file schema.sql     # new tables only
npx wrangler d1 execute rr-ads --remote --file migrations/0003_refunds.sql   # columns on an existing database: run each migration once
```

## Not built yet

- **Per-player targeting** (plan phase 3).
- **Email notifications.**
- **Level 2 boards:** it has no billboard art or slots.
- **A custom domain:** it's on `workers.dev`. `ratelrage.com` is now the game's domain (request 581), so `ads.ratelrage.com` can be pointed at the Worker later; the QR codes follow the endpoint in `ads-config.js`.
