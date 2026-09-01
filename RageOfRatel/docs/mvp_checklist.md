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
- [x] Pause overlay that preserves scene state (P/Enter; dim wash + PAUSED plate)

## 1. Combat Feel  ← never sacrifice

- [x] 8-way movement with lane depth, walkable road band
- [x] Jump: coyote time, input buffer, variable height
- [x] First attack (uppercut) — data-driven active frames, damage, knockback
- [x] One-hit-per-swing; damage only on `active: true` frames
- [x] Enemy hit reaction: knockback launch → KO'd on tarmac → get up
- [x] **Hit stop** on contact (~0.09 s freeze, tunable)
- [x] **Hit sparks** — starburst at the contact point on every confirmed hit
- [x] **Screen shake** — short decaying camera jolt on the uppercut (tunable)
- [x] Attack input buffering (`bufferedAttack` + 0.18 s `attackBufferT` window)
- [x] Light combo string — jab chains + the LMBx2 5-hit combo (fists→launcher)
- [x] Heavy attack distinct from light (jab = light; uppercut / high & back kick = heavy launchers)
- [x] Player hurt state + knockdown/get-up (i-frames, hurt, KO second-wind; enemies lunge and hit back)
- [x] Player + enemy health; enemy KO → down/fade, wave-managed (no infinite respawn)
- [x] Walk-up auto-face: idle squares up to `nearestEnemy()`
- [ ] 30-second test: new player smiling before the first zebra crossing

## 2. Enemy AI

- [x] Enemies exist on lanes, depth-sorted with the player
- [x] Sprite-based enemy (Ginger: idle/hit on one sheet, stride walk on another)
- [x] Enemies guard up and face the player when close
- [x] Enemies seek the player and attack (patrol → engage → attack loop)
- [x] Steering collision avoidance: walk around each other + behind the player
- [x] Attack-token mob AI (SoR blueprint): 1 attacks, rest circle/surround, take turns
- [x] Enemies surround from slots (some behind), telegraph windup, lunge, recover
- [ ] Distinct archetypes (rusher/flanker/thrower/brute) split out of the shared AI
- [ ] Thrower archetype (ranged object, telegraphed)
- [ ] Brute archetype (no flinch on lights, heavy knockdown only)
- [ ] Mixed male/female army variants per faction rules
- [x] Spawn waves per street section; "GO →" arrow when cleared (3 gated arenas,
      drip-fed kill quotas, camera+player wall, GO arrow, AREA CLEARED banner)

## 3. Boss Battle (MC_Olodo)

- [x] Boss actor: MC_Olodo, locked arena past gate 3, locked camera, exactly one
      body ever. Three sheets — the EMOTE bob IS his combat stance (no walk cycle
      by design), `SpecialMove` drives the 28-step fist combo (telegraph →
      straight → cross → showboat; the flourish is the punish window), and
      `SpiningHookKick` drives the kick. One move table each; `b.move` is
      whichever he committed to
- [x] Boss moveset with STRATEGY: intent is picked once when his rest runs out
      and he then closes to that move's range — the boot out-reaches his fists,
      so retreating out of punching range stops being safe, and the hands stay
      his default up close (35% kick mix). Measured mix at full health:
      5 combos to 4 kicks per 20 s
- [~] Phases: **two gears, not three** — base, then enrage under 45% HP (faster,
      hotter anim fps, shorter rest) with its own signature move: the multi-spin
      super, 2-4 laps rolled per performance, gated to second gear and behind a
      10-16 s cooldown (0 in a calm 60 s bout, 2 in an enraged one). A third
      HEALTH gear is still open
- [x] Armor windows: super armour, never immune — lights chip and flash him but
      don't break rhythm, only `isHeavyHit` jolts him (0.14 s), only the killing
      blow floors him
- [x] Boss intro card + health bar: 4-beat entrance cutscene off one clock
      (letterbox → swagger-in → name plate SLAM on white flash/shake/embers →
      FIGHT!), every input edge swallowed, Enter/Start skips to the same marks;
      full-width HP plate replaces the little floating bar
- [x] Evidence paper drop + case-closed screen: the ledger flutters out of the
      dying boss, Darki walks over and picks it up, CASE CLOSED slams up over
      the frozen street and HOLDS (no reset path to hand control back to).
      Same one-clock phase list as the entrance; Enter/Start skips to the card

## 4. Cutscenes

- [ ] Challenge cutscene (social-media post style) before the level
- [ ] Response cutscene → street battle handoff
- [ ] Skippable, subtitle every spoken line (Pidgin + English)

## 5. Progression

- [ ] Score (hits, combos, style bonus), arcade HUD
- [ ] Case-file select screen (locked cases teased)
- [ ] Versioned local-storage save (unlocks, best scores)

## 6. Story

- [x] Case file text for the Level 1 boss (fictionalized — MC_Olodo, his corner
      and his ledger are invented). Copy lives in `CASE_FILE`, apart from the
      staging, so rewriting the case never touches a beat
- [x] Next-case teaser after the boss ("whoever was paying him", on the file)

## Asset queue (see prompt_library.md for prompts)

- [x] Dark Ratel: jab / combo / high & back kick / uppercut sheets (+ uppercut hits.json)
- [ ] Dark Ratel: hurt, KO/get-up sheets
- [x] Rusher walk/idle/hurt/attack sheets (Ginger) — dedicated KO sheet still nice-to-have
- [ ] Thrower + projectile, Brute sheets
- [x] MC_Olodo boss sheets: stance (`boss-olodo-emote`, 81 frames keyed+cropped
      out of `ASSETS/MC_Olodo EMOTE.mp4`), `boss-olodo-special` (fist combo) and
      `boss-olodo-hookkick` (the spinning hook kick + the multi-spin super).
      NOTE the trap — they do NOT all face the same way: stance and hook kick
      face LEFT (`faces: -1`), SpecialMove faces RIGHT (`faces: 1`). Check the
      cap peak on a blown-up head, never a thumbnail
- [ ] Impact FX sheet (sparks, dust, stars)
- [~] SFX → `sounds/`: **punches done** (hit1/2/3.mp3, shuffled + pitch/volume varied, weight-scaled); whooshes, KO, crowd, danfo horns still needed
- [~] Music → `music/`: **street loop done** (`level1.webm`, looping, fade-in, mutable); boss loop still needed

## Definition of done (MVP)

One street, one wave system, three enemy archetypes, one 3-phase boss,
full combat feel stack (stop/sparks/shake/buffer/combos), sound on hits,
30-second fun test passed by someone who isn't us.
