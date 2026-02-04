const path = require('path');

function safePathJoin(baseDir, ...segments) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, ...segments);
  if (resolvedTarget === resolvedBase) return resolvedTarget;
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    const err = new Error('Path traversal detected');
    err.code = 'E_PATH_TRAVERSAL';
    throw err;
  }
  return resolvedTarget;
}

module.exports = { safePathJoin };
