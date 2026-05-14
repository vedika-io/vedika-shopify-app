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

## Installation

### Option 1: Shopify CLI (for development)

```bash
cd vedika-shopify-app
npm install
shopify app dev
```

### Option 2: Manual Theme Extension

1. Copy the `theme-extension/` folder into your Shopify theme
2. Add the snippets, blocks, and assets to the appropriate directories
3. In your theme, add blocks via the Shopify Theme Editor (Customize)

### Option 3: Code Snippet (any theme)

Add to a Custom Liquid section in Shopify:

```liquid
{{ 'vedika-shopify.css' | asset_url | stylesheet_tag }}
{{ 'vedika-shopify.js' | asset_url | script_tag }}

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

## Theme Editor Settings

Each block exposes settings in the Shopify Theme Editor:

- **API Key** — Leave empty for sandbox (free, mock data). Enter your `vk_live_*` key for real data.
- **Default Sign** — Pre-selected zodiac sign
- **Period** — Daily, weekly, or monthly (horoscope only)
- **Language** — English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi
- **Color Theme** — Light or dark

## File Structure

```
vedika-shopify-app/
  shopify.app.toml              Shopify app configuration
  package.json                  Dependencies
  README.md                     This file
  theme-extension/
    blocks/
      horoscope.liquid          Daily horoscope block
      tarot.liquid              Card of the Day block
      compatibility.liquid      Compatibility checker block
      gemstone.liquid           Gemstone recommendation block
    snippets/
      vedika-init.liquid        API initialization snippet
    assets/
      vedika-shopify.js         API client + all widget renderers
      vedika-shopify.css        Styles (light + dark theme)
```

## API Endpoints Used

| Widget | Sandbox Endpoint | Production Endpoint |
|--------|-----------------|---------------------|
| Horoscope | `GET /sandbox/horoscope/:sign` | `GET /v2/astrology/horoscope/:sign` |
| Tarot | `GET /sandbox/tarot/card-of-the-day` | `GET /v2/astrology/tarot/card-of-the-day` |
| Compatibility | `GET /sandbox/astrology/ashtakoota` | `GET /v2/astrology/ashtakoota` |
| Gemstone | `GET /sandbox/crystals/by-zodiac` | `GET /v2/astrology/crystals/by-zodiac` |

All sandbox endpoints are free, no API key required, rate-limited to 30 req/min.

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
