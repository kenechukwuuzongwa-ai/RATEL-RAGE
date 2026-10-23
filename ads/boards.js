/* RATEL RAGE — the billboard register (see docs/ADS.md).
 *
 * One entry per board in the game. These numbers come from the game's own
 * ADVERT_SLOTS (src/game.js) and the board art in layers/adverts/: `face` is the
 * printable panel inside the frame and `qr` the printed QR, both in the board
 * art's own pixels (measured by _chromakey/ads/measure.js + overlay.js). The
 * game reads the same rectangles from ADVERT_SLOTS; keep the two in step.
 *
 * `price` (naira per month) and `bookable` are only the SEED values: the live
 * ones are in D1 and are edited on /admin. */
export const ART_SCALE = 2;          // uploads are made at 2x the face, so they stay sharp on 2x screens
export const SAFE_MARGIN = 0.06;     // keep text this far inside every edge

export const BOARDS = [
  { id: 'board-1', level: 1, name: 'The Ratel Open University board', where: 'Level 1, the first long stretch of Ojuelegba street',
    art: 'layers/adverts/board-1.png', artW: 539, artH: 413,
    face: { x: 8, y: 24, w: 489, h: 208 }, qr: null, price: 60000, bookable: 0 },
  { id: 'board-2', level: 1, name: 'The portrait sign', where: 'Level 1, the shop row before the big board',
    art: 'layers/adverts/board-2.png', artW: 201, artH: 338,
    face: { x: 15, y: 8, w: 171, h: 209 }, qr: { x: 37, y: 102, w: 60, h: 60 }, price: 30000, bookable: 1 },
  { id: 'board-3', level: 1, name: 'The big two-post board', where: 'Level 1, mid-street, wave 2',
    art: 'layers/adverts/board-3.png', artW: 658, artH: 525,
    face: { x: 14, y: 12, w: 631, h: 251 }, qr: { x: 80, y: 52, w: 146, h: 142 }, price: 80000, bookable: 1 },
  { id: 'board-4', level: 1, name: 'The mural board', where: 'Level 1, in front of the End Hunger mural, before MC Olodo',
    art: 'layers/adverts/board-4.png', artW: 491, artH: 391,
    face: { x: 10, y: 8, w: 470, h: 189 }, qr: { x: 60, y: 38, w: 110, h: 104 }, price: 50000, bookable: 1 },
];

export const boardById = (id) => BOARDS.find((b) => b.id === id) || null;
export const uploadSize = (b) => ({ w: b.face.w * ART_SCALE, h: b.face.h * ART_SCALE });
