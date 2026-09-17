// leaks#3: the theme extension must never put a Vedika key in storefront HTML or send one from the browser.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../theme-extension/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const blocks = readdirSync(new URL('blocks/', root)).filter((f) => f.endsWith('.liquid'));

test('no block, snippet or asset renders or sends a key', () => {
  assert.deepEqual(blocks.sort(), ['compatibility.liquid', 'gemstone.liquid', 'horoscope.liquid', 'tarot.liquid']);
  for (const rel of [...blocks.map((b) => `blocks/${b}`), 'snippets/vedika-init.liquid']) {
    const source = read(rel);
    assert.doesNotMatch(source, /vedika_api_key|data-api-key|api_key:|apiKey\s*:|X-API-Key|Authorization/i, rel);
    const schema = source.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/);
    if (schema) {
      for (const setting of JSON.parse(schema[1]).settings) {
        assert.doesNotMatch(String(setting.id || ''), /key|secret|token/i, `${rel} setting ${setting.id}`);
      }
    }
  }
  assert.match(read('snippets/vedika-init.liquid'), /proxyBase:\s*'\/apps\/vedika'/);
  assert.doesNotMatch(read('assets/vedika-shopify.js'), /X-API-Key|Authorization|api\.vedika\.io\/(?:v2|sandbox)/);
});

class FakeNode {
  constructor(tag) { this.tagName = tag; this.childNodes = []; this.attributes = {}; this.style = {}; this.className = ''; this.textContent = ''; this.listeners = {}; }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(child) { this.childNodes.push(child); return child; }
  insertBefore(child) { this.childNodes.unshift(child); return child; }
  removeChild(child) { this.childNodes = this.childNodes.filter((c) => c !== child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get classList() { return { add() {}, remove() {}, toggle() {}, contains: () => false }; }
}

function storefront({ config } = {}) {
  const fetches = [];
  const warnings = [];
  const window = {
    VedikaConfig: config,
    console: { warn: (msg) => warnings.push(msg) },
  };
  const context = vm.createContext({
    window,
    console: window.console,
    document: { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => ({ textContent: text }) },
    fetch: (url, options) => { fetches.push({ url, options }); return new Promise(() => {}); },
    encodeURIComponent, Date, Math, String,
  });
  vm.runInContext(read('assets/vedika-shopify.js'), context);
  const block = (attrs) => { const el = new FakeNode('div'); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); return el; };
  return { api: window.VedikaShopify, block, fetches, warnings };
}

test('a leftover theme key is ignored: requests go to the app proxy with no credentials', () => {
  const s = storefront({ config: { proxyBase: '/apps/vedika', apiKey: 'vk_live_old_config' } });
  s.api.renderTarot(s.block({ 'data-lang': 'hi', 'data-api-key': 'vk_live_old_block' }));
  s.api.renderGemstone(s.block({ 'data-sign': 'leo', 'data-api-key': 'vk_live_old_block' }));
  s.api.renderHoroscope(s.block({ 'data-sign': 'virgo', 'data-period': 'weekly' }));
  assert.deepEqual(s.fetches.map((f) => f.url), [
    '/apps/vedika/tarot/card-of-the-day?lang=hi',
    '/apps/vedika/crystals/by-zodiac/leo',
    '/apps/vedika/horoscope/virgo/weekly',
  ]);
  for (const { options } of s.fetches) assert.deepEqual(JSON.parse(JSON.stringify(options)), { headers: { Accept: 'application/json' } });
  assert.equal(JSON.stringify(s.fetches).includes('vk_live'), false);
  assert.equal(s.warnings.length, 1);
  assert.match(s.warnings[0], /ignored and was not sent/);
});

test('without VedikaConfig the blocks still use the same-origin app proxy', () => {
  const s = storefront();
  s.api.renderTarot(s.block({ 'data-proxy-base': '/apps/astro/' }));
  s.api.renderTarot(s.block({}));
  assert.deepEqual(s.fetches.map((f) => f.url), ['/apps/astro/tarot/card-of-the-day', '/apps/vedika/tarot/card-of-the-day']);
  assert.equal(s.warnings.length, 0);
});
