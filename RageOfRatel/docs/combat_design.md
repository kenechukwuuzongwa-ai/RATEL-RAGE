# Rage of Ratel — Combat Design

Combat feel is priority #1. Heavy, responsive, fast, rewarding.

## Anatomy of every attack

Every attack is defined in data (manifest sections + `.hits.json`), never
hard-coded:

| Phase | Rule |
| --- | --- |
| Startup | Wind-up frames; no damage; readable silhouette |
| Active | The ONLY frames with live hitboxes (`active: true`) |
| Recovery | Vulnerable follow-through; always plays; never skipped |

Plus, per attack:

- **Hit stop** — freeze both actors for a few frames on contact (heavier
  attack = longer stop). Target: light 3 frames, heavy 6–8 @ 60 fps.
- **Knockback** — data-driven `{x, y}` per hitbox; heavy attacks launch.
- **Hit sparks** — impact flash at the contact point, every confirmed hit.
- **Screen shake** — heavy attacks and slams only; short and sharp (≤ 6 frames,
  ≤ 8 px). Never on light hits.

## Animation rules

- An attack in progress is never interrupted unless the move is explicitly
  cancellable (cancel windows are listed per move, none exist yet).
- One hit per enemy per swing (`id` in hits.json identifies the swing).
- Characters always recover — no snapping to idle from active frames.

## Input

- **Buffering:** attack/jump inputs pressed during an animation queue and fire
  the frame it ends (window ~0.15 s). Jump already buffers (0.12 s) with
  coyote time (0.1 s); attacks must get the same treatment.
- Combos: light-light-light strings chain when the next press lands during a
  late-recovery link window; combo resets on whiff or hit-stun end.

## Current move set (implemented)

| Move | Input | Data | Notes |
| --- | --- | --- | --- |
| Walk | WASD / arrows / stick | Newwalksprite.json | 8-way, lane depth ±, anim rate scales with speed |
| Jump | Space / W | — | coyote 0.1 s, buffer 0.12 s, variable height |
| Uppercut | Mouse click / J / K | VDM-Uppercut.json + .hits.json | frames 9–14 active, dmg 14, kb {240, −460}; locks movement; grounded only |

Missing from the loop: hit stop, hit sparks, screen shake, combo strings,
attack input buffering, player hurt/KO states, health.

## Enemy design

Every enemy reacts visibly to every hit. Current reaction chain (implemented):
**hit** (airborne knockback, tilted) → **down** (KO'd flat, circling stars,
1.6 s) → get up and resume.

### Archetypes (target roster)

| Archetype | Behaviour |
| --- | --- |
| Rusher | Runs straight in, quick light attacks, low HP |
| Flanker | Circles via lanes to attack from behind while a rusher engages |
| Thrower | Keeps distance, lobs objects (bottles, sandals, POS machines) |
| Brute | Slow, absorbs damage (no flinch on lights), needs heavies/juggles |

Group rules: enemies attack in groups (2–4 engaged, rest circling); attackers
take turns (token system) so mobs pressure without stun-locking; mixed-gender
armies per faction rules in `game_design.md`.

### Bosses

Multiple phases (three per boss), each phase changes attack pattern and
visuals (torn clothing, sweat, rage). Boss order: Sound Kleft → Receipt
Queen → Miracle Merchant. Bosses obey the same hit-reaction rules — with
armor windows, not immunity.

## Tuning values (current)

- Player: maxSpeed 340, accel 2600, jump 780, gravity 2000, depth speed 190.
- Enemy knockback physics: gravity 2200, down timer 1.6 s.
- Lane band: y 610–700; hits require |Δlane| ≤ 32.

Iterate these in playtests; combat feel reviews happen every phase gate.
