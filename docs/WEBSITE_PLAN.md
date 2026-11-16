# Ratel Rage: official website plan (request 656)

Status: PLAN ONLY, nothing built. Written 2026-11-16 from the current code (v169), not from older docs.

## 1. Goal

One website at ratelrage.com that:

1. teaches players the controls, moves, combos and systems (the main problem today),
2. tells the story and shows the game (screenshots, clips),
3. explains scoring and grades,
4. helps players install, sign in and fix problems,
5. sells the billboard adverts and explains the rules to advertisers,
6. gets players into the game in one tap.

## 2. What the audit found (affects the site)

| Finding | Why it matters |
|---|---|
| The in-game HOW TO PLAY page shows only the touch pad, on every device, and lists 7 basics. Uppercut, back kick, RamRage, the GRAB+JAB fist combo, rush follow-ups, weapons, Rage, Rage Tornado and executions are not explained anywhere. | This is the gap the site fills first. |
| Keyboard has no kick key, and the unarmed 5-hit combo and the fist combo can't be done from the keyboard alone (they read mouse/pad/touch presses). | The site can't honestly teach keyboard-only play until the game gets a kick key and a keyboard combo. Fix in the game first (see decisions). |
| Four options do nothing: CRT EFFECT, TUTORIAL HINTS, COMBO ASSIST, HIGH CONTRAST UI. | The site must not describe them. Hide or build them. |
| Level 02's story target is AIG Moshun Jimoh, but the level has no Jimoh fight; it ends in the server-defence mission. Level 03 is not playable. | Copy must describe what is really there ("coming" for Level 03). |
| Grades are total score only: S 32,000+, A 25,000+, B 18,000+, C 11,000+, D below. | A simple page answers the owner's own question (requests 640, 650). |
| An older prelaunch site exists in `../WEB` ("Ratel Rage HQ", Next.js + D1, only a GitHub Pages preview). Its content is out of date (says Level 02 reuses Level 01). | Retire it; reuse only its asset-source notes. |
| Saves, sign-in, the service worker, the app manifest, push links and the ad worker all assume the game lives at the root of ratelrage.com. | Moving the game to /play needs a careful checklist (section 6). |

## 3. Sitemap

| Page | URL | Contents |
|---|---|---|
| Home | `/` | Hero loop + PLAY NOW, three-line pitch, feature strip (Rage, RamRage, weapons, executions, evidence board), "Learn the basics in 60 seconds", latest update, install the app. |
| How to play | `/how-to-play` | The core page, see section 4. |
| Combos | `/how-to-play/combos` | Every chain with clip + input strip + timing, and a combo map. |
| Scoring and grades | `/grades` | What each grade means, what earns points, how to raise it. |
| Story | `/story` | The world, Darki, the case files (MC Olodo, AIG Moshun Jimoh, The Sponsor, The Cabal), spoiler toggle, fiction disclaimer. |
| Enemies and bosses | `/enemies` | Agbero, Taskforce, Aye, SARS, MC Olodo: what each does, how to beat them. |
| Weapons | `/weapons` | Bat and machete: where to find, every move, Rage Tornado. |
| Levels | `/levels` | 01 The Street Tax, 02 Operation Clean Sweep, 03 The Sponsor (coming); unlock rules, checkpoints, difficulty. |
| Gallery | `/gallery` | Screenshots and short clips, phone and desktop. |
| Leaderboards (phase 2) | `/leaderboards` | Top 20 per level and difficulty (the `get_leaderboard` function already exists). |
| Updates | `/updates` | Short player-friendly patch notes. |
| Help | `/help` | Install (Android, iPhone, desktop), sound, rotating, data size, saves and sign-in, load errors, supported browsers, contact. |
| Advertise | `/advertise` | See section 5. |
| Press kit (phase 2) | `/press` | Logo, key art, screenshots, fact sheet, contact. |
| Legal | `/privacy`, `/terms`, `/credits` | Privacy (moved from privacy.html), terms (new: accounts and leaderboards need them), credits and licences (Inter OFL etc.), the fiction disclaimer. |
| Game | `/play/` | The game itself (if decision 1 is the move). |

## 4. How to play: the design

**Platform switch** at the top: TOUCH / KEYBOARD AND MOUSE / CONTROLLER. Remembered per visitor; phones default to TOUCH. Every input on the page redraws for the chosen platform.

**Inputs drawn with the game's own art:** the real touch button art (JAB, KICK, GRAB, BLOCK, JUMP), flat key caps for the keyboard, and plain words for a controller. No console glyphs (rule 577).

**Sections:**

1. **Basics in 60 seconds:** five cards (move, jab, kick, block, grab) each with a 2-3 s looping clip.
2. **Move list:** one card per move. Clip, input strip, one-line "when to use it", and a power meter (light / medium / heavy). Exact numbers sit in a "details" fold for players who want them.
   - Jab, high kick, back kick, uppercut, air kick, 5-hit combo, block, pick up / carry / throw, rush, rush kick, running leap, RamRage.
3. **Combos and chains:**
   - Double-tap JAB: 5-hit combo (and its boss finisher trigger).
   - GRAB then JAB: beat-down; JAB again quickly: the long fist combo.
   - Rush, then JAB / double-tap / KICK inside the follow-up window.
   - Flick back, then forward: RamRage (needs a full stamina bar; free in Rage).
   - Running leap into an air kick.
   - Throw a body into a crowd.
   - Machete HIT, HIT and hold during Rage: Rage Tornado.
   - A "combo map": a simple diagram of what can follow what.
4. **Systems:** Rage (how it fills, x1.6 damage, 7 s), stamina gauge, block (front only; the Agbero side kick breaks it), health recovery and medpacks, hit counter and CLUTCH saves, executions (timed GRAB presses, GOOD / PERFECT), retreat limit, checkpoints.
5. **Practice pad (phase 2):** a copy of the touch pad on the page. The visitor taps a sequence and the page names the move it would fire and shows its clip.

**One source of truth:** the move data lives in one file (`site/data/moves.json`). A check script run by `build-web.js` compares its numbers and grade bands with the constants in `game.js` (ATTACKS, SCORE.ranks, DIFFICULTY, RAM, RUSH) and fails the build if they drift.

**Game to site links (phase 2, game change):**
- a FULL MOVE LIST row on the in-game HOW TO PLAY page,
- a WHAT GRADES MEAN link on the results grade key,
- each opening the matching page section.

## 5. Advertising

The board system already exists (rr-ads Worker: booking, artwork fitting, Paystack, rotation shares, view and tap counts, policy v3, refunds). The site is its front door, not a second system.

**`/advertise` page:**
- Why advertise: who plays, where boards appear, how a view is counted (half the face on screen for 1 s, once per pass) and a tap (opened from VISIT POSTS).
- Board gallery: each board shown in the game scene, size, shares, price per month and free dates, read live from the rr-ads public board list. BOOK THIS BOARD opens the existing board page.
- How booking works, in four steps.
- Policy summary with betting and alcohol allowed under conditions (rule 596), refund table, link to the full policy.
- Advertiser FAQ.

**Supporting changes:**
- Point `ads.ratelrage.com` at the rr-ads Worker so advertisers see one brand. QR codes follow `ads-config.js`.
- **Recommended:** no third-party ad network on the website. The game is for all ages, the site should stay fast, and it keeps the privacy page simple (no cookie banner).
- **Optional:** an "On the boards now" strip on the home page that shows current paid adverts, as an extra for advertisers. Needs a line in the policy.
- **Optional:** public audience numbers (players per week, board views) from rr-stats on /advertise. Owner's call.

**Screenshots** on the site show house art on the boards, never a paying advertiser's artwork.

## 6. Hosting and structure

**Recommended:** website at `ratelrage.com/`, game at `ratelrage.com/play/`, one Cloudflare Pages project, one build (`node deploy/build-web.js` builds both), so rule 606 deploys cover both.

Saves are kept: localStorage is per origin, and the origin doesn't change.

**Migration checklist for the move:**
- **Installed app:** `manifest.webmanifest` start_url and scope move to `/play/`. The root forwards `?app=1` there, because installed apps keep the old start_url.
- **Service worker:** `media-sw.js` moves to `/play/` scope. Unregister the old root worker from the site.
- **Sign-in:** OAuth return links (`#access_token`, `?code=`, `error=`) that land on the root are forwarded to `/play/`. Add `/play/**` to the Supabase redirect list.
- **Saves carried from pages.dev:** the old pages.dev `#fragment` save hand-over is forwarded to `/play/`.
- **Return reminders:** the push notification URL is `/play/`.
- **Adverts:** rr-ads `GAME_ORIGIN` links and the game's "advertise" links are checked.
- **Bookmarks:** old bookmarks of `ratelrage.com` land on the site with a big PLAY NOW. On a phone in landscape, or when returning from a game session, they could go straight to `/play/` (optional).
- **Tests:** the existing harnesses re-run against `/play/`.

**Alternative (lower risk, weaker front door):** the game stays at the root and the site lives at `/guide/`.

**Technology:**
- Plain static HTML, CSS and a little vanilla JS in `site/`, like the game: no framework, no bundler.
- Pages written in HTML partials and assembled by build-web.js.
- First load target under 1.5 MB on a phone. Images as WebP. Clips as short muted MP4/WebM under 1 MB each, lazy-loaded.

**Look:**
- Same as the game menus: dark street palette, green accent #36d67e, the short red rule #e3242b.
- Inter self-hosted cuts (rule 639/640), tracked capitals for labels and headings.
- Square corners everywhere (rule 603).
- Mobile first: most players are on phones.

**SEO and sharing:** page titles and descriptions, an Open Graph image per page, VideoGame structured data, sitemap.xml, robots.txt, canonical links.

**Analytics:** the Cloudflare Web Analytics beacon already used, plus a few site events to rr-stats (PLAY NOW clicks, which how-to-play sections are opened) to learn what confuses players. No cookies.

**Accessibility:** keyboard navigation, alt text, captions or text for every clip, reduced-motion support (clips paused, stills shown).

## 7. Media to produce

- 12-20 screenshots: Level 01 street, boss, Rage, RamRage, weapons, Level 02 strong room and server defence, evidence board, menus, phone shots with the touch pad. Captured from the real game with the existing harnesses.
- About 25 short move clips (2-3 s each, one per move/combo). **Risk:** headless Chrome renders slowly (software GPU), so clips may need frame-by-frame capture on the game clock, or recording on the owner's phone/PC.
- Key art for the hero and share image (existing title art, Darki story art, dossier art).

## 8. Rules that apply

- Inter fonts.
- Square corners.
- No console glyphs.
- No age gate.
- Betting and alcohol adverts allowed with conditions.
- Push + build + deploy + curl check in the same turn (rule 606).
- Fiction firewall: only approved fictional names, never internal tags.
- The fiction disclaimer (request 541) on Story and Legal pages.

## 9. Build phases

**Phase 1 (launch):**
- Home, How to play (with Combos), Grades, Story, Enemies, Weapons, Levels, Gallery, Help, Advertise (static and linking to rr-ads), Legal.
- The `/play/` move.
- Screenshots and clips.
- The drift check.

**Phase 2:**
- Practice pad.
- Live board list and prices.
- Leaderboards.
- Updates.
- Press kit.
- In-game links to the site.
- `ads.ratelrage.com`.

**Phase 3:**
- "On the boards now" strip.
- Public audience numbers.
- Newsletter or community links, once official accounts exist.

## 10. Decisions needed from the owner

1. **URL:** site at the root and game at `/play/` (recommended), or game stays at the root and site at `/guide/`?
2. **Old WEB site:** retire "Ratel Rage HQ" (recommended), or keep any of its features (playtest sign-up, idea voting, bug reports)?
3. **Fix the game first:** add a keyboard kick key and keyboard combos, hide or build the 4 dead options, and fix the touch uppercut that fires a kick first?
4. **Controller:** describe it in plain words, or leave it off the site?
5. **Spoilers:** how much story to show (Level 02 ending, the Minister Kiwe reveal), behind a spoiler toggle or not at all?
6. **Advertising:** no third-party ads on the site (recommended)? Publish audience numbers? Add an "On the boards now" strip?
7. **Leaderboards:** public, with player names?
