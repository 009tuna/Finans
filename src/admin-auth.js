// Yazma işlemleri (refresh, portföy kaydetme) için basit admin parolası koruması.
// Header: x-admin-secret: <ADMIN_SECRET>  (veya Authorization: Bearer <ADMIN_SECRET>)
'use strict';

/**
 * İsteğin yetkili olup olmadığını döner.
 * - ADMIN_SECRET tanımlıysa: header'daki değerle eşleşmeli.
 * - ADMIN_SECRET tanımlı DEĞİLse:
 *     • Vercel/üretimde  → reddet (secure-by-default; parola koymayı unutmaya karşı).
 *     • Yerel geliştirmede → izin ver (frictionless dev).
 */
function isAuthorized(req) {
  const required = process.env.ADMIN_SECRET;
  if (!required) {
    return !process.env.VERCEL; // prod'da kapalı, local'de açık
  }
  const headers = (req && req.headers) || {};
  const provided = headers['x-admin-secret']
    || String(headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  return provided === required;
}

module.exports = { isAuthorized };
