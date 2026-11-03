// Daily scheduled cleanup (schedule set in netlify.toml): deletes every
// expired client delivery from R2 — the photos and the client's name —
// so nothing is kept longer than the link is valid. The R2 lifecycle
// rule (30 days) stays as a second safety net.
// Scheduled functions can't be triggered by a public URL in production.
const portal = require('../lib/portal');

exports.handler = async () => {
  try {
    const result = await portal.purgeExpired();
    console.log(`client-portal-cleanup: removed ${result.clients} expired client(s), ${result.objects} object(s)`);
    return { statusCode: 200 };
  } catch (err) {
    console.error('client-portal-cleanup error:', err && err.name);
    return { statusCode: 500 };
  }
};
