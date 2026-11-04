// Shared R2 logic for the client download portal. Lives OUTSIDE
// netlify/functions so Netlify doesn't try to deploy it as a function;
// esbuild bundles it into each function that require()s it.
//
// Storage layout in the R2 bucket (nothing about clients is in git):
//   clients/<uuid>/.meta.json   → { title, note, expiryDate, createdAt }
//   clients/<uuid>/<file>       → the delivered photos
//   clients/<uuid>/.thumbs/<file>.jpg → small preview (~1200 px JPEG),
//                                  made in the admin's browser on upload
//
// Secrets come only from Netlify environment variables and are used
// only in this server-side module. Nothing here is ever sent to a browser
// except short-lived pre-signed URLs (which contain the public access-key
// ID and a signature, never the secret key).
//
// DATA RETENTION (GDPR Art. 5(1)(c)/(e) — data minimisation, storage
// limitation). Three independent layers make sure client photos and
// names never outlive their purpose:
//   1. Expiry date: max MAX_DAYS (30) days after creation, enforced on
//      create. After that day the public link answers 410 EXPIRED.
//   2. Active purge: purgeExpired() deletes every expired client (files
//      + .meta.json) daily via the scheduled function
//      client-portal-cleanup, and on every admin page load.
//   3. R2 lifecycle rule (Cloudflare dashboard, NOT in code): prefix
//      "clients/", delete objects 30 days after upload — a safety net
//      that works even if Netlify/this code is down or misconfigured.
//      Keep MAX_DAYS and that rule in sync.

const crypto = require('crypto');
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const ROOT = 'clients/';
const META = '.meta.json';
const THUMBS = '.thumbs/';
const thumbKey = (clientId, fileName) => `${ROOT}${clientId}/${THUMBS}${fileName}.jpg`;
const MAX_DAYS = 30; // must match the R2 lifecycle rule on "clients/"

// UUIDv4 only (crypto.randomUUID(): 122 random bits from the OS CSPRNG).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Bare file name only: no slashes, no "..", no leading dot (so ".meta.json"
// can never be overwritten), known extension. Rejected, never "cleaned".
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,150}\.(jpe?g|png|tiff?|heic|webp|dng|arw|cr3|nef|zip|pdf|mp4|mov)$/i;

let s3;
function client() {
  if (s3) return s3;
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error('R2 environment variables missing');
  }
  s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return s3;
}
const bucket = () => process.env.R2_BUCKET_NAME;

// ---------- dates ----------
const todayUtc = () => new Date().toISOString().slice(0, 10);
function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}
// Expired once the expiry day is over (UTC end of day — errs a few hours
// generous, never short).
function isExpired(meta) {
  if (!meta || !isValidDate(meta.expiryDate)) return true;
  return Date.now() > new Date(`${meta.expiryDate}T23:59:59Z`).getTime();
}

// ---------- low-level ----------
async function listAll(prefix) {
  const out = [];
  let ContinuationToken;
  do {
    const page = await client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken }));
    for (const o of page.Contents || []) out.push({ key: o.Key, size: o.Size || 0, lastModified: o.LastModified });
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}

async function readMeta(clientId) {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: `${ROOT}${clientId}/${META}` }));
    return JSON.parse(await res.Body.transformToString('utf-8'));
  } catch (err) {
    if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return null;
    throw err;
  }
}

async function deleteKeys(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await client().send(new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));
  }
}

// ---------- clients ----------
async function createClient({ title, note, expiryDate }) {
  const today = todayUtc();
  const maxDate = addDays(today, MAX_DAYS);
  const expiry = expiryDate || maxDate;
  if (!isValidDate(expiry) || expiry < today || expiry > maxDate) {
    const e = new Error(`Ablaufdatum muss zwischen heute und ${maxDate} liegen.`);
    e.code = 'INVALID_EXPIRY';
    throw e;
  }
  const clientId = crypto.randomUUID(); // 122 bits from the OS CSPRNG
  const meta = { title, note, expiryDate: expiry, createdAt: new Date().toISOString() };
  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: `${ROOT}${clientId}/${META}`,
    Body: JSON.stringify(meta),
    ContentType: 'application/json',
  }));
  return { clientId, ...meta };
}

// Every client, with file count/size, sorted newest first.
async function listClients() {
  const objects = await listAll(ROOT);
  const byId = new Map();
  for (const o of objects) {
    const [id, ...rest] = o.key.slice(ROOT.length).split('/');
    const name = rest.join('/');
    if (!byId.has(id)) byId.set(id, { clientId: id, files: 0, bytes: 0, hasMeta: false });
    const c = byId.get(id);
    if (name === META) c.hasMeta = true;
    else if (name && !name.includes('/')) { c.files += 1; c.bytes += o.size; } // previews don't count
  }
  const clients = await Promise.all([...byId.values()].map(async (c) => {
    const meta = c.hasMeta && UUID_RE.test(c.clientId) ? await readMeta(c.clientId) : null;
    return { ...c, meta, expired: isExpired(meta) };
  }));
  return clients.sort((a, b) => String(b.meta?.createdAt || '').localeCompare(String(a.meta?.createdAt || '')));
}

// Delivered files of one client. thumbKey is set when a preview exists.
async function listFiles(clientId) {
  const prefix = `${ROOT}${clientId}/`;
  const all = (await listAll(prefix)).map((o) => ({ ...o, name: o.key.slice(prefix.length) }));
  const thumbs = new Set(all.filter((o) => o.name.startsWith(THUMBS)).map((o) => o.key));
  return all
    .filter((o) => o.name && o.name !== META && !o.name.includes('/'))
    .map((o) => {
      const t = thumbKey(clientId, o.name);
      return { ...o, thumbKey: thumbs.has(t) ? t : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
}

async function deleteClient(clientId) {
  const keys = (await listAll(`${ROOT}${clientId}/`)).map((o) => o.key);
  await deleteKeys(keys);
  return keys.length;
}

async function deleteFile(clientId, fileName) {
  await deleteKeys([`${ROOT}${clientId}/${fileName}`, thumbKey(clientId, fileName)]);
}

// Deletes every expired client, and any folder whose .meta.json is gone
// (e.g. removed by the R2 lifecycle rule) — data minimisation: nothing
// stays stored once the link no longer works.
async function purgeExpired() {
  const clients = await listClients();
  const doomed = clients.filter((c) => c.expired);
  let deleted = 0;
  for (const c of doomed) deleted += await deleteClient(c.clientId);
  return { clients: doomed.length, objects: deleted };
}

// ---------- signed URLs ----------
const signDownload = (key, name, expiresIn) => getSignedUrl(
  client(),
  new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  }),
  { expiresIn }
);
const signUpload = (clientId, fileName, expiresIn) => getSignedUrl(
  client(),
  new PutObjectCommand({ Bucket: bucket(), Key: `${ROOT}${clientId}/${fileName}` }),
  { expiresIn }
);
// Previews are shown inline in an <img>, so no attachment disposition.
const signThumb = (key, expiresIn) => getSignedUrl(
  client(),
  new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentType: 'image/jpeg' }),
  { expiresIn }
);
const signThumbUpload = (clientId, fileName, expiresIn) => getSignedUrl(
  client(),
  new PutObjectCommand({ Bucket: bucket(), Key: thumbKey(clientId, fileName) }),
  { expiresIn }
);

module.exports = {
  UUID_RE, FILE_NAME_RE, MAX_DAYS,
  isExpired, readMeta, createClient, listClients, listFiles,
  deleteClient, deleteFile, purgeExpired, signDownload, signUpload,
  signThumb, signThumbUpload,
};
