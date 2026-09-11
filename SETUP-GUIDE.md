# Editing your website on Netlify — setup guide

Your admin panel is now **Decap CMS**, the standard editing tool for
Netlify sites. It lives at `/admin` and, unlike a traditional admin
panel, it doesn't run on a server — it edits `content.json` directly in
your GitHub repository, and Netlify automatically rebuilds the site
whenever you save.

This setup needs a few one-time steps in your Netlify dashboard first.
Once done, editing is just filling out a form and clicking "Publish."

## Editing locally, without a Netlify account at all

You don't strictly need Netlify to use the CMS — there's a "local
backend" mode that writes straight to the files on your own computer,
no login, no internet required:

1. In this project folder, run a static server (e.g. `npx serve .`)
   and, in a second terminal, `npx decap-server`.
2. Open `http://localhost:<port>/admin/` in your browser. You'll see a
   plain **Login** button (no Netlify Identity involved) — click it and
   you're straight into the editor.
3. Edit and click **Publish** as normal. Changes are written directly
   to `content.json` and `uploads/` on disk — nothing is committed to
   Git automatically, so review the changes (`git diff`) and commit
   them yourself when you're happy.

This is the quickest way to preview a change before it's live, or to
edit on a plane with no signal. For the real, deployed site, the steps
below (Identity + Git Gateway) are what makes editing on `/admin` work
for good — that part genuinely does need Netlify.

## 1. Make sure your site is connected to GitHub

Decap CMS needs your site to be deployed from a Git repository (not a
drag-and-drop upload), because it saves your edits as commits.

1. Go to your site in the [Netlify dashboard](https://app.netlify.com).
2. Open **Site configuration → Build & deploy**.
3. If it shows a connected GitHub repository, you're already set — skip to step 2.
4. If it says something like "This site isn't linked to a Git repository":
   create a new repository on [GitHub](https://github.com) and push these
   files to it, then in Netlify choose **Add new site → Import an existing
   project** and connect that repository. Your existing site's URL and
   settings can stay the same — you're just switching how it deploys.

## 2. Enable Identity — and lock it to invite-only

Identity is what handles your login for the admin panel. This step is
what actually stops a stranger from creating their own account and
logging into your CMS — nothing in the code can enforce this for you,
it only exists as a dashboard setting.

1. In the Netlify dashboard, open **Site configuration → Identity**.
2. Click **Enable Identity**.
3. Under **Registration**, set it to **Invite only** — do this before
   anything else. If it's left on "Open", anyone who finds `/admin` can
   register their own account and get an editor login.
4. While you're there, turn on **two-factor authentication** for your
   own Netlify account (Netlify dashboard → your avatar → **User
   settings → Security**) and for the GitHub account this repo lives
   in. Both are outside what any file in this repo can control, and
   both matter more than anything below — someone with your Netlify or
   GitHub login doesn't need to go through `/admin` at all.

## 3. Enable Git Gateway

This lets the CMS commit your changes to GitHub on your behalf, without
you needing a personal GitHub access token.

1. Still under **Identity**, scroll to **Services → Git Gateway**.
2. Click **Enable Git Gateway**.

## 4. Invite yourself as an editor

1. Under **Identity**, click **Invite users**.
2. Enter your own email address and send the invite.
3. Check your inbox, open the invite email, and click the link. It will
   land on your live site and open a "set your password" popup — set one
   and confirm.

## 5. Log in and edit

1. Go to `https://your-site.netlify.app/admin` (or your custom domain + `/admin`).
2. Log in with the email + password from step 4.
3. You'll see one entry, **"Website Content"** — open it.
4. Edit any field: headline, bio tags, gallery images, captions, contact
   email, and so on.
5. Click **Publish** (top right) when done.

That triggers a new deploy — your changes go live within roughly a
minute, the same way any other update to the site would.

## What you can edit

The editor is split into six collapsed sections — click a title bar to
open it. A live preview pane on the right shows roughly how each change
will look on the real site as you type.

- **1. Hero section:** bio tags, headline (3 lines), subtext, both
  button labels, two floating photos
- **2. Gallery:** as many tiles as you want — there's no fixed number,
  add or remove with the "Add gallery" / ✕ buttons, and drag the ☰
  handle on a collapsed entry to reorder it. Each entry only needs a
  **Type** (Stage/Night/Covers/Motion) and its Photo, or for Motion a
  Video + optional poster frame — Caption is entirely optional. A tile
  only appears on the live site once its Photo (or Video) is filled in.
  Upload any aspect ratio you like — the gallery sizes itself to match.
- **3. About:** your one-line bio + portrait photo
- **4. Contact:** the intro line + the email address enquiries go to
- **5. Footer:** displayed email, Instagram link, Impressum/Datenschutz
  page links
- **6. Legal:** the name, address, phone and VAT ID shown on the
  Impressum and Datenschutz pages. These are legally required fields
  in Germany — leave phone/VAT ID blank to hide those lines entirely,
  but name/address/ZIP+city need to be filled in with real details
  before the site goes live. The contact email on both pages is pulled
  from the Footer section above.

## Uploading photos

Click into any image field and either drag a photo in or pick one from
your computer. Upload your **full-resolution** originals — the site
automatically requests a resized, modern-format version for every
visitor's screen (see the performance section below), so you don't need
to resize or compress anything yourself beforehand.

## A note on how this differs from a typical admin panel

There's no separate "database" — `content.json` in your repository *is*
the database, and every save is a Git commit. This means:

- You get a full history of every change, visible in your GitHub repo
- If something ever looks wrong, you (or I) can always roll back to a
  previous commit
- There's a short delay (usually under a minute) between clicking
  "Publish" and the change appearing live, because Netlify has to rebuild
  and redeploy the site — this is normal

## Performance — how the site stays fast with high-resolution photos

- Every photo is served through **Netlify's Image CDN**, which resizes
  and converts it on the fly (to AVIF or WebP where the visitor's browser
  supports it) — a phone gets a small file, a large desktop screen gets a
  bigger one, nobody downloads your full-resolution original
- Gallery and about-page images use `loading="lazy"`, so they're only
  downloaded once the visitor actually scrolls near them
- The two hero photos load immediately, since they're visible right away
- Fonts, styles and scripts are cached aggressively via `netlify.toml`,
  so repeat visits are close to instant

You genuinely don't need to compress or resize images before uploading —
upload the real files straight from your camera or editing software.

## The social-share preview image

`index.html`'s `og:image`/`twitter:image` tags — the photo that shows up
when someone shares this site's link on WhatsApp, iMessage, Slack,
Twitter, etc. — point at one specific file in `/uploads` by name.
Unlike the rest of the page, this can't update itself automatically:
the apps that generate link previews read the raw HTML directly and
never run `script.js`, so there's nothing to pull a live value from
`content.json` with. If the referenced photo is ever replaced or
removed via `/admin`, update those two `<meta>` tags in `index.html` to
point at a current photo — otherwise the share preview quietly breaks
(shows no image, or a broken one) without anything on the live site
itself looking wrong.

## Security — what's built in, and what you still have to do yourself

**Already in place, no action needed:**

- Strict security headers on every page (`netlify.toml`): a locked-down
  Content-Security-Policy, `Strict-Transport-Security`, `X-Frame-Options`,
  and disabled browser permissions (camera/mic/location/etc. — the site
  never needs them). `/admin` gets its own, slightly less strict policy
  since Decap CMS needs a bit more room to run.
- Every vendor script (GSAP, ScrollTrigger, Lenis, SplitType, Decap CMS)
  is self-hosted from `/vendor`, exactly like the fonts in
  `/fonts` — a normal visit never contacts cdnjs.cloudflare.com or
  unpkg.com, so no visitor IP reaches either of them just from browsing.
  Netlify Identity's own script is the one exception, loaded only when
  someone actually opens `/admin` or follows an invite/recovery link —
  see the comment in `script.js`. It's deliberately left unpinned (no
  local copy, no SRI hash), since Netlify updates that one themselves.
- **Bumping a `/vendor` file's version:** download the new version from
  its original CDN URL, save it over the matching file in `/vendor`,
  and reload the page locally to confirm nothing broke — no SRI hash to
  regenerate, since a same-origin file doesn't need one (SRI only
  matters for a file fetched from somewhere else).
- The contact form has a honeypot field, `maxlength` limits on every
  field, and proper `type`/`autocomplete` attributes — plus Netlify
  Forms' own automatic spam filtering.
- `/admin` is blocked in `robots.txt` and marked `noindex` — this
  doesn't stop a determined visitor who already knows the URL, just
  casual crawling/discovery.
- No tracking cookies, no analytics, self-hosted fonts AND self-hosted
  vendor scripts (see the Datenschutz page for the full breakdown of
  what does and doesn't leave the browser).

**You still need to do this yourself — none of it can live in a file:**

1. **Identity → Registration → Invite only** (step 2 above). This is
   the single most important one — without it, anyone can register
   their own admin account.
2. **Two-factor authentication** on your Netlify account and on the
   GitHub account this repo lives in.
3. Only ever invite people you actually trust with editing rights under
   Identity → Invite users — anyone invited can edit and publish content.

None of this makes the site literally unhackable — no site is — but
between the headers, the pinned scripts, and locking down who can log
in, this covers the realistic risks for a small static site like this
one.
