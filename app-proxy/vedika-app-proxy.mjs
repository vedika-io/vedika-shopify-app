/**
 * Vedika Shopify app proxy — the only place the Vedika API key lives.
 *
 * The theme blocks call `/apps/vedika/<route>` on the shop's own domain.
 * Shopify forwards that request to this handler (see `[app_proxy]` in
 * shopify.app.toml) and adds `shop`, `logged_in_customer_id`, `path_prefix`,
 * `timestamp` and an HMAC-SHA256 `signature`. This handler:
 *   1. verifies the signature with the app's client secret,
 *   2. rejects stale timestamps and, if configured, other shops,
 *   3. forwards only the exact GET routes the blocks use,
 *   4. adds the Vedika key server-side (live mode) or uses the keyless
 *      sandbox (sandbox mode, mock data, no billing).
 * The browser never receives the key.
 *
 * Pure Web-standard code (Request/Response/URL/fetch) plus node:crypto, so it
 * runs under Node 18+ with no dependencies. `server.mjs` is a minimal
 * node:http adapter around `handleAppProxyRequest`.
 *
 * (c) Vedika Intelligence — https://vedika.io
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const VEDIKA_API = 'https://api.vedika.io';
export const SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];
export const MAX_TIMESTAMP_SKEW_SECONDS = 300;
const LANGS = /^[a-z]{2}$/;

/**
 * Shopify app proxy signature message: drop `signature`, sort the remaining
 * keys, write each as `key=value` with repeated values joined by commas, and
 * concatenate with no separator.
 * https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
 */
export function appProxyMessage(searchParams) {
  const keys = [...new Set(searchParams.keys())].filter((key) => key !== 'signature').sort();
  return keys.map((key) => `${key}=${searchParams.getAll(key).join(',')}`).join('');
}

export function verifyAppProxySignature(searchParams, secret) {
  const signature = searchParams.get('signature');
  if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(appProxyMessage(searchParams)).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Map a proxy path (segments after the proxy prefix) to one Vedika operation.
 * Returns null for anything that is not an exact, known widget route.
 * `live` is the keyed path; `sandbox` is the keyless mock-data path.
 */
export function resolveVedikaRoute(segments) {
  const [a, b, c, ...rest] = segments;
  if (rest.length) return null;
  if (a === 'horoscope' && SIGNS.includes(b) && c === undefined) {
    return { live: `/v2/astrology/horoscope/${b}`, sandbox: `/sandbox/horoscope/${b}`, query: ['lang'] };
  }
  if (a === 'horoscope' && SIGNS.includes(b) && (c === 'weekly' || c === 'monthly')) {
    return { live: `/v2/astrology/horoscope/${b}/${c}`, sandbox: `/sandbox/horoscope/${b}/${c}`, query: ['lang'] };
  }
  if (a === 'tarot' && b === 'card-of-the-day' && c === undefined) {
    return { live: '/v2/tarot/card-of-the-day', sandbox: '/sandbox/tarot/card-of-the-day', query: ['lang'] };
  }
  if (a === 'crystals' && b === 'by-zodiac' && SIGNS.includes(c)) {
    return { live: `/v2/crystals/by-zodiac/${c}`, sandbox: `/sandbox/crystals/by-zodiac/${c}`, query: ['lang'] };
  }
  return null;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function cleanQuery(name, value) {
  return name === 'lang' && LANGS.test(value) ? value : null;
}

/**
 * env: {
 *   SHOPIFY_API_SECRET  (required) the app's client secret, used to verify Shopify's signature
 *   VEDIKA_MODE         'live' (keyed, billed) or 'sandbox' (keyless mock data). Default 'sandbox'.
 *   VEDIKA_API_KEY      required when VEDIKA_MODE is 'live'
 *   SHOPIFY_SHOP_DOMAIN optional; when set, only this *.myshopify.com shop is served
 *   PROXY_PATH_PREFIX   path this handler is mounted at (default '/vedika-proxy')
 * }
 */
export async function handleAppProxyRequest(request, env, { fetchImpl = fetch, nowSeconds = () => Math.floor(Date.now() / 1000) } = {}) {
  if (request.method !== 'GET') return json(405, { error: 'method not allowed' });
  const url = new URL(request.url);
  if (!verifyAppProxySignature(url.searchParams, env.SHOPIFY_API_SECRET)) return json(401, { error: 'invalid app proxy signature' });
  const timestamp = Number(url.searchParams.get('timestamp'));
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds() - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return json(401, { error: 'stale app proxy request' });
  }
  if (env.SHOPIFY_SHOP_DOMAIN && url.searchParams.get('shop') !== env.SHOPIFY_SHOP_DOMAIN) return json(403, { error: 'shop not allowed' });

  const prefix = (env.PROXY_PATH_PREFIX || '/vedika-proxy').replace(/\/+$/, '');
  if (!url.pathname.startsWith(`${prefix}/`)) return json(404, { error: 'not found' });
  const route = resolveVedikaRoute(url.pathname.slice(prefix.length + 1).split('/'));
  if (!route) return json(404, { error: 'not found' });

  const live = env.VEDIKA_MODE === 'live';
  if (live && !env.VEDIKA_API_KEY) return json(500, { error: 'proxy key not configured' });
  const upstream = new URL(live ? route.live : route.sandbox, VEDIKA_API);
  for (const name of route.query) {
    const value = url.searchParams.get(name);
    const clean = value === null ? null : cleanQuery(name, value);
    if (clean !== null) upstream.searchParams.set(name, clean);
  }
  // Built fresh: nothing from the storefront request (cookies, headers) is forwarded.
  const headers = { Accept: 'application/json' };
  if (live) headers.Authorization = `Bearer ${env.VEDIKA_API_KEY}`;

  const reply = await fetchImpl(upstream, { method: 'GET', headers });
  return new Response(reply.body, {
    status: reply.status,
    headers: {
      'Content-Type': reply.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
