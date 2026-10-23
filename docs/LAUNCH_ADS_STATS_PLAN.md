# Ratel Rage: Web Launch, Billboard Ads and Player Stats Plan

Agreed 2026-10-07 (requests 361-364). This is a plan only: no code is written until the owner says go.
Every decision below is the recommendation the owner accepted ("I will go with your options").

---

## 1. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Where does the feedback build live? | **itch.io first**; move to our own Cloudflare domain when the ad system launches |
| 2 | Real brands on the billboards (BET9JA, Naija Win)? | **Replace with fictional brands** in every public build. Approach real brands separately as sponsors; their art only goes in under a signed deal |
| 3 | Age rating | **18+ age gate** (assistant's pick; owner may override). The game is violent, and 18+ keeps betting and alcohol adverts possible under Nigerian rules |
| 4 | Player profile | **Optional** (nickname, age range, gender, city), offered for a small in-game reward. Needed for age and gender targeting and for leaderboards |
| 5 | Ad pricing | **Flat monthly sponsorship per board first.** Price per view or per tap only once view numbers are proven |
| 6 | Private stats dashboard | **GameAnalytics** (free, built for games), from the feedback launch |
| 7 | Player-facing numbers | **Our own small stats server on Cloudflare**, later reused to count ad views |
| 8 | Where players see the numbers | **All three:** a "players online" line on the title/menu, achievement stats after beating Olodo, and an EXTRAS > Street Stats page. **Nothing during the fight** |
| 9 | Live counter threshold | **Hidden until 50 or more players are online**; until then show monthly totals, or nothing |
| 10 | Leaderboards | **Later**, on Street Stats, for players with a nickname (needs the profile) |

---

## 2. Phase 0: Feedback launch (about 1-2 weeks)

**Goal:** a link people can play on phone and desktop, plus numbers on how they play.

1. **Web build.** Use the 8 MB mobile intro, compressed WebP plates and sheets, and lazy loading. Target playable in under 1 minute on 4G (the full source today is about 386 MB).
2. **Brands.** Swap BET9JA and Naija Win for fictional brands, keeping the art style.
3. **Age gate.** A one-screen 18+ confirmation, stored on the device.
4. **iPhone pass.** Tap-to-start audio, no Fullscreen API, memory limits on the large canvases. Test on a real iPhone.
5. **Analytics.** Add GameAnalytics (web and Android) with these events:
   - session start and end
   - a heartbeat every 30-60 s
   - level start, death (with location), Olodo reached, mission complete, intro skipped
   - platform
   Plus a short consent notice and a privacy policy page.
6. **Feedback form.** Three questions at most, reachable from pause and the end screen (reuse the WEB site's form backend).
7. **itch.io page.** Screenshots, a GIF and controls help.
8. **X launch kit.** A native 30-45 s clip, with the link in the first reply and the bio, and one specific question.

**Done when:** strangers can play it from the link on Android, iPhone and desktop, and the dashboard shows their sessions.

---

## 3. Phase 1: Prove ad demand (about 2-3 weeks)

**Goal:** sell 3-5 boards to local businesses at a flat price before building self-serve.

1. **Board register** (server database), one record per billboard:
   - `slot_id` (e.g. `L1-B3`) and level
   - pixel size, aspect ratio and safe area. Taken from the game's existing ADVERT_SLOTS, including board-3's `fit: 0.70`
   - position on the street, expected views, price, status
2. **QR code = ID only.** Each board's QR is a short link `ads.ratelrage.com/b/{slot_id}` leading to an "Advertise on this board" page with size, template download, price and an enquiry form.
   - **In the game, tapping a board opens that link.** A phone can't scan its own screen.
   - The QR itself is for streams, screenshots and in-person pitches.
3. **Manual booking.** Enquiry, then invoice (Paystack), then the owner approves the creative, then it goes live.
4. **The game loads board art from the server**, the same advert for every player, with house art as the offline or empty fallback.
   - The Android app needs internet access added (it currently has none).
   - Images are served from our own domain, so no CORS problems.

**Done when:** at least 3 boards are paid for and showing in the game.

---

## 4. Phase 2: Self-serve advertising (about 4-6 weeks)

The advertiser flow:
1. Pick a board: map, size, views, price.
2. Upload artwork: an automatic check against the board's pixel size and safe area, a template download, and an "as it looks in the game" preview.
3. Choose dates and budget.
4. Pay: Paystack or Flutterwave (NGN), Stripe (cards).
5. **Moderation queue.** Nothing goes live without the owner's approval, checked against a written ad policy (allowed, 18+ only, banned).
6. Results dashboard: views, taps, spend.

---

## 5. Phase 3: A different advert per player (about 4-8 weeks)

1. **How serving works.** When a level loads, the game sends the board IDs plus anonymous context (rough location from the connection, device, language, time, optional profile) to the ad server. The server picks a campaign per board, per player. Ten players can see ten different adverts on the same board at the same moment.
2. **What counts as a view.** A board at least 50% on screen for at least 1 s (the industry standard). Taps are counted. Each player has a cap on how often they see the same advert.
3. **Targeting, in this order:**
   - location (state or city), device, language, time of day (free to know)
   - player type: new or returning, casual or skilled (from play)
   - age and gender: only from the opt-in profile
4. **Pacing.** Spread each budget across its dates.
5. **Fallback.** House art whenever nothing matches or the device is offline.

---

## 6. Player stats

| Metric | Measured as |
|---|---|
| Online now | Different players heard from (heartbeat) in the last 2 minutes |
| Daily / weekly / monthly players | Different anonymous IDs in the period (one random ID per install or browser) |
| Sessions, play time, retention (returning after 1, 7 and 30 days) | Session start and end events |
| Progress funnel | Level start, death location, Olodo reached, mission complete |

- **Private view:** the GameAnalytics dashboard from Phase 0.
- **Our own stats server** (with the ad server, Phase 1 or 2): Cloudflare Worker plus Analytics Engine. It powers the in-game numbers and a private dashboard on the WEB site. Run it alongside GameAnalytics for a few weeks to check the numbers agree.
- **In the game:**
  - Title/menu: "● N players online", in a corner, refreshed every ~60 s, shown only when N is 50 or more (otherwise "N players this month" or nothing). Hidden offline.
  - After beating Olodo: "You're one of N players who took down MC Olodo", plus best combo and percentile.
  - EXTRAS > Street Stats: players this week, total Olodo defeats, longest combo, bat vs machete use, fastest clear. Leaderboards later.
  - Numbers are fetched in the background on the menus only, never during a fight. Players only ever see totals, never other players' details.
- **Limits:** counts are devices, not people, unless players sign in. Events are queued offline and sent later.

---

## 7. Hosting and services

| Need | Service |
|---|---|
| Feedback build | itch.io (Phase 0); later Cloudflare Pages + R2 (files over 25 MB go in R2) |
| Ad server, stats server | Cloudflare Workers (the WEB site already runs on Cloudflare) |
| Boards, campaigns, advertisers, bookings | Cloudflare D1 (Supabase if richer logins and reporting are needed) |
| Ad artwork | Cloudflare R2 |
| View and play events | Cloudflare Analytics Engine / Queues |
| Payments | Paystack / Flutterwave (NGN), Stripe (cards) |
| Private analytics | GameAnalytics |

---

## 8. Legal and compliance checklist

- Nigeria Data Protection Act 2023: consent, privacy policy, collect only what's needed. GDPR applies if EU players arrive.
- Google Play: data-safety form, ads declaration, the internet permission added to the app.
- 18+ gate. Betting and alcohol adverts need local legal advice (the lottery and gaming regulators) before any betting money is accepted.
- Written ad policy and moderation before any advert goes live.
- No real brands without written permission.

---

## 9. Order of work

1. Phase 0 (feedback launch + GameAnalytics).
2. Phase 1 (board register, QR/tap links, manual sponsorships, server-loaded board art) **plus** our own stats server and the three in-game stats placements.
3. Phase 2 (self-serve), only after Phase 1 sells boards.
4. Phase 3 (per-player targeting) and leaderboards, with the optional profile.
5. Later: ad-network partners (Anzu, Frameplay) once players number in the tens of thousands.
