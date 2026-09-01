/* RATEL RAGE — story data, character identities and the level table.
 *
 * ============================ WHAT THIS FILE IS FOR ==========================
 *
 * Everything the player READS about the case lives here as data. No screen in
 * this game writes its own copy, and no copy in this game carries a coordinate.
 * A case can be rewritten without touching a draw call, and a screen can be
 * relaid out without touching a word.
 *
 * ========================== THE FICTION FIREWALL =============================
 *
 * RATEL RAGE takes its ATMOSPHERE from real Nigerian street life. It takes its
 * PEOPLE from nowhere. Every character, organisation, accusation, recording,
 * testimony and case number in this game is invented.
 *
 * Production notes may carry an `internalReference` — a development tag used to
 * keep the writers' room organised. Those tags are METADATA. They must never
 * reach a player, in any form: not in copy, not in a label, not in a debug
 * readout, not in an accessibility string, not in a save file.
 *
 * That rule is not left to discipline. `resolveIdentity()` below is the ONLY
 * way to get a name out of this file, it returns nothing but the approved
 * fictional identity, and `assertPlayerSafe()` will refuse a string that has an
 * internal tag in it. See CharacterIdentityResolver at the bottom.
 */

/* ---------------------------------------------------------------- people ---
 * `internalReference` is a development tag. `displayName` is the ONLY name that
 * may be rendered. The two are deliberately kept in one record rather than in
 * two files: a mapping you have to go and find is a mapping that drifts, and a
 * tag sitting next to the name it must never be confused with is a tag the next
 * person to edit this cannot miss.
 */
const CHARACTERS = {
  darki: {
    internalReference: 'PLAYER_001',
    displayName: 'Darki',
    role: 'Street investigator',
  },
  olodo: {
    internalReference: 'CASE_SUBJECT_000',
    displayName: 'MC Olodo',
    /* WITH the MC. "OLODO DEFEATED" on the mission card read like a different
     * man to the "MC OLODO" in the row directly under it. */
    shortName: 'MC OLODO',
    role: 'Motorpark Chairman',
    level: 1,
  },
  jibril: {
    internalReference: 'CASE_REFERENCE_001',
    displayName: 'Commissioner Masood Jibril',
    shortName: 'MASOOD JIBRIL',
    rank: 'COMMISSIONER',
    /* NOT "the head of The Cabal". The whole point of this beat is that nobody
     * — including the player — knows how high he sits. Any copy that settles
     * that question is a copy bug, not a wording preference. */
    role: 'Senior police official · position in the network unconfirmed',
    level: 2,
  },
  cabal: {
    internalReference: 'ORG_UNKNOWN',
    displayName: 'The Cabal',
    role: 'Identity unknown',
  },
};

/* Every internal tag, for the leak check. Built from the records so a new
 * character cannot be added without its tag joining the blocklist. */
const INTERNAL_TAGS = Object.values(CHARACTERS)
  .map((c) => c.internalReference)
  .filter(Boolean);

/* --------------------------------------------------------------- levels ---
 * One row per level. `intro` names the video the level opens on; a level with
 * no cut of its own falls back to the shipped intro rather than to a black
 * screen, and `introOwn` records which of those two the player actually got so
 * a test can tell "reused deliberately" from "wired up wrong".
 */
const LEVELS = {
  1: {
    id: 1,
    code: 'LEVEL 01',
    title: 'THE STREET TAX',
    place: 'LAGOS ISLAND · BALOGUN STREET',
    boss: 'olodo',
    intro: '../frontend/intro/intro.mp4?v=master37-fixed',
    introOwn: true,
    caseNo: 'CASE FILE 001',
    playable: true,
  },
  2: {
    id: 2,
    code: 'LEVEL 02',
    title: 'THE COMMISSIONER',
    place: 'LAGOS · POLICE COMMAND',
    boss: 'jibril',
    /* No cut for Level 02 has been delivered yet, so it opens on the existing
     * one. Deliberate reuse, flagged: `introOwn: false` is what a test reads to
     * prove this is a placeholder rather than a mis-wire. */
    intro: '../frontend/intro/intro.mp4?v=master37-fixed',
    introOwn: false,
    caseNo: 'CASE FILE 002',
    playable: true,
  },
};

/* ------------------------------------------------- the Level 01 aftermath ---
 * The post-mission sequence's script. Times are on the NARRATION CLOCK — the
 * voice note's own currentTime — for exactly the reason BRIEF_SCRIPT is: every
 * cue is an absolute time, so a cue that lands a beat late cannot push the one
 * after it. Error is bounded per cue, never cumulative.
 *
 * `voice` is optional. There is no aftermath read recorded yet, so the
 * controller runs the same script off its own clock and the sequence plays in
 * full — see EvidenceNarrationController. Drop a file in, point `voice` at it,
 * re-measure the cues, and nothing else changes.
 */
const AFTERMATH = {
  id: 'level01_evidence',
  voice: null,                 // e.g. '../frontend/audio/evidence1.mp3'
  fallbackDur: 15.4,           // the script's own runtime when there is no read
  typewriterSpeed: 0.035,      // seconds per character (the read owns the pace)

  /* The heading over analysisBG. NOT "connection to The Cabal" — that reveal is
   * two screens away and naming it here throws the whole beat. */
  heading: 'CONNECTION TO NEXT TARGET',
  subhead: 'Recovered from MC Olodo. Analysis in progress.',

  /* The read. Investigative, not a verdict — "points to", "appears connected",
   * "requires confirmation". Nothing here says anyone did anything. */
  narration:
    'Olodo’s phone contains a recording that points to a senior police official. '
    + 'Witness accounts and irregularities in a sensitive case appear to connect the '
    + 'same name to his network. The evidence is incomplete. We need answers.',

  /* Where each sentence of that read is typed, on the narration clock. The
   * evidence nodes hang off these same cues, so a node lands ON the sentence
   * that describes it rather than near it. */
  script: [
    [0.30, 4.60],
    [4.90, 10.30],
    [10.60, 12.40],
    [12.60, 14.30],
  ],

  /* The three recovered items. `at` is when the node lands; `draw` is when its
   * connection starts drawing itself. Each carries its own STATUS, and no
   * status is a conclusion. */
  evidence: [
    {
      id: 'phone',
      no: 'EVIDENCE 01',
      title: 'RECOVERED PHONE RECORDING',
      source: 'MC OLODO’S PHONE',
      status: 'UNDER ANALYSIS',
      /* The short form for the BOARD. The full status belongs on the detail
       * panel, where there is room for it; a 31-character caption centred
       * under a 33px circle is a caption that overlaps its neighbours. */
      nodeStatus: 'UNDER ANALYSIS',
      tone: 'gold',
      body: [
        'A recording recovered from the handset suggests Olodo was',
        'in contact with an unknown intermediary about the handling',
        'of a sensitive criminal case.',
      ],
      at: 0.70, draw: 1.30,
    },
    {
      id: 'witness',
      no: 'EVIDENCE 02',
      title: 'WITNESS TESTIMONIES',
      source: 'MULTIPLE SOURCES',
      status: 'UNVERIFIED',
      nodeStatus: 'UNVERIFIED',
      tone: 'gold',
      body: [
        'Multiple sources describe contact between Olodo’s network',
        'and a senior police official. Accounts are consistent with',
        'one another but remain uncorroborated.',
      ],
      at: 5.20, draw: 5.80,
    },
    {
      id: 'casefile',
      no: 'EVIDENCE 03',
      title: 'CASE FILE IRREGULARITIES',
      source: 'RECOVERED DOCUMENTS',
      status: 'REQUIRES FURTHER INVESTIGATION',
      nodeStatus: 'UNRESOLVED',
      tone: 'gold',
      body: [
        'Timelines, statements and case movements do not fully match.',
        'The handling of the investigation raises questions that have',
        'not been answered.',
      ],
      at: 8.60, draw: 9.20,
    },
  ],

  /* The reveal, beat by beat. Offsets from when the reveal starts, so retiming
   * the climax is four numbers in one place — see TargetRevealController. */
  reveal: {
    at: 11.20,                 // on the narration clock
    scan: 0.85,                // the sweep down the unknown node
    glitch: 0.55,              // data break
    silhouette: 0.70,          // shape resolves
    portrait: 0.90,            // …into a face
    name: 0.75,                // and the name types on under it
  },

  target: {
    character: 'jibril',
    tag: 'NEXT TARGET',
    level: 'LEVEL 02',
    /* Deliberately hedged. He is the next name on the board and nothing more
     * has been established. */
    note: 'Named across all three recovered items. Position in the network unconfirmed.',
  },

  /* ---- the second screen: what sits above him ---------------------------- */
  cabal: {
    heading: 'CONNECTION TO THE CABAL',
    narration:
      'Olodo was only one link. The evidence points higher, but the people behind '
      + 'the network remain hidden. Masood Jibril is the next name on the board. '
      + 'Beyond him, the trail disappears.',
    fallbackDur: 9.6,
    script: [[0.25, 3.40], [3.70, 7.10], [7.40, 9.20]],
    /* The chain, bottom-up. The two UNKNOWN rungs are the point: the player
     * must leave this screen certain that The Cabal exists and no more. */
    chain: [
      { key: 'olodo', top: 'MC OLODO', bottom: 'LEVEL 01 · DEFEATED', tone: 'green', portrait: true },
      { key: 'jibril', top: 'MASOOD JIBRIL', bottom: 'LEVEL 02 · NEXT TARGET', tone: 'red', portrait: true },
      /* No caption but the status. `unknown` makes the node draw the same
       * faceless avatar Masood Jibril's does — a person on the board whose face
       * has not been obtained. It used to draw a typographic '?' with another
       * '?' floating beside the line into it, which was the same word three
       * times in one column and made the circle read as a UI placeholder rather
       * than as a suspect. The dashed red line and the empty face say it. */
      { key: null, top: '', bottom: 'UNIDENTIFIED', tone: 'dim', unknown: true },
      { key: null, top: '', bottom: 'UNIDENTIFIED', tone: 'dim', unknown: true },
      { key: 'cabal', top: 'THE CABAL', bottom: 'IDENTITY UNKNOWN', tone: 'alert' },
    ],
    footer: 'THE CABAL   ·   IDENTITY UNKNOWN',
  },
};

/* --------------------------------------------------------- the case index ---
 *
 * ONE ROW PER BOSS, and the thing both of the aftermath's browsers walk.
 *
 * The post-mission screens used to know about exactly two people: MC Olodo,
 * because he is the one whose evidence AFTERMATH holds, and Masood Jibril,
 * because the reveal names him. Everything else — the chain on the Cabal page,
 * the two cards on the level choice — restated that pair in its own shape, so
 * "let the player browse the bosses" had no list to browse.
 *
 * This is that list. It is ordered the way the case runs, and it is the only
 * place that answers three questions:
 *
 *   `file` — the recovered evidence for this boss, or null. A case with no file
 *     is a case the player CANNOT open: there is nothing to read yet, and
 *     showing him an empty board would be worse than telling him it is empty.
 *     Level 02's read has not been written, so `jibril.file` is null and the
 *     Cabal page will not let him be entered. Author it, point this at it, and
 *     he becomes enterable with no other change anywhere.
 *
 *   `status` — what the board says under his name. NOT derived from `file`:
 *     "defeated" and "his file is open" are different facts that happen to
 *     agree right now, and a level completed with no read authored would make
 *     the derivation lie.
 *
 *   `level` — which mission REPLAY starts. Straight through to the front end's
 *     existing pipeline; this table adds no second way to start a level.
 */
const CASES = [
  {
    id: 'olodo',
    boss: 'olodo',
    level: 1,
    status: 'DEFEATED',
    tone: 'green',
    /* Filled in below — AFTERMATH is declared after this table only because the
     * evidence it holds is long, and a forward reference here would be a
     * temporal-dead-zone error rather than a style choice. */
    file: null,
  },
  {
    id: 'jibril',
    boss: 'jibril',
    level: 2,
    status: 'NEXT TARGET',
    tone: 'red',
    file: null,
  },
];

/* The one line that ties the index to the read. Kept as an assignment rather
 * than an inline reference so the reason above stays true and visible. */
CASES[0].file = AFTERMATH;

/* A case by its id, or by the character it is about — the Cabal chain keys its
 * rungs by character, the pager keys its pages by case, and they must resolve
 * to the same row. */
export function caseFor(key) {
  return CASES.find((c) => c.id === key || c.boss === key) ?? null;
}

/* Can the player open this file? The single predicate both browsers ask, so
 * "unlocked" cannot come to mean two things in two places. */
export function caseIsOpen(key) {
  const c = caseFor(key);
  return !!(c && c.file && Array.isArray(c.file.evidence) && c.file.evidence.length);
}

/* ------------------------------------------- CharacterIdentityResolver -----
 * The one door out of this file.
 *
 * Returns the approved fictional identity and NOTHING ELSE — the record's
 * internal tag is not on the object it hands back, so a screen cannot render it
 * even by accident, even by spreading the whole thing into a template. That is
 * the entire design: make the unsafe field unreachable rather than trusting
 * every future call site to avoid it.
 */
export function resolveIdentity(key) {
  const c = CHARACTERS[key];
  if (!c) return { displayName: 'UNKNOWN', shortName: 'UNKNOWN', role: '', rank: '', level: null };
  return {
    displayName: c.displayName,
    shortName: c.shortName ?? c.displayName.toUpperCase(),
    role: c.role ?? '',
    rank: c.rank ?? '',
    level: c.level ?? null,
  };
}

/* Does this string contain a development tag? The backstop for §1: anything
 * about to be drawn can be run through here, and the harness runs EVERY string
 * this file can produce through it. Case-insensitive, because a tag that leaks
 * through a `toLowerCase()` has still leaked. */
export function containsInternalReference(text) {
  if (typeof text !== 'string') return false;
  const hay = text.toUpperCase();
  return INTERNAL_TAGS.some((tag) => hay.includes(tag.toUpperCase()));
}

/* Use where a string is about to become pixels. Returns the text unchanged when
 * it is safe; when it is not, it strips the tag, says so loudly on the console,
 * and lets the frame carry on — a leaked development tag is a content bug, and
 * crashing the game in front of the player is a worse outcome than a redacted
 * word plus a screaming log. */
export function assertPlayerSafe(text, where = 'ui') {
  if (!containsInternalReference(text)) return text;
  let safe = text;
  for (const tag of INTERNAL_TAGS) safe = safe.split(tag).join('[REDACTED]');
  console.error(`[story] INTERNAL REFERENCE LEAKED INTO PLAYER-FACING TEXT (${where}):`, text);
  return safe;
}

/* Walk EVERY string this file can put on screen and report the ones that carry
 * a development tag. The firewall above stops a leak at the door; this is what
 * proves the door is shut, and it is run by `_chromakey/aftermathverify.js` on
 * every build rather than trusted to review.
 *
 * Deliberately walks the raw data — including the `internalReference` fields
 * themselves — so it can also confirm the thing it is checking for is actually
 * present to be found. A leak test that passes because there was nothing to
 * leak is not a test. */
export function auditPlayerStrings() {
  const leaks = [];
  const seen = [];
  const walk = (node, path) => {
    if (typeof node === 'string') {
      seen.push(node);
      if (containsInternalReference(node)) leaks.push({ path, text: node });
      return;
    }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        /* The tag itself is the one string that is ALLOWED to be a tag. It is
         * never rendered — resolveIdentity does not return it. */
        if (k === 'internalReference') continue;
        walk(v, `${path}.${k}`);
      }
    }
  };
  walk(AFTERMATH, 'AFTERMATH');
  walk(LEVELS, 'LEVELS');
  /* The case index is player-facing copy too — its statuses are printed under
   * portraits on two screens. Walked with `file` cut out, because that is a
   * reference back into AFTERMATH and would otherwise be audited twice and
   * reported as two leaks for one string. */
  walk(CASES.map(({ file, ...rest }) => rest), 'CASES');
  for (const key of Object.keys(CHARACTERS)) walk(resolveIdentity(key), `resolveIdentity(${key})`);
  return {
    leaks,
    checked: seen.length,
    tags: INTERNAL_TAGS.length,
    /* Proof the check can fail: run a known tag through it. */
    selfTest: containsInternalReference(`x ${INTERNAL_TAGS[0]} y`),
  };
}

export { CHARACTERS, LEVELS, AFTERMATH, CASES, INTERNAL_TAGS };
