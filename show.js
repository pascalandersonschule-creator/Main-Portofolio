// Clean address bar: /show instead of /show.html. Netlify serves
// both, so this only changes what's displayed — no reload, no redirect.
if (/\.html$/.test(location.pathname)) {
  const clean = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  history.replaceState(null, '', clean + location.search + location.hash);
}

// One show (concert) page: /show?s=<slug>. Reads content.json, finds
// the show whose slug matches, renders its photos as the same masonry
// gallery as the main site. Lightbox arrows step through THIS show's
// photos only. Same self-contained approach as personal.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const yearEl = $('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const gallery = $('showGallery');

  function netlifyImageUrl(path, width) {
    return `/.netlify/images?url=${encodeURIComponent(path)}&w=${width}`;
  }

  // Must match showSlug() in script.js.
  function showSlug(show) {
    const base = `${show.artist || ''} ${show.date || ''}`
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'show';
  }

  function formatShowDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function notFound() {
    $('showTitle').textContent = 'Show not found';
    $('showMeta').textContent = 'This show may have been removed or renamed.';
    document.title = 'Show not found — Pascal Anderson';
  }

  const slug = (new URLSearchParams(location.search).get('s') || '').toLowerCase();

  fetch('/content.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const shows = (data && Array.isArray(data.shows) ? data.shows : [])
        .filter((sh) => sh && sh.artist && Array.isArray(sh.photos) && sh.photos.some(Boolean))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const index = shows.findIndex((sh) => showSlug(sh) === slug);
      if (index === -1) { notFound(); return; }
      render(shows[index]);
      renderNext(shows, index);
    })
    .catch(notFound);

  function render(sh) {
    const where = [sh.venue, sh.city].filter(Boolean).join(', ');
    const when = formatShowDate(sh.date);
    const photos = sh.photos.filter(Boolean);

    $('showTitle').textContent = sh.artist;
    $('showMeta').textContent = [where, when, `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`].filter(Boolean).join(' — ');
    if (sh.text) { $('showText').textContent = sh.text; $('showText').hidden = false; }

    document.title = `${sh.artist}${where ? ` at ${where}` : ''} — Pascal Anderson`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', `Concert photos of ${sh.artist}${where ? ` at ${where}` : ''}${when ? `, ${when}` : ''} — by Pascal Anderson.`);

    const caption = [sh.artist, where].filter(Boolean).join(' — ');
    gallery.innerHTML = '';
    photos.forEach((path, i) => {
      const tile = document.createElement('figure');
      tile.className = 'tile';
      tile.dataset.hasMedia = 'true';
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', `View photo ${i + 1} of ${photos.length} larger`);

      const ph = document.createElement('div');
      ph.className = `tile__ph tile__ph--${(i % 9) + 1}`;

      const img = document.createElement('img');
      img.className = 'tile__img';
      img.loading = i < 6 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.alt = `${caption}, photo ${i + 1}`;
      const widths = [500, 900, 1300];
      img.sizes = '(max-width: 860px) 50vw, 33vw';
      img.srcset = widths.map((w) => `${netlifyImageUrl(path, w)} ${w}w`).join(', ');
      img.src = netlifyImageUrl(path, widths[1]);
      img.addEventListener('error', () => {
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = path;
      }, { once: true });
      img.addEventListener('load', () => {
        img.classList.add('is-loaded');
        if (img.naturalWidth && img.naturalHeight) tile.dataset.ratio = img.naturalWidth / img.naturalHeight;
        schedule();
      }, { once: true });
      ph.appendChild(img);
      tile.appendChild(ph);

      tile.addEventListener('click', () => openLightbox(i));
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(i); }
      });
      gallery.appendChild(tile);
    });

    // Scroll-reveal, same feel as the main gallery.
    const tiles = gallery.querySelectorAll('.tile');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      tiles.forEach((t) => t.classList.add('is-revealed'));
    } else {
      const obs = new IntersectionObserver((entries, o) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          o.unobserve(entry.target);
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
      tiles.forEach((t) => obs.observe(t));
    }
    layout();
  }

  function renderNext(shows, index) {
    if (shows.length < 2) return;
    const next = shows[(index + 1) % shows.length];
    $('showNextLink').href = `/show?s=${encodeURIComponent(showSlug(next))}`;
    $('showNextTitle').textContent = next.artist;
    $('showNext').hidden = false;
  }

  // ---------- masonry (same math as script.js / personal.js) ----------
  const ROW = 8;
  const GAP = 4;
  const MOBILE_BREAKPOINT = 860;
  const MIN_RATIO = 0.5;
  const MAX_RATIO = 2.4;

  function colSpanFor(ratio, index) {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    // Mobile rhythm: every 5th photo runs full width, so the two-column
    // grid doesn't read as a uniform wall on a phone.
    if (isMobile) return ratio > 1.2 || index % 5 === 0 ? 2 : 1;
    if (ratio > 2.0) return 6;
    if (ratio > 1.6) return 4;
    if (ratio > 1.2) return 3;
    return 2;
  }

  function layout() {
    const tiles = Array.from(gallery.querySelectorAll('.tile[data-has-media="true"]'));
    const ratios = tiles.map((tile, index) => {
      const measured = parseFloat(tile.dataset.ratio);
      const ratio = Math.min(Math.max(measured || 4 / 5, MIN_RATIO), MAX_RATIO);
      tile.style.gridColumn = `span ${colSpanFor(ratio, index)}`;
      tile.style.aspectRatio = 'auto';
      return ratio;
    });
    const widths = tiles.map((tile) => tile.getBoundingClientRect().width);
    tiles.forEach((tile, i) => {
      if (!widths[i]) return;
      tile.style.gridRowEnd = `span ${Math.ceil((widths[i] / ratios[i] + GAP) / (ROW + GAP))}`;
    });
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; layout(); });
  }
  window.addEventListener('resize', schedule);

  // ---------- lightbox ----------
  const box = $('lightbox');
  const closeBtn = $('lightboxClose');
  const stage = $('lightboxStage');
  const stageImg = $('lightboxImg');
  const captionEl = $('lightboxCaption');
  let current = 0;
  let lastFocused = null;

  function show(i) {
    const tiles = gallery.querySelectorAll('.tile');
    if (!tiles.length) return;
    current = (i + tiles.length) % tiles.length;
    const src = tiles[current].querySelector('.tile__img');
    stageImg.classList.remove('is-loaded');
    stageImg.src = src.currentSrc || src.src;
    stageImg.srcset = src.srcset;
    stageImg.sizes = '(max-width: 700px) 85vw, 640px';
    stageImg.alt = src.alt;
    stageImg.onload = () => stageImg.classList.add('is-loaded');
    if (stageImg.complete) stageImg.classList.add('is-loaded');
    stage.classList.add('has-photo');
    captionEl.textContent = `${current + 1} / ${tiles.length}`;
  }

  function openLightbox(i) {
    lastFocused = document.activeElement;
    show(i);
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  closeBtn.addEventListener('click', closeLightbox);
  $('lightboxPrev').addEventListener('click', () => show(current - 1));
  $('lightboxNext').addEventListener('click', () => show(current + 1));
  box.addEventListener('click', (e) => { if (e.target === box) closeLightbox(); });
  window.addEventListener('keydown', (e) => {
    if (!box.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });

  // Touch: swipe left/right in the lightbox.
  let touchX = null;
  box.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  });
})();
