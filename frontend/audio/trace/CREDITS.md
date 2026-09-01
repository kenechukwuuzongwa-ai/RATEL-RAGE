# Evidence-board tracing cues

The four cues the post-mission board draws its connections to. Built by
`_chromakey/sfxbuild.js` — rerun it to rebuild them from source.

## Source

**CC0 Sci-Fi SFX** by *rubberduck*, from OpenGameArt.
<https://opengameart.org/content/50-cc0-sci-fi-sfx>

Licence: **CC0 1.0 (public domain dedication)**. No attribution is required;
this file exists so the next person knows where the sound came from and can
rebuild it, not because the licence demands it.

## What each cue is, and why that clip

Picked on measurements from `_chromakey/sfxprobe.js`, not on filenames.

| Cue | Source clip | Why |
| --- | --- | --- |
| `trace-draw.wav` | `loop_machine_03.ogg` | The BED, under a line while it is being drawn. The only clip in the pack with a dead-flat envelope across all twelve buckets — no shape of its own, so it can be cut to any trace length without a bump landing in the wrong place. 1.6 s covers the longest trace (0.62 s) several times over. |
| `trace-land.wav` | `terminal_04.ogg` | A line ARRIVING. Front-loaded, 0.24 s, and then it stops. A connection landing is a hard data event, not a fade. |
| `trace-node.wav` | `terminal_06.ogg` | A circle landing. Deliberately softer than the line land — three evidence nodes appearing under the read must not shout over the voice. |
| `trace-unknown.wav` | `misc_11.ogg` | An UNIDENTIFIED rung of the Cabal chain. Its envelope swells and falls away without resolving (0-2-8-9-7-5-3-2-2-1) — a reach that does not arrive, which is the entire meaning of those two circles. |

## Why WAV and not the original Ogg

The pack ships Ogg Vorbis. Chrome and Firefox decode it; Safari's support for
Vorbis-in-Ogg has never been dependable, and a cue that silently fails to
decode is a cue nobody notices is missing until a player reports a dead screen.
16-bit PCM decodes everywhere, and at these lengths the files are smaller than
the mp3s already in `frontend/audio/`.

Trimmed, peak-matched and ramped at build time, so `aftermath.js` does not need
a table of per-file lead-ins the way the navigation cues in `frontend.js` do.
