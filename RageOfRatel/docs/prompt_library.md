# Rage of Ratel — Prompt Library

Reusable prompts for asset generation (Sorceress) and implementation phases
(Fable 5 in WizardGenie). Fill the {braces}, keep the constraints.

## Sorceress — character sheet generation

### Style block (append to every character prompt)

> High-quality 90s arcade beat-'em-up pixel art in the style of Final Fight,
> Streets of Rage, The Punisher Arcade, Cadillacs and Dinosaurs. 32-bit
> Afro-comic look, strong silhouette, side-view game camera, uniform flat
> background for keying, no ground shadow baked in, full body in frame with
> consistent scale across all frames.

### Animation export

> Export {CHARACTER} {ACTION} as a sprite sheet via Sprite Analyzer:
> uniform grid, all frames the same size, character feet consistent to the
> baseline. Define animation sections (start/middle/end or named custom
> sections) and per-section fps in the manifest. For attacks, author combat
> hitboxes (.hits.json) on the active frames only, with damage and knockback.

### Character brief template

> {NAME}, {ROLE — e.g. street rusher, brute, boss phase 2}. Human, Nigerian
> street fashion {detail: agbada / ankara shirt / okrika tee / gele ...},
> {build}, {palette}. Non-lethal comic fighter: expressive hurt and KO poses,
> no blood. Actions needed: {walk, jab, hurt, KO, get-up, ...}.

## Fable 5 — implementation phase prompt

> Read RageOfRatel/docs (instruction.md, combat_design.md, asset_pipeline.md,
> mvp_checklist.md) first. Implement ONLY phase: {PHASE NAME}.
> Inspect the current project before editing; preserve working systems; keep
> definitions data-driven; use asset manifests, never invented filenames.
> After editing: run the game, verify via tests/drive.html (extend it for the
> new feature), take screenshots, update CHANGELOG.md and mvp_checklist.md.
> Gate: {observable pass condition — e.g. "enemy flinches, hit spark spawns,
> and 4-frame hit stop occurs on every landed jab, verified in the sim log"}.

## Ready-to-run asset prompts (queue)

1. Dark Ratel — jab + straight combo sheets, hits.json on active frames.
2. Dark Ratel — hurt (flinch) and KO/get-up sheets.
3. Street rusher male ("Sound Boy") — walk, jab, hurt, KO.
4. Street rusher female — walk, slap combo, hurt, KO.
5. Thrower — walk, throw (bottle), hurt, KO + bottle projectile sprite.
6. Brute — walk, haymaker, armored flinch, KO.
7. Sound Kleft boss — idle, walk, mic-swing, speaker-slam, 3 phase looks.
8. Impact FX sheet — hit sparks (light/heavy), dust, KO stars.
9. Lagos props — kiosk, okada, market stalls (paper background for keying).
10. UI — health bars, portrait frames, "RAGE" meter, arcade font.
