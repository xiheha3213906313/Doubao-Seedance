function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJsonBody(req) {
  return readRequestBody(req).then((buf) => {
    if (!buf || !buf.length) return null;
    const text = buf.toString('utf-8');
    return JSON.parse(text);
  });
}

module.exports = { readRequestBody, parseJsonBody };
