/**
 * Vedika Shopify — API Client + Widget Renderers
 *
 * Used by Liquid blocks (horoscope.liquid, tarot.liquid, etc.)
 * All rendering uses safe DOM methods (createElement, textContent).
 *
 * (c) Vedika Intelligence — https://vedika.io
 */

(function () {
  'use strict';

  // =========================================================================
  // CONSTANTS
  // =========================================================================

  var SIGNS = [
    { id: 'aries',       symbol: '♈', name: 'Aries' },
    { id: 'taurus',      symbol: '♉', name: 'Taurus' },
    { id: 'gemini',      symbol: '♊', name: 'Gemini' },
    { id: 'cancer',      symbol: '♋', name: 'Cancer' },
    { id: 'leo',         symbol: '♌', name: 'Leo' },
    { id: 'virgo',       symbol: '♍', name: 'Virgo' },
    { id: 'libra',       symbol: '♎', name: 'Libra' },
    { id: 'scorpio',     symbol: '♏', name: 'Scorpio' },
    { id: 'sagittarius', symbol: '♐', name: 'Sagittarius' },
    { id: 'capricorn',   symbol: '♑', name: 'Capricorn' },
    { id: 'aquarius',    symbol: '♒', name: 'Aquarius' },
    { id: 'pisces',      symbol: '♓', name: 'Pisces' }
  ];

  var GEMSTONE_ICONS = {
    'Diamond': '💎', 'Ruby': '🔴', 'Sapphire': '🔵',
    'Emerald': '🟢', 'Amethyst': '🟣', 'Citrine': '🟡',
    'Pearl': '⚪', 'Coral': '🔴', 'Topaz': '🟡'
  };

  // =========================================================================
  // DOM HELPERS
  // =========================================================================

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function getSign(id) {
    for (var i = 0; i < SIGNS.length; i++) { if (SIGNS[i].id === id) return SIGNS[i]; }
    return SIGNS[0];
  }

  function todayStr() { return new Date().toISOString().split('T')[0]; }

  // =========================================================================
  // API CLIENT
  // =========================================================================

  // No API key is ever read into a request (Vastu review register leaks#3,
  // 2026-09-17). Anything in theme markup or window.VedikaConfig reaches every
  // storefront visitor, so a key there could be read and billed by anyone.
  // Requests go to the app proxy on the shop's own domain (/apps/vedika by
  // default); the proxy server adds the key. A leftover data-api-key attribute
  // or VedikaConfig.apiKey from an older theme is ignored with one warning.
  var DEFAULT_PROXY_BASE = '/apps/vedika';
  var keyWarned = false;

  function warnIgnoredKey(container) {
    var legacy = container.getAttribute('data-api-key') || (window.VedikaConfig && window.VedikaConfig.apiKey);
    if (!legacy || keyWarned) return;
    keyWarned = true;
    if (window.console && console.warn) {
      console.warn('[vedika] The API key in this theme is ignored and was not sent. Remove it: a key in page markup is readable by every visitor. The app proxy adds the key server-side.');
    }
  }

  function getConfig(container) {
    warnIgnoredKey(container);
    var base = container.getAttribute('data-proxy-base') ||
      (window.VedikaConfig && window.VedikaConfig.proxyBase) || DEFAULT_PROXY_BASE;
    return {
      base: String(base).replace(/\/+$/, ''),
      lang: container.getAttribute('data-lang') || 'en',
      theme: container.getAttribute('data-theme') || 'light'
    };
  }

  function apiFetch(base, path, lang) {
    var url = base + path;
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    if (lang && lang !== 'en') url += sep + 'lang=' + encodeURIComponent(lang);

    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('API returned ' + r.status); return r.json(); })
      .then(function (j) { if (j.success === false) throw new Error(j.error || 'API error'); return j.data || j; });
  }

  // =========================================================================
  // SHARED COMPONENTS
  // =========================================================================

  function showLoading(c, msg) {
    clear(c);
    var w = mk('div', 'vedika-loading');
    w.appendChild(mk('div', 'vedika-loading__spinner'));
    w.appendChild(mk('p', null, msg || 'Loading...'));
    c.appendChild(w);
  }

  function showError(c, msg, retryFn) {
    clear(c);
    var w = mk('div', 'vedika-error');
    w.appendChild(mk('span', 'vedika-error__icon', '⚠'));
    w.appendChild(mk('p', null, msg));
    if (retryFn) {
      var btn = mk('button', 'vedika-btn vedika-btn--outline', 'Retry');
      btn.addEventListener('click', retryFn);
      w.appendChild(btn);
    }
    c.appendChild(w);
  }

  function makeHeader(icon, title, badge) {
    var hdr = mk('div', 'vedika-header');
    var ttl = mk('div', 'vedika-header__title');
    ttl.appendChild(mk('span', 'vedika-header__icon', icon));
    ttl.appendChild(document.createTextNode(' ' + title));
    hdr.appendChild(ttl);
    if (badge) hdr.appendChild(mk('span', 'vedika-header__badge', badge));
    return hdr;
  }

  function makeFooter(date) {
    var f = mk('div', 'vedika-footer');
    var brand = mk('div', 'vedika-footer__brand');
    brand.appendChild(document.createTextNode('Powered by '));
    var a = mk('a');
    a.href = 'https://vedika.io';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Vedika AI';
    brand.appendChild(a);
    f.appendChild(brand);
    f.appendChild(mk('div', 'vedika-footer__date', date || todayStr()));
    return f;
  }

  function makeSignSelector(active, onSelect) {
    var wrap = mk('div', 'vedika-sign-selector');
    for (var i = 0; i < SIGNS.length; i++) {
      (function (s) {
        var btn = mk('button', 'vedika-sign-btn' + (s.id === active ? ' active' : ''));
        btn.appendChild(mk('span', 'vedika-sign-btn__symbol', s.symbol));
        btn.appendChild(document.createTextNode(s.name));
        btn.addEventListener('click', function () { onSelect(s.id); });
        wrap.appendChild(btn);
      })(SIGNS[i]);
    }
    return wrap;
  }

  function makeSelect(signs, selected, id) {
    var sel = mk('select', 'vedika-select');
    if (id) sel.id = id;
    for (var i = 0; i < signs.length; i++) {
      var opt = mk('option', null, signs[i].symbol + ' ' + signs[i].name);
      opt.value = signs[i].id;
      if (signs[i].id === selected) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  // =========================================================================
  // HOROSCOPE RENDERER
  // =========================================================================

  function renderHoroscope(container) {
    var cfg = getConfig(container);
    var sign = (container.getAttribute('data-sign') || 'aries').toLowerCase();
    var period = (container.getAttribute('data-period') || 'daily').toLowerCase();
    container.setAttribute('data-theme', cfg.theme);

    function load(s) {
      sign = s;
      showLoading(container, 'Loading horoscope...');
      var path = period === 'daily' ? '/horoscope/' + sign : '/horoscope/' + sign + '/' + period;
      apiFetch(cfg.base, path, cfg.lang)
        .then(render)
        .catch(function (e) { showError(container, e.message, function () { load(sign); }); });
    }

    function render(data) {
      clear(container);
      var info = getSign(sign);

      container.appendChild(makeHeader(info.symbol, info.name + ' Horoscope', data.period || period));
      container.appendChild(makeSignSelector(sign, load));
      container.appendChild(mk('div', 'vedika-prediction', data.prediction || ''));

      if (data.categories) {
        var grid = mk('div', 'vedika-categories');
        var labels = { love: '❤ Love', career: '💼 Career', health: '🌿 Health', finance: '💰 Finance' };
        ['love', 'career', 'health', 'finance'].forEach(function (k) {
          var c = data.categories[k];
          if (!c) return;
          var card = mk('div', 'vedika-category');
          card.appendChild(mk('div', 'vedika-category__label', labels[k]));
          card.appendChild(mk('div', 'vedika-category__text', c.text || ''));
          if (c.score) card.appendChild(mk('span', 'vedika-category__score', c.score + '/100'));
          grid.appendChild(card);
        });
        container.appendChild(grid);
      }

      var lucky = mk('div', 'vedika-lucky-row');
      [{ l: 'Lucky #', v: data.lucky_number }, { l: 'Color', v: data.lucky_color },
       { l: 'Mood', v: data.mood }, { l: 'Match', v: data.compatibility }].forEach(function (x) {
        if (x.v == null) return;
        var sp = mk('span', 'vedika-lucky-item');
        sp.appendChild(mk('span', 'vedika-lucky-item__label', x.l));
        sp.appendChild(document.createTextNode(' ' + x.v));
        lucky.appendChild(sp);
      });
      container.appendChild(lucky);
      container.appendChild(makeFooter(data.date));
    }

    load(sign);
  }

  // =========================================================================
  // TAROT RENDERER
  // =========================================================================

  function renderTarot(container) {
    var cfg = getConfig(container);
    container.setAttribute('data-theme', cfg.theme);

    function load() {
      showLoading(container, 'Drawing your card...');
      apiFetch(cfg.base, '/tarot/card-of-the-day', cfg.lang)
        .then(render)
        .catch(function (e) { showError(container, e.message, load); });
    }

    function render(data) {
      clear(container);
      var card = data.card || {};
      var arcana = card.arcana === 'major' ? 'Major Arcana' : (card.suit ? card.suit + ' — Minor Arcana' : 'Minor Arcana');

      container.appendChild(makeHeader('🃏', 'Card of the Day', card.upright ? 'Upright' : 'Reversed'));

      var cardDiv = mk('div', 'vedika-tarot-card');
      cardDiv.appendChild(mk('span', 'vedika-tarot-card__symbol', '🃏'));
      cardDiv.appendChild(mk('div', 'vedika-tarot-card__name', card.name || 'Unknown'));
      cardDiv.appendChild(mk('div', 'vedika-tarot-card__arcana', arcana));
      cardDiv.appendChild(mk('div', 'vedika-tarot-card__meaning', card.meaning || ''));

      if (card.keywords && card.keywords.length) {
        var kw = mk('div', 'vedika-tarot-keywords');
        for (var i = 0; i < card.keywords.length; i++) {
          kw.appendChild(mk('span', 'vedika-tarot-keyword', card.keywords[i]));
        }
        cardDiv.appendChild(kw);
      }
      container.appendChild(cardDiv);

      if (data.affirmation) {
        container.appendChild(mk('div', 'vedika-tarot-affirmation', '"' + data.affirmation + '"'));
      }

      container.appendChild(makeFooter(data.date || todayStr()));
    }

    load();
  }

  // =========================================================================
  // COMPATIBILITY RENDERER
  // =========================================================================

  function renderCompatibility(container) {
    var cfg = getConfig(container);
    var sign1 = (container.getAttribute('data-sign') || 'aries').toLowerCase();
    var sign2 = (container.getAttribute('data-sign2') || 'leo').toLowerCase();
    container.setAttribute('data-theme', cfg.theme);
    var resultDiv;

    function buildUI() {
      clear(container);
      container.appendChild(makeHeader('❤', 'Zodiac Compatibility', 'Ashtakoot'));

      var row = mk('div', 'vedika-input-row');
      var sel1 = makeSelect(SIGNS, sign1, 'vedika-cs1-' + container.getAttribute('data-block-id'));
      var sel2 = makeSelect(SIGNS, sign2, 'vedika-cs2-' + container.getAttribute('data-block-id'));
      var btn = mk('button', 'vedika-btn', 'Check');
      btn.addEventListener('click', function () {
        sign1 = sel1.value;
        sign2 = sel2.value;
        loadResult();
      });
      row.appendChild(sel1);
      row.appendChild(sel2);
      row.appendChild(btn);
      container.appendChild(row);

      resultDiv = mk('div', 'vedika-compat-result');
      container.appendChild(resultDiv);
      container.appendChild(makeFooter());
    }

    function loadResult() {
      clear(resultDiv);
      var ld = mk('div', 'vedika-loading');
      ld.appendChild(mk('div', 'vedika-loading__spinner'));
      resultDiv.appendChild(ld);

      apiFetch(cfg.base, '/astrology/ashtakoota', cfg.lang)
        .then(renderResult)
        .catch(function (e) {
          clear(resultDiv);
          resultDiv.appendChild(mk('p', 'vedika-error__text', e.message));
        });
    }

    function renderResult(data) {
      clear(resultDiv);
      var info1 = getSign(sign1);
      var info2 = getSign(sign2);
      var total = data.total_points || 36;
      var scored = data.received_points || data.scored_points || 28;
      var pct = Math.round((scored / total) * 100);

      var row = mk('div', 'vedika-compat-signs');
      var s1 = mk('div', 'vedika-compat-sign');
      s1.appendChild(mk('span', 'vedika-compat-sign__symbol', info1.symbol));
      s1.appendChild(mk('div', 'vedika-compat-sign__name', info1.name));
      row.appendChild(s1);
      row.appendChild(mk('span', 'vedika-compat-heart', '❤'));
      var s2 = mk('div', 'vedika-compat-sign');
      s2.appendChild(mk('span', 'vedika-compat-sign__symbol', info2.symbol));
      s2.appendChild(mk('div', 'vedika-compat-sign__name', info2.name));
      row.appendChild(s2);
      resultDiv.appendChild(row);

      var scoreDiv = mk('div', 'vedika-compat-score');
      scoreDiv.appendChild(mk('div', 'vedika-compat-score__value', scored + '/' + total));
      scoreDiv.appendChild(mk('div', 'vedika-compat-score__label', pct + '% Compatible'));
      resultDiv.appendChild(scoreDiv);

      if (data.koots && data.koots.length) {
        var list = mk('ul', 'vedika-compat-details');
        for (var i = 0; i < data.koots.length; i++) {
          var k = data.koots[i];
          var maxP = k.max_points || k.maxPoints || 8;
          var gotP = k.received_points || k.receivedPoints || k.points || 0;
          var barPct = Math.round((gotP / maxP) * 100);
          var li = mk('li');
          li.appendChild(mk('span', 'vedika-compat-details__name', k.name || k.koot || ''));
          li.appendChild(mk('span', null, gotP + '/' + maxP));
          var bar = mk('span', 'vedika-compat-details__bar');
          var fill = mk('span', 'vedika-compat-details__fill');
          fill.style.width = barPct + '%';
          bar.appendChild(fill);
          li.appendChild(bar);
          list.appendChild(li);
        }
        resultDiv.appendChild(list);
      }

      if (data.recommendation) {
        resultDiv.appendChild(mk('div', 'vedika-prediction', data.recommendation));
      }
    }

    buildUI();
  }

  // =========================================================================
  // GEMSTONE RENDERER
  // =========================================================================

  function renderGemstone(container) {
    var cfg = getConfig(container);
    var sign = (container.getAttribute('data-sign') || 'aries').toLowerCase();
    container.setAttribute('data-theme', cfg.theme);

    function load(s) {
      sign = s;
      showLoading(container, 'Finding your gemstones...');
      apiFetch(cfg.base, '/crystals/by-zodiac/' + sign, cfg.lang)
        .then(render)
        .catch(function (e) { showError(container, e.message, function () { load(sign); }); });
    }

    function render(data) {
      clear(container);
      var info = getSign(sign);

      container.appendChild(makeHeader('💎', info.name + ' Gemstones', 'Vedic'));
      container.appendChild(makeSignSelector(sign, load));

      // Birthstones
      if (data.birthstones && data.birthstones.length) {
        var bsDiv = mk('div', 'vedika-gemstone-section');
        bsDiv.appendChild(mk('div', 'vedika-gemstone-section__label', 'Primary Birthstones'));
        var bsList = mk('div', 'vedika-gemstone-list');
        for (var i = 0; i < data.birthstones.length; i++) {
          var name = data.birthstones[i];
          var gem = mk('div', 'vedika-gemstone-item vedika-gemstone-item--primary');
          var icon = GEMSTONE_ICONS[name] || '💎';
          gem.appendChild(mk('span', 'vedika-gemstone-item__icon', icon));
          gem.appendChild(mk('span', 'vedika-gemstone-item__name', name));
          bsList.appendChild(gem);
        }
        bsDiv.appendChild(bsList);
        container.appendChild(bsDiv);
      }

      // Supporting crystals
      if (data.supporting_crystals && data.supporting_crystals.length) {
        var scDiv = mk('div', 'vedika-gemstone-section');
        scDiv.appendChild(mk('div', 'vedika-gemstone-section__label', 'Supporting Crystals'));
        var scList = mk('div', 'vedika-gemstone-list');
        for (var j = 0; j < data.supporting_crystals.length; j++) {
          var sName = data.supporting_crystals[j];
          var sGem = mk('div', 'vedika-gemstone-item');
          var sIcon = GEMSTONE_ICONS[sName] || '⭐';
          sGem.appendChild(mk('span', 'vedika-gemstone-item__icon', sIcon));
          sGem.appendChild(mk('span', 'vedika-gemstone-item__name', sName));
          scList.appendChild(sGem);
        }
        scDiv.appendChild(scList);
        container.appendChild(scDiv);
      }

      // Balancing crystals
      if (data.balancing_crystals && data.balancing_crystals.length) {
        var bcDiv = mk('div', 'vedika-gemstone-section');
        bcDiv.appendChild(mk('div', 'vedika-gemstone-section__label', 'Balancing Crystals'));
        var bcList = mk('div', 'vedika-gemstone-list');
        for (var k = 0; k < data.balancing_crystals.length; k++) {
          var bName = data.balancing_crystals[k];
          var bGem = mk('div', 'vedika-gemstone-item vedika-gemstone-item--balance');
          bGem.appendChild(mk('span', 'vedika-gemstone-item__icon', '🔮'));
          bGem.appendChild(mk('span', 'vedika-gemstone-item__name', bName));
          bcList.appendChild(bGem);
        }
        bcDiv.appendChild(bcList);
        container.appendChild(bcDiv);
      }

      // Guidance
      if (data.guidance) {
        container.appendChild(mk('div', 'vedika-prediction', data.guidance));
      }

      container.appendChild(makeFooter());
    }

    load(sign);
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  window.VedikaShopify = {
    renderHoroscope: renderHoroscope,
    renderTarot: renderTarot,
    renderCompatibility: renderCompatibility,
    renderGemstone: renderGemstone,
    SIGNS: SIGNS
  };

})();
