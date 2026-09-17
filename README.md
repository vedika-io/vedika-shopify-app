# Vedika Shopify App

Astrology widgets for Shopify stores, powered by [Vedika Intelligence API](https://vedika.io).
Add horoscopes, tarot, compatibility checkers, and gemstone recommendations to any Shopify theme.

## Theme Extension Blocks

| Block | File | Description |
|-------|------|-------------|
| **Horoscope** | `blocks/horoscope.liquid` | Daily/weekly/monthly horoscope with 12-sign selector |
| **Tarot** | `blocks/tarot.liquid` | Card of the Day with keywords and affirmation |
| **Compatibility** | `blocks/compatibility.liquid` | Ashtakoot zodiac compatibility checker |
| **Gemstone** | `blocks/gemstone.liquid` | Zodiac-specific gemstone and crystal recommendations |

## How the API key is kept off the storefront

Earlier versions asked for a **Vedika API Key** in the theme editor and rendered it into the page (`data-api-key`, `window.VedikaConfig.apiKey`). Anything in theme markup is sent to every visitor, so anyone could copy that key and spend the account balance. That setting is gone (Vastu review register `leaks#3`, 2026-09-17).

The blocks now call the shop's own domain:

```
https://<shop>/apps/vedika/horoscope/aries?lang=hi
```

Shopify's [app proxy](https://shopify.dev/docs/apps/build/online-store/app-proxies) forwards that request to your proxy server and adds a signature. The server in `app-proxy/` verifies the signature, forwards only the routes below, and adds the key. The browser never sees it. Because the request stays on the shop's domain, there is no cross-origin call: `api.vedika.io` does not accept browser calls from storefront origins anyway.

If an older theme still carries a key, the widget script ignores it, sends nothing, and logs one console warning. Rotate that key in the Vedika dashboard: it has already been public.

## Installation

### 1. Run the app proxy server

Requirements: Node 18 or later, an HTTPS host, no npm dependencies.

```bash
SHOPIFY_API_SECRET=<app client secret> \
VEDIKA_MODE=live \
VEDIKA_API_KEY=<vk_live_... key> \
SHOPIFY_SHOP_DOMAIN=<your-shop>.myshopify.com \
PORT=8787 \
npm run proxy
```

| Variable | Required | Meaning |
|----------|----------|---------|
| `SHOPIFY_API_SECRET` | yes | The app's client secret. Every request without a valid Shopify signature gets 401. |
| `VEDIKA_MODE` | no | `live` sends keyed, billed requests. `sandbox` (default) uses Vedika's keyless mock data. |
| `VEDIKA_API_KEY` | in live mode | Your Vedika key. Keep it in your host's secret store. |
| `SHOPIFY_SHOP_DOMAIN` | recommended | Serve only this shop. Leave unset only if one key may serve every shop that installs the app. |
| `PROXY_PATH_PREFIX` | no | Path the handler is mounted at. Default `/vedika-proxy`. |
| `PORT` | no | Listen port for `server.mjs`. Default `8787`. |

The handler also rejects signatures older than 5 minutes. It does not rate-limit: put a per-client limit in front of it at your load balancer or WAF, because every live call is billed to your Vedika account.

To host it elsewhere (serverless, edge), import `handleAppProxyRequest` from `app-proxy/vedika-app-proxy.mjs`. It takes a Web `Request` and returns a `Response`.

A public app installed by many merchants needs a key per shop. This reference handler holds one key; store per-shop keys server-side and look them up by the verified `shop` parameter before using it for more than one store.

### 2. Point the app proxy at it

In `shopify.app.toml`, replace the placeholder host:

```toml
[app_proxy]
url = "https://<your-proxy-host>/vedika-proxy"
subpath = "vedika"
prefix = "apps"
```

The app needs the `write_app_proxy` scope (already set). Then deploy the app configuration with `npm run deploy` (Shopify CLI).

### 3. Add the blocks

In the theme editor (Customize), add the Vedika blocks. Or add the assets to any theme with a Custom Liquid section:

```liquid
{% render 'vedika-init' %}

<div class="vedika-shopify-block vedika-horoscope"
     id="vedika-horoscope-1"
     data-sign="aries"
     data-period="daily"
     data-theme="light">
</div>

<script>
  VedikaShopify.renderHoroscope(document.getElementById('vedika-horoscope-1'));
</script>
```

If a merchant changes the proxy prefix or subpath in the Shopify admin, set `data-proxy-base` on the block (for example `data-proxy-base="/tools/astro"`).

For development: `npm run dev` (Shopify CLI). Tests: `npm test` (Node's built-in runner, no install needed).

## Theme Editor Settings

- **Default Sign** — Pre-selected zodiac sign
- **Period** — Daily, weekly, or monthly (horoscope only)
- **Language** — English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali (varies by block)
- **Color Theme** — Light or dark

There is no API key setting. The key is configured only on the proxy server.

## File Structure

```
vedika-shopify-app/
  shopify.app.toml              Shopify app configuration (app proxy URL)
  package.json                  Scripts: dev, deploy, proxy, test
  README.md                     This file
  app-proxy/
    vedika-app-proxy.mjs        Signature check, route allowlist, key injection
    server.mjs                  Minimal node:http host for the handler
  test/
    app-proxy.test.mjs          Proxy tests (signature vectors from Shopify's docs)
    theme-no-key.test.mjs       Theme never renders or sends a key
  theme-extension/
    blocks/
      horoscope.liquid          Daily horoscope block
      tarot.liquid              Card of the Day block
      compatibility.liquid      Compatibility checker block
      gemstone.liquid           Gemstone recommendation block
    snippets/
      vedika-init.liquid        Loads assets, sets the proxy base (no key)
    assets/
      vedika-shopify.js         Proxy client + all widget renderers
      vedika-shopify.css        Styles (light + dark theme)
```

## Routes the proxy forwards

Only these GET routes are forwarded. Everything else gets 404 and never reaches Vedika. Only `lang` (two lowercase letters) is passed through; Shopify's own parameters are dropped.

| Block | Proxy path (under `/apps/vedika`) | `VEDIKA_MODE=live` (keyed) | `VEDIKA_MODE=sandbox` (keyless mock) |
|-------|-----------------------------------|----------------------------|--------------------------------------|
| Horoscope, daily | `/horoscope/:sign` | `GET /v2/astrology/horoscope/:sign` | `GET /sandbox/horoscope/:sign` |
| Horoscope, weekly or monthly | `/horoscope/:sign/weekly`, `/horoscope/:sign/monthly` | `GET /v2/astrology/horoscope/:sign/:period` | `GET /sandbox/horoscope/:sign/:period` |
| Tarot | `/tarot/card-of-the-day` | `GET /v2/tarot/card-of-the-day` | `GET /sandbox/tarot/card-of-the-day` |
| Gemstone | `/crystals/by-zodiac/:sign` | `GET /v2/crystals/by-zodiac/:sign` | `GET /sandbox/crystals/by-zodiac/:sign` |

Known gaps, unchanged by the key fix:

- **Compatibility** requests `/astrology/ashtakoota`. No public GET operation matches a sign pair (the published Ashtakoot operation, `POST /v2/astrology/ashtakoot-match`, compares two birth charts), so the proxy returns 404 and the block shows an error. The keyless sandbox path also returned 404 when checked on 2026-09-17.
- **Gemstone** now requests the sign-specific route. Its renderer reads `birthstones`, `supporting_crystals` and `balancing_crystals`, but the sandbox response on 2026-09-17 carried `sign` and `crystals`, so the block may render little until the renderer is updated.

## Compatibility

Works with all Shopify themes including:
- Dawn (default Shopify 2.0 theme)
- Debut
- Brooklyn
- Minimal
- Any theme supporting app blocks / custom Liquid sections

CSS uses namespaced class names (`vedika-*`) and inherits font-family from the theme to ensure zero conflicts.

## License

Proprietary. Contact sales@vedika.io for commercial licensing.
