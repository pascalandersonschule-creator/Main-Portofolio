// ============================================================
// Client download portal — server side only.
//
// Secrets (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET_NAME) live exclusively in Netlify environment variables and
// never appear in any response. Browsers only get short-lived signed URLs.
//
// POST, JSON body { action, ... }:
//   PUBLIC
//     get-downloads        { clientId }
//   ADMIN (Netlify Identity login: Authorization: Bearer <jwt>)
//     admin-list-clients   {}
//     admin-create-client  { title, note?, expiryDate? }
//     admin-delete-client  { clientId }
//     admin-list-files     { clientId }
//     admin-delete-file    { clientId, fileName }
//     get-upload-url       { clientId, fileName }
//
// Errors are always { error: { code, message } }.
// ============================================================

const portal = require('../lib/portal');

const UPLOAD_URL_TTL = 15 * 60;   // 15 minutes
const DOWNLOAD_URL_TTL = 60 * 60; // 60 minutes
const MAX_BODY_BYTES = 8 * 1024;

const ALLOWED_ORIGINS = new Set([
  'https://pascalanderson.com',
  'https://www.pascalanderson.com',
  ...(process.env.CONTEXT === 'dev' ? ['http://localhost:8888'] : []),
]);

function headers(origin) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}
const ok = (origin, body) => ({ statusCode: 200, headers: headers(origin), body: JSON.stringify(body) });
const fail = (origin, statusCode, code, message) => ({
  statusCode, headers: headers(origin), body: JSON.stringify({ error: { code, message } }),
});

// Admin allow-list: only these Identity accounts may manage clients.
// Fail closed — if PORTAL_ADMIN_EMAILS is not set, nobody is admin.
// Comma-separated, e.g. "hello@pascalanderson.com".
function isAdmin(user) {
  const allowed = (process.env.PORTAL_ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = typeof user.email === 'string' ? user.email.toLowerCase() : '';
  return allowed.length > 0 && allowed.includes(email);
}

const ACTIONS = new Set([
  'get-downloads', 'get-upload-url', 'admin-list-clients', 'admin-create-client',
  'admin-delete-client', 'admin-list-files', 'admin-delete-file',
]);

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---------- public ----------
async function getDownloads(origin, clientId) {
  const meta = await portal.readMeta(clientId);
  if (!meta) return fail(origin, 404, 'NOT_FOUND', 'Dieser Download-Link ist ungültig.');
  if (portal.isExpired(meta)) return fail(origin, 410, 'EXPIRED', 'Dieser Download-Link ist abgelaufen.');

  const files = await Promise.all((await portal.listFiles(clientId)).slice(0, 500).map(async (f) => ({
    name: f.name,
    size: f.size,
    url: await portal.signDownload(f.key, f.name, DOWNLOAD_URL_TTL),
  })));
  return ok(origin, {
    title: meta.title || '',
    note: meta.note || '',
    expiryDate: meta.expiryDate,
    linkTtlSeconds: DOWNLOAD_URL_TTL,
    files,
  });
}

// ---------- admin ----------
async function admin(origin, action, body) {
  if (action === 'admin-list-clients') {
    // Housekeeping on every admin visit (plus the daily scheduled run).
    await portal.purgeExpired();
    const clients = await portal.listClients();
    return ok(origin, {
      maxDays: portal.MAX_DAYS,
      clients: clients.filter((c) => c.meta).map((c) => ({
        clientId: c.clientId,
        title: c.meta.title || '',
        note: c.meta.note || '',
        expiryDate: c.meta.expiryDate,
        createdAt: c.meta.createdAt,
        files: c.files,
        bytes: c.bytes,
      })),
    });
  }

  if (action === 'admin-create-client') {
    const title = str(body.title, 120);
    if (!title) return fail(origin, 400, 'INVALID_REQUEST', 'Kundenname fehlt.');
    try {
      const created = await portal.createClient({
        title,
        note: str(body.note, 1000),
        expiryDate: str(body.expiryDate, 10) || undefined,
      });
      return ok(origin, created);
    } catch (err) {
      if (err.code === 'INVALID_EXPIRY') return fail(origin, 400, 'INVALID_EXPIRY', err.message);
      throw err;
    }
  }

  // Everything below works on one existing client.
  const clientId = str(body.clientId, 64).toLowerCase();
  if (!portal.UUID_RE.test(clientId)) return fail(origin, 400, 'INVALID_CLIENT_ID', 'Ungültige Kunden-ID.');

  if (action === 'admin-delete-client') {
    return ok(origin, { deleted: await portal.deleteClient(clientId) });
  }

  const meta = await portal.readMeta(clientId);
  if (!meta) return fail(origin, 404, 'NOT_FOUND', 'Kunde nicht gefunden.');

  if (action === 'admin-list-files') {
    const files = await portal.listFiles(clientId);
    return ok(origin, { files: files.map((f) => ({ name: f.name, size: f.size })) });
  }

  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  if (!portal.FILE_NAME_RE.test(fileName) || fileName.includes('..')) {
    return fail(origin, 400, 'INVALID_FILE_NAME', `Ungültiger Dateiname: ${fileName.slice(0, 80)}`);
  }

  if (action === 'admin-delete-file') {
    await portal.deleteFile(clientId, fileName);
    return ok(origin, { deleted: fileName });
  }

  if (action === 'get-upload-url') {
    if (portal.isExpired(meta)) return fail(origin, 410, 'EXPIRED', 'Dieser Kunde ist abgelaufen.');
    const url = await portal.signUpload(clientId, fileName, UPLOAD_URL_TTL);
    return ok(origin, { url, expiresIn: UPLOAD_URL_TTL });
  }

  return fail(origin, 400, 'INVALID_REQUEST', 'Unknown action.');
}

// ---------- entry point ----------
exports.handler = async (event, context) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  if (origin && !ALLOWED_ORIGINS.has(origin)) return fail('', 403, 'FORBIDDEN_ORIGIN', 'Origin not allowed.');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers(origin), body: '' };
  if (event.httpMethod !== 'POST') return fail(origin, 405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');

  const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) return fail(origin, 400, 'INVALID_REQUEST', 'Expected application/json.');

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  if (raw.length > MAX_BODY_BYTES) return fail(origin, 400, 'INVALID_REQUEST', 'Request too large.');

  let body;
  try { body = JSON.parse(raw); } catch { return fail(origin, 400, 'INVALID_REQUEST', 'Invalid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(origin, 400, 'INVALID_REQUEST', 'Invalid request.');

  const action = body.action;
  if (typeof action !== 'string' || !ACTIONS.has(action)) {
    return fail(origin, 400, 'INVALID_REQUEST', 'Unknown action.');
  }
  try {
    if (action === 'get-downloads') {
      const clientId = str(body.clientId, 64).toLowerCase();
      if (!portal.UUID_RE.test(clientId)) return fail(origin, 400, 'INVALID_CLIENT_ID', 'Dieser Download-Link ist ungültig.');
      return await getDownloads(origin, clientId);
    }

    if (typeof action === 'string' && (action.startsWith('admin-') || action === 'get-upload-url')) {
      // Netlify verifies the Identity JWT signature itself and only then
      // fills clientContext.user; a missing/forged/expired token leaves it
      // empty. On top of that, only allow-listed emails are admins.
      const user = context && context.clientContext && context.clientContext.user;
      if (!user) return fail(origin, 401, 'UNAUTHORIZED', 'Anmeldung erforderlich.');
      if (!isAdmin(user)) return fail(origin, 403, 'FORBIDDEN', 'Kein Zugriff.');
      return await admin(origin, action, body);
    }

    return fail(origin, 400, 'INVALID_REQUEST', 'Unknown action.');
  } catch (err) {
    console.error('client-portal error:', err && err.name); // never log keys, URLs or IDs
    return fail(origin, 500, 'SERVER_ERROR', 'Gerade nicht erreichbar. Bitte später erneut versuchen.');
  }
};
