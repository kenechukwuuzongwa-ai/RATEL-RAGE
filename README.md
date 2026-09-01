# Rage of Ratels — browser vertical slice

A dependency-free HTML5 Canvas prototype containing three playable fictional case files:

1. Sound Kleft / Sound Boys
2. Receipt Queen / Market Influencers
3. Miracle Merchant / Miracle Guards

All characters are original, code-rendered human arcade characters. The game does not use the reference photograph in the adjacent `ASSETS` folder.

## Run

Serve this directory with any static HTTP server, then open the shown localhost URL. For example:

```powershell
python -m http.server 4173
```

Or with Node (if Python is not installed):

```powershell
npx http-server -p 4173
```

## Controls

- Move: WASD / arrows
- Jump: Space
- Quick Jabs (fast two-hit flurry): left mouse button / J
- Uppercut (heavy launcher): right mouse button / K
- Combo: jab then right-click in quick succession cancels the jabs into the uppercut
- Rage: fills as you deal/take damage and auto-bursts into a temporary power state when full

## Project layout

- `src/game.js` — the single-file engine (movement, combat, AI, render, dev panel)
- `sprites/` — all character sprite sheets + their Sorceress-analyzer JSONs
  (`darki-*` = the player Darki, `enemy-*` = the street enemy "Ginger")
- `layers/` — Level 1 parallax background art (sky / far / mid / gameplay)
- `tests/` — headless/visual harnesses (`drive.html`, `sheetview.html`, …)
- `docs/` — design walkthroughs · `_unused/` — retired/duplicate source art

A dev tuning panel (gear, top-right) exposes live parallax/fog/fighter/shadow
sliders; **Save** persists them to local storage.
