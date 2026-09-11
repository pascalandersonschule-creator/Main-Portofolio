// Personal Work — a small, separate gallery outside the main portfolio.
// Deliberately independent from script.js: no category filters, no
// video tiles, no hero/contact-form logic. Just fetch, render, masonry,
// lightbox — the same masonry approach as the main gallery, scaled down.
(function () {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  function netlifyImageUrl(path, width) {
    return `/.netlify/images?url=${encodeURIComponent(path)}&w=${width}`;
  }

  const gallery = document.getElementById('personalGallery');
  const introEl = document.getElementById('personalIntro');

  fetch('content.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      const pw = data.personalWork || {};
      if (introEl && pw.intro) introEl.textContent = pw.intro;
      renderGallery(Array.isArray(pw.gallery) ? pw.gallery : []);
    })
    .catch(() => {});

  function renderGallery(items) {
    if (!gallery) return;
    gallery.innerHTML = '';
    items.forEach((item) => {
      if (!item.image) return;

      const tile = document.createElement('figure');
      tile.className = 'tile';
      tile.dataset.hasMedia = 'true';
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', item.caption ? `View larger: ${item.caption}` : 'View larger');

      const ph = document.createElement('div');
      ph.className = 'tile__ph';

      const img = document.createElement('img');
      img.className = 'tile__img';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = item.caption || '';
      const widths = [500, 900, 1300];
      img.sizes = '(max-width: 860px) 50vw, 33vw';
      img.srcset = widths.map((w) => `${netlifyImageUrl(item.image, w)} ${w}w`).join(', ');
      img.src = netlifyImageUrl(item.image, widths[1]);
      img.addEventListener('error', () => {
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = item.image;
      }, { once: true });
      img.addEventListener('load', () => {
        img.classList.add('is-loaded');
        if (img.naturalWidth && img.naturalHeight) {
          tile.dataset.ratio = img.naturalWidth / img.naturalHeight;
        }
        layout();
      }, { once: true });
      ph.appendChild(img);
      tile.appendChild(ph);

      if (item.caption) {
        const cap = document.createElement('figcaption');
        cap.textContent = item.caption;
        tile.appendChild(cap);
      }

      tile.addEventListener('click', () => openLightbox(tile, item));
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(tile, item); }
      });

      gallery.appendChild(tile);
    });
    layout();
  }

  // Masonry — same math as the main gallery (script.js): measure each
  // tile's real aspect ratio, span columns/rows to match, no cropping.
  const ROW = 8;
  const GAP = 4;
  const MOBILE_BREAKPOINT = 860;
  const MIN_RATIO = 0.5;
  const MAX_RATIO = 2.4;

  function colSpanFor(ratio) {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    if (isMobile) return ratio > 1.2 ? 2 : 1;
    if (ratio > 2.0) return 6;
    if (ratio > 1.6) return 4;
    if (ratio > 1.2) return 3;
    return 2;
  }

  function layout() {
    if (!gallery) return;
    const tiles = Array.from(gallery.querySelectorAll('.tile[data-has-media="true"]'));

    const ratios = tiles.map((tile) => {
      const measured = parseFloat(tile.dataset.ratio);
      const ratio = Math.min(Math.max(measured || 4 / 5, MIN_RATIO), MAX_RATIO);
      tile.style.gridColumn = `span ${colSpanFor(ratio)}`;
      // Neutralize the fallback CSS aspect-ratio once we're computing a
      // real row-span from here — see script.js's galleryMasonry for
      // why this matters (leaving it set fights the row-span it's
      // based on for any photo whose ratio differs from 4:5).
      tile.style.aspectRatio = 'auto';
      return ratio;
    });

    const widths = tiles.map((tile) => tile.getBoundingClientRect().width);

    tiles.forEach((tile, i) => {
      const width = widths[i];
      if (!width) return;
      const naturalHeight = width / ratios[i];
      const span = Math.ceil((naturalHeight + GAP) / (ROW + GAP));
      tile.style.gridRowEnd = `span ${span}`;
    });
  }

  let scheduled = false;
  window.addEventListener('resize', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; layout(); });
  });

  // Lightbox — same markup/behavior as the main site's, reusing the
  // already-loaded tile image instead of fetching a second copy.
  const box = document.getElementById('lightbox');
  const closeBtn = document.getElementById('lightboxClose');
  const stage = document.getElementById('lightboxStage');
  const stageImg = document.getElementById('lightboxImg');
  const caption = document.getElementById('lightboxCaption');
  let lastFocused = null;

  function openLightbox(tile, item) {
    if (!box) return;
    const sourceImg = tile.querySelector('.tile__img');
    lastFocused = document.activeElement;

    if (sourceImg && sourceImg.classList.contains('is-loaded')) {
      stageImg.src = sourceImg.src;
      stageImg.srcset = sourceImg.srcset;
      stageImg.sizes = '(max-width: 700px) 85vw, 640px';
      stageImg.alt = sourceImg.alt;
      stageImg.classList.add('is-loaded');
      stage.classList.add('has-photo');
    }

    caption.textContent = item.caption || '';
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    if (!box) return;
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
  if (box) box.addEventListener('click', (e) => { if (e.target === box) closeLightbox(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box && box.classList.contains('is-open')) closeLightbox();
  });
})();
