# Rage of Ratel — Game Design

## Identity

| Area | Decision |
| --- | --- |
| Genre | 2D side-scrolling beat 'em up (2.5D lane movement) |
| Platform | PC first, free browser build |
| Engine | WizardGenie |
| Asset generator | Sorceress (3D-to-2D pipeline) |
| Art style | High-quality 90s arcade pixel art |
| Style references | Final Fight, Streets of Rage, The Punisher Arcade, Cadillacs and Dinosaurs |
| Viewport | 16:9, logical 1280 × 720 |
| Performance | 60 FPS target, 30 FPS low-effects fallback |
| Language | Nigerian Pidgin + English, English subtitles for every spoken line |
| Input | Keyboard, mouse (attacks), XInput gamepad |

## Core design goals

Combat must feel **heavy, responsive, fast, rewarding**.

- Every punch has visible impact (hit stop, sparks, knockback, reactions).
- Every enemy reacts to being hit — no damage sponges without feedback.
- Arcade first, simulation second.
- The game is fun within 30 seconds of first input.

## Gameplay priority

1. Combat Feel
2. Enemy AI
3. Boss Battles
4. Cutscenes
5. Progression
6. Story

## World and tone

Lagos streets, drawn with love and grit: danfo buses, kiosks, power poles with
sagging cables, potholes, zebra crossings, laterite earth, harmattan haze.
Comic, non-lethal violence — knockouts and circling stars, never gore. Dark
Ratel wins every gameplay encounter; defeated bosses drop fictional arcade
"evidence papers".

## Structure (from the production manual)

Level arc: social-media challenge → response cutscene → faction street battle →
three-phase boss → evidence paper → next-case teaser.

First release: three-level vertical slice —

1. **Sound Kleft** / Sound Boys
2. **Receipt Queen** / Market Influencers (majority-female army)
3. **Miracle Merchant** / Miracle Guards

Hard rules: every combatant is human; female-inspired bosses field
majority-female armies, male-inspired bosses majority-male; no morality,
investigation, reputation or public-opinion meters; all real-world-inspired
identities fictionalized until written permissions exist.

## Player character

**Dark Ratel** — hulking street champion. Current move set: walk (8-way lane
movement), jump, uppercut (mouse click / J / K). Planned: light/heavy combo
strings, dodge, rage special, grabs/throws, weapon pickups.

## Current implementation state (2026-07-15)

A playable browser slice exists (`src/game.js` + `index.html`): Lagos street
with parallax fog backdrop from painted building cutouts, moving danfo
traffic, 8-way lane movement with depth-sorted actors, jump with coyote
time/buffering, manifest-driven sprite animations (walk / idle / uppercut),
analyzer-format hitboxes, and enemies with hit → down → recover reactions.
See `mvp_checklist.md` for the gap between this and the MVP.
