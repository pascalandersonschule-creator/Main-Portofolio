// ============================================
// PASCAL ANDERSON — PHOTOGRAPHY
// ============================================

document.getElementById('year').textContent = new Date().getFullYear();

// --------------------------------------------
// Netlify Identity — loaded ONLY when this page was actually opened via
// one of Netlify's own invite/recovery/confirmation links (they land on
// "/" with a token in the URL fragment). On a normal visit this block
// does nothing and no request to identity.netlify.com is ever made, so
// no visitor's IP reaches Netlify just for browsing the portfolio.
// Once loaded, the widget picks up the token itself; we just also send
// a freshly-logged-in editor straight to the admin panel afterward.
// --------------------------------------------
(function loadIdentityIfNeeded(){
  const hash = window.location.hash;
  const isIdentityLink = /(invite|recovery|confirmation|email_change)_token=/.test(hash);
  if (!isIdentityLink) return;

  const script = document.createElement('script');
  script.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
  script.onload = () => {
    if (!window.netlifyIdentity) return;
    window.netlifyIdentity.on('init', (user) => {
      if (!user) {
        window.netlifyIdentity.on('login', () => { document.location.href = '/admin/'; });
      }
    });
    window.netlifyIdentity.init();
  };
  document.head.appendChild(script);
})();

// --------------------------------------------
// Content loader — pulls text & images from content.json
// so the site can be edited via /admin without touching code.
// If content.json can't be reached (e.g. a local file:// preview,
// where browsers block fetch), the page simply keeps the default
// text already written into index.html — nothing breaks.
// --------------------------------------------
async function loadContent(){
  try {
    const res = await fetch('content.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    applyContent(data);
  } catch (err) {
    // content.json unreachable — the default text in the HTML stays as-is.
  } finally {
    window.__relayoutGallery && window.__relayoutGallery();
    initHeroReveal();
  }
}

// --------------------------------------------
// Hero title reveal: splits the (by now final, whether default or
// CMS-edited) headline into characters and cascades them in with GSAP.
// Runs once content.json has resolved either way, so it never animates
// placeholder text that's about to be swapped out.
// --------------------------------------------
function initHeroReveal(){
  const title = document.getElementById('heroTitle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!title || reducedMotion || typeof SplitType === 'undefined' || typeof gsap === 'undefined') return;

  const split = new SplitType(title, { types: 'chars' });
  // SplitType sets an inline display style on the elements it measures —
  // put .hero__line's own block layout back so each line still stacks.
  title.querySelectorAll('.hero__line').forEach((line) => { line.style.display = 'block'; });
  gsap.set(split.chars, { yPercent: 110, opacity: 0 });
  gsap.to(split.chars, {
    yPercent: 0,
    opacity: 1,
    duration: 0.8,
    ease: 'power2.out',
    stagger: 0.02,
    delay: 0.15,
  });
}

function applyContent(data){
  if (data.hero){
    setText('heroSub', data.hero.sub);
    setText('heroCtaPrimary', data.hero.ctaPrimary);
    setText('heroCtaSecondary', data.hero.ctaSecondary);

    if (data.hero.tags){
      const tagsEl = document.getElementById('heroTags');
      if (tagsEl){
        const tags = data.hero.tags.split(',').map((t) => t.trim()).filter(Boolean);
        tagsEl.innerHTML = '';
        tags.forEach((tag) => {
          const span = document.createElement('span');
          span.className = 'hero__tag';
          span.textContent = tag;
          tagsEl.appendChild(span);
        });
      }
    }

    const lines = document.querySelectorAll('.hero__line');
    if (lines[0] && data.hero.line1) lines[0].textContent = data.hero.line1;
    if (lines[1] && data.hero.line2) lines[1].textContent = data.hero.line2;
    if (lines[2] && data.hero.line3) lines[2].textContent = data.hero.line3;

    if (data.hero.float1Image){
      setResponsiveImage(document.querySelector('[data-slot="float1"]'), data.hero.float1Image, {
        widths: [500, 800, 1100],
        sizes: '45vw',
        alt: '',
      });
    }
    if (data.hero.float2Image){
      setResponsiveImage(document.querySelector('[data-slot="float2"]'), data.hero.float2Image, {
        widths: [350, 600],
        sizes: '30vw',
        alt: '',
      });
    }
  }

  if (Array.isArray(data.gallery)){
    renderGallery(data.gallery);
  }

  if (data.about){
    setText('aboutLead', data.about.lead);
    if (data.about.image){
      setResponsiveImage(document.querySelector('[data-slot="about"]'), data.about.image, {
        widths: [400, 700, 1000],
        sizes: '(max-width: 860px) 90vw, 45vw',
        alt: 'Pascal Anderson',
      });
    }
  }

  if (data.contact){
    setText('contactLead', data.contact.lead);
    if (data.contact.email) window.__contactRecipient = data.contact.email;
  }

  if (data.footer){
    const emailLink = document.getElementById('footerEmail');
    if (emailLink && data.footer.email){
      emailLink.textContent = data.footer.email;
      emailLink.href = `mailto:${data.footer.email}`;
    }
    const igLink = document.getElementById('footerInstagram');
    if (igLink){
      if (data.footer.instagram){
        igLink.href = data.footer.instagram;
        igLink.style.display = '';
      } else {
        igLink.style.display = 'none';
      }
    }
    const impressumLink = document.getElementById('footerImpressum');
    if (impressumLink && data.footer.impressumUrl) impressumLink.href = data.footer.impressumUrl;
    const datenschutzLink = document.getElementById('footerDatenschutz');
    if (datenschutzLink && data.footer.datenschutzUrl) datenschutzLink.href = data.footer.datenschutzUrl;
  }
}

function setText(id, value){
  if (!value) return;
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setTextIn(root, selector, value){
  if (!value) return;
  const el = root.querySelector(selector);
  if (el) el.textContent = value;
}

// --------------------------------------------
// Netlify Image CDN: requests an appropriately-sized, modern-format
// (AVIF/WebP where supported) version of the original upload instead
// of shipping the full-resolution file to every visitor.
// Docs: https://docs.netlify.com/image-cdn/overview/
// --------------------------------------------
function netlifyImageUrl(path, width){
  return `/.netlify/images?url=${encodeURIComponent(path)}&w=${width}`;
}

function setResponsiveImage(container, path, { widths, sizes, alt }){
  if (!container || !path) return;
  const img = container.querySelector('.tile__img');
  if (!img) return;

  img.sizes = sizes;
  img.srcset = widths.map((w) => `${netlifyImageUrl(path, w)} ${w}w`).join(', ');
  img.src = netlifyImageUrl(path, widths[Math.floor(widths.length / 2)]);
  if (alt !== undefined) img.alt = alt;

  img.addEventListener('error', () => {
    // The /.netlify/images transform endpoint only exists on an actual
    // Netlify deploy (or `netlify dev`) — on a plain local static server
    // it 404s. Fall back to the original file directly so local
    // previews still show photos instead of a broken image.
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = path;
  }, { once: true });

  img.addEventListener('load', () => {
    img.classList.add('is-loaded');
    // The tile's real shape, not a category guess — a 1:1, 3:4, 4:5 or
    // landscape photo all get sized to their own actual proportions.
    if (img.naturalWidth && img.naturalHeight){
      container.dataset.ratio = img.naturalWidth / img.naturalHeight;
    }
    window.__relayoutGallery && window.__relayoutGallery();
  }, { once: true });
}

// --------------------------------------------
// Gallery: built fresh from content.json every time, so there's no
// fixed number of tiles — add or remove entries in /admin and the
// grid just grows or shrinks. An entry is only rendered once it has
// its required media (a photo, or for Motion a video); everything
// else about a tile (caption included) is optional.
// --------------------------------------------
function renderGallery(items){
  const gallery = document.getElementById('gallery');
  if (!gallery || !Array.isArray(items)) return;

  gallery.innerHTML = '';

  items.forEach((item, i) => {
    const type = item.type;
    const hasMedia = type === 'motion' ? !!item.video : !!item.image;
    if (!hasMedia) return;

    const tile = document.createElement('figure');
    tile.className = 'tile';
    tile.dataset.category = type;
    tile.dataset.hasMedia = 'true';
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', item.caption ? `View larger: ${item.caption}` : 'View larger');

    const ph = document.createElement('div');
    ph.className = `tile__ph tile__ph--${(i % 9) + 1}`;
    tile.appendChild(ph);

    if (type === 'motion'){
      const video = document.createElement('video');
      video.className = 'tile__video';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'none';
      video.setAttribute('aria-hidden', 'true');
      ph.appendChild(video);

      // Inline SVG (not a Lucide <i>) — same "play" icon, just built by
      // hand so the site doesn't need the ~430KB icon library for the
      // handful of icons it actually uses. SVG elements need their own
      // namespace to render at all, unlike a plain HTML tag.
      const svgNS = 'http://www.w3.org/2000/svg';
      const play = document.createElementNS(svgNS, 'svg');
      play.setAttribute('class', 'tile__play');
      play.setAttribute('aria-hidden', 'true');
      play.setAttribute('viewBox', '0 0 24 24');
      play.setAttribute('fill', 'none');
      play.setAttribute('stroke', 'currentColor');
      play.setAttribute('stroke-width', '2');
      play.setAttribute('stroke-linecap', 'round');
      play.setAttribute('stroke-linejoin', 'round');
      const playPath = document.createElementNS(svgNS, 'path');
      playPath.setAttribute('d', 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z');
      play.appendChild(playPath);
      ph.appendChild(play);

      setVideoSource(tile, item.video, item.poster || '');
    } else {
      const img = document.createElement('img');
      img.className = 'tile__img';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      ph.appendChild(img);

      setResponsiveImage(tile, item.image, {
        widths: [400, 700, 1000, 1400],
        sizes: '(max-width: 860px) 50vw, 33vw',
        alt: item.caption || '',
      });
    }

    const tc = document.createElement('span');
    tc.className = 'tile__tc';
    tc.setAttribute('aria-hidden', 'true');
    tc.textContent = fakeTimecode(i);
    tile.appendChild(tc);

    if (item.caption){
      const caption = document.createElement('figcaption');
      caption.textContent = item.caption;
      tile.appendChild(caption);
    }

    gallery.appendChild(tile);
  });

  // Scroll-reveal: each tile fades/slides in once, the first time it
  // crosses into the viewport. A plain IntersectionObserver on purpose
  // (not GSAP ScrollTrigger, used elsewhere in this file) — tiles are
  // shown/hidden dynamically by the category filters, and ScrollTrigger's
  // start/end math is sensitive to layout height changing after it's
  // already measured. Uses the independent `translate` property (not
  // `transform`) so it never collides with the tile's own press-feedback
  // transform (see .tile:active in styles.css).
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const tileRevealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    gallery.querySelectorAll('.tile').forEach((tile) => tileRevealObserver.observe(tile));
  }

  window.__relayoutGallery && window.__relayoutGallery();
}

// Purely decorative per-tile timecode stamp — deterministic from the
// item's position, not a real clock.
function fakeTimecode(i){
  const h = String(Math.floor(i / 60) % 24).padStart(2, '0');
  const m = String((i * 7) % 60).padStart(2, '0');
  const s = String((i * 13) % 60).padStart(2, '0');
  const f = String((i * 5) % 30).padStart(2, '0');
  return `TC ${h}:${m}:${s}:${f}`;
}

// Reel tiles: point the muted <video> at the uploaded file and give it
// a poster frame so there's something to see before playback starts.
function setVideoSource(tile, videoPath, posterPath){
  const video = tile.querySelector('.tile__video');
  if (!video || !videoPath) return;

  video.src = videoPath;
  if (posterPath) video.poster = posterPath;

  const markLoaded = () => {
    video.classList.add('is-loaded');
    window.__relayoutGallery && window.__relayoutGallery();
  };
  video.addEventListener('loadeddata', markLoaded, { once: true });
  video.addEventListener('loadedmetadata', () => {
    if (video.videoWidth && video.videoHeight){
      tile.dataset.ratio = video.videoWidth / video.videoHeight;
      window.__relayoutGallery && window.__relayoutGallery();
    }
  }, { once: true });
  video.load();

  reelObserver.observe(video);
}

loadContent();

// --------------------------------------------
// Reel autoplay: only the reel thumbnail currently in view plays
// (muted, looped) — everything off-screen stays paused. Disabled
// entirely under prefers-reduced-motion; a play icon + click-through
// to the lightbox (with real controls) always remains available.
// --------------------------------------------
const reelReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reelObserver = new IntersectionObserver((entries) => {
  if (reelReducedMotion) return;
  entries.forEach((entry) => {
    const video = entry.target;
    if (entry.isIntersecting) video.play().catch(() => {});
    else video.pause();
  });
}, { threshold: 0.5 });

// --------------------------------------------
// Camcorder HUD: running timecode since page load.
// --------------------------------------------
(function hudTimecode(){
  const el = document.getElementById('hudTime');
  if (!el) return;
  const start = Date.now();
  function tick(){
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
})();

// --------------------------------------------
// Gallery masonry: both the column span (width) and row span (height)
// come from each tile's OWN photo/video's real aspect ratio (measured
// on load, see setResponsiveImage/setVideoSource) — square, 3:4, 4:5,
// landscape, whatever the upload actually is. A wide landscape shot
// gets more columns instead of being squashed into a portrait-width
// slot; grid-auto-flow:dense (in CSS) fills the gaps that leaves
// around it. The category-based guess below is only a placeholder for
// the split second before that real ratio is known, so a tile isn't
// zero-size while its media is still loading.
// Re-runs on resize (column count changes at the mobile breakpoint)
// and whenever tiles show/hide/finish loading.
// --------------------------------------------
(function galleryMasonry(){
  const gallery = document.getElementById('gallery');
  if (!gallery) return;

  const ROW = 8;
  const GAP = 4;
  const MOBILE_BREAKPOINT = 860; // matches the .gallery media query in styles.css
  const FALLBACK_ASPECT = { stage: 4 / 5, night: 4 / 5, covers: 1, motion: 9 / 16 };
  // Keeps one very wide or very tall upload from wrecking the grid's
  // rhythm — still clearly landscape/portrait, just not absurdly so.
  const MIN_RATIO = 0.5;   // tallest allowed (like a 1:2 portrait)
  const MAX_RATIO = 2.4;   // widest allowed (like an ultrawide landscape)

  // Desktop grid is 6 columns wide; mobile is 2. A span has to fit
  // within whichever is currently active, or the tile would overflow
  // sideways instead of just wrapping.
  function colSpanFor(ratio){
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    if (isMobile) return ratio > 1.2 ? 2 : 1;
    if (ratio > 2.0) return 6;
    if (ratio > 1.6) return 4;
    if (ratio > 1.2) return 3;
    return 2;
  }

  function layout(){
    const tiles = Array.from(gallery.querySelectorAll('.tile[data-has-media="true"]:not(.is-hidden)'));

    // Write pass 1: column span — this changes how wide each tile is,
    // so it has to land before we measure anything.
    const ratios = tiles.map((tile) => {
      const measured = parseFloat(tile.dataset.ratio);
      const raw = measured || FALLBACK_ASPECT[tile.dataset.category] || 4 / 5;
      const ratio = Math.min(Math.max(raw, MIN_RATIO), MAX_RATIO);
      tile.style.gridColumn = `span ${colSpanFor(ratio)}`;
      // The CSS aspect-ratio in styles.css is only a placeholder shape
      // for the instant before this runs. Once we're computing a real
      // row-span from here on, it has to be cleared — otherwise it wins
      // over the row-span for any upload whose real ratio doesn't match
      // its category's default, stretching the tile's rendered height
      // past what the grid thinks it occupies and opening a gap below.
      tile.style.aspectRatio = 'auto';
      return ratio;
    });

    // Read pass: grouped together so the browser only has to flush
    // layout once for all of them, not once per tile.
    const widths = tiles.map((tile) => tile.getBoundingClientRect().width);

    // Write pass 2: row span, from each tile's now-final width.
    tiles.forEach((tile, i) => {
      const width = widths[i];
      if (!width) return;
      const naturalHeight = width / ratios[i];
      const span = Math.ceil((naturalHeight + GAP) / (ROW + GAP));
      tile.style.gridRowEnd = `span ${span}`;
    });
  }

  let scheduled = false;
  function schedule(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; layout(); });
  }

  window.addEventListener('resize', schedule);
  window.__relayoutGallery = layout;
  layout();
})();

// --------------------------------------------
// Cursor orb: one system, three contextual states
//   - default: soft ambient spotlight glow, follows the cursor anywhere
//     on the page (not just the hero) — keeps the black from feeling inert
//   - gallery tile hover: label showing category
// --------------------------------------------
(function cursorOrb(){
  const orb = document.getElementById('cursorOrb');
  const label = document.getElementById('cursorLabel');
  if (!orb) return;

  const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!isFinePointer || reducedMotion) return;

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let ox = x, oy = y;

  window.addEventListener('mousemove', (e) => {
    x = e.clientX;
    y = e.clientY;
  });

  function raf(){
    ox += (x - ox) * 0.18;
    oy += (y - oy) * 0.18;
    orb.style.transform = `translate(${ox}px, ${oy}px) translate(-50%, -50%)`;
    requestAnimationFrame(raf);
  }
  raf();

  orb.classList.add('is-spotlight');

  // Delegated (not per-tile) — tiles are rendered dynamically from
  // content.json, often after this code runs, so listeners attached
  // directly to them at load time would miss every tile entirely.
  const gallery = document.getElementById('gallery');
  if (gallery){
    // Adjacent tiles are only 4px apart, so the cursor briefly crosses
    // the gallery's own background between them. Without a grace period,
    // that fires a mouseout (orb drops to the spotlight state) and then
    // a mouseover on the next tile (orb jumps back) on every single tile
    // boundary — reads as constant flicker when hovering across a row,
    // not a single continuous hover. The short delay bridges that gap.
    let leaveTimer = null;
    gallery.addEventListener('mouseover', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile || tile.contains(e.relatedTarget)) return;
      clearTimeout(leaveTimer);
      label.textContent = 'VIEW';
      orb.classList.add('is-viewing');
    });
    gallery.addEventListener('mouseout', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile || tile.contains(e.relatedTarget)) return;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        orb.classList.remove('is-viewing');
        label.textContent = '';
      }, 80);
    });
  }
})();

// --------------------------------------------
// Magnetic gallery: every tile reacts to how close the
// cursor is to it, pulling gently toward it — the whole
// grid feels like one connected, magnetic surface.
// --------------------------------------------
(function galleryMagnetic(){
  const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gallery = document.getElementById('gallery');
  if (!gallery || !isFinePointer || reducedMotion) return;

  const RADIUS = 260;    // how far the "magnetic" pull reaches (px)
  const STRENGTH = 0.32; // how strongly tiles get pulled

  let mouseX = 0;
  let mouseY = 0;
  let scheduled = false;

  function apply(){
    scheduled = false;
    gallery.querySelectorAll('.tile').forEach((tile) => {
      const ph = tile.querySelector('.tile__ph');
      if (!ph) return;
      const rect = tile.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = mouseX - cx;
      const dy = mouseY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist < RADIUS){
        const pull = 1 - dist / RADIUS;
        const tx = dx * pull * STRENGTH;
        const ty = dy * pull * STRENGTH;
        const scale = 1 + pull * 0.05;
        ph.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      } else {
        ph.style.transform = '';
      }
    });
  }

  gallery.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!scheduled){
      scheduled = true;
      requestAnimationFrame(apply);
    }
  });

  gallery.addEventListener('mouseleave', () => {
    gallery.querySelectorAll('.tile__ph').forEach((ph) => { ph.style.transform = ''; });
  });
})();

// --------------------------------------------
// Lightbox: click a tile to view it larger (photo or reel)
// --------------------------------------------
(function lightbox(){
  const box = document.getElementById('lightbox');
  const closeBtn = document.getElementById('lightboxClose');
  const prevBtn = document.getElementById('lightboxPrev');
  const nextBtn = document.getElementById('lightboxNext');
  const stage = document.getElementById('lightboxStage');
  const stagePh = document.getElementById('lightboxPh');
  const stageImg = document.getElementById('lightboxImg');
  const stageVideo = document.getElementById('lightboxVideo');
  const caption = document.getElementById('lightboxCaption');
  if (!box) return;

  const gallery = document.getElementById('gallery');
  let currentTile = null;

  // Only tiles the current filter is actually showing — arrow-key/button
  // navigation should match what's visually on screen, not jump through
  // tiles hidden by the active Stage/Night/Covers/Motion filter.
  function visibleTiles(){
    return Array.from(gallery.querySelectorAll('.tile[data-has-media="true"]:not(.is-hidden)'));
  }

  function step(direction){
    const tiles = visibleTiles();
    if (!tiles.length) return;
    const i = tiles.indexOf(currentTile);
    const next = i === -1 ? 0 : (i + direction + tiles.length) % tiles.length;
    open(tiles[next]);
  }

  function open(tile){
    currentTile = tile;
    const ph = tile.querySelector('.tile__ph');
    const isReel = tile.dataset.category === 'motion';
    const sourceImg = tile.querySelector('.tile__img');
    const sourceVideo = tile.querySelector('.tile__video');
    const text = tile.querySelector('figcaption')?.textContent || '';

    stagePh.className = 'lightbox__ph ' + Array.from(ph.classList).filter(c => c.startsWith('tile__ph--')).join(' ');
    stagePh.classList.toggle('is-video', isReel);
    stageVideo.pause();

    if (isReel && sourceVideo && sourceVideo.classList.contains('is-loaded')){
      stageVideo.src = sourceVideo.currentSrc || sourceVideo.src;
      if (sourceVideo.poster) stageVideo.poster = sourceVideo.poster;
      stage.classList.add('has-photo');
      stageVideo.currentTime = 0;
      stageVideo.play().catch(() => {});
    } else if (!isReel && sourceImg && sourceImg.classList.contains('is-loaded')){
      stageImg.src = sourceImg.src;
      stageImg.srcset = sourceImg.srcset;
      stageImg.sizes = '(max-width: 700px) 85vw, 640px';
      stageImg.alt = sourceImg.alt;
      stageImg.classList.add('is-loaded');
      stage.classList.add('has-photo');
    } else {
      stageImg.removeAttribute('src');
      stageImg.removeAttribute('srcset');
      stageImg.classList.remove('is-loaded');
      stageVideo.removeAttribute('src');
      stage.classList.remove('has-photo');
    }

    caption.textContent = text;
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close(){
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    stageVideo.pause();
  }

  // Delegated on the (always-present, static) gallery container —
  // tiles inside it are created dynamically from content.json.
  if (gallery){
    gallery.addEventListener('click', (e) => {
      const tile = e.target.closest('.tile');
      if (tile) open(tile);
    });
    gallery.addEventListener('keydown', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile) return;
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        open(tile);
      }
    });
  }

  closeBtn.addEventListener('click', close);
  if (prevBtn) prevBtn.addEventListener('click', () => step(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => step(1));
  box.addEventListener('click', (e) => {
    if (e.target === box) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!box.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
})();

// --------------------------------------------
// Gallery filtering
// --------------------------------------------
(function galleryFilter(){
  const buttons = document.querySelectorAll('.filter');
  const gallery = document.getElementById('gallery');
  if (!gallery) return;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');

      // Queried fresh on every click, not captured once at load —
      // tiles are (re)rendered dynamically from content.json.
      const filter = btn.dataset.filter;
      gallery.querySelectorAll('.tile').forEach((tile) => {
        const match = filter === 'all' || tile.dataset.category === filter;
        tile.classList.toggle('is-hidden', !match);
      });

      window.__relayoutGallery && window.__relayoutGallery();
    });
  });
})();

// --------------------------------------------
// Mobile nav toggle
// --------------------------------------------
(function mobileNav(){
  const toggle = document.getElementById('navToggle');
  const links = document.querySelector('.nav__links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  links.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
})();

// --------------------------------------------
// Contact form — opens the visitor's mail client
// prefilled with their message (no backend needed).
// The recipient is set via content.json / the admin panel,
// or falls back to the address below.
// --------------------------------------------
(function contactForm(){
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');
  if (!form) return;

  const DEFAULT_RECIPIENT = 'hello@pascalanderson.com';

  function encode(data){
    return Object.keys(data)
      .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
      .join('&');
  }

  function fallbackToMailto(){
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const message = form.message.value.trim();
    const recipient = window.__contactRecipient || DEFAULT_RECIPIENT;

    const subject = encodeURIComponent(`Enquiry — from ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ''}\n\nMessage:\n${message}`
    );
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
  }

  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (status) status.textContent = 'Sending…';
    if (submitBtn) submitBtn.disabled = true;

    const formData = new FormData(form);
    const payload = {};
    formData.forEach((value, key) => { payload[key] = value; });

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        if (status) status.textContent = "Thanks — I’ll get back to you soon.";
        form.reset();
      })
      .catch(() => {
        // Netlify Forms unreachable (e.g. not actually deployed on Netlify) —
        // fall back to opening the visitor's mail client instead.
        if (status) status.textContent = '';
        fallbackToMailto();
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();

// --------------------------------------------
// Lenis smooth scroll + GSAP ScrollTrigger.
// Skipped entirely under prefers-reduced-motion — the page falls back
// to plain native scrolling, no inertia, no reveal animations.
// --------------------------------------------
(function smoothScrollAndReveals(){
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

  if (!reducedMotion && typeof Lenis !== 'undefined'){
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });

    if (hasGsap){
      gsap.registerPlugin(ScrollTrigger);
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      requestAnimationFrame(function raf(time){
        lenis.raf(time);
        requestAnimationFrame(raf);
      });
    }

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (e) => {
        const id = link.getAttribute('href').slice(1);
        const target = id ? document.getElementById(id) : null;
        if (!target) return;
        e.preventDefault();
        // -96: clears the fixed nav bar (~64-90px, more on notched
        // phones) so the target heading doesn't land underneath it.
        lenis.scrollTo(target, { offset: -96 });
      });
    });
  }

  if (reducedMotion || !hasGsap) return;

  // Scroll-triggered reveals — only for content that's always present
  // (not the CMS-driven gallery tiles, whose visibility toggles later
  // once media is uploaded and could throw off ScrollTrigger's math).
  const revealGroups = [
    { selector: '.work__head > *', y: 20, stagger: 0.08 },
    { selector: '.about__media, .about__text', y: 28, stagger: 0.1 },
    { selector: '.contact__inner > *', y: 20, stagger: 0.06 },
  ];

  revealGroups.forEach(({ selector, y, stagger }) => {
    const els = gsap.utils.toArray(selector);
    if (!els.length) return;
    gsap.set(els, { opacity: 0, y });
    els.forEach((el, i) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: 'power2.out',
          delay: i * stagger,
        }),
      });
    });
  });
})();
