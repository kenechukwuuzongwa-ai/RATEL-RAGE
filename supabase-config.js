/* RATEL RAGE — player accounts (see docs/ACCOUNTS.md).
 *
 * OFF while `url` or `anonKey` is empty: the game plays exactly as before and
 * keeps progress on this device only (src/progress.js).
 *
 *   url         https://<project-ref>.supabase.co
 *   anonKey     the project's PUBLISHABLE key (Settings > API Keys: "anon" /
 *               "sb_publishable_..."). It is public by design; RLS protects the
 *               data. NEVER put the service_role / "sb_secret_..." key here —
 *               src/account.js refuses to start if it sees one.
 *   redirectTo  where Google sign-in and email links return to. Empty = the
 *               page the player is on. Must be listed in Supabase
 *               Authentication > URL Configuration > Redirect URLs.
 *   google      false hides the Google buttons (e.g. before the provider is set up).
 */
window.RR_SUPABASE = {
  url: '',
  anonKey: '',
  redirectTo: '',
  google: true,
};
