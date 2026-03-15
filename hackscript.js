/**
 * hackscript.js — HackScript v3.0 Language Engine
 *
 * HackScript IS real JavaScript. No fake interpreter.
 * It runs via eval() inside an async IIFE with:
 *   - Full stdlib injected into scope
 *   - Crypto functions (VaultCrypto)
 *   - Template literal sugar: html`...`, css`...`
 *   - Persistent ENV (vars survive between runs)
 *   - Preprocessing for syntactic sugar
 *
 * "JavaScript 2.0" philosophy: 100% valid JS, plus a curated
 * stdlib injected automatically so common operations are
 * first-class without imports or boilerplate.
 */

'use strict';

/* ─── Persistent environment ─────────────────────────────── */
const ENV = {
  vars:     {},   // user-defined variables (persisted between runs)
  fns:      {},   // user-defined functions
  cmdCount: 0,
  lineCount: 0,
  history:  [],
  histIdx:  -1,
};

/* ─── HackScript Standard Library ────────────────────────── */
const HS = {

  /* ── Output ──────────────────────────────────────────────── */
  print:   (...a)  => Terminal.write(a.map(v => HS._fmt(v)).join(' ')),
  println: (...a)  => a.forEach(v => Terminal.write(HS._fmt(v))),
  info:    (...a)  => Terminal.write('ℹ ' + a.map(v => HS._fmt(v)).join(' '), 't-info'),
  warn:    (...a)  => Terminal.write('⚠ ' + a.join(' '), 't-warn'),
  error:   (...a)  => Terminal.write('✖ ' + a.join(' '), 't-err'),
  success: (...a)  => Terminal.write('✔ ' + a.join(' '), 't-ok'),
  sys:     (...a)  => Terminal.write('⚙ ' + a.join(' '), 't-sys'),
  dim:     (...a)  => Terminal.write(a.join(' '), 't-dim'),
  banner:  (t)     => Terminal.writeBanner(String(t)),
  log:     (...a)  => HS.print(...a),   // console.log alias
  pp:      (v)     => Terminal.write(JSON.stringify(v, null, 2), 't-info'), // pretty print
  cls:     ()      => Terminal.clear(),
  clear:   ()      => Terminal.clear(),

  /* ── Rich output ─────────────────────────────────────────── */
  table: (data) => {
    if (!Array.isArray(data) || !data.length) { HS.dim('(empty table)'); return; }
    const keys = Object.keys(data[0]);
    let html = `<table class="hs-table"><thead><tr>`;
    html += keys.map(k => `<th>${Terminal.esc(k)}</th>`).join('');
    html += `</tr></thead><tbody>`;
    data.forEach(row => {
      html += `<tr>` + keys.map(k => `<td>${Terminal.esc(String(row[k] ?? ''))}</td>`).join('') + `</tr>`;
    });
    html += `</tbody></table>`;
    Terminal.writeHtml(html);
  },

  chart: (data, label = '') => {
    const max = Math.max(...data, 1);
    let html = `<div style="margin:4px 0;font-size:11px;">`;
    if (label) html += `<div style="color:var(--blue);margin-bottom:3px;font-family:var(--font-hud);letter-spacing:1px;font-size:9px;">${Terminal.esc(label)}</div>`;
    data.forEach((v, i) => {
      const pct = Math.round((v / max) * 100);
      html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
        <span style="color:var(--text-dim);width:22px;text-align:right;font-size:10px;">${i}</span>
        <div style="flex:1;background:var(--bg3);border-radius:2px;height:9px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--red),var(--blue));"></div>
        </div>
        <span style="color:var(--green);width:44px;font-size:10px;">${v}</span>
      </div>`;
    });
    html += `</div>`;
    Terminal.writeHtml(html);
  },

  progress: (pct, label = '') => {
    Terminal.writeHtml(`<div style="font-size:11px;margin:2px 0;display:flex;align-items:center;gap:8px;">
      ${label ? `<span style="color:var(--text-dim);font-size:10px;">${Terminal.esc(label)}</span>` : ''}
      <div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${Math.min(100,Math.max(0,pct))}%;"></div></div>
      <span style="color:var(--blue);font-size:10px;">${pct}%</span>
    </div>`);
  },

  /** Inject HTML directly into terminal */
  html: (str) => Terminal.writeHtml(str),

  /** Inject CSS into the page */
  css: (str) => {
    const tag = document.createElement('style');
    tag.textContent = str;
    document.head.appendChild(tag);
    HS.success('CSS injected into page.');
  },

  /** Open a new window with rendered HTML content */
  render: (html, title = 'HackScript Output') => {
    const win = window.open('', '_blank', 'width=900,height=600');
    if (!win) { HS.error('Popup blocked. Allow popups for this site.'); return; }
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"><title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
      <style>body{background:#050508;color:#c8d0e0;font-family:'Share Tech Mono',monospace;padding:24px;}</style>
    </head><body>${html}</body></html>`);
    win.document.close();
    HS.success('Rendered in new window.');
  },

  /* ── Network ─────────────────────────────────────────────── */
  links: (cat) => {
    const items = cat ? LinkRegistry.getByCategory(cat) : LinkRegistry.getAll();
    items.forEach(l => {
      Terminal.writeHtml(`<div style="display:flex;gap:8px;align-items:center;font-size:11px;padding:1px 0;">
        <span style="color:${l.cat==='proxy'?'var(--red)':'var(--blue)'}">${l.cat==='proxy'?'🔒':'🎮'}</span>
        <span style="color:var(--cyan);min-width:160px;">${Terminal.esc(l.n)}</span>
        <span style="color:var(--text-dim);font-size:10px;flex:1;">${Terminal.esc(l.d)}</span>
        <span style="color:var(--text-dim);font-size:8px;font-family:var(--font-hud);">${l.cat.toUpperCase()}</span>
      </div>`);
    });
  },
  proxies: () => HS.links('proxy'),
  games:   () => HS.links('game'),

  open: (query) => {
    const r = LinkRegistry.resolve(query);
    if (r) { Terminal.openLink(r.url, r.name); HS.success(`Opening ${r.name}`); }
    else HS.error(`No link found: "${query}"`);
  },
  openUrl: (url) => Terminal.openLink(url, url),
  hashLink: (name) => {
    const h = LinkRegistry.makeHash(name);
    if (h) { HS.info(`Shareable hash: ${location.origin + location.pathname + h}`); return h; }
    HS.error(`No link named "${name}"`);
  },

  fetch: async (url, opts = {}) => {
    try {
      const r = await fetch(url, opts);
      const text = await r.text();
      return text;
    } catch (e) {
      HS.error('fetch failed: ' + e.message);
      return null;
    }
  },

  /* ── Crypto (VaultCrypto wrappers) ───────────────────────── */
  /**
   * Encrypt a string. Returns Base64 .vlt payload.
   * @param {string} text
   * @param {string} passphrase
   * @param {boolean} [stego=false]  — hide in cover text via steganography
   * @param {string}  [cover='']     — visible cover text (stego mode)
   */
  encrypt: async (text, passphrase, stego = false, cover = '') => {
    if (stego) return VaultCrypto.stegoEncrypt(text, passphrase, cover);
    return VaultCrypto.encryptText(text, passphrase);
  },

  /**
   * Decrypt a .vlt Base64 payload or stego text.
   */
  decrypt: async (payload, passphrase) => {
    // Try stego first (has invisible separator)
    const hidden = VaultCrypto.stegoDecode(payload);
    if (hidden) return VaultCrypto.decryptText(hidden, passphrase);
    return VaultCrypto.decryptText(payload, passphrase);
  },

  /** AES-256-GCM encrypt file (File object) → downloads .vlt */
  encryptFile: async (file, passphrase) => {
    const buf = await file.arrayBuffer();
    const vlt = await VaultCrypto.encryptFile(buf, passphrase);
    VaultCrypto.downloadBuffer(vlt, file.name + '.vlt');
    HS.success(`Encrypted: ${file.name}.vlt`);
  },

  /** AES-256-GCM decrypt .vlt File object → downloads original */
  decryptFile: async (file, passphrase, originalName = 'decrypted') => {
    const buf = await file.arrayBuffer();
    const raw = await VaultCrypto.decryptFile(buf, passphrase);
    VaultCrypto.downloadBuffer(raw, originalName);
    HS.success(`Decrypted: ${originalName}`);
  },

  /** Hide secret in cover text using steganography (no encryption) */
  stegoHide: (secret, cover = '') => VaultCrypto.stegoEncode(secret, cover),

  /** Extract hidden payload from stego text */
  stegoReveal: (text) => {
    const r = VaultCrypto.stegoDecode(text);
    if (r) { HS.success('Payload found:'); HS.info(r); return r; }
    HS.warn('No steganographic payload found.');
    return null;
  },

  /** Encrypt then hide in stego text */
  stegoEncrypt: (text, pass, cover = '') => VaultCrypto.stegoEncrypt(text, pass, cover),

  /** Reveal and decrypt stego text */
  stegoDecrypt: (text, pass) => VaultCrypto.stegoDecrypt(text, pass),

  /** Hash a string. algo: 'SHA-256'|'SHA-384'|'SHA-512' */
  hash: (text, algo = 'SHA-256') => VaultCrypto.hash(text, algo),

  /** HMAC-SHA256 */
  hmac: (msg, secret) => VaultCrypto.hmac(msg, secret),

  /** Generate a secure passphrase */
  passgen: (length = 24, mode = 'chars') => {
    const p = VaultCrypto.generatePassphrase(length, mode);
    const s = VaultCrypto.scorePassphrase(p);
    HS.success(p);
    HS.dim(`strength: ${s.label} (${s.score}/100)`);
    return p;
  },

  /** Score a passphrase */
  passScore: (pass) => {
    const s = VaultCrypto.scorePassphrase(pass);
    HS.info(`Strength: ${s.label} (${s.score}/100)`);
    return s;
  },

  /** Base64 encode */
  encode: (str) => btoa(unescape(encodeURIComponent(str))),
  /** Base64 decode */
  decode: (str) => decodeURIComponent(escape(atob(str))),

  /** Hex encode a string */
  toHex:   (str) => VaultCrypto.strToHex(str),
  /** Decode hex to string */
  fromHex: (hex) => VaultCrypto.hexToStr(hex),

  /** UUID v4 */
  uuid: () => crypto.randomUUID(),

  /* ── Math ────────────────────────────────────────────────── */
  rand:    (a = 0, b = 1) => Math.random() * (b - a) + a,
  randInt: (a = 0, b = 10) => Math.floor(Math.random() * (b - a + 1)) + a,
  clamp:   (v, mn, mx) => Math.min(mx, Math.max(mn, v)),
  lerp:    (a, b, t) => a + (b - a) * t,
  mapRange:(v, a1, b1, a2, b2) => a2 + ((v - a1) / (b1 - a1)) * (b2 - a2),
  sum:     (arr) => arr.reduce((a, b) => a + b, 0),
  mean:    (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
  median:  (arr) => { const s = [...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; },
  mode:    (arr) => { const f={}; arr.forEach(x=>f[x]=(f[x]||0)+1); return Object.entries(f).sort((a,b)=>b[1]-a[1])[0][0]; },
  std:     (arr) => { const m=HS.mean(arr); return Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length); },
  variance:(arr) => { const m=HS.mean(arr); return arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length; },
  max:     (...a) => Math.max(...(Array.isArray(a[0]) ? a[0] : a)),
  min:     (...a) => Math.min(...(Array.isArray(a[0]) ? a[0] : a)),
  abs:     (n) => Math.abs(n),
  floor:   (n) => Math.floor(n),
  ceil:    (n) => Math.ceil(n),
  round:   (n, d = 0) => Number(n.toFixed(d)),
  sqrt:    (n) => Math.sqrt(n),
  cbrt:    (n) => Math.cbrt(n),
  pow:     (b, e) => Math.pow(b, e),
  log:     (n, base = Math.E) => Math.log(n) / Math.log(base),
  log2:    (n) => Math.log2(n),
  log10:   (n) => Math.log10(n),
  sin:     (n) => Math.sin(n),
  cos:     (n) => Math.cos(n),
  tan:     (n) => Math.tan(n),
  asin:    (n) => Math.asin(n),
  acos:    (n) => Math.acos(n),
  atan:    (n) => Math.atan(n),
  atan2:   (y, x) => Math.atan2(y, x),
  hypot:   (...a) => Math.hypot(...a),
  sign:    (n) => Math.sign(n),
  trunc:   (n) => Math.trunc(n),
  gcd:     (a, b) => b === 0 ? Math.abs(a) : HS.gcd(b, a % b),
  lcm:     (a, b) => Math.abs(a * b) / HS.gcd(a, b),
  factorial:(n) => n <= 1 ? 1 : n * HS.factorial(n - 1),
  fib:     (n) => { let [a,b]=[0,1]; for(let i=0;i<n;i++)[a,b]=[b,a+b]; return a; },
  isPrime: (n) => { if(n<2)return false; for(let i=2;i<=Math.sqrt(n);i++)if(n%i===0)return false; return true; },
  primes:  (n) => Array.from({length:n},(_,i)=>i+2).filter(HS.isPrime),
  PI:      Math.PI,
  TAU:     Math.PI * 2,
  E:       Math.E,
  PHI:     (1 + Math.sqrt(5)) / 2,

  /* ── Arrays ──────────────────────────────────────────────── */
  range:   (a, b, step = 1) => { const r=[]; for(let i=a;i<b;i+=step)r.push(i); return r; },
  rangeInc:(a, b, step = 1) => { const r=[]; for(let i=a;i<=b;i+=step)r.push(i); return r; },
  shuffle: (arr) => [...arr].sort(() => Math.random() - 0.5),
  unique:  (arr) => [...new Set(arr)],
  flatten: (arr, d = Infinity) => arr.flat(d),
  chunk:   (arr, n) => { const r=[]; for(let i=0;i<arr.length;i+=n)r.push(arr.slice(i,i+n)); return r; },
  zip:     (...arrs) => arrs[0].map((_, i) => arrs.map(a => a[i])),
  unzip:   (arr) => arr[0].map((_, i) => arr.map(r => r[i])),
  product: (arr) => arr.reduce((a,b)=>a*b, 1),
  count:   (arr, pred) => pred ? arr.filter(pred).length : arr.length,
  countBy: (arr, fn) => arr.reduce((a,v)=>{const k=fn(v);a[k]=(a[k]||0)+1;return a;},{}),
  groupBy: (arr, fn) => arr.reduce((a,v)=>{const k=fn(v);(a[k]=a[k]||[]).push(v);return a;},{}),
  sortBy:  (arr, key) => [...arr].sort((a,b)=>a[key]<b[key]?-1:1),
  first:   (arr, n = 1) => n === 1 ? arr[0] : arr.slice(0, n),
  last:    (arr, n = 1) => n === 1 ? arr[arr.length-1] : arr.slice(-n),
  sample:  (arr, n = 1) => HS.shuffle(arr).slice(0, n),
  take:    (arr, n) => arr.slice(0, n),
  drop:    (arr, n) => arr.slice(n),
  partition:(arr, pred) => [arr.filter(pred), arr.filter(v=>!pred(v))],
  intersection:(a,b) => a.filter(v=>b.includes(v)),
  difference:  (a,b) => a.filter(v=>!b.includes(v)),
  union:       (a,b) => [...new Set([...a,...b])],
  fill:    (n, v) => Array(n).fill(v),
  matrix:  (r, c, v = 0) => Array.from({length:r}, () => Array(c).fill(v)),
  transpose:(m) => m[0].map((_, i) => m.map(r => r[i])),

  /* ── Strings ─────────────────────────────────────────────── */
  upper:      (s) => String(s).toUpperCase(),
  lower:      (s) => String(s).toLowerCase(),
  trim:       (s) => String(s).trim(),
  trimStart:  (s) => String(s).trimStart(),
  trimEnd:    (s) => String(s).trimEnd(),
  split:      (s, d) => String(s).split(d),
  join:       (a, d = '') => a.join(d),
  repeat:     (s, n) => String(s).repeat(n),
  pad:        (s, n, c = ' ') => String(s).padStart(n, c),
  padEnd:     (s, n, c = ' ') => String(s).padEnd(n, c),
  replace:    (s, a, b) => String(s).replace(new RegExp(a, 'g'), b),
  includes:   (s, q) => String(s).includes(q),
  startsWith: (s, q) => String(s).startsWith(q),
  endsWith:   (s, q) => String(s).endsWith(q),
  escHtml:    (s) => Terminal.esc(s),
  slugify:    (s) => s.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,''),
  camelCase:  (s) => s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),
  snakeCase:  (s) => s.replace(/([A-Z])/g,(_,c)=>'_'+c.toLowerCase()).replace(/^_/,''),
  titleCase:  (s) => s.replace(/\b\w/g,c=>c.toUpperCase()),
  truncate:   (s, n, suf='…') => s.length>n ? s.slice(0,n)+suf : s,
  countWords: (s) => s.trim().split(/\s+/).length,
  template:   (tmpl, data) => tmpl.replace(/\{\{(\w+)\}\}/g, (_,k) => data[k] ?? ''),
  parseJson:  (s) => JSON.parse(s),
  stringify:  (v) => JSON.stringify(v, null, 2),

  /* ── Objects ─────────────────────────────────────────────── */
  keys:      (o) => Object.keys(o),
  values:    (o) => Object.values(o),
  entries:   (o) => Object.entries(o),
  fromEntries:(e)=> Object.fromEntries(e),
  merge:     (...objs) => Object.assign({}, ...objs),
  deepMerge: (a, b) => {
    const r = {...a};
    for (const [k,v] of Object.entries(b)) r[k] = (v && typeof v==='object' && !Array.isArray(v)) ? HS.deepMerge(r[k]||{}, v) : v;
    return r;
  },
  pick:      (o, ...ks) => Object.fromEntries(ks.map(k => [k, o[k]])),
  omit:      (o, ...ks) => Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k))),
  deepClone: (o) => JSON.parse(JSON.stringify(o)),
  mapValues: (o, fn) => Object.fromEntries(Object.entries(o).map(([k,v])=>[k,fn(v,k)])),
  filterObj: (o, fn) => Object.fromEntries(Object.entries(o).filter(([k,v])=>fn(v,k))),
  invert:    (o) => Object.fromEntries(Object.entries(o).map(([k,v])=>[v,k])),
  type:      (v) => Array.isArray(v) ? 'array' : typeof v,
  sizeof:    (v) => new Blob([JSON.stringify(v)]).size + ' bytes',
  inspect:   (v) => { HS.pp(v); return v; },

  /* ── Functional ──────────────────────────────────────────── */
  pipe:     (...fns) => (v) => fns.reduce((a, f) => f(a), v),
  compose:  (...fns) => (v) => fns.reduceRight((a, f) => f(a), v),
  memoize:  (fn) => { const c = new Map(); return (...a) => { const k=JSON.stringify(a); return c.has(k)?c.get(k):(c.set(k,fn(...a)),c.get(k)); }; },
  curry:    (fn) => function cur(...a){ return a.length >= fn.length ? fn(...a) : (...b) => cur(...a,...b); },
  partial:  (fn, ...a) => (...b) => fn(...a,...b),
  throttle: (fn, ms) => { let last=0; return (...a)=>{ const now=Date.now(); if(now-last>=ms){last=now;return fn(...a);} }; },
  debounce: (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; },
  once:     (fn) => { let r,c=false; return (...a)=>{ if(!c){c=true;r=fn(...a);} return r; }; },
  retry:    async (fn, times=3, delay=200) => {
    for(let i=0;i<times;i++){try{return await fn();}catch(e){if(i===times-1)throw e;await HS.sleep(delay);}}
  },
  tryCatch: async (fn, fallback) => { try { return await fn(); } catch(e) { HS.error(e.message); return fallback; } },

  /* ── Time / async ────────────────────────────────────────── */
  sleep:     (ms) => new Promise(r => setTimeout(r, ms)),
  now:       () => new Date().toLocaleString(),
  timestamp: () => Date.now(),
  date:      () => new Date().toLocaleDateString(),
  time:      () => new Date().toLocaleTimeString(),
  isoDate:   () => new Date().toISOString(),
  timeAgo:   (ts) => {
    const s = Math.round((Date.now()-ts)/1000);
    if(s<60) return s+'s ago';
    if(s<3600) return Math.round(s/60)+'m ago';
    if(s<86400) return Math.round(s/3600)+'h ago';
    return Math.round(s/86400)+'d ago';
  },
  benchmark: async (fn, label='') => {
    const t0 = performance.now();
    await fn();
    const ms = (performance.now()-t0).toFixed(2);
    HS.info(`${label||'benchmark'}: ${ms}ms`);
    return parseFloat(ms);
  },

  /* ── Browser / DOM ───────────────────────────────────────── */
  $:         (sel) => document.querySelector(sel),
  $$:        (sel) => [...document.querySelectorAll(sel)],
  createElement: (tag, attrs={}, text='') => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
    if(text) el.textContent = text;
    return el;
  },
  setVar:    (name, val) => { document.documentElement.style.setProperty(name, val); },
  getVar:    (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
  copy:      async (text) => { await navigator.clipboard.writeText(text); HS.success('Copied to clipboard.'); },
  storage:   {
    get:    (k) => { const v = localStorage.getItem(k); try { return JSON.parse(v); } catch { return v; } },
    set:    (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    remove: (k) => localStorage.removeItem(k),
    clear:  () => localStorage.clear(),
    keys:   () => Object.keys(localStorage),
  },

  /* ── System (terminal meta) ──────────────────────────────── */
  help:    (topic) => HS_HELP.show(topic),
  version: () => HS.banner('HackScript v3.0'),
  about:   () => HS_HELP.about(),
  demo:    () => HS_HELP.demo(),
  vars:    () => { HS.pp(ENV.vars); },
  fns:     () => { HS.info(Object.keys(ENV.fns).join(', ') || '(none)'); },
  history: () => { ENV.history.forEach((h, i) => HS.dim(`${String(i).padStart(2,'0')}: ${h}`)); },
  matrix:  () => Terminal.startMatrix(),
  theme:   (name) => Terminal.applyTheme(name),
  notify:  (msg, t) => Terminal.notify(msg, t),
  assert:  (cond, msg='Assertion failed') => {
    if (!cond) throw new Error(msg);
    HS.success('assert passed');
  },

  /* ── Internal helpers ─────────────────────────────────────── */
  _fmt: (v) => {
    if (v === null)      return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    return String(v);
  },
};

/* ─── Help system ─────────────────────────────────────────── */
const HS_HELP = {
  categories: {
    output:      ['print','println','info','warn','error','success','sys','dim','banner','table','chart','progress','html','css','render'],
    math:        ['rand','randInt','range','rangeInc','clamp','lerp','mapRange','sum','mean','median','mode','std','variance','max','min','abs','floor','ceil','round','sqrt','cbrt','pow','log','log2','log10','sin','cos','tan','gcd','lcm','factorial','fib','isPrime','primes','PI','TAU','E','PHI'],
    arrays:      ['shuffle','unique','flatten','chunk','zip','unzip','product','count','countBy','groupBy','sortBy','first','last','sample','take','drop','partition','intersection','difference','union','fill','matrix','transpose'],
    strings:     ['upper','lower','trim','split','join','repeat','pad','replace','includes','startsWith','endsWith','slugify','camelCase','snakeCase','titleCase','truncate','countWords','template','parseJson','stringify'],
    objects:     ['keys','values','entries','fromEntries','merge','deepMerge','pick','omit','deepClone','mapValues','filterObj','invert','type','sizeof','inspect'],
    functional:  ['pipe','compose','memoize','curry','partial','throttle','debounce','once','retry','tryCatch'],
    crypto:      ['encrypt','decrypt','encryptFile','decryptFile','stegoHide','stegoReveal','stegoEncrypt','stegoDecrypt','hash','hmac','passgen','passScore','encode','decode','toHex','fromHex','uuid'],
    network:     ['fetch','open','openUrl','links','proxies','games','hashLink'],
    time:        ['sleep','now','timestamp','date','time','isoDate','timeAgo','benchmark'],
    browser:     ['$','$$','createElement','setVar','getVar','copy','storage'],
    system:      ['help','version','about','demo','vars','fns','history','clear','matrix','theme','notify','assert'],
  },

  show(topic) {
    if (!topic) {
      Terminal.write('─── HackScript v3.0 Help ──────────────────────────', 't-sys');
      Terminal.write('Categories:', 't-info');
      Object.keys(this.categories).forEach(cat => Terminal.write(`  ${cat}`, 't-dim'));
      Terminal.write('', 't-dim');
      Terminal.write('Usage: help("category") or help("funcname")', 't-dim');
      Terminal.write('Real JS — all stdlib injected. async/await supported.', 't-dim');
      return;
    }
    if (this.categories[topic]) {
      Terminal.write(`─── ${topic.toUpperCase()} ─────────────────────────────────`, 't-sys');
      Terminal.writeHtml(`<div style="display:flex;flex-wrap:wrap;gap:4px;padding:2px 0;">` +
        this.categories[topic].map(f =>
          `<span style="font-size:11px;color:var(--cyan);background:var(--bg2);border:1px solid var(--border-hi);padding:2px 7px;border-radius:2px;">${f}</span>`
        ).join('') + `</div>`);
      return;
    }
    // search individual fn
    const all = Object.values(this.categories).flat();
    const found = all.filter(f => f.toLowerCase().includes(topic.toLowerCase()));
    if (found.length) {
      Terminal.write(`Matches for "${topic}":`, 't-info');
      found.forEach(f => Terminal.write(`  ${f}()`, 't-dim'));
    } else {
      Terminal.write(`Not found: "${topic}". Try help() for categories.`, 't-warn');
    }
  },

  about() {
    Terminal.writeBanner('HACKTERMINAL v3.0');
    Terminal.write('HackScript — JavaScript, but batteries included.', 't-info');
    Terminal.write('AES-256-GCM · PBKDF2 · Stego · 90+ stdlib functions', 't-dim');
    Terminal.write('Real async/await · DOM access · Persistent ENV', 't-dim');
    Terminal.write('CodeMirror editor · Hash-routed links · VLT format', 't-dim');
  },

  async demo() {
    Terminal.write('─── Demo ───────────────────────────────────────────', 't-sys');
    HS.banner('HACKSCRIPT');
    HS.progress(80, 'Loading demo');
    await HS.sleep(300);
    HS.chart([14,38,72,55,90,43,67], 'Sample Data');
    await HS.sleep(200);
    HS.table([
      { fn:'encrypt', type:'async', cat:'crypto' },
      { fn:'stegoHide', type:'sync', cat:'crypto' },
      { fn:'hash', type:'async', cat:'crypto' },
      { fn:'pipe', type:'sync', cat:'functional' },
    ]);
    await HS.sleep(200);
    HS.html(`<div style="padding:8px 12px;border:1px solid var(--blue);border-radius:3px;font-size:12px;margin:4px 0;display:flex;gap:10px;align-items:center;">
      <span style="color:var(--blue);">⚡</span>
      <span>HTML injection works — </span>
      <span style="color:var(--green);">CSS variables active</span>
    </div>`);
    const p = HS.passgen(20, 'chars');
    const h = await HS.hash(p);
    HS.dim(`Hash of passphrase: ${h.slice(0,32)}…`);
    await HS.sleep(100);
    HS.success('Demo complete.');
  },
};

/* ─── Preprocessor ────────────────────────────────────────── */
function preprocessHackScript(code) {
  // html`...` template literal → HS.html(`...`)
  code = code.replace(/\bhtml\s*(`)/g,  'HS.html(`');
  // css`...` template literal → HS.css(`...`)
  code = code.replace(/\bcss\s*(`)/g,   'HS.css(`');
  // log(...) → HS.print(...)  (when not inside an object)
  code = code.replace(/(?<![.\w])log\s*\(/g, 'HS.print(');
  return code;
}

/* ─── Executor ────────────────────────────────────────────── */
async function executeHackScript(code) {
  ENV.cmdCount++;
  updateStats();

  try {
    const processed = preprocessHackScript(code);

    // Inject persistent user vars into scope
    const varDecls = Object.entries(ENV.vars)
      .map(([k, v]) => `let ${k} = __ENV__.vars[${JSON.stringify(k)}];`)
      .join('\n');

    // Inject user functions
    const fnDecls = Object.entries(ENV.fns)
      .map(([k]) => `const ${k} = __ENV__.fns[${JSON.stringify(k)}];`)
      .join('\n');

    const wrapped = `(async function(__ENV__, HS, VaultCrypto, LinkRegistry) {
      "use strict";

      // Spread entire HS stdlib into scope — all functions available as bare names
      const {
        ${Object.keys(HS).filter(k => !k.startsWith('_')).join(',\n        ')}
      } = HS;

      // Persistent user variables
      ${varDecls}

      // User functions
      ${fnDecls}

      // ── User code ──────────────────────────────────
      ${processed}
      // ───────────────────────────────────────────────
    })(__ENV__, HS, VaultCrypto, LinkRegistry)`;

    const result = await eval(wrapped); // eslint-disable-line no-eval
    if (result !== undefined) {
      Terminal.write(HS._fmt(result), 't-ok');
    }
  } catch (err) {
    Terminal.write(`✖ ${err.name}: ${err.message}`, 't-err');
    if (err.stack) Terminal.write(err.stack.split('\n')[1]?.trim() ?? '', 't-dim');
  }

  ENV.lineCount += code.split('\n').length;
  updateStats();
}

/* ─── Stats refresh ───────────────────────────────────────── */
function updateStats() {
  document.getElementById('stat-cmds').textContent  = ENV.cmdCount;
  document.getElementById('stat-vars').textContent  = Object.keys(ENV.vars).length;
  document.getElementById('stat-fns').textContent   = Object.keys(ENV.fns).length;
  document.getElementById('stat-lines').textContent = ENV.lineCount;
  refreshVarsPanel();
}

function refreshVarsPanel() {
  const panel = document.getElementById('vars-panel');
  if (!panel) return;
  panel.innerHTML = '';
  Object.entries(ENV.vars).slice(0, 50).forEach(([k, v]) => {
    const t = HS.type(v);
    const row = document.createElement('div');
    row.className = 'var-row';
    row.innerHTML = `
      <span class="var-name">${Terminal.esc(k)}</span>
      <span class="var-val">${Terminal.esc(HS._fmt(v).slice(0, 35))}</span>
      <span class="var-type">${t}</span>`;
    panel.appendChild(row);
  });
}

// Expose globally
window.ENV             = ENV;
window.HS              = HS;
window.executeHackScript = executeHackScript;
window.updateStats     = updateStats;
window.HS_HELP         = HS_HELP;
