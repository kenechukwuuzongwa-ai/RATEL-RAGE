# Rage of Ratel — MVP Checklist

MVP = one Lagos street level that is **immediately fun within 30 seconds**:
tight combat against reacting group AI, ending in a boss fight. Ordered by the
gameplay priority (combat feel first). Check items only when verified in-game
via `tests/drive.html` + screenshots.

## 0. Foundation

- [x] Browser runtime, 1280×720, dependency-free (WizardGenie project)
- [x] Deterministic test harness (`tests/drive.html`, `?walkshot=N`, debug hitboxes)
- [x] CHANGELOG discipline
- [ ] Migrate runtime + assets into the `RageOfRatel/` folder structure
      (sprites → `sprites/`, scenery → `assets/`, level data → `levels/`)
      without breaking the running slice
- [ ] Boot-time validation of all manifests (fail loudly with a visible list)
- [ ] Pause overlay that preserves scene state

## 1. Combat Feel  ← never sacrifice

- [x] 8-way movement with lane depth, walkable road band
- [x] Jump: coyote time, input buffer, variable height
- [x] First attack (uppercut) — data-driven active frames, damage, knockback
- [x] One-hit-per-swing; damage only on `active: true` frames
- [x] Enemy hit reaction: knockback launch → KO'd on tarmac → get up
- [ ] **Hit stop** on contact (light 3f / heavy 6–8f @ 60 fps)
- [ ] **Hit sparks** at the contact point on every confirmed hit
- [ ] **Screen shake** on heavy hits only (≤ 6f, ≤ 8 px)
- [ ] Attack input buffering (queue during animations, ~0.15 s window)
- [ ] Light combo string (jab → jab → straight) with link windows
- [ ] Heavy attack distinct from light (the uppercut becomes the heavy)
- [ ] Player hurt state + knockdown/get-up (enemies can hit back)
- [ ] Player + enemy health; KO removes enemy after down state
- [ ] Walk-up auto-face: attacks face the nearest threat direction
- [ ] 30-second test: new player smiling before the first zebra crossing

## 2. Enemy AI

- [x] Enemies exist on lanes, depth-sorted with the player
- [ ] Enemies seek the player and attack (stop patrolling decoratively)
- [ ] Group logic: 2–4 engage, others circle; attack tokens prevent stun-lock
- [ ] Flanker archetype (uses lanes to get behind)
- [ ] Thrower archetype (ranged object, telegraphed)
- [ ] Brute archetype (no flinch on lights, heavy knockdown only)
- [ ] Mixed male/female army variants per faction rules
- [ ] Spawn waves per street section; "GO →" arrow when cleared

## 3. Boss Battle (Sound Kleft)

- [ ] Boss actor with 3 phases (pattern + visual change per phase)
- [ ] Phase transitions with armor windows (reacts to hits, never immune)
- [ ] Boss intro card + health bar
- [ ] Evidence paper drop + case-closed screen

## 4. Cutscenes

- [ ] Challenge cutscene (social-media post style) before the level
- [ ] Response cutscene → street battle handoff
- [ ] Skippable, subtitle every spoken line (Pidgin + English)

## 5. Progression

- [ ] Score (hits, combos, style bonus), arcade HUD
- [ ] Case-file select screen (locked cases teased)
- [ ] Versioned local-storage save (unlocks, best scores)

## 6. Story

- [ ] Case file text for Sound Kleft (fictionalized, permission rule respected)
- [ ] Next-case teaser after the boss

## Asset queue (see prompt_library.md for prompts)

- [ ] Dark Ratel: jab/straight sheets + hits.json
- [ ] Dark Ratel: hurt, KO/get-up sheets
- [ ] Rusher m/f: walk, attack, hurt, KO sheets (replace placeholder rectangles)
- [ ] Thrower + projectile, Brute sheets
- [ ] Sound Kleft boss sheets (3 phases)
- [ ] Impact FX sheet (sparks, dust, stars)
- [ ] SFX: punches, whooshes, KO, crowd, danfo horns → `sounds/`
- [ ] Music: street loop + boss loop (highlife/afrobeat energy) → `music/`

## Definition of done (MVP)

One street, one wave system, three enemy archetypes, one 3-phase boss,
full combat feel stack (stop/sparks/shake/buffer/combos), sound on hits,
30-second fun test passed by someone who isn't us.
