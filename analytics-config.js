/* RATEL RAGE — analytics settings (see docs/WEB_DEPLOYMENT.md, "Analytics").
 *
 * OFF while `endpoint` is empty: nothing is collected and nothing is sent.
 * The game never waits on analytics, and a failing endpoint is ignored.
 *
 *   endpoint     URL that accepts a POST of { events: [...] } as JSON
 *                (e.g. the Cloudflare Worker in the deployment guide).
 *   anonymousId  true  = a random ID kept in this browser's localStorage, so
 *                        returning players can be counted as unique. Not tied
 *                        to any name, email, IP or account.
 *                false = no stored ID; only sessions are counted.
 *                Browsers sending Do Not Track never get a stored ID.
 *   sampleRate   0..1, share of sessions that report (1 = all).
 */
window.RR_ANALYTICS = {
  endpoint: '',
  anonymousId: true,
  sampleRate: 1,
};
