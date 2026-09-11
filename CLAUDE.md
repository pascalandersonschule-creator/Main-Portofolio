# High-End Editorial Photography & Film Portfolio Guidelines

## 1. Visual & Aesthetic Architecture
- **Theme:** Dark Mode Only. Background: `#08080a` (Deep Charcoal), Text: `#f3f3f5` (Off-white), Accent: `#a1a1aa` (Muted Zinc).
- **Typography:** 
  - Headlines: Display Serif (Playfair Display / Cormorant Garamond) – lokal eingebunden.
  - Body: Modern Clean Sans (Plus Jakarta Sans / Geist) – lokal eingebunden.
  - KEINE System-Schriften, KEIN Inter.

## 2. Layout & Composition Rules
- **No Generic Cards:** Verwende keine abgerundeten Standard-Karten mit Schatten.
- **Editorial Grids:** Asymmetrische Layouts, überlappende Elemente, unterschiedliche Bildgrößen (Masonry/Bento), viel Freiraum (Padding).
- **Full-Bleed Media:** Bilder und Videos breiten sich teilweise über die volle Bildschirmbreite aus.

## 3. Interaction & Motion
- **Smooth Scroll:** Pflicht via Lenis.
- **Hover-Effects:** Sanftes Heranzoomen bei Bildern (`scale-105` über 0.5s), subtle Cursor-Follower bei Media-Elementen.
- **Transitions:** Sanftes Aufblenden beim Scrollen (Framer Motion `whileInView`).

## 4. Privacy & GDPR (Strict)
- ZERO External Network Requests (kein Google Fonts CDN, kein YouTube/Vimeo Iframe). Alle Fonts & Assets liegen unter `/public`.

# Refactoring Rules: High-End Enhancement ONLY

## Strict Boundaries
- **DO NOT** add new sections, new pages, or new features.
- Keep the existing HTML structure, content, texts, and component hierarchy strictly as they are.
- Focus ONLY on visual polish, typography, spacing, CSS transitions, and micro-interactions.
- No full layout/structural rebuilds under this heading — that's a separate, explicit request, not an "enhancement."

## Design Upgrade Standards (Editorial Photography & Video Vibe)
- **Whitespace & Spacing:** Verdopple die vertikalen Abstände (Paddings/Margins) zwischen Sektionen. Gib den Bildern und Videos maximale Raumwirkung.
- **Typography Refinement:** Feile an den Schrifthierarchien (Font-Sizes, Line-Heights, Letter-Spacing/Tracking). Überschriften müssen edler wirken, Fließtext dezent zurücktreten.
- **Micro-Interactions:** Ändere bestehende Hover-Effekte auf geschmeidige, lange Übergänge — in diesem Projekt heißt das: längere Dauer (400–600ms) über den vorhandenen `--ease-out`-Token (`cubic-bezier(.2,.8,.2,1)`, siehe `styles.css`), auf konkrete Properties (`transform`, `opacity`, `border-color`) statt `transition: all`. Kein Tailwind hier — reines CSS, Utility-Klassennamen wie `transition-all duration-500` sind nur Referenz für die *Wirkung*, nicht für die Syntax.
- **Color Harmony:** Optimiere die bestehenden Farbtöne (z. B. Kontraste bei Hintergründen abmildern, Konturen/Bordüren ultradezent machen).
- **Media Presentation:** Optimiere `object-fit`, Bild-Proportionen und Ladezeiten der bestehenden Bilder/Videos, ohne neue Elemente hinzuzufügen.