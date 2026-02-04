const fs = require('fs');
const path = require('path');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function replaceDirContents(targetDir, sourceDir) {
  ensureDirSync(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const e of entries) {
    const src = path.join(sourceDir, e.name);
    const dst = path.join(targetDir, e.name);
    try {
      fs.rmSync(dst, { recursive: true, force: true });
    } catch {}
    try {
      fs.renameSync(src, dst);
    } catch (err) {
      if (err && (err.code === 'EPERM' || err.code === 'EXDEV')) {
        fs.cpSync(src, dst, { recursive: true, force: true });
        try {
          fs.rmSync(src, { recursive: true, force: true });
        } catch {}
      } else {
        throw err;
      }
    }
  }
}

module.exports = { ensureDirSync, replaceDirContents };
