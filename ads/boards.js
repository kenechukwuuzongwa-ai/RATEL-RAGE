/* RATEL RAGE — the billboard register (see docs/ADS.md).
 *
 * One entry per board in the game. These numbers come from the game's own
 * ADVERT_SLOTS (src/game.js) and the board art in layers/adverts/: `face` is the
 * printable panel inside the frame and `qr` the printed QR, both in the board
 * art's own pixels (measured by _chromakey/ads/measure.js + overlay.js). The
 * game reads the same rectangles from ADVERT_SLOTS; keep the two in step.
 *
 * `price` (naira per month, for the WHOLE board), `bookable` and `shares` (how
 * many advertisers can rotate on it at once) are only the SEED values: the live
 * ones are in D1 and are edited on /admin. */
export const ART_SCALE = 2;          // uploads are made at 2x the face, so they stay sharp on 2x screens
export const SAFE_MARGIN = 0.06;     // keep text this far inside every edge

/* `place`, `stretch`, `scene` and `order` (request 657) are what the website's board
 * chooser tells an advertiser who will never play: where on the street the board
 * stands and what players are doing in front of it. The stretch is the game's own
 * section (game.js adBoardSection: boards 1-3 stand in section 1, board 4 in the
 * boss section 3; _chromakey/req657/dwell.js prints them). */
export const BOARDS = [
  { id: 'board-1', level: 1, name: 'The Ratel Open University board', where: 'Level 1, Balogun Street, just past the first gate',
    place: 'Level 01 · Balogun Street, Lagos Island', stretch: 'Stretch 2 of 4 · wave 2', order: 1,
    scene: 'The first board after the opening gate, beside the floating bat players pick up before wave 2 arrives.',
    art: 'layers/adverts/board-1.png', artW: 539, artH: 413,
    face: { x: 8, y: 24, w: 489, h: 208 }, qr: null, price: 60000, bookable: 0, shares: 3 },
  { id: 'board-2', level: 1, name: 'The portrait sign', where: 'Level 1, the shop row before the big board',
    place: 'Level 01 · Balogun Street, Lagos Island', stretch: 'Stretch 2 of 4 · wave 2', order: 2,
    scene: 'A tall sign on the shop row, inside the wave 2 fight: seven enemies, the first Taskforce heavies and machete-carrying Aye.',
    art: 'layers/adverts/board-2.png', artW: 201, artH: 338,
    face: { x: 15, y: 8, w: 171, h: 209 }, qr: { x: 37, y: 102, w: 60, h: 60 }, price: 30000, bookable: 1, shares: 3 },
  { id: 'board-3', level: 1, name: 'The big two-post board', where: 'Level 1, mid-street, wave 2',
    place: 'Level 01 · Balogun Street, Lagos Island', stretch: 'Stretch 2 of 4 · wave 2', order: 3,
    scene: 'The largest board on the street, mid-way through the wave 2 brawl. Its face is the widest print area in the game.',
    art: 'layers/adverts/board-3.png', artW: 658, artH: 525,
    face: { x: 14, y: 12, w: 631, h: 251 }, qr: { x: 80, y: 52, w: 146, h: 142 }, price: 80000, bookable: 1, shares: 3 },
  { id: 'board-4', level: 1, name: 'The mural board', where: 'Level 1, in front of the End Hunger mural, in MC Olodo’s stretch',
    place: 'Level 01 · Balogun Street, Lagos Island', stretch: 'Stretch 4 of 4 · the boss fight', order: 4,
    scene: 'In front of the End Hunger mural, in the stretch where MC Olodo and his crew are fought.',
    art: 'layers/adverts/board-4.png', artW: 491, artH: 391,
    face: { x: 10, y: 8, w: 470, h: 189 }, qr: { x: 60, y: 38, w: 110, h: 104 }, price: 50000, bookable: 1, shares: 3 },
];

export const boardById = (id) => BOARDS.find((b) => b.id === id) || null;
export const uploadSize = (b) => ({ w: b.face.w * ART_SCALE, h: b.face.h * ART_SCALE });
