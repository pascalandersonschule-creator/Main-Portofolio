// Clean address bar: /impressum instead of /impressum.html. Netlify serves
// both, so this only changes what's displayed — no reload, no redirect.
if (/\.html$/.test(location.pathname)) {
  const clean = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  history.replaceState(null, '', clean + location.search + location.hash);
}

// Client download page. Reads ?client=<uuid>, asks the server-side
// function for short-lived signed links, renders them. No cookies, no
// storage, no third-party requests: the only outside connection is the
// actual file download, which the visitor starts by clicking.
(function () {
  const $ = (id) => document.getElementById(id);
  const yearEl = $('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  const MESSAGES = {
    EXPIRED: ['Link abgelaufen', 'Dieser Download-Link ist nicht mehr gültig. Schreib mir kurz, dann schicke ich dir einen neuen.'],
    NOT_FOUND: ['Link ungültig', 'Zu diesem Link gibt es keine Dateien. Bitte prüfe, ob du ihn vollständig kopiert hast.'],
    INVALID_CLIENT_ID: ['Link ungültig', 'Dieser Link ist unvollständig oder fehlerhaft. Bitte prüfe, ob du ihn vollständig kopiert hast.'],
    EMPTY: ['Noch keine Dateien', 'Hier liegen gerade noch keine Dateien. Schau später noch einmal vorbei.'],
    SERVER_ERROR: ['Gerade nicht erreichbar', 'Die Dateien konnten nicht geladen werden. Bitte versuch es in ein paar Minuten erneut.'],
  };

  function showError(code) {
    const [title, text] = MESSAGES[code] || MESSAGES.SERVER_ERROR;
    $('portalIntro').hidden = true;
    $('portalErrorTitle').textContent = title;
    $('portalErrorText').textContent = text;
    $('portalError').hidden = false;
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toLocaleString('de-DE', { maximumFractionDigits: i < 2 ? 0 : 1 })} ${units[i]}`;
  }

  function formatDate(iso) {
    const d = new Date(`${iso}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Only https links from R2 are ever used as src/href.
  function safeUrl(raw) {
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' ? u.href : null;
    } catch { return null; }
  }
  const ext = (name) => (name.match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toUpperCase();
  // Browsers can show these directly — used when no small preview exists.
  const WEB_IMAGE = /\.(jpe?g|png|webp)$/i;
  const LINK_MAX_AGE = 55 * 60 * 1000; // signed links live 60 min
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const state = { files: [], selected: new Set(), selectMode: false, loadedAt: 0, busy: false };

  function fetchDownloads() {
    return fetch('/.netlify/functions/client-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify({ action: 'get-downloads', clientId }),
    })
      .then((res) => res.json().catch(() => ({})).then((data) => ({ res, data })));
  }

  function normalise(files) {
    return (Array.isArray(files) ? files : [])
      .map((f) => ({ name: String(f.name || ''), size: f.size, url: safeUrl(f.url), thumb: f.thumb ? safeUrl(f.thumb) : null }))
      .filter((f) => f.name && f.url);
  }

  // ---------- selection ----------
  function updateBar() {
    const n = state.selected.size;
    const total = state.files.length;
    const modeBtn = $('selectModeBtn');
    modeBtn.textContent = state.selectMode ? 'Fertig' : 'Auswählen';
    modeBtn.setAttribute('aria-pressed', String(state.selectMode));
    $('selectAllBtn').textContent = state.selectMode && n === total ? 'Auswahl aufheben' : 'Alle auswählen';
    $('selectCount').textContent = state.selectMode ? `${n} von ${total} ausgewählt` : '';
    const dl = $('downloadBtn');
    dl.textContent = state.selectMode
      ? (n === 1 ? '1 Datei herunterladen' : `${n} Dateien herunterladen`)
      : (total === 1 ? 'Herunterladen' : `Alle ${total} herunterladen`);
    dl.disabled = state.busy || (state.selectMode && n === 0);
    $('portalGrid').classList.toggle('is-selecting', state.selectMode);
    document.querySelectorAll('.portal__media').forEach((btn) => {
      const on = state.selected.has(Number(btn.dataset.i));
      btn.setAttribute('aria-pressed', String(on));
      btn.closest('.portal__tile').classList.toggle('is-selected', on);
    });
  }

  function setSelectMode(on) {
    state.selectMode = on;
    if (!on) state.selected.clear();
    updateBar();
  }

  function toggleFile(i) {
    if (!state.selectMode) state.selectMode = true;
    if (state.selected.has(i)) state.selected.delete(i); else state.selected.add(i);
    updateBar();
  }

  // ---------- download ----------
  // One file after another via the signed link (R2 answers with
  // "attachment", so the page stays open). Browsers ask once whether
  // this site may download several files — that's expected.
  async function downloadFiles() {
    if (state.busy) return;
    const indices = state.selectMode ? [...state.selected].sort((a, b) => a - b) : state.files.map((_, i) => i);
    if (!indices.length) return;
    state.busy = true;
    updateBar();
    const status = $('downloadStatus');
    status.hidden = false;

    try {
      // Links older than ~55 min would fail — fetch fresh ones first.
      if (Date.now() - state.loadedAt > LINK_MAX_AGE) {
        status.textContent = 'Links werden erneuert …';
        const { res, data } = await fetchDownloads();
        if (!res.ok) throw new Error();
        const fresh = new Map(normalise(data.files).map((f) => [f.name, f]));
        state.files.forEach((f) => { const n = fresh.get(f.name); if (n) { f.url = n.url; f.thumb = n.thumb; } });
        state.loadedAt = Date.now();
      }

      for (let k = 0; k < indices.length; k++) {
        const f = state.files[indices[k]];
        status.textContent = indices.length === 1
          ? `${f.name} wird heruntergeladen …`
          : `Datei ${k + 1} von ${indices.length} wird heruntergeladen …`;
        const a = document.createElement('a');
        a.href = f.url;
        a.rel = 'noopener noreferrer';
        a.hidden = true;
        document.body.appendChild(a);
        a.click();
        a.remove();
        await sleep(900);
      }
      status.textContent = indices.length === 1
        ? 'Download gestartet.'
        : `${indices.length} Downloads gestartet. Falls nur eine Datei ankommt: Erlaube deinem Browser, von dieser Seite mehrere Dateien herunterzuladen, und versuch es noch einmal.`;
    } catch {
      status.textContent = 'Die Downloads konnten nicht gestartet werden. Bitte lade die Seite neu und versuch es noch einmal.';
    } finally {
      state.busy = false;
      updateBar();
    }
  }

  // ---------- rendering ----------
  function placeholder(name) {
    const span = document.createElement('span');
    span.className = 'portal__ext';
    span.textContent = ext(name) || 'DATEI';
    return span;
  }

  function tile(f, i) {
    const li = document.createElement('li');
    li.className = 'portal__tile';

    const media = document.createElement('button');
    media.type = 'button';
    media.className = 'portal__media';
    media.dataset.i = String(i);
    media.setAttribute('aria-pressed', 'false');
    media.setAttribute('aria-label', `${f.name} auswählen`);
    media.addEventListener('click', () => toggleFile(i));

    const src = f.thumb || (WEB_IMAGE.test(f.name) ? f.url : null);
    if (src) {
      const img = document.createElement('img');
      img.className = 'portal__img';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => img.classList.add('is-loaded'));
      img.addEventListener('error', () => img.replaceWith(placeholder(f.name)));
      img.src = src;
      media.appendChild(img);
    } else {
      media.appendChild(placeholder(f.name));
    }

    const check = document.createElement('span');
    check.className = 'portal__check';
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    media.appendChild(check);

    const caption = document.createElement('div');
    caption.className = 'portal__caption';

    const name = document.createElement('span');
    name.className = 'portal__name';
    name.textContent = f.name;

    const size = document.createElement('span');
    size.className = 'portal__size';
    size.textContent = formatSize(f.size);

    const a = document.createElement('a');
    a.className = 'portal__link';
    a.href = f.url;
    a.rel = 'noopener noreferrer';
    a.textContent = 'Download';
    a.setAttribute('aria-label', `${f.name} herunterladen`);
    // Always use the current (possibly refreshed) link.
    a.addEventListener('click', () => { a.href = state.files[i].url; });

    caption.append(name, size, a);
    li.append(media, caption);
    return li;
  }

  function render(data) {
    if (data.title) {
      $('portalTitle').textContent = data.title;
      document.title = `${data.title} — Pascal Anderson`;
    }

    if (data.note) {
      $('portalNote').textContent = data.note;
      $('portalNote').hidden = false;
    }

    state.files = normalise(data.files);
    state.loadedAt = Date.now();
    if (!state.files.length) { showError('EMPTY'); return; }

    $('portalIntro').textContent = state.files.length === 1
      ? '1 Datei bereit zum Download.'
      : `${state.files.length} Dateien bereit zum Download. Tippe auf Bilder, um sie auszuwählen.`;

    const grid = $('portalGrid');
    grid.replaceChildren(...state.files.map(tile));
    grid.hidden = false;
    $('portalBar').hidden = false;

    $('selectModeBtn').addEventListener('click', () => setSelectMode(!state.selectMode));
    $('selectAllBtn').addEventListener('click', () => {
      const all = state.selectMode && state.selected.size === state.files.length;
      state.selectMode = true;
      state.selected = all ? new Set() : new Set(state.files.map((_, i) => i));
      updateBar();
    });
    $('downloadBtn').addEventListener('click', downloadFiles);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.selectMode) setSelectMode(false);
    });
    updateBar();

    const parts = [];
    if (data.expiryDate) parts.push(`Verfügbar bis ${formatDate(data.expiryDate)}.`);
    parts.push('Die Download-Links gelten aus Sicherheitsgründen 60 Minuten und werden beim Herunterladen automatisch erneuert.');
    $('portalMeta').textContent = parts.join(' ');
    $('portalMeta').hidden = false;
  }

  const clientId = (new URLSearchParams(window.location.search).get('client') || '').trim().toLowerCase();
  if (!UUID_RE.test(clientId)) { showError('INVALID_CLIENT_ID'); return; }

  fetchDownloads()
    .then(({ res, data }) => {
      if (!res.ok) { showError(data && data.error && data.error.code); return; }
      render(data);
    })
    .catch(() => showError('SERVER_ERROR'));
})();
