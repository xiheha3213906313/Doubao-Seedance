const http = require('http');
const https = require('https'); // Added https
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const crypto = require('crypto');

const {
  DEFAULT_PORT,
  ROOT_DIR,
  JSON_DIR,
  CONFIG_FILE,
  DATA_DIR,
  TASKS_DIR,
  TASK_INDEX_FILE,
  ASSETS_DIR,
  IMAGES_DIR,
  ASSETS_INDEX_FILE,
  SEVEN_ZIP_EXE
} = require('./server/config');

const MIME_TYPES = require('./server/mime-types');
const { ensureDirSync, replaceDirContents } = require('./server/utils/fs');
const { safePathJoin } = require('./server/utils/path');
const { readRequestBody, parseJsonBody } = require('./server/utils/request');
const { formatProjectId } = require('./server/utils/time');
const { extFromContentType, guessMimeFromExt, bufferToDataUrl, decodeDataUrl } = require('./server/utils/data-url');

function loadAssetsIndex() {
  try {
    const txt = fs.readFileSync(ASSETS_INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(txt);
    if (parsed && typeof parsed === 'object') {
      const images = parsed.images && typeof parsed.images === 'object' ? parsed.images : {};
      const taskRefs = parsed.taskRefs && typeof parsed.taskRefs === 'object' ? parsed.taskRefs : {};
      return { version: 1, images, taskRefs };
    }
  } catch {}
  return { version: 1, images: {}, taskRefs: {} };
}

function saveAssetsIndex(index) {
  ensureDirSync(ASSETS_DIR);
  fs.writeFileSync(ASSETS_INDEX_FILE, JSON.stringify(index || { version: 1, images: {}, taskRefs: {} }, null, 2), 'utf-8');
}

function hashBufferSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function ensureImageAsset(decoded) {
  if (!decoded || !decoded.buf || !decoded.buf.length) return null;
  ensureDirSync(DATA_DIR);
  ensureDirSync(ASSETS_DIR);
  ensureDirSync(IMAGES_DIR);
  const sha = hashBufferSha256(decoded.buf);
  const ext = decoded.ext || extFromContentType(decoded.mimeType) || '.bin';
  const filename = `${sha}${ext}`;
  const abs = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(abs)) {
    fs.writeFileSync(abs, decoded.buf);
  }
  const key = filename;
  const url = `/data-files/assets/images/${filename}`;
  return { key, url, filename, mimeType: decoded.mimeType };
}

function releaseTaskImageRefs(taskId, assetsIndex) {
  const id = sanitizeTaskId(taskId);
  if (!id) return;
  const refs = Array.isArray(assetsIndex?.taskRefs?.[id]) ? assetsIndex.taskRefs[id] : [];
  if (!refs.length) return;
  for (const key of refs) {
    const meta = assetsIndex.images?.[key];
    if (!meta) continue;
    meta.refCount = Math.max(0, Number(meta.refCount || 0) - 1);
    if (meta.refCount <= 0) {
      try {
        fs.rmSync(path.join(IMAGES_DIR, meta.filename || key), { force: true });
      } catch {}
      delete assetsIndex.images[key];
    } else {
      assetsIndex.images[key] = meta;
    }
  }
  delete assetsIndex.taskRefs[id];
}

function updateTaskImageRefs(taskId, nextRefs, assetsIndex) {
  const id = sanitizeTaskId(taskId);
  if (!id) return;
  const prev = Array.isArray(assetsIndex?.taskRefs?.[id]) ? assetsIndex.taskRefs[id] : [];
  const prevSet = new Set(prev);
  const nextSet = new Set(Array.isArray(nextRefs) ? nextRefs.filter(Boolean) : []);

  for (const key of prevSet) {
    if (nextSet.has(key)) continue;
    const meta = assetsIndex.images?.[key];
    if (!meta) continue;
    meta.refCount = Math.max(0, Number(meta.refCount || 0) - 1);
    if (meta.refCount <= 0) {
      try {
        fs.rmSync(path.join(IMAGES_DIR, meta.filename || key), { force: true });
      } catch {}
      delete assetsIndex.images[key];
    } else {
      assetsIndex.images[key] = meta;
    }
  }

  for (const key of nextSet) {
    if (prevSet.has(key)) continue;
    const meta = assetsIndex.images?.[key] || { filename: key, refCount: 0 };
    meta.refCount = Number(meta.refCount || 0) + 1;
    assetsIndex.images[key] = meta;
  }

  assetsIndex.taskRefs[id] = Array.from(nextSet);
}

function sanitizeTaskId(taskId) {
  const raw = String(taskId || '').trim();
  if (!raw) return '';
  if (raw.length > 200) return raw.slice(0, 200);
  return raw;
}

function loadTaskIndex() {
  try {
    const txt = fs.readFileSync(TASK_INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(txt);
    if (parsed && typeof parsed === 'object' && parsed.map && typeof parsed.map === 'object') return parsed;
  } catch {}
  return { version: 1, map: {} };
}

function saveTaskIndex(index) {
  ensureDirSync(TASKS_DIR);
  fs.writeFileSync(TASK_INDEX_FILE, JSON.stringify(index || { version: 1, map: {} }, null, 2), 'utf-8');
}

function allocateTaskFolderName(taskId, index) {
  const safe = String(taskId || '')
    .trim()
    .replace(/[^\w-]/g, '_')
    .slice(0, 80) || formatProjectId();
  let name = safe;
  let attempt = 0;
  while (true) {
    const exists = fs.existsSync(path.join(TASKS_DIR, name));
    const taken = Object.values(index?.map || {}).includes(name);
    if (!exists && !taken) return name;
    attempt += 1;
    name = `${safe}-${attempt}`;
    if (attempt > 50) return `${formatProjectId()}-${safe}`;
  }
}

function ensureTask(taskId) {
  const id = sanitizeTaskId(taskId);
  if (!id) {
    const err = new Error('Invalid task id');
    err.code = 'E_INVALID_TASK_ID';
    throw err;
  }
  ensureDirSync(DATA_DIR);
  ensureDirSync(TASKS_DIR);
  const index = loadTaskIndex();
  let folder = index.map[id] || '';
  if (!folder || !fs.existsSync(path.join(TASKS_DIR, folder))) {
    folder = allocateTaskFolderName(id, index);
    index.map[id] = folder;
    saveTaskIndex(index);
  }
  const taskDir = path.join(TASKS_DIR, folder);
  ensureDirSync(taskDir);
  const manifestPath = path.join(taskDir, 'manifest.json');
  return { taskId: id, folder, taskDir, manifestPath };
}

function loadTaskManifest(taskId) {
  const { manifestPath, taskId: id } = ensureTask(taskId);
  if (!fs.existsSync(manifestPath)) return { id, createdAt: Date.now(), updatedAt: Date.now() };
  const txt = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(txt);
}

function saveTaskManifest(taskId, manifest) {
  const { manifestPath, taskId: id } = ensureTask(taskId);
  const next = {
    ...(manifest || {}),
    id,
    updatedAt: Date.now()
  };
  if (!next.createdAt) next.createdAt = Date.now();
  fs.writeFileSync(manifestPath, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

function rebuildTaskIndexFromDisk() {
  if (!fs.existsSync(TASKS_DIR)) return;
  const entries = fs.readdirSync(TASKS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  const map = {};
  for (const e of entries) {
    const folder = e.name;
    const manifestPath = path.join(TASKS_DIR, folder, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const txt = fs.readFileSync(manifestPath, 'utf-8');
      const m = JSON.parse(txt);
      const id = sanitizeTaskId(m?.id || '');
      if (!id) continue;
      map[id] = folder;
    } catch {}
  }
  saveTaskIndex({ version: 1, map });
}

function rebuildAssetsIndexFromDisk() {
  if (!fs.existsSync(TASKS_DIR)) return;
  const taskEntries = fs.readdirSync(TASKS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  const taskRefs = {};
  const images = {};

  const extractKey = (u) => {
    const s = String(u || '');
    const prefix = '/data-files/assets/images/';
    if (!s.startsWith(prefix)) return '';
    return s.slice(prefix.length).split('?')[0];
  };

  for (const e of taskEntries) {
    const manifestPath = path.join(TASKS_DIR, e.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const txt = fs.readFileSync(manifestPath, 'utf-8');
      const m = JSON.parse(txt);
      const taskId = sanitizeTaskId(m?.id || '');
      if (!taskId) continue;
      const refs = [];

      const p = m?.params || {};
      const ff = extractKey(p?.firstFrame);
      const lf = extractKey(p?.lastFrame);
      if (ff) refs.push(ff);
      if (lf) refs.push(lf);
      const arr = Array.isArray(p?.referenceImages) ? p.referenceImages : [];
      for (const u of arr) {
        const k = extractKey(u);
        if (k) refs.push(k);
      }

      const unique = Array.from(new Set(refs));
      if (unique.length) taskRefs[taskId] = unique;
      for (const k of unique) {
        images[k] = images[k] || { filename: k, refCount: 0 };
        images[k].refCount += 1;
      }
    } catch {}
  }

  const nextIndex = { version: 1, images, taskRefs };
  if (Object.keys(images).length) {
    ensureDirSync(IMAGES_DIR);
  }

  try {
    if (fs.existsSync(IMAGES_DIR)) {
      const existing = fs.readdirSync(IMAGES_DIR, { withFileTypes: true }).filter((x) => x.isFile()).map((x) => x.name);
      const keep = new Set(Object.keys(images));
      for (const f of existing) {
        if (keep.has(f)) continue;
        try {
          fs.rmSync(path.join(IMAGES_DIR, f), { force: true });
        } catch {}
      }
    }
  } catch {}

  if (Object.keys(images).length || Object.keys(taskRefs).length) {
    saveAssetsIndex(nextIndex);
  } else {
    try {
      fs.rmSync(ASSETS_DIR, { recursive: true, force: true });
    } catch {}
  }
}

function overlayImportData(extractedDataDir) {
  const incomingTasksDir = path.join(extractedDataDir, 'tasks');
  if (fs.existsSync(incomingTasksDir)) {
    ensureDirSync(TASKS_DIR);
    const entries = fs.readdirSync(incomingTasksDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const src = path.join(incomingTasksDir, e.name);
      const dst = path.join(TASKS_DIR, e.name);
      try {
        fs.rmSync(dst, { recursive: true, force: true });
      } catch {}
      try {
        fs.renameSync(src, dst);
      } catch (err) {
        fs.cpSync(src, dst, { recursive: true, force: true });
        try {
          fs.rmSync(src, { recursive: true, force: true });
        } catch {}
      }
    }
  }

  const incomingImagesDir = path.join(extractedDataDir, 'assets', 'images');
  if (fs.existsSync(incomingImagesDir)) {
    ensureDirSync(IMAGES_DIR);
    const entries = fs.readdirSync(incomingImagesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const src = path.join(incomingImagesDir, e.name);
      const dst = path.join(IMAGES_DIR, e.name);
      if (fs.existsSync(dst)) continue;
      try {
        fs.renameSync(src, dst);
      } catch (err) {
        fs.cpSync(src, dst, { force: true });
        try {
          fs.rmSync(src, { force: true });
        } catch {}
      }
    }
  }
}

function pruneTaskIndexAndAssets() {
  if (!fs.existsSync(TASKS_DIR)) return;
  rebuildTaskIndexFromDisk();
  rebuildAssetsIndexFromDisk();
  const folders = fs.readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const folderSet = new Set(folders);
  const index = loadTaskIndex();
  const assetsIndex = loadAssetsIndex();
  let changed = false;

  for (const [taskId, folder] of Object.entries(index.map || {})) {
    if (folderSet.has(folder)) {
      const manifestPath = path.join(TASKS_DIR, folder, 'manifest.json');
      if (fs.existsSync(manifestPath)) continue;
    }
    releaseTaskImageRefs(taskId, assetsIndex);
    delete index.map[taskId];
    changed = true;
  }

  if (changed) {
    saveTaskIndex(index);
    saveAssetsIndex(assetsIndex);
  }
}

function listTaskManifests() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  pruneTaskIndexAndAssets();
  const entries = fs.readdirSync(TASKS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  const out = [];
  for (const e of entries) {
    const manifestPath = path.join(TASKS_DIR, e.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const txt = fs.readFileSync(manifestPath, 'utf-8');
      out.push(JSON.parse(txt));
    } catch {}
  }
  out.sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
  return out;
}

function deleteTaskStorage(taskId) {
  const id = sanitizeTaskId(taskId);
  if (!id) return;
  const index = loadTaskIndex();
  const folder = index.map[id] || '';
  const assetsIndex = loadAssetsIndex();
  releaseTaskImageRefs(id, assetsIndex);
  saveAssetsIndex(assetsIndex);
  if (folder) {
    const abs = path.join(TASKS_DIR, folder);
    try {
      fs.rmSync(abs, { recursive: true, force: true });
    } catch {}
    delete index.map[id];
    try {
      saveTaskIndex(index);
    } catch {}
  }
  try {
    const remaining = fs.existsSync(TASKS_DIR) ? fs.readdirSync(TASKS_DIR).filter((n) => n !== 'index.json') : [];
    if (!remaining.length) {
      fs.rmSync(TASKS_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(DATA_DIR)) {
      const dataRemaining = fs.readdirSync(DATA_DIR);
      if (!dataRemaining.length) fs.rmSync(DATA_DIR, { recursive: true, force: true });
    }
  } catch {}
}

function maybeRewriteLocalImagesInPayload(payload) {
  const next = JSON.parse(JSON.stringify(payload || {}));
  const items = Array.isArray(next?.content) ? next.content : [];
  for (const it of items) {
    if (!it || it.type !== 'image_url') continue;
    const url = it?.image_url?.url;
    if (typeof url !== 'string' || !url) continue;
    let abs = '';
    if (url.startsWith('/task-files/')) {
      const rel = url.slice('/task-files/'.length);
      abs = safePathJoin(TASKS_DIR, rel.replace(/\//g, path.sep));
    } else if (url.startsWith('/data-files/')) {
      const rel = url.slice('/data-files/'.length);
      abs = safePathJoin(DATA_DIR, rel.replace(/\//g, path.sep));
    } else {
      continue;
    }
    const ext = path.extname(abs);
    const mime = guessMimeFromExt(ext);
    const buf = fs.readFileSync(abs);
    it.image_url.url = bufferToDataUrl(buf, mime);
  }
  return next;
}

function runCurlJson({ method, url, authorization, body }) {
  return new Promise((resolve, reject) => {
    const args = ['-sS', '-X', method, url, '-H', 'Authorization: ' + authorization];

    if (method !== 'GET') {
      args.push('-H', 'Content-Type: application/json');
    }
    if (body != null) {
      args.push('--data-binary', '@-');
    }

    args.push('-w', '\n__CURL_HTTP_STATUS__:%{http_code}\n__CURL_CONTENT_TYPE__:%{content_type}');

    const child = spawn('curl', args, { windowsHide: true });
    if (body != null) {
      const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
      child.stdin.write(bodyText);
    }
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(err);
    });
    child.on('close', (code) => {
      const statusMarker = '\n__CURL_HTTP_STATUS__:';
      const statusIndex = stdout.lastIndexOf(statusMarker);
      if (statusIndex < 0) {
        const error = new Error(stderr || `curl exited with code ${code}`);
        error.cause = { code, stdout, stderr };
        reject(error);
        return;
      }

      const bodyText = stdout.slice(0, statusIndex);
      const metaText = stdout.slice(statusIndex + 1);
      const metaLines = metaText.split('\n').map((l) => l.trim()).filter(Boolean);

      const statusLine = metaLines.find((l) => l.startsWith('__CURL_HTTP_STATUS__:')) || '';
      const contentTypeLine = metaLines.find((l) => l.startsWith('__CURL_CONTENT_TYPE__:')) || '';

      const statusCode = Number(statusLine.slice('__CURL_HTTP_STATUS__:'.length));
      const contentType = contentTypeLine.slice('__CURL_CONTENT_TYPE__:'.length).trim() || 'application/json';

      resolve({ statusCode: Number.isFinite(statusCode) ? statusCode : 502, contentType, bodyText, stderr, code });
    });
  });
}

function downloadToFile(remoteUrl, filePath) {
  return new Promise((resolve, reject) => {
    const u = new URL(remoteUrl);
    const client = u.protocol === 'https:' ? https : http;
    const req = client.get(u, (resp) => {
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        resp.resume();
        downloadToFile(resp.headers.location, filePath).then(resolve, reject);
        return;
      }
      if (!resp.statusCode || resp.statusCode < 200 || resp.statusCode >= 300) {
        resp.resume();
        reject(new Error(`Download failed: HTTP ${resp.statusCode || 0}`));
        return;
      }
      ensureDirSync(path.dirname(filePath));
      const out = fs.createWriteStream(filePath);
      resp.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

function run7za(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(SEVEN_ZIP_EXE, args, { windowsHide: true, cwd });
    const OUTPUT_LIMIT = 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    child.stdout.on('data', (c) => {
      if (!c || !c.length) return;
      const remaining = OUTPUT_LIMIT - stdoutBytes;
      if (remaining > 0) {
        const chunk = c.length > remaining ? c.subarray(0, remaining) : c;
        stdout += chunk.toString();
      }
      stdoutBytes += c.length;
    });
    child.stderr.on('data', (c) => {
      if (!c || !c.length) return;
      const remaining = OUTPUT_LIMIT - stderrBytes;
      if (remaining > 0) {
        const chunk = c.length > remaining ? c.subarray(0, remaining) : c;
        stderr += chunk.toString();
      }
      stderrBytes += c.length;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        const err = new Error(`7za failed with code ${code}`);
        err.cause = { code, stdout, stderr, args };
        reject(err);
      }
    });
  });
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  const exportJobs = globalThis.__doubaoSeedanceExportJobs || (globalThis.__doubaoSeedanceExportJobs = new Map());
  const pruneExportJobs = () => {
    const now = Date.now();
    for (const [id, job] of exportJobs.entries()) {
      const ts = Number(job?.createdAt) || 0;
      if (now - ts > 60 * 60 * 1000) {
        try {
          if (job?.tmpDir) fs.rmSync(job.tmpDir, { recursive: true, force: true });
        } catch {}
        exportJobs.delete(id);
      }
    }
  };

  // API Endpoint: Save Config
  if (req.method === 'POST' && pathname === '/api/save-config') {
    parseJsonBody(req)
      .then((data) => {
        // Ensure json directory exists
        ensureDirSync(JSON_DIR);
        // Write file
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Config saved successfully' }));
        console.log('Config saved to:', CONFIG_FILE);
      })
      .catch((err) => {
        console.error('Error saving config:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Failed to save config' }));
      });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/tasks') {
    try {
      const tasks = listTaskManifests();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tasks }));
    } catch (err) {
      console.error('List tasks failed:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Failed to list tasks' } }));
    }
    return;
  }

  if (pathname.startsWith('/api/tasks/')) {
    const parts = pathname.split('/').filter(Boolean);
    const taskId = parts[2] || '';

    if (parts.length === 3 && req.method === 'DELETE') {
      try {
        deleteTaskStorage(taskId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Delete task failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Failed to delete task' } }));
      }
      return;
    }

    if (parts.length === 4 && parts[3] === 'manifest') {
      if (req.method === 'GET') {
        try {
          const manifest = loadTaskManifest(taskId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ taskId: sanitizeTaskId(taskId), manifest }));
        } catch (err) {
          console.error('Read task manifest failed:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Failed to read task manifest' } }));
        }
        return;
      }

      if (req.method === 'POST') {
        parseJsonBody(req)
          .then((body) => {
            const saved = saveTaskManifest(taskId, body || {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ taskId: sanitizeTaskId(taskId), manifest: saved }));
          })
          .catch((err) => {
            console.error('Save task manifest failed:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Failed to save task manifest' } }));
          });
        return;
      }
    }

    if (parts.length === 4 && parts[3] === 'save-inputs' && req.method === 'POST') {
      parseJsonBody(req)
        .then((body) => {
          ensureTask(taskId);
          const assetsIndex = loadAssetsIndex();
          const refsForTask = [];

          const first = decodeDataUrl(body?.firstFrame);
          const last = decodeDataUrl(body?.lastFrame);
          const refs = Array.isArray(body?.referenceImages) ? body.referenceImages : [];

          let firstFrameUrl = '';
          let lastFrameUrl = '';
          const referenceImageUrls = [];

          if (first) {
            const asset = ensureImageAsset(first);
            if (asset) {
              refsForTask.push(asset.key);
              firstFrameUrl = asset.url;
            }
          }
          if (last) {
            const asset = ensureImageAsset(last);
            if (asset) {
              refsForTask.push(asset.key);
              lastFrameUrl = asset.url;
            }
          }

          for (let i = 0; i < refs.length; i++) {
            const decoded = decodeDataUrl(refs[i]);
            if (!decoded) continue;
            const asset = ensureImageAsset(decoded);
            if (!asset) continue;
            refsForTask.push(asset.key);
            referenceImageUrls.push(asset.url);
          }

          updateTaskImageRefs(taskId, refsForTask, assetsIndex);
          saveAssetsIndex(assetsIndex);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ firstFrameUrl, lastFrameUrl, referenceImageUrls }));
        })
        .catch((err) => {
          console.error('Save task inputs failed:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Failed to save task inputs' } }));
        });
      return;
    }

    if (parts.length === 5 && parts[3] === 'videos' && parts[4] === 'download' && req.method === 'POST') {
      parseJsonBody(req)
        .then(async (body) => {
          const remoteUrl = String(body?.url || '').trim();
          const index = Number.isFinite(Number(body?.index)) ? Number(body.index) : 0;
          if (!remoteUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Missing url' } }));
            return;
          }
          const { taskDir, folder } = ensureTask(taskId);
          const u = new URL(remoteUrl);
          const ext = path.extname(u.pathname) || '.mp4';
          const filename = `video-${index + 1}${ext}`;
          const abs = path.join(taskDir, filename);
          await downloadToFile(remoteUrl, abs);
          const url = `/task-files/${folder}/${filename}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ url }));
        })
        .catch((err) => {
          console.error('Download task video failed:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Failed to download task video' } }));
        });
      return;
    }
  }

  // API Endpoint: Proxy Generation Request
  if (req.method === 'POST' && pathname === '/api/generate') {
    parseJsonBody(req)
      .then((payload) => {
        const apiKey = req.headers['authorization']; // Get API Key from header
        if (!apiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Missing Authorization header' } }));
          return;
        }
        const rewritten = maybeRewriteLocalImagesInPayload(payload);
        return runCurlJson({
          method: 'POST',
          url: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
          authorization: apiKey,
          body: rewritten
        })
          .then(({ statusCode, contentType, bodyText }) => {
            res.writeHead(statusCode, { 'Content-Type': contentType });
            res.end(bodyText);
          });
      })
      .catch((e) => {
        console.error('Proxy Error:', e);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message || 'Proxy Error' } }));
      });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/export/start') {
    (async () => {
      try {
        pruneExportJobs();
        if (!fs.existsSync(DATA_DIR)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'No data to export' } }));
          return;
        }
        try {
          fs.rmSync(path.join(DATA_DIR, 'projects'), { recursive: true, force: true });
        } catch {}
        if (!fs.existsSync(SEVEN_ZIP_EXE)) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: `7za not found: ${SEVEN_ZIP_EXE}` } }));
          return;
        }

        const compression = String(reqUrl.searchParams.get('compression') || 'store').toLowerCase();
        const mx = compression === 'max' ? 9 : (compression === 'normal' ? 5 : (compression === 'fast' ? 1 : 0));
        const ts = formatProjectId();
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doubao-seedance-export-'));
        const archiveName = `Doubao-Seedance-data-${ts}.7z`;
        const archivePath = path.join(tmpDir, archiveName);

        const jobId = `exp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        exportJobs.set(jobId, {
          id: jobId,
          createdAt: Date.now(),
          status: 'running',
          tmpDir,
          archiveName,
          archivePath,
          size: null,
          errorMessage: null
        });

        (async () => {
          try {
            if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
            await run7za(['a', '-t7z', `-mx=${mx}`, '-bb0', '-bd', '-bso0', '-bse0', '-bsp0', archivePath, 'data'], ROOT_DIR);
            const stat = fs.statSync(archivePath);
            const job = exportJobs.get(jobId);
            if (!job) return;
            job.status = 'ready';
            job.size = stat.size;
            exportJobs.set(jobId, job);
          } catch (e) {
            const job = exportJobs.get(jobId);
            if (!job) return;
            job.status = 'failed';
            job.errorMessage = e?.message || 'Export failed';
            exportJobs.set(jobId, job);
          }
        })();

        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ jobId, filename: archiveName }));
      } catch (err) {
        console.error('Export start failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Export failed' } }));
      }
    })();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/export/status') {
    pruneExportJobs();
    const jobId = String(reqUrl.searchParams.get('id') || '').trim();
    if (!jobId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Missing id' } }));
      return;
    }
    const job = exportJobs.get(jobId);
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { message: 'Export job not found' } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      id: job.id,
      status: job.status,
      filename: job.archiveName,
      size: job.size,
      errorMessage: job.errorMessage
    }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/export/download') {
    (async () => {
      try {
        pruneExportJobs();
        try {
          req.socket?.setTimeout?.(0);
          res.setTimeout?.(0);
        } catch {}
        const jobId = String(reqUrl.searchParams.get('id') || '').trim();
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Missing id' } }));
          return;
        }
        const job = exportJobs.get(jobId);
        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: { message: 'Export job not found' } }));
          return;
        }
        if (job.status !== 'ready' || !job.archivePath || !fs.existsSync(job.archivePath)) {
          res.writeHead(409, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: { message: 'Export not ready' } }));
          return;
        }

        const stat = fs.statSync(job.archivePath);
        res.writeHead(200, {
          'Content-Type': 'application/x-7z-compressed',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${job.archiveName || 'Doubao-Seedance-data.7z'}"`
        });

        const cleanup = () => {
          try {
            if (job?.tmpDir) fs.rmSync(job.tmpDir, { recursive: true, force: true });
          } catch {}
          exportJobs.delete(jobId);
        };
        res.once('close', cleanup);
        res.once('finish', cleanup);
        fs.createReadStream(job.archivePath).pipe(res);
      } catch (err) {
        console.error('Export download failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Export failed' } }));
      }
    })();
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/generate/')) {
    const apiKey = req.headers['authorization'];
    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Missing Authorization header' } }));
      return;
    }

    const taskId = pathname.slice('/api/generate/'.length).split('?')[0].trim();
    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Missing task id' } }));
      return;
    }

    runCurlJson({
      method: 'GET',
      url: `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      authorization: apiKey
    })
      .then(({ statusCode, contentType, bodyText }) => {
        res.writeHead(statusCode, { 'Content-Type': contentType });
        res.end(bodyText);
      })
      .catch((e) => {
        console.error('Proxy Error:', e);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message || 'Proxy Error' } }));
      });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/export') {
    (async () => {
      try {
        try {
          req.socket?.setTimeout?.(0);
          res.setTimeout?.(0);
        } catch {}
        if (!fs.existsSync(DATA_DIR)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'No data to export' } }));
          return;
        }
        try {
          fs.rmSync(path.join(DATA_DIR, 'projects'), { recursive: true, force: true });
        } catch {}
        if (!fs.existsSync(SEVEN_ZIP_EXE)) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: `7za not found: ${SEVEN_ZIP_EXE}` } }));
          return;
        }
        const compression = String(reqUrl.searchParams.get('compression') || 'store').toLowerCase();
        const mx = compression === 'max' ? 9 : (compression === 'normal' ? 5 : (compression === 'fast' ? 1 : 0));
        const ts = formatProjectId();
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doubao-seedance-export-'));
        const archiveName = `Doubao-Seedance-data-${ts}.7z`;
        const archivePath = path.join(tmpDir, archiveName);
        if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
        await run7za(['a', '-t7z', `-mx=${mx}`, '-bb0', '-bd', '-bso0', '-bse0', '-bsp0', archivePath, 'data'], ROOT_DIR);
        const stat = fs.statSync(archivePath);
        res.writeHead(200, {
          'Content-Type': 'application/x-7z-compressed',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${archiveName}"`
        });
        const cleanup = () => {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {}
        };
        res.once('close', cleanup);
        res.once('finish', cleanup);
        fs.createReadStream(archivePath).pipe(res);
      } catch (err) {
        console.error('Export failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Export failed' } }));
      }
    })();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/import') {
    (async () => {
      try {
        ensureDirSync(DATA_DIR);
        if (!fs.existsSync(SEVEN_ZIP_EXE)) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: `7za not found: ${SEVEN_ZIP_EXE}` } }));
          return;
        }
        const filename = String(req.headers['x-filename'] || 'import.7z');
        const ext = path.extname(filename).toLowerCase() || '.7z';
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doubao-seedance-import-'));
        const archivePath = path.join(tmpRoot, `upload${ext}`);
        const buf = await readRequestBody(req);
        fs.writeFileSync(archivePath, buf);
        const extractDir = path.join(tmpRoot, 'extracted');
        ensureDirSync(extractDir);
        await run7za(['x', archivePath, `-o${extractDir}`, '-y'], tmpRoot);
        const extractedDataDir = path.join(extractDir, 'data');
        const tasksDir = path.join(extractedDataDir, 'tasks');
        if (!fs.existsSync(extractedDataDir) || !fs.existsSync(tasksDir)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid archive: missing data/tasks' } }));
          return;
        }

        overlayImportData(extractedDataDir);
        pruneTaskIndexAndAssets();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Import failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Import failed' } }));
      }
    })();
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/data-files/')) {
    try {
      const rel = pathname.slice('/data-files/'.length);
      const abs = safePathJoin(DATA_DIR, rel.replace(/\//g, path.sep));
      const extname = path.extname(abs);
      const contentType = guessMimeFromExt(extname);
      fs.readFile(abs, (err, content) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404);
            res.end('404 Not Found');
          } else {
            res.writeHead(500);
            res.end('500 Internal Server Error');
          }
          return;
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(content);
      });
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid file path' } }));
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/task-files/')) {
    try {
      const rel = pathname.slice('/task-files/'.length);
      const abs = safePathJoin(TASKS_DIR, rel.replace(/\//g, path.sep));
      const extname = path.extname(abs);
      const contentType = guessMimeFromExt(extname);
      fs.readFile(abs, (err, content) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404);
            res.end('404 Not Found');
          } else {
            res.writeHead(500);
            res.end('500 Internal Server Error');
          }
          return;
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(content);
      });
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid file path' } }));
    }
    return;
  }

  // Serve Static Files
  let filePath = path.join(ROOT_DIR, pathname === '/' ? 'index.html' : pathname);
  const extname = path.extname(filePath);
  let contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('500 Internal Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    }
  });
});

function startServer(port, attempt = 0) {
  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attempt < 20) {
      startServer(port + 1, attempt + 1);
      return;
    }
    throw err;
  });

  server.listen(port, () => {
    try {
      fs.rmSync(path.join(DATA_DIR, 'current-project.txt'), { force: true });
    } catch (e) {
      console.warn('Failed to cleanup current project file:', e);
    }
    try {
      fs.rmSync(path.join(DATA_DIR, 'projects'), { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to cleanup legacy projects dir:', e);
    }
    try {
      pruneTaskIndexAndAssets();
    } catch (e) {
      console.warn('Failed to prune task index:', e);
    }
    console.log(`Server running at http://localhost:${port}/`);
    console.log(`Saving config to: ${CONFIG_FILE}`);
  });
}

startServer(DEFAULT_PORT);
