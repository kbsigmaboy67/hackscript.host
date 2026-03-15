/**
 * links.js — HackTerminal Link Registry
 *
 * Links are NOT in plain text. They are stored Base64-encoded and
 * only decoded on demand (user action or hash route).
 *
 * Hash routing: yourapp.vercel.app/#proxy/RammerHead
 *               yourapp.vercel.app/#game/MacVG
 *               yourapp.vercel.app/#url/https://...
 *
 * The sidebar never renders raw URLs — only names + categories.
 */

'use strict';

const LinkRegistry = (() => {

  // Encoded link data — decoded on demand, never stored in DOM
  const _raw = [
    // ─── Proxies ─────────────────────────────────────────────
    { n:'RammerHead',       cat:'proxy', d:'Full-featured web proxy. Bypasses most filters.',        _:'aHR0cHM6Ly9lZmx5LjEwOC0xODEtMzItNzcuc3NsaXAuaW8v' },
    { n:'PeteZah',          cat:'proxy', d:'Alternative proxy node. Fast and reliable.',             _:'aHR0cHM6Ly90dWJtbGR4ZW5pLnZpYXIzZC5jb20v' },
    { n:'Interstellar',     cat:'proxy', d:'Lightweight mini proxy. Good for gaming sites.',         _:'aHR0cHM6Ly85Mjg1MC52ZXJjZWwuYXBwLw==' },
    { n:'Ultraviolet',      cat:'proxy', d:'Popular open-source web proxy service.',                 _:'aHR0cHM6Ly91bHRyYXZpb2xldC5jbG91ZC8=' },
    { n:'Holy Unblocker',   cat:'proxy', d:'Full proxy suite on Vercel.',                           _:'aHR0cHM6Ly9ob2x5LXVuYmxvY2tlci52ZXJjZWwuYXBwLw==' },
    { n:'Titanium Network', cat:'proxy', d:'Proxy hub with multiple backends.',                      _:'aHR0cHM6Ly90aXRhbml1bW5ldHdvcmsub3JnLw==' },
    { n:'CroxyProxy',       cat:'proxy', d:'Free anonymous web proxy.',                             _:'aHR0cHM6Ly9jcm94eS5uZXR3b3JrLw==' },
    { n:'Hidester',         cat:'proxy', d:'Online proxy with SSL support.',                         _:'aHR0cHM6Ly9oaWRlc3Rlci5jb20vcHJveHkv' },
    { n:'Proxyium',         cat:'proxy', d:'Fast web proxy, no config needed.',                      _:'aHR0cHM6Ly9wcm94eWl1bS5jb20v' },
    // ─── Games ───────────────────────────────────────────────
    { n:'MacVG',            cat:'game',  d:'Unblocked games collection.',                            _:'aHR0cHM6Ly9rYnNpZ21hYm95NjcuZ2l0aHViLmlvL21hY3ZnLw==' },
    { n:'GN Math',          cat:'game',  d:'Math-based unblocked games.',                            _:'aHR0cHM6Ly82anV3bjMzYTNjLjEwNy4xNzQuMzQuNDQuc3NsaXAuaW8=' },
    { n:'UG Premium',       cat:'game',  d:'Huge unblocked browser game library.',                   _:'aHR0cHM6Ly91bmJsb2NrZWQtZ2FtZXNwcmVtaXVtLmNvbS8=' },
    { n:'UG Premium GH',    cat:'game',  d:'GitHub mirror of UG Premium.',                           _:'aHR0cHM6Ly91bmJsb2NrZWRnYW1lc3ByZW1pdW0uZ2l0aHViLmlvLw==' },
    { n:'Premium UG GL',    cat:'game',  d:'GitLab mirror, usually accessible.',                     _:'aHR0cHM6Ly9wcmVtaXVtdW5ibG9ja2VkZ2FtZXMuZ2l0bGFiLmlvLw==' },
    { n:'Unblocked GG',     cat:'game',  d:'Large game catalog.',                                    _:'aHR0cHM6Ly91bmJsb2NrZWRnYW1lcy5nZy8=' },
    { n:'Unblocked Premium',cat:'game',  d:'Curated premium unblocked game site.',                   _:'aHR0cHM6Ly91bmJsb2NrZWRwcmVtaXVtLmNvbS8=' },
    { n:'Unblocked 76',     cat:'game',  d:'Classic 76-style unblocked game hub.',                   _:'aHR0cHM6Ly91bmJsb2NrZWQtNzYtZ2FtZXMub3JnLw==' },
    { n:'UG Now',           cat:'game',  d:'Quick access unblocked games.',                          _:'aHR0cHM6Ly91bmJsb2NrZWRnYW1lcy5ub3cv' },
    { n:'UG-G',             cat:'game',  d:'Alternate unblocked game portal.',                       _:'aHR0cHM6Ly91bmJsb2NrZWRnYW1lc2cub3JnLw==' },
    { n:'UG Premium Online',cat:'game',  d:'GitHub-hosted UG mirror.',                              _:'aHR0cHM6Ly91bmJsb2NrZWRnYW1lc3ByZW1pdW1vbmxpbmUuZ2l0aHViLmlvLw==' },
    { n:'UG IM',            cat:'game',  d:'Instant game launcher.',                                 _:'aHR0cHM6Ly91bmJsb2NrZWRnYW1lcy5pbS8=' },
    { n:'Unbanned Games',   cat:'game',  d:'Games removed from blocklists.',                         _:'aHR0cHM6Ly91bmJhbm5lZGdhbWVzLmlvLw==' },
    { n:'1001 Unblocked',   cat:'game',  d:'Over a thousand unblocked titles.',                      _:'aHR0cHM6Ly8xMDAxdW5ibG9ja2VkZ2FtZXMuZ2l0aHViLmlvLw==' },
    { n:'UG GG Com',        cat:'game',  d:'.com variant of the GG hub.',                            _:'aHR0cHM6Ly91bmJsb2NrZWRnYW1lc2dnLmNvbS8=' },
    { n:'Unbanned.games',   cat:'game',  d:'Community-run unbanned game directory.',                 _:'aHR0cHM6Ly91bmJhbm5lZC5nYW1lcy8=' },
    { n:'Now GG Unblocked', cat:'game',  d:'Cloud-based games, runs in browser.',                   _:'aHR0cHM6Ly9ub3cuZ2cvZ2FtZXMvdW5ibG9ja2VkLmh0bWw=' },
    { n:'Freeze Nova',      cat:'game',  d:'GitLab-hosted game collection.',                         _:'aHR0cHM6Ly9mcmVlemVub3ZhZ2FtZXMuZ2l0bGFiLmlvLw==' },
    { n:'Yapi Games',       cat:'game',  d:'HTML5 browser games.',                                   _:'aHR0cHM6Ly93d3cueWFwaWdhbWVzLmNvbS8=' },
    { n:'GameDistribution', cat:'game',  d:'Official publisher portal, 1000+ titles.',               _:'aHR0cHM6Ly93d3cuZ2FtZWRpc3RyaWJ1dGlvbi5jb20v' },
    { n:'G Plus Games',     cat:'game',  d:'Curated browser games, clean interface.',                _:'aHR0cHM6Ly9ncGx1c2dhbWVzLmNvbS8=' },
  ];

  /** Decode a link URL only when needed */
  function decode(entry) {
    return atob(entry._);
  }

  /** Get all entries (without decoded URLs) */
  function getAll() {
    return _raw.map(({ n, cat, d }) => ({ n, cat, d }));
  }

  /** Get entries by category */
  function getByCategory(cat) {
    return _raw.filter(e => e.cat === cat).map(({ n, cat, d }) => ({ n, cat, d }));
  }

  /** Find a link by name (fuzzy) and return its decoded URL */
  function resolve(query) {
    const q = query.toLowerCase().trim();
    const match = _raw.find(e =>
      e.n.toLowerCase() === q ||
      e.n.toLowerCase().includes(q)
    );
    return match ? { name: match.n, url: decode(match), cat: match.cat, desc: match.d } : null;
  }

  /** Resolve by exact name */
  function resolveExact(name) {
    const match = _raw.find(e => e.n === name);
    return match ? decode(match) : null;
  }

  /**
   * Hash routing handler.
   * Parses: #proxy/Name, #game/Name, #url/base64encodedUrl
   */
  function handleHash(hash) {
    if (!hash || hash === '#') return null;
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    const [type, ...rest] = raw.split('/');
    const val = rest.join('/');

    if (type === 'url') {
      try { return { url: atob(val), name: 'Direct URL' }; } catch { return null; }
    }
    if (type === 'proxy' || type === 'game') {
      const entry = _raw.find(e => e.cat === type && e.n.toLowerCase() === decodeURIComponent(val).toLowerCase());
      if (entry) return { url: decode(entry), name: entry.n };
    }
    // Fallback: try to match name across all categories
    const entry = _raw.find(e => e.n.toLowerCase() === decodeURIComponent(val).toLowerCase());
    if (entry) return { url: decode(entry), name: entry.n };
    return null;
  }

  /**
   * Generate a shareable hash URL for a link name.
   * e.g. #proxy/RammerHead
   */
  function makeHash(name) {
    const entry = _raw.find(e => e.n === name);
    if (!entry) return null;
    return `#${entry.cat}/${encodeURIComponent(entry.n)}`;
  }

  /**
   * Generate a hash URL for a raw URL (base64 encoded in hash).
   */
  function makeUrlHash(url) {
    return `#url/${btoa(url)}`;
  }

  return {
    getAll,
    getByCategory,
    resolve,
    resolveExact,
    handleHash,
    makeHash,
    makeUrlHash,
    count: () => _raw.length,
    proxyCount: () => _raw.filter(e => e.cat === 'proxy').length,
    gameCount:  () => _raw.filter(e => e.cat === 'game').length,
  };
})();

window.LinkRegistry = LinkRegistry;
