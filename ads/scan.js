/* RATEL RAGE — rr-ads artwork scan (request 685).
 *
 * Every new booking's artwork is looked at by a vision model on Cloudflare Workers AI
 * (env.AI, the [ai] binding in wrangler.toml). The model reads the words on the artwork and
 * says what it shows. The decision is made HERE, in code, and it is one-sided:
 *
 *   'approve'  only when the scan worked, the model saw nothing against the policy, the
 *              artwork is not a betting or alcohol advert (those need a person to check the
 *              licence on the link page), no risky word is on the art or in the form, and the
 *              advertiser left no note (a note is a question for a person).
 *   'review'   everything else: the owner looks at it in /admin, as before.
 *
 * The scan never rejects anyone: a doubt goes to the owner, who can still reject or take
 * down any advert. If the AI is missing, slow or answers nonsense, the booking waits for review.
 * AUTO_APPROVE = "off" (wrangler.toml [vars]) turns the whole thing off. */

// Compared live on the same test artworks (request 685): Llama 4 Scout flagged a cigarette advert as
// tobacco by itself and described every image correctly (~10 s, ~29 neurons); Llama 3.2 Vision called
// the cigarette advert fine (~3 s, ~11 neurons). Scout first; 3.2 only if Scout errors.
export const SCAN_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const BACKUP_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const SCAN_TIMEOUT_MS = 30000;

// Words that send a booking to a person, wherever they appear: on the artwork (as the model
// read it) or in the business, brand, link. Matched as whole words, case-insensitive.
const RISKY = [
  // betting / gaming (allowed, but a person checks the licence and the 18+ / responsible-play line)
  'bet', 'bets', 'betting', 'bet9ja', 'sportybet', 'betking', 'casino', 'odds', 'jackpot', 'lottery', 'lotto', 'stake', 'wager', 'slots', 'poker', 'roulette',
  // alcohol (allowed, but a person checks 18+ / "drink responsibly" and the people in it)
  'beer', 'lager', 'stout', 'wine', 'vodka', 'whisky', 'whiskey', 'gin', 'rum', 'brandy', 'tequila', 'champagne', 'liquor', 'alcohol', 'schnapps', 'cognac', 'palmwine', 'ogogoro',
  // banned outright (tobacco and drugs, sex, weapons, money schemes, politics, health claims)
  'cigarette', 'cigarettes', 'tobacco', 'vape', 'vapes', 'shisha', 'hookah', 'cannabis', 'weed', 'marijuana', 'codeine', 'tramadol',
  'sex', 'sexy', 'nude', 'xxx', 'escort', 'hookup', 'dating',
  'gun', 'guns', 'pistol', 'rifle', 'ammo', 'ammunition', 'knife', 'knives', 'fireworks',
  'crypto', 'bitcoin', 'forex', 'invest', 'investment', 'doubling', 'ponzi', 'loan', 'loans', 'roi', 'giveaway', 'jackpot',
  'vote', 'votes', 'election', 'candidate', 'apc', 'pdp', 'governor', 'senator', 'president',
  'cure', 'cures', 'herbal', 'slimming', 'weightloss', 'medicine', 'pills', 'viagra',
  '18+',
];
const riskyRe = new RegExp('(^|[^a-z0-9])(' + RISKY.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^a-z0-9])', 'i');
export const riskyWord = (s) => { const m = riskyRe.exec(String(s || '')); return m ? m[2].toLowerCase() : ''; };

export const scanPrompt = (f) => `You check billboard adverts for a street-fighting video game played by people of all ages.
The advertiser says the brand is "${f.brand}" (business: "${f.business}").
Look at the image and answer with ONE JSON object and nothing else, in exactly this shape:
{"text":"every word you can read on the image","shows":"one short sentence: what the image shows","brand_visible":true,"betting":false,"alcohol":false,"problems":[],"verdict":"approve"}
Rules:
- "betting": true if it advertises betting, lottery, casino or gambling. "alcohol": true if it advertises alcoholic drinks.
- "problems": list each thing that breaks these rules (empty list if none): tobacco, vapes or drugs; sexual or suggestive images; weapons; investment, crypto, forex, loan or "double your money" offers; politics or elections; medicines, cures or slimming products; violent, bloody, frightening or hateful images; fake buttons, fake warnings or "tap to win" messages that look like part of a game; famous brands, logos, cartoon characters or celebrity faces that do not belong to the advertiser; anything illegal.
- "brand_visible": true if the brand or business name can be read on the image.
- "verdict": "approve" only if problems is empty and betting and alcohol are both false; otherwise "review".`;

// The model's answer -> a plain object, or null when it is not the JSON we asked for.
export function parseScan(text) {
  if (typeof text !== 'string') return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o; try { o = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  if (!o || typeof o !== 'object' || (o.verdict !== 'approve' && o.verdict !== 'review')) return null;
  return {
    text: String(o.text || '').slice(0, 400), shows: String(o.shows || '').slice(0, 300),
    brandVisible: o.brand_visible === true, betting: o.betting === true, alcohol: o.alcohol === true,
    problems: Array.isArray(o.problems) ? o.problems.map((p) => String(p).slice(0, 120)).filter(Boolean).slice(0, 8) : ['unreadable problem list'],
    verdict: o.verdict,
  };
}

// The rule. `s` is parseScan's result (or null), `f` the booking's form fields.
export function decide(s, f) {
  if (!s) return { decision: 'review', why: 'The automatic check could not read the artwork.' };
  if (s.problems.length) return { decision: 'review', why: 'The check flagged: ' + s.problems.join('; ') };
  if (s.betting) return { decision: 'review', why: 'Betting advert: a person checks the licence and the 18+ / responsible-play message.' };
  if (s.alcohol) return { decision: 'review', why: 'Alcohol advert: a person checks the 18+ / "Drink responsibly" message.' };
  if (s.verdict !== 'approve') return { decision: 'review', why: 'The check was not sure.' };
  if (!s.brandVisible) return { decision: 'review', why: 'The brand name could not be read on the artwork.' };
  const w = riskyWord(s.text) || riskyWord(s.shows) || riskyWord(f.business) || riskyWord(f.brand) || riskyWord(f.link);
  if (w) return { decision: 'review', why: `The word "${w}" needs a person to look.` };
  if (f.note) return { decision: 'review', why: 'The advertiser left a note.' };
  return { decision: 'approve', why: 'Passed the automatic check.' };
}

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

// Image formats tested live (request 685): Scout takes OpenAI-style content parts; 3.2 Vision takes
// `prompt` + `image` (a data URL); 3.2 refuses `messages` + `image` (AiError 3030).
async function runModel(env, prompt, bytes, mime) {
  const uri = `data:${mime};base64,${b64(bytes)}`;
  const text = (out) => (typeof out?.response === 'string' ? out.response : JSON.stringify(out?.response ?? ''));
  try {
    return text(await env.AI.run(SCAN_MODEL, { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: uri } }] }],
      max_tokens: 400, temperature: 0 }));
  } catch {
    const ask = () => env.AI.run(BACKUP_MODEL, { prompt, image: uri, max_tokens: 400, temperature: 0 });
    try { return text(await ask()); }
    catch (e) {
      // Meta's licence for 3.2 must be accepted once per Cloudflare account: send "agree", then try once more
      if (!/agree|licen[cs]e/i.test(String(e?.message || e))) throw e;
      await env.AI.run(BACKUP_MODEL, { prompt: 'agree' }).catch(() => {});
      return text(await ask());
    }
  }
}

// Scan one artwork. Never throws: any failure is a 'review'.
export async function scanArtwork(env, bytes, mime, f) {
  if (String(env.AUTO_APPROVE || 'on').toLowerCase() === 'off') return { decision: 'review', why: 'Automatic approval is switched off.', scan: null };
  if (!env.AI) return { decision: 'review', why: 'The automatic check is not set up.', scan: null };
  try {
    const timeout = new Promise((_, no) => setTimeout(() => no(new Error('timeout')), SCAN_TIMEOUT_MS));
    const raw = await Promise.race([runModel(env, scanPrompt(f), bytes, mime), timeout]);
    const s = parseScan(raw);
    return { ...decide(s, f), scan: s, raw: s ? undefined : String(raw).slice(0, 300) };
  } catch (e) {
    return { decision: 'review', why: 'The automatic check did not answer (' + String(e?.message || e).slice(0, 80) + ').', scan: null };
  }
}
