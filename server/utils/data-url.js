const MIME_TYPES = require('../mime-types');

function extFromContentType(contentType) {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct === 'image/png') return '.png';
  if (ct === 'image/jpeg') return '.jpg';
  if (ct === 'image/webp') return '.webp';
  if (ct === 'image/gif') return '.gif';
  if (ct === 'video/mp4') return '.mp4';
  if (ct === 'video/webm') return '.webm';
  if (ct === 'video/quicktime') return '.mov';
  return '';
}

function guessMimeFromExt(ext) {
  return MIME_TYPES[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

function bufferToDataUrl(buf, mimeType) {
  const mt = mimeType || 'application/octet-stream';
  const b64 = buf.toString('base64');
  return `data:${mt};base64,${b64}`;
}

function decodeDataUrl(dataUrl) {
  const text = String(dataUrl || '').trim();
  if (!text.startsWith('data:')) return null;
  const idx = text.indexOf(',');
  if (idx < 0) return null;
  const meta = text.slice(5, idx);
  const data = text.slice(idx + 1);
  const [mimePart, ...rest] = meta.split(';');
  const mimeType = (mimePart || 'application/octet-stream').trim();
  const isBase64 = rest.includes('base64');
  if (!isBase64) return null;
  const buf = Buffer.from(data, 'base64');
  const ext = extFromContentType(mimeType) || '';
  return { mimeType, buf, ext };
}

module.exports = { extFromContentType, guessMimeFromExt, bufferToDataUrl, decodeDataUrl };
