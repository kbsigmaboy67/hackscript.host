/**
 * terminal.js — HackTerminal v3.0 UI Layer
 *
 * Handles:
 *   - Terminal output API (Terminal.write, writeHtml, etc.)
 *   - CodeMirror editor init + theme
 *   - Tab switching (terminal / editor / vault)
 *   - Sidebar rendering (from LinkRegistry, no raw URLs in DOM)
 *   - Hash routing: #proxy/Name, #game/Name, #url/<b64>
 *   - Autocomplete engine
 *   - Command history
 *   - Matrix rain effect
 *   - Theme switcher
 *   - Vault panel UI wiring
 *   - Startup banner + clock
 */

'use strict';

/* ─── Terminal output API ─────────────────────────────────── */
const Terminal = (() => {

  const $out = () => document.getElementById('terminal');

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function write(text, cls = 't-out') {
    const el = document.createElement('div');
    el.className = 't-line';
    el.innerHTML = `<span class="${cls}">${esc(String(text))}</span>`;
    $out().appendChild(el);
    $out().scrollTop = $out().scrollHeight;
  }

  function writeHtml(html) {
    const el = document.createElement('div');
    el.className = 't-line';
    const inner = document.createElement('span');
    inner.className = 't-html';
    inner.innerHTML = html;
    el.appendChild(inner);
    $out().appendChild(el);
    $out().scrollTop = $out().scrollHeight;
  }

  function writePrompt(text) {
    const el = document.createElement('div');
    el.className = 't-line';
    el.innerHTML = `<span class="t-prompt">hackscript&gt;</span><span class="t-cmd" style="margin-left:8px;">${esc(text)}</span>`;
    $out().appendChild(el);
    $out().scrollTop = $out().scrollHeight;
  }

  function writeBanner(text) {
    writeHtml(`<span class="t-banner" style="display:block;font-family:var(--font-hud);font-size:14px;letter-spacing:6px;text-transform:uppercase;padding:4px 0;">${esc(text)}</span>`);
  }

  function clear() {
    $out().innerHTML = '';
  }

  /* iframe */
  function openLink(url, title = '') {
    const overlay = document.getElementById('iframe-overlay');
    document.getElementById('iframe-title').textContent = title || url;
    document.getElementById('iframe-frame').src = url;
    overlay.removeAttribute('hidden');
  }

  /* Matrix */
  let _matrixRaf = null;
  let _matrixRunning = false;

  function startMatrix() {
    const canvas = document.getElementById('matrix-canvas');
    canvas.style.display = 'block';
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx  = canvas.getContext('2d');
    const cols = Math.floor(canvas.width / 14);
    const drops = new Array(cols).fill(0);
    _matrixRunning = true;

    function frame() {
      if (!_matrixRunning) return;
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = '13px Share Tech Mono';
      drops.forEach((y, i) => {
        const ch = String.fromCharCode(0x30A0 + Math.random() * 96);
        const r  = Math.random();
        ctx.fillStyle = r > 0.97 ? '#ffffff' : r > 0.8 ? '#00aaff' : '#ff2244';
        ctx.fillText(ch, i * 14, y * 14);
        if (y * 14 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        else drops[i]++;
      });
      _matrixRaf = requestAnimationFrame(frame);
    }
    frame();
    write('Matrix started — click canvas or call stopMatrix() to stop.', 't-info');
  }

  function stopMatrix() {
    _matrixRunning = false;
    cancelAnimationFrame(_matrixRaf);
    document.getElementById('matrix-canvas').style.display = 'none';
    write('Matrix stopped.', 't-dim');
  }

  /* Theme */
  const THEMES = {
    cyber:  { '--red':'#ff2244', '--blue':'#00aaff', '--cyan':'#00ffee' },
    red:    { '--red':'#ff2244', '--blue':'#cc1133', '--cyan':'#ff6688' },
    blue:   { '--red':'#0066ff', '--blue':'#00aaff', '--cyan':'#00ddff' },
    green:  { '--red':'#00ff88', '--blue':'#00cc66', '--cyan':'#00ffaa' },
    purple: { '--red':'#cc44ff', '--blue':'#8800ff', '--cyan':'#dd88ff' },
    hacker: { '--red':'#00ff00', '--blue':'#00cc00', '--cyan':'#88ff88' },
    amber:  { '--red':'#ffaa00', '--blue':'#ff8800', '--cyan':'#ffcc44' },
  };

  function applyTheme(name) {
    if (!THEMES[name]) {
      write(`Available themes: ${Object.keys(THEMES).join(', ')}`, 't-info');
      return;
    }
    const root = document.documentElement;
    Object.entries(THEMES[name]).forEach(([k, v]) => root.style.setProperty(k, v));
    write(`✔ Theme "${name}" applied.`, 't-ok');
    notify(`Theme: ${name}`, 'ok');
  }

  /* Notifications */
  function notify(msg, type = '') {
    const el = document.createElement('div');
    el.className = `notif-item${type ? ' ' + type : ''}`;
    el.textContent = msg;
    document.getElementById('notif').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  return { write, writeHtml, writePrompt, writeBanner, clear, esc, openLink, startMatrix, stopMatrix, applyTheme, notify };
})();

window.Terminal = Terminal;

/* ─── DOM ready ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  /* ─── Clock ─────────────────────────────────────────────── */
  const $clock = document.getElementById('clock');
  const tickClock = () => {
    const n = new Date();
    $clock.textContent = [n.getHours(), n.getMinutes(), n.getSeconds()]
      .map(x => String(x).padStart(2,'0')).join(':');
  };
  tickClock();
  setInterval(tickClock, 1000);

  /* ─── CodeMirror init ───────────────────────────────────── */
  const editor = CodeMirror(document.getElementById('editor-wrap'), {
    mode: 'javascript',
    theme: 'default',           // overridden by CSS
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    smartIndent: true,
    lineWrapping: false,
    extraKeys: {
      'Ctrl-Space': 'autocomplete',
      'Ctrl-Enter': () => runEditor(),
      'Cmd-Enter':  () => runEditor(),
    },
    value: `// HackScript v3.0 — real JavaScript + curated stdlib
// Ctrl+Enter or ▶ RUN to execute

// All HS functions available as bare names:
print("Hello from HackScript!");

// Crypto
const pass = passgen(20, 'chars');        // generate passphrase
const cipher = await encrypt("secret", pass); // AES-256-GCM
print("Encrypted:", cipher.slice(0,40) + "...");

const plain = await decrypt(cipher, pass);
success("Decrypted: " + plain);

// Stego example
const hidden = stegoHide("invisible payload", "normal looking text");
const revealed = stegoReveal(hidden);

// Math & arrays
const data = range(0, 8).map(i => randInt(10, 100));
chart(data, "Random chart");

// HTML injection
html\`<div style="color:var(--blue);padding:8px;border:1px solid var(--blue);border-radius:3px;margin:4px 0;font-size:12px;">
  ⚡ Injected HTML — CSS variables work!
</div>\`;

// Open a proxy by name (tab opens in overlay)
// open("Ultraviolet");

print("Done. Type help() in terminal for all commands.");
`,
  });
  window.hackEditor = editor;

  /* ─── Editor buttons ────────────────────────────────────── */
  function runEditor() {
    const code = editor.getValue().trim();
    if (!code) return;
    Terminal.write('▶ Running editor script…', 't-sys');
    executeHackScript(code);
  }
  document.getElementById('btn-run').addEventListener('click', runEditor);
  document.getElementById('btn-save').addEventListener('click', () => {
    const code = editor.getValue();
    const fn   = document.getElementById('editor-filename').textContent.trim() || 'script.hs';
    VaultCrypto.downloadText(code, fn);
    Terminal.notify('Saved: ' + fn, 'ok');
  });
  document.getElementById('btn-clear').addEventListener('click', () => editor.setValue(''));

  /* ─── Tabs ──────────────────────────────────────────────── */
  let activeTab = 'terminal';

  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    const vault = document.getElementById('vault-panel');
    if (name === 'vault') vault.removeAttribute('hidden');
    else vault.setAttribute('hidden', '');
    // editor is always visible in the bottom panel — just focus it
    if (name === 'editor') editor.focus();
    if (name === 'terminal') document.getElementById('cmd-input').focus();
  }

  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => switchTab(tab.dataset.tab))
  );

  /* ─── Sidebar ───────────────────────────────────────────── */
  function buildSidebar(cat = 'all') {
    const list  = document.getElementById('sidebar-list');
    list.innerHTML = '';
    const items = cat === 'all' ? LinkRegistry.getAll() : LinkRegistry.getByCategory(cat);
    items.forEach(link => {
      const el = document.createElement('div');
      el.className = `sidebar-item si-${link.cat}`;
      el.title = link.d;
      el.innerHTML = `
        <span style="color:${link.cat==='proxy'?'var(--red)':'var(--blue)'};">${link.cat==='proxy'?'🔒':'🎮'}</span>
        <span class="si-name">${Terminal.esc(link.n)}</span>
        <span class="si-tag">${link.cat.toUpperCase()}</span>`;
      el.addEventListener('click', () => {
        const resolved = LinkRegistry.resolve(link.n);
        if (resolved) Terminal.openLink(resolved.url, resolved.name);
      });
      list.appendChild(el);
    });
  }
  buildSidebar();

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildSidebar(btn.dataset.cat);
    });
  });

  /* ─── iframe overlay ────────────────────────────────────── */
  document.getElementById('iframe-close').addEventListener('click', () => {
    document.getElementById('iframe-overlay').setAttribute('hidden', '');
    document.getElementById('iframe-frame').src = 'about:blank';
  });

  /* ─── Matrix canvas click ───────────────────────────────── */
  document.getElementById('matrix-canvas').addEventListener('click', Terminal.stopMatrix);

  /* ─── Hash routing ──────────────────────────────────────── */
  function handleHash() {
    const hash = window.location.hash;
    if (!hash || hash === '#') return;
    const result = LinkRegistry.handleHash(hash);
    if (result) {
      Terminal.write(`Hash route → ${result.name}`, 't-info');
      Terminal.openLink(result.url, result.name);
    }
  }
  handleHash();
  window.addEventListener('hashchange', handleHash);

  /* ─── Autocomplete ──────────────────────────────────────── */
  const $ac    = document.getElementById('autocomplete');
  const $input = document.getElementById('cmd-input');

  const AC_ITEMS = [
    ...Object.keys(HS).filter(k => !k.startsWith('_')).map(k => ({
      label: k,
      type: typeof HS[k] === 'function' ? 'fn' : 'kw',
    })),
    ...['let','const','var','async','await','for','while','if','else','return',
        'function','class','try','catch','throw','new','typeof','instanceof','in','of',
        'switch','case','break','continue','do','import','export','default'].map(k => ({ label: k, type: 'kw' })),
    ...LinkRegistry.getAll().map(l => ({ label: `open("${l.n}")`, type: 'cmd' })),
    ...['encrypt','decrypt','hash','passgen','stegoHide','stegoReveal','stegoEncrypt','stegoDecrypt','hmac','uuid'].map(k => ({ label: k, type: 'enc' })),
  ];

  let acIndex = 0;

  function showAC(val) {
    const word = val.split(/[\s(,;]+/).pop().replace(/[^a-zA-Z0-9_"]/g, '');
    if (!word || word.length < 2) { hideAC(); return; }
    const matches = AC_ITEMS.filter(c => c.label.startsWith(word)).slice(0, 14);
    if (!matches.length) { hideAC(); return; }
    acIndex = 0;
    $ac.innerHTML = '';
    matches.forEach((m, i) => {
      const el = document.createElement('div');
      el.className = `ac-item${i === 0 ? ' ac-selected' : ''}`;
      el.dataset.label = m.label;
      el.innerHTML = `<span>${Terminal.esc(m.label)}</span><span class="ac-type ${m.type}">${m.type}</span>`;
      el.addEventListener('mousedown', e => { e.preventDefault(); applyAC(m.label, word); });
      $ac.appendChild(el);
    });
    const rect = $input.getBoundingClientRect();
    $ac.style.left   = rect.left + 'px';
    $ac.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
    $ac.style.display = 'block';
  }

  function hideAC() { $ac.style.display = 'none'; }

  function applyAC(label, word) {
    const cur = $input.value;
    const idx = cur.lastIndexOf(word);
    $input.value = cur.slice(0, idx) + label;
    hideAC();
    $input.focus();
  }

  function moveAC(dir) {
    const items = $ac.querySelectorAll('.ac-item');
    if (!items.length) return;
    items[acIndex]?.classList.remove('ac-selected');
    acIndex = (acIndex + dir + items.length) % items.length;
    items[acIndex]?.classList.add('ac-selected');
    items[acIndex]?.scrollIntoView({ block: 'nearest' });
  }

  $input.addEventListener('input', () => showAC($input.value));
  document.addEventListener('click', e => { if (!$ac.contains(e.target)) hideAC(); });

  /* ─── Command input ─────────────────────────────────────── */
  $input.addEventListener('keydown', e => {
    if ($ac.style.display !== 'none') {
      if (e.key === 'ArrowDown')  { e.preventDefault(); moveAC(1); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); moveAC(-1); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const sel = $ac.querySelector('.ac-selected');
        if (sel) {
          e.preventDefault();
          const word = $input.value.split(/[\s(,;]+/).pop().replace(/[^a-zA-Z0-9_"]/g,'');
          applyAC(sel.dataset.label, word);
          return;
        }
      }
      if (e.key === 'Escape') { hideAC(); return; }
    }

    if (e.key === 'Enter') {
      const val = $input.value.trim();
      if (!val) return;
      hideAC();
      Terminal.writePrompt(val);
      addHistory(val);
      $input.value = '';
      executeHackScript(val);

    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (ENV.histIdx < ENV.history.length - 1) {
        ENV.histIdx++;
        $input.value = ENV.history[ENV.histIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (ENV.histIdx > 0) { ENV.histIdx--; $input.value = ENV.history[ENV.histIdx]; }
      else { ENV.histIdx = -1; $input.value = ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  });

  /* ─── History ───────────────────────────────────────────── */
  function addHistory(cmd) {
    ENV.history.unshift(cmd);
    if (ENV.history.length > 100) ENV.history.pop();
    ENV.histIdx = -1;
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    ENV.history.slice(0, 25).forEach(h => {
      const el = document.createElement('div');
      el.className = 'hist-item';
      el.textContent = h;
      el.addEventListener('click', () => { $input.value = h; $input.focus(); });
      list.appendChild(el);
    });
  }

  /* ─── Auto-focus on keypress ────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.target === $input) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && activeTab === 'terminal') {
      $input.focus();
    }
  });

  /* ─── Vault panel UI ────────────────────────────────────── */
  initVaultUI();

  /* ─── Startup banner ────────────────────────────────────── */
  printStartupBanner();

  $input.focus();
});

/* ─── Startup banner ──────────────────────────────────────── */
function printStartupBanner() {
  Terminal.writeHtml(`<pre class="t-banner">
 ██╗  ██╗ █████╗  ██████╗██╗  ██╗
 ██║  ██║██╔══██╗██╔════╝██║ ██╔╝
 ███████║███████║██║     █████╔╝ 
 ██╔══██║██╔══██║██║     ██╔═██╗ 
 ██║  ██║██║  ██║╚██████╗██║  ██╗
 <span class="blue">╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝</span>
 <span class="blue">TERMINAL v3.0  ·  HACKSCRIPT ENGINE  ·  AES-256-GCM</span></pre>`);
  Terminal.write(`System ready. ${LinkRegistry.proxyCount()} proxies · ${LinkRegistry.gameCount()} game sites · 90+ stdlib functions.`, 't-dim');
  Terminal.write('Type help() for all commands. Open links via sidebar or open("name"). Hash routing active.', 't-dim');
  Terminal.write('─────────────────────────────────────────────────────────────────────', 't-dim');
}

/* ─── Vault UI wiring ─────────────────────────────────────── */
function initVaultUI() {

  /* Tab switching */
  document.querySelectorAll('.vtab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.vtab-body').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.vtab-body[data-vtab="${btn.dataset.vtab}"]`)?.classList.add('active');
    });
  });

  /* Password visibility toggles */
  document.querySelectorAll('.v-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target);
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });

  /* Strength meter */
  const strengthTargets = [
    ['v-pass-text', 'vstr-text'],
    ['v-pass-file', 'vstr-file'],
  ];
  strengthTargets.forEach(([inp, str]) => {
    const el = document.getElementById(inp);
    const st = document.getElementById(str);
    if (!el || !st) return;
    el.addEventListener('input', () => {
      const s = VaultCrypto.scorePassphrase(el.value);
      st.textContent = `strength: ${s.label} (${s.score}/100)`;
      st.style.color = s.color;
    });
  });

  /* ── TEXT TAB ── */
  document.getElementById('v-text-enc')?.addEventListener('click', async () => {
    const pass  = document.getElementById('v-pass-text').value;
    const plain = document.getElementById('v-plain').value;
    const cover = document.getElementById('v-cover').value;
    if (!pass || !plain) { Terminal.notify('Passphrase and plaintext required', 'err'); return; }
    try {
      const out = cover ? await VaultCrypto.stegoEncrypt(plain, pass, cover) : await VaultCrypto.encryptText(plain, pass);
      document.getElementById('v-out-text').value = out;
      Terminal.notify('Text encrypted', 'ok');
    } catch (e) { Terminal.notify('Encrypt failed: ' + e.message, 'err'); }
  });

  document.getElementById('v-text-dec')?.addEventListener('click', async () => {
    const pass  = document.getElementById('v-pass-text').value;
    const cipher = document.getElementById('v-out-text').value || document.getElementById('v-plain').value;
    if (!pass || !cipher) { Terminal.notify('Passphrase and ciphertext required', 'err'); return; }
    try {
      // Try stego decode first
      const hidden = VaultCrypto.stegoDecode(cipher);
      const plain  = hidden
        ? await VaultCrypto.decryptText(hidden, pass)
        : await VaultCrypto.decryptText(cipher, pass);
      document.getElementById('v-plain').value = plain;
      Terminal.notify('Text decrypted', 'ok');
    } catch (e) { Terminal.notify('Decrypt failed — wrong passphrase?', 'err'); }
  });

  document.getElementById('v-text-clr')?.addEventListener('click', () => {
    ['v-plain','v-cover','v-out-text'].forEach(id => { document.getElementById(id).value = ''; });
  });

  document.getElementById('v-text-copy')?.addEventListener('click', () => {
    const val = document.getElementById('v-out-text').value;
    if (val) navigator.clipboard.writeText(val).then(() => Terminal.notify('Copied', 'ok'));
  });

  document.getElementById('v-text-export')?.addEventListener('click', () => {
    const val = document.getElementById('v-out-text').value;
    if (val) VaultCrypto.downloadText(val, 'encrypted.txt');
  });

  /* ── FILE TAB ── */
  let selectedFile = null;

  const dropZone = document.getElementById('v-file-drop');
  dropZone?.addEventListener('click', () => document.getElementById('v-file-input').click());
  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    selectedFile = e.dataTransfer.files[0];
    dropZone.querySelector('span').textContent = `📄 ${selectedFile.name}`;
  });
  document.getElementById('v-file-input')?.addEventListener('change', e => {
    selectedFile = e.target.files[0];
    if (selectedFile) dropZone.querySelector('span').textContent = `📄 ${selectedFile.name}`;
  });

  document.getElementById('v-file-enc')?.addEventListener('click', async () => {
    const pass = document.getElementById('v-pass-file').value;
    if (!pass || !selectedFile) { Terminal.notify('Passphrase + file required', 'err'); return; }
    try {
      const buf = await selectedFile.arrayBuffer();
      const vlt = await VaultCrypto.encryptFile(buf, pass);
      VaultCrypto.downloadBuffer(vlt, selectedFile.name + '.vlt');
      document.getElementById('v-file-status').textContent = `✔ Encrypted: ${selectedFile.name}.vlt`;
      Terminal.notify('File encrypted → .vlt', 'ok');
    } catch (e) { Terminal.notify('Encrypt failed: ' + e.message, 'err'); }
  });

  document.getElementById('v-file-dec')?.addEventListener('click', async () => {
    const pass = document.getElementById('v-pass-file').value;
    if (!pass || !selectedFile) { Terminal.notify('Passphrase + .vlt file required', 'err'); return; }
    try {
      const buf  = await selectedFile.arrayBuffer();
      const raw  = await VaultCrypto.decryptFile(buf, pass);
      const name = selectedFile.name.replace(/\.vlt$/i, '') || 'decrypted';
      VaultCrypto.downloadBuffer(raw, name);
      document.getElementById('v-file-status').textContent = `✔ Decrypted: ${name}`;
      Terminal.notify('File decrypted', 'ok');
    } catch (e) { Terminal.notify('Decrypt failed — wrong passphrase?', 'err'); }
  });

  /* ── HASH TAB ── */
  document.getElementById('v-hash-run')?.addEventListener('click', async () => {
    const text = document.getElementById('v-hash-in').value;
    const algo = document.getElementById('v-hash-algo').value;
    if (!text) return;
    const out = await VaultCrypto.hash(text, algo);
    document.getElementById('v-hash-out').value = out;
  });
  document.getElementById('v-hash-copy')?.addEventListener('click', () => {
    const val = document.getElementById('v-hash-out').value;
    if (val) navigator.clipboard.writeText(val).then(() => Terminal.notify('Copied', 'ok'));
  });

  /* ── PASSGEN TAB ── */
  const pgLen  = document.getElementById('v-pg-len');
  const pgLbl  = document.getElementById('v-pg-len-lbl');
  pgLen?.addEventListener('input', () => { pgLbl.textContent = pgLen.value; });

  document.getElementById('v-pg-gen')?.addEventListener('click', () => {
    const len  = parseInt(pgLen.value);
    const mode = document.getElementById('v-pg-mode').value;
    const pass = VaultCrypto.generatePassphrase(len, mode);
    document.getElementById('v-pg-out').value = pass;
    const s = VaultCrypto.scorePassphrase(pass);
    const str = document.getElementById('vstr-pg');
    str.textContent = `strength: ${s.label} (${s.score}/100)`;
    str.style.color = s.color;
  });
  document.getElementById('v-pg-copy')?.addEventListener('click', () => {
    const val = document.getElementById('v-pg-out').value;
    if (val) navigator.clipboard.writeText(val).then(() => Terminal.notify('Copied', 'ok'));
  });

  /* ── STEGO TAB ── */
  document.getElementById('v-stego-enc')?.addEventListener('click', () => {
    const secret = document.getElementById('v-stego-secret').value;
    const cover  = document.getElementById('v-stego-cover').value;
    if (!secret) return;
    document.getElementById('v-stego-out').value = VaultCrypto.stegoEncode(secret, cover);
    Terminal.notify('Stego encoded', 'ok');
  });
  document.getElementById('v-stego-dec')?.addEventListener('click', () => {
    const text = document.getElementById('v-stego-out').value || document.getElementById('v-stego-cover').value;
    const result = VaultCrypto.stegoDecode(text);
    if (result) {
      document.getElementById('v-stego-secret').value = result;
      Terminal.notify('Payload extracted', 'ok');
    } else {
      Terminal.notify('No payload found', 'warn');
    }
  });
}
