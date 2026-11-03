// Admin page for client deliveries. Every request carries the editor's
// Netlify Identity token; the server function checks it. R2 keys never
// reach this page — uploads go straight to R2 via 15-minute signed URLs.
(function () {
  const $ = (id) => document.getElementById(id);
  const API = '/.netlify/functions/client-portal';
  const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,150}\.(jpe?g|png|tiff?|heic|webp|dng|arw|cr3|nef|zip|pdf|mp4|mov)$/i;
  const PARALLEL_UPLOADS = 3;
  let maxDays = 30;

  // ---------- helpers ----------
  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c != null) n.append(c);
    return n;
  }
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const addDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
  const fmtDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('de-DE') : '—');
  function fmtSize(b) {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${b.toLocaleString('de-DE', { maximumFractionDigits: i < 2 ? 0 : 1 })} ${u[i]}`;
  }
  const downloadLink = (id) => `${location.origin}/download.html?client=${id}`;

  // Make a camera/OS file name acceptable to the server: strip accents,
  // replace anything outside the allowed set. "Hochzeit Größe 1.JPG" →
  // "Hochzeit Grosse 1.JPG". Returns null if the type isn't allowed.
  function safeName(name) {
    const clean = name
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9 ._()-]/g, '-')
      .replace(/\.{2,}/g, '.')
      .replace(/^[^A-Za-z0-9]+/, '');
    return FILE_NAME_RE.test(clean) ? clean : null;
  }

  async function api(action, body = {}) {
    const user = window.netlifyIdentity && netlifyIdentity.currentUser();
    if (!user) throw Object.assign(new Error('Nicht angemeldet.'), { code: 'UNAUTHORIZED' });
    const token = await user.jwt(); // refreshes automatically when expired
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      body: JSON.stringify({ action, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error((data.error && data.error.message) || `Fehler ${res.status}`);
      e.code = data.error && data.error.code;
      if (e.code === 'UNAUTHORIZED') showLogin();
      throw e;
    }
    return data;
  }

  function putFile(url, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Netzwerkfehler (CORS-Regel im R2-Bucket gesetzt?)'));
      xhr.send(file);
    });
  }

  // ---------- views ----------
  function showLogin() { $('loginView').hidden = false; $('appView').hidden = true; $('logoutBtn').hidden = true; }
  function showApp() { $('loginView').hidden = true; $('appView').hidden = false; $('logoutBtn').hidden = false; loadClients(); }

  function setExpiryBounds() {
    const input = $('createForm').expiryDate;
    input.min = isoDay(new Date());
    input.max = addDays(maxDays);
    if (!input.value || input.value > input.max) input.value = input.max;
    $('expiryHint').textContent = `Höchstens ${maxDays} Tage. Danach werden Fotos und Name automatisch gelöscht.`;
  }

  async function loadClients(openId) {
    $('listStatus').textContent = 'Lade …';
    try {
      const data = await api('admin-list-clients');
      maxDays = data.maxDays || maxDays;
      setExpiryBounds();
      renderClients(data.clients || [], openId);
      $('listStatus').textContent = data.clients.length ? '' : 'Noch keine Kunden angelegt.';
    } catch (e) {
      $('listStatus').textContent = e.message;
    }
  }

  function renderClients(clients, openId) {
    const list = $('clientList');
    list.replaceChildren();
    for (const c of clients) {
      const details = el('div', { class: 'k-client__details', hidden: true });
      const item = el('li', { class: 'k-client' },
        el('div', { class: 'k-client__row' },
          el('div', { class: 'k-client__info' },
            el('strong', {}, c.title),
            el('span', { class: 'k-muted' }, `bis ${fmtDate(c.expiryDate)} · ${c.files} Datei${c.files === 1 ? '' : 'en'} · ${fmtSize(c.bytes)}`)
          ),
          el('div', { class: 'k-client__actions' },
            el('button', { type: 'button', class: 'k-btn k-btn--ghost', onclick: (e) => copyLink(c.clientId, e.currentTarget) }, 'Link kopieren'),
            el('button', { type: 'button', class: 'k-btn k-btn--ghost', onclick: () => toggle(details, c) }, 'Dateien'),
            el('button', { type: 'button', class: 'k-btn k-btn--danger', onclick: () => removeClient(c) }, 'Löschen')
          )
        ),
        details
      );
      list.append(item);
      if (c.clientId === openId) toggle(details, c);
    }
  }

  async function copyLink(id, btn) {
    try {
      await navigator.clipboard.writeText(downloadLink(id));
      btn.textContent = 'Kopiert ✓';
    } catch {
      window.prompt('Link kopieren:', downloadLink(id));
    }
    setTimeout(() => { btn.textContent = 'Link kopieren'; }, 2000);
  }

  async function removeClient(c) {
    if (!window.confirm(`„${c.title}“ mit allen ${c.files} Dateien endgültig löschen?`)) return;
    try { await api('admin-delete-client', { clientId: c.clientId }); loadClients(); }
    catch (e) { alert(e.message); }
  }

  function toggle(details, c) {
    details.hidden = !details.hidden;
    if (!details.hidden) renderDetails(details, c);
  }

  async function renderDetails(box, c) {
    const fileList = el('ul', { class: 'k-files' });
    const progress = el('ul', { class: 'k-progress' });
    const input = el('input', { type: 'file', multiple: true, class: 'k-file-input' });
    const linkField = el('input', { type: 'text', readonly: true, value: downloadLink(c.clientId), class: 'k-link', onfocus: (e) => e.target.select() });

    box.replaceChildren(
      el('label', { class: 'k-muted' }, 'Kunden-Link', linkField),
      el('div', { class: 'k-drop' }, el('span', {}, 'Fotos hochladen:'), input),
      progress,
      fileList
    );

    async function refreshFiles() {
      fileList.replaceChildren(el('li', { class: 'k-muted' }, 'Lade Dateien …'));
      try {
        const { files } = await api('admin-list-files', { clientId: c.clientId });
        fileList.replaceChildren(...(files.length ? files.map((f) => el('li', {},
          el('span', {}, f.name),
          el('span', { class: 'k-muted' }, fmtSize(f.size)),
          el('button', {
            type: 'button', class: 'k-link-btn',
            onclick: async () => {
              if (!window.confirm(`${f.name} löschen?`)) return;
              try { await api('admin-delete-file', { clientId: c.clientId, fileName: f.name }); refreshFiles(); }
              catch (e) { alert(e.message); }
            },
          }, 'löschen')
        )) : [el('li', { class: 'k-muted' }, 'Noch keine Dateien.')]));
      } catch (e) {
        fileList.replaceChildren(el('li', { class: 'k-error' }, e.message));
      }
    }

    input.addEventListener('change', async () => {
      const queue = [...input.files];
      input.value = '';
      progress.replaceChildren();
      const jobs = queue.map((file) => {
        const name = safeName(file.name);
        const bar = el('progress', { max: 1, value: 0 });
        const label = el('span', { class: 'k-muted' }, name ? '' : 'Dateityp nicht erlaubt');
        progress.append(el('li', {}, el('span', {}, file.name), bar, label));
        return { file, name, bar, label };
      }).filter((j) => j.name);

      let next = 0;
      async function worker() {
        while (next < jobs.length) {
          const j = jobs[next++];
          try {
            const { url } = await api('get-upload-url', { clientId: c.clientId, fileName: j.name });
            await putFile(url, j.file, (p) => { j.bar.value = p; });
            j.bar.value = 1;
            j.label.textContent = j.name === j.file.name ? 'fertig' : `fertig (als ${j.name})`;
          } catch (e) {
            j.label.textContent = e.message;
            j.label.className = 'k-error';
          }
        }
      }
      await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));
      refreshFiles();
    });

    refreshFiles();
  }

  // ---------- create ----------
  $('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const created = await api('admin-create-client', {
        title: f.title.value, note: f.note.value, expiryDate: f.expiryDate.value,
      });
      f.reset();
      setExpiryBounds();
      await loadClients(created.clientId);
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('refreshBtn').addEventListener('click', () => loadClients());
    $('loginBtn').addEventListener('click', () => {
    // A Google/GitHub login returns to "/" — script.js reads this to send
    // you back here instead of to the CMS. Tab-scoped, not tracking.
    try { sessionStorage.setItem('identityReturnTo', '/admin/kunden.html'); } catch (e) { /* ignore */ }
    netlifyIdentity.open('login');
  });
  $('logoutBtn').addEventListener('click', () => netlifyIdentity.logout());

  // ---------- auth ----------
  if (!window.netlifyIdentity) {
    $('loginView').hidden = false;
    $('loginView').firstElementChild.textContent = 'Login-Dienst nicht erreichbar.';
    return;
  }
  netlifyIdentity.on('init', (user) => (user ? showApp() : showLogin()));
  netlifyIdentity.on('login', () => { netlifyIdentity.close(); showApp(); });
  netlifyIdentity.on('logout', showLogin);
  netlifyIdentity.init();
})();
