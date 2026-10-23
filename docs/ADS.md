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

## What you do (the owner)

**https://rr-ads.kenechukwuuzongwa.workers.dev/admin**. The user name can be anything; the password is the `ADMIN_PASSWORD` secret.

- **Review:** look at the artwork and press **Approve** or **Reject** (the reason is shown to the advertiser). Approving refuses dates that clash with another approved booking on the same board.
- **Payment:** without Paystack, send an invoice yourself, then press **Mark paid** and enter the reference.
- **Live rule:** a board shows the advert only when it is **approved + paid + today is inside its dates**. Otherwise it shows the house art. Players pick up changes within about 5 minutes: at the next level start, or the next page load.
- **Boards:** edit each board's price per month and whether it is open for booking. Board 1, the Ratel Open University board, is reserved.
- **Numbers:** views and taps per board for the last 30 days, and running totals per booking.
- **Cancel / Delete:** delete removes the booking and its artwork for good.

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

- `node ads/test/ads.test.mjs`: the Worker against a local SQLite D1 (44 checks).
- `node _chromakey/ads/e2e.js`: against the **live** server. It books, approves, pays, checks the game draws and counts it, opens the pause link, then deletes the booking.
- `node _chromakey/ads/pagesmoke.js`: the live advertiser pages in a real browser (upload, preview, submit, status, admin), then deletes the booking.

## Deploy

```
cd "RAGE OF RATELS/ads"
npx wrangler deploy
npx wrangler d1 execute rr-ads --remote --file schema.sql     # only after schema changes
```

## Not built yet

- **Per-player targeting** (plan phase 3).
- **Email notifications.**
- **Level 2 boards:** it has no billboard art or slots.
- **A custom domain:** it's on `workers.dev`. A domain like `ads.ratelrage.com` can be pointed at the Worker later; the QR codes follow the endpoint in `ads-config.js`.
