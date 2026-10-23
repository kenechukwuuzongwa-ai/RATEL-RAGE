/* RATEL RAGE — billboard ads (see docs/ADS.md).
 *
 * OFF while `endpoint` is empty: the boards show the game's own house art and
 * nothing is fetched or counted. The web build (deploy/build-web.js) writes the
 * rr-ads Worker's address here; the source tree, the editor and the APK stay off.
 *
 *   endpoint   the rr-ads Worker, e.g. https://rr-ads.<account>.workers.dev
 */
window.RR_ADS = {
  endpoint: '',
};
