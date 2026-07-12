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

- Move: WASD / arrows / left stick
- Light attack or pick up: J / gamepad X
- Heavy attack: K / gamepad Y
- Jump: Space / gamepad A
- Dodge: L / gamepad B
- Rage special: U / right bumper
- Pause: Enter / Start
- Advance cutscenes: J, Space, Enter, X or A

The prototype saves unlocked case files and best scores in versioned local storage.
