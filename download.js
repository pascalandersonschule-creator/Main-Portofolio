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

  function render(data) {
    if (data.title) {
      $('portalTitle').textContent = data.title;
      document.title = `${data.title} — Pascal Anderson`;
    }

    if (data.note) {
      $('portalNote').textContent = data.note;
      $('portalNote').hidden = false;
    }

    const files = Array.isArray(data.files) ? data.files : [];
    if (!files.length) { showError('EMPTY'); return; }

    $('portalIntro').textContent = files.length === 1 ? '1 Datei bereit zum Download.' : `${files.length} Dateien bereit zum Download.`;

    const list = $('portalList');
    files.forEach((file, i) => {
      // Only accept https links — never render anything else as href.
      let href;
      try {
        const u = new URL(file.url);
        if (u.protocol !== 'https:') return;
        href = u.href;
      } catch { return; }

      const li = document.createElement('li');
      li.className = 'portal__item';

      const index = document.createElement('span');
      index.className = 'portal__index';
      index.textContent = String(i + 1).padStart(2, '0');

      const name = document.createElement('span');
      name.className = 'portal__name';
      name.textContent = file.name;

      const size = document.createElement('span');
      size.className = 'portal__size';
      size.textContent = formatSize(file.size);

      const a = document.createElement('a');
      a.className = 'portal__link';
      a.href = href;
      a.rel = 'noopener noreferrer';
      a.textContent = 'Download';
      a.setAttribute('aria-label', `${file.name} herunterladen`);

      li.append(index, name, size, a);
      list.appendChild(li);
    });
    list.hidden = false;

    const parts = [];
    if (data.expiryDate) parts.push(`Verfügbar bis ${formatDate(data.expiryDate)}.`);
    parts.push('Die Download-Links gelten aus Sicherheitsgründen 60 Minuten — danach die Seite einfach neu laden.');
    $('portalMeta').textContent = parts.join(' ');
    $('portalMeta').hidden = false;
  }

  const clientId = (new URLSearchParams(window.location.search).get('client') || '').trim().toLowerCase();
  if (!UUID_RE.test(clientId)) { showError('INVALID_CLIENT_ID'); return; }

  fetch('/.netlify/functions/client-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    body: JSON.stringify({ action: 'get-downloads', clientId }),
  })
    .then((res) => res.json().catch(() => ({})).then((data) => ({ res, data })))
    .then(({ res, data }) => {
      if (!res.ok) { showError(data && data.error && data.error.code); return; }
      render(data);
    })
    .catch(() => showError('SERVER_ERROR'));
})();
