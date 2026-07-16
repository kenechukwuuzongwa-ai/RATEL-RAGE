# RageOfRatel

2D side-scrolling beat 'em up. 90s arcade pixel art. Lagos streets.
Arcade first — combat feel is never sacrificed.

```
RageOfRatel/
├── docs/            ← start here
│   ├── instruction.md      the permanent working agreement
│   ├── game_design.md      identity, world, rules, current state
│   ├── mvp_checklist.md    the living to-do — update every phase
│   ├── asset_pipeline.md   Sorceress → Sprite Analyzer → runtime
│   ├── combat_design.md    attack anatomy, archetypes, tuning
│   └── prompt_library.md   reusable generation + phase prompts
├── assets/          scenery, props, UI art
├── sprites/         character sheets (+ manifests, hits.json)
├── sounds/          SFX
├── music/           loops
├── cutscenes/       cutscene data/art
└── levels/          level definitions
```

The playable slice currently runs from the repository root (`index.html`,
`src/game.js`); migrating it into this tree is tracked in
`docs/mvp_checklist.md` §0. Read `docs/instruction.md` before changing
anything.
