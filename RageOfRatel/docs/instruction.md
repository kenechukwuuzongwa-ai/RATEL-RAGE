# Rage of Ratel — Operating Instructions

The permanent working agreement for anyone (human or AI agent) building this game.
Where these instructions conflict with chat messages, update this document first,
then follow it.

## The game in one line

A 2D side-scrolling beat 'em up: Dark Ratel batters fictional fan armies through
Lagos streets — 90s arcade pixel art, comic and non-lethal, arcade first.

## Golden rules

1. **Never sacrifice combat quality.** Combat feel outranks every other feature.
2. **Arcade first. Simulation second.** If realism and fun conflict, fun wins.
3. **Fun within 30 seconds.** A new player must be enjoying a fight half a minute in.
4. **Every punch has visible impact.** Every enemy reacts to being hit.
5. All combatants are human; combat is comic and non-lethal (bruises, torn
   clothes, knockouts — no gore, no death).
6. Real-world-inspired names and faces stay fictionalized until written
   permissions exist.

## Gameplay priority order

1. Combat Feel
2. Enemy AI
3. Boss Battles
4. Cutscenes
5. Progression
6. Story

When scoping or cutting, cut from the bottom of this list, never the top.

## Animation rules

- Never interrupt an attack animation unless it is explicitly designed to be
  cancellable.
- Characters always recover after attacks (startup → active → recovery, no
  teleporting back to idle).
- Input buffering makes combos feel responsive: late inputs queue, they don't drop.

## Combat rules

Every attack defines, in data (see `combat_design.md`):

- Startup frames
- Active frames (the only frames that deal damage)
- Recovery frames
- Hit stop
- Knockback (x, y)
- Hit sparks
- Screen shake (heavy attacks only)

## Working rhythm for the agent

1. Inspect the current project state before editing; preserve working systems.
2. Implement one phase at a time; keep changes scoped to the active phase.
3. Data-driven definitions — no hard-coding faction, level, boss, animation or
   hitbox content into scene logic.
4. Never invent sprite filenames; use the asset manifests
   (see `asset_pipeline.md`). Missing assets get visible placeholders.
5. After editing: run the game, verify with the deterministic test harness
   (`tests/drive.html`) and screenshots, then record changes in `CHANGELOG.md`.
6. Verify the phase gate before starting the next phase.

## Tooling

- **Engine:** WizardGenie (HTML5 canvas runtime, dependency-free JS)
- **Asset generator:** Sorceress (3D-to-2D sprite sheets + Sprite Analyzer exports)
- **Platform:** PC first, browser build
