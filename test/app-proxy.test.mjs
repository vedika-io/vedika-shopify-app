// leaks#3: the app proxy is the only holder of the Vedika key for the Shopify blocks.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  appProxyMessage, verifyAppProxySignature, resolveVedikaRoute, handleAppProxyRequest, SIGNS,
} from '../app-proxy/vedika-app-proxy.mjs';

const SECRET = 'app-client-secret';
const SERVER_KEY = 'fixture-key-1';
const NOW = 1_800_000_000;

function signedUrl(path, params = {}, { secret = SECRET, timestamp = NOW } = {}) {
  const query = new URLSearchParams({
    shop: 'merchant.myshopify.com', logged_in_customer_id: '42', path_prefix: '/apps/vedika',
    timestamp: String(timestamp), ...params,
  });
  query.set('signature', createHmac('sha256', secret).update(appProxyMessage(query)).digest('hex'));
  return `https://proxy.example.com/vedika-proxy${path}?${query}`;
}

function harness(env = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('{"success":true,"data":{"ok":1}}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const run = (url, init = {}) => handleAppProxyRequest(new Request(url, init), {
    SHOPIFY_API_SECRET: SECRET, VEDIKA_MODE: 'live', VEDIKA_API_KEY: SERVER_KEY, ...env,
  }, { fetchImpl, nowSeconds: () => NOW });
  return { calls, run };
}

test('signature matches both of Shopify\'s documented examples', () => {
  const base = 'extra=1&extra=2&shop=shop-name.myshopify.com&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555';
  const loggedIn = new URLSearchParams(`${base}&logged_in_customer_id=1&signature=4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb`);
  const anonymous = new URLSearchParams(`${base}&logged_in_customer_id=&signature=e072b6d7e6622d85912a5214b860d3100dc1e73d9bc29f43796ac8c9ff8093cb`);
  assert.equal(appProxyMessage(loggedIn), 'extra=1,2logged_in_customer_id=1path_prefix=/apps/awesome_reviewsshop=shop-name.myshopify.comtimestamp=1317327555');
  assert.equal(verifyAppProxySignature(loggedIn, 'hush'), true);
  assert.equal(verifyAppProxySignature(anonymous, 'hush'), true);
  const tampered = new URLSearchParams(loggedIn); tampered.set('shop', 'other.myshopify.com');
  assert.equal(verifyAppProxySignature(tampered, 'hush'), false);
  assert.equal(verifyAppProxySignature(loggedIn, 'wrong'), false);
  assert.equal(verifyAppProxySignature(loggedIn, ''), false);
  const shortSig = new URLSearchParams(loggedIn); shortSig.set('signature', 'abcd');
  assert.equal(verifyAppProxySignature(shortSig, 'hush'), false);
});

test('live mode adds the key server-side and forwards only the route and lang', async () => {
  const { calls, run } = harness();
  const res = await run(signedUrl('/horoscope/aries/weekly', { lang: 'hi', apiKey: 'vk_live_from_browser' }), {
    headers: { Cookie: 'cart=1', 'X-API-Key': 'vk_live_from_browser', Authorization: 'Bearer vk_live_from_browser' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await res.json(), { success: true, data: { ok: 1 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.vedika.io/v2/astrology/horoscope/aries/weekly?lang=hi');
  assert.deepEqual({ ...calls[0].options.headers }, { Accept: 'application/json', Authorization: `Bearer ${SERVER_KEY}` });
});

test('every block route maps to a live and a sandbox operation', async () => {
  const { calls, run } = harness();
  for (const [path, live] of [
    ['/horoscope/leo', '/v2/astrology/horoscope/leo'],
    ['/horoscope/leo/monthly', '/v2/astrology/horoscope/leo/monthly'],
    ['/tarot/card-of-the-day', '/v2/tarot/card-of-the-day'],
    ['/crystals/by-zodiac/pisces', '/v2/crystals/by-zodiac/pisces'],
  ]) {
    assert.equal((await run(signedUrl(path))).status, 200, path);
    assert.equal(calls.at(-1).url, `https://api.vedika.io${live}`);
  }
  const sandbox = harness({ VEDIKA_MODE: 'sandbox', VEDIKA_API_KEY: '' });
  assert.equal((await sandbox.run(signedUrl('/tarot/card-of-the-day', { lang: 'ta' }))).status, 200);
  assert.equal(sandbox.calls[0].url, 'https://api.vedika.io/sandbox/tarot/card-of-the-day?lang=ta');
  assert.deepEqual({ ...sandbox.calls[0].options.headers }, { Accept: 'application/json' });
  assert.equal(SIGNS.length, 12);
});

test('refuses unsigned, stale, foreign-shop, unknown and unkeyed requests without calling Vedika', async () => {
  const { calls, run } = harness({ SHOPIFY_SHOP_DOMAIN: 'merchant.myshopify.com' });
  const unsigned = signedUrl('/horoscope/aries').replace(/signature=[0-9a-f]+/, 'signature=' + '0'.repeat(64));
  for (const [url, init, status] of [
    [unsigned, {}, 401],
    [signedUrl('/horoscope/aries', {}, { secret: 'not-the-app-secret' }), {}, 401],
    [signedUrl('/horoscope/aries', {}, { timestamp: NOW - 301 }), {}, 401],
    [signedUrl('/horoscope/aries', { shop: 'other.myshopify.com' }), {}, 403],
    [signedUrl('/astrology/ashtakoota'), {}, 404],
    [signedUrl('/horoscope/notasign'), {}, 404],
    [signedUrl('/horoscope/aries/daily'), {}, 404],
    [signedUrl('/horoscope/aries/weekly/extra'), {}, 404],
    [signedUrl('/v2/astrology/kundli'), {}, 404],
    [signedUrl('/crystals/by-zodiac'), {}, 404],
    [signedUrl('/horoscope/aries').replace('/vedika-proxy/', '/elsewhere/'), {}, 404],
    [signedUrl('/horoscope/aries'), { method: 'POST', body: '{}' }, 405],
  ]) {
    assert.equal((await run(url, init)).status, status, `${init.method || 'GET'} ${url}`);
  }
  const unkeyed = harness({ VEDIKA_API_KEY: '' });
  assert.equal((await unkeyed.run(signedUrl('/horoscope/aries'))).status, 500);
  assert.equal(calls.length + unkeyed.calls.length, 0);
});

test('a malformed lang value is dropped, not forwarded', async () => {
  const { calls, run } = harness();
  assert.equal((await run(signedUrl('/tarot/card-of-the-day', { lang: 'en&x=1' }))).status, 200);
  assert.equal(calls[0].url, 'https://api.vedika.io/v2/tarot/card-of-the-day');
});

const spec = new URL('../../../web/vedika-public/openapi.json', import.meta.url);
test('live routes are published GET operations (monorepo only)', { skip: !existsSync(spec) && 'openapi.json is not in this checkout' }, () => {
  const paths = JSON.parse(readFileSync(spec, 'utf8')).paths;
  for (const segments of [['horoscope', 'aries'], ['horoscope', 'aries', 'weekly'], ['horoscope', 'aries', 'monthly'], ['tarot', 'card-of-the-day'], ['crystals', 'by-zodiac', 'aries']]) {
    const live = resolveVedikaRoute(segments).live.replace('/aries', '/{sign}');
    assert.ok(paths[live]?.get, `${live} is a published GET operation`);
  }
});
