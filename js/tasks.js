const TASKS_STORAGE_KEY = 'generationTasksV1';
let tasks = [];
let currentOpenTaskId = null;
let taskFeedFilters = {
  starredOnly: false,
  modelId: 'all'
};
const TASK_FEED_LAYOUT_STORAGE_KEY = 'taskFeedLayoutV1';
let taskFeedLayout = 'list';
let taskGridEditHoverTimer = null;
let taskGridEditHoverToken = 0;
const taskPollingState = {
  active: new Set(),
  started: false
};

function normalizeTaskFeedLayout(layout) {
  return layout === 'grid' ? 'grid' : 'list';
}

function syncTaskLayoutControls() {
  const listBtn = document.getElementById('taskLayoutListBtn');
  const gridBtn = document.getElementById('taskLayoutGridBtn');
  if (listBtn) listBtn.setAttribute('aria-pressed', String(taskFeedLayout === 'list'));
  if (gridBtn) gridBtn.setAttribute('aria-pressed', String(taskFeedLayout === 'grid'));
}

function applyTaskFeedLayoutClass() {
  const feed = document.getElementById('taskFeed');
  if (!feed) return;
  feed.classList.toggle('task-feed-grid', taskFeedLayout === 'grid');
  syncTaskLayoutControls();
}

function setTaskFeedLayout(layout) {
  const next = normalizeTaskFeedLayout(layout);
  if (taskFeedLayout === next) return;
  taskFeedLayout = next;
  try {
    localStorage.setItem(TASK_FEED_LAYOUT_STORAGE_KEY, taskFeedLayout);
  } catch {}
  applyTaskFeedLayoutClass();
  renderTaskFeed();
}

function initTaskFeedLayoutToggle() {
  let saved = 'list';
  try {
    saved = localStorage.getItem(TASK_FEED_LAYOUT_STORAGE_KEY) || 'list';
  } catch {}
  taskFeedLayout = normalizeTaskFeedLayout(saved);
  applyTaskFeedLayoutClass();

  const wrap = document.getElementById('taskLayoutToggle');
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = '1';
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.task-layout-btn');
    if (!btn) return;
    const layout = btn.dataset.layout || 'list';
    setTaskFeedLayout(layout);
  });
}

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  const contentType = resp.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await resp.json() : await resp.text();
  if (!resp.ok) {
    const message = isJson ? (body?.error?.message || `HTTP ${resp.status}`) : `HTTP ${resp.status}`;
    throw new Error(message);
  }
  return body;
}

function sanitizeTaskForStorage(task) {
  if (!task || typeof task !== 'object') return task;
  const next = { ...task };
  const params = next.params && typeof next.params === 'object' ? { ...next.params } : null;
  if (params) {
    if (typeof params.firstFrame === 'string' && params.firstFrame.startsWith('data:')) params.firstFrame = null;
    if (typeof params.lastFrame === 'string' && params.lastFrame.startsWith('data:')) params.lastFrame = null;
    if (Array.isArray(params.referenceImages)) {
      params.referenceImages = params.referenceImages.filter((u) => !(typeof u === 'string' && u.startsWith('data:')));
    }
    next.params = params;
  }
  if (Array.isArray(next.images)) {
    next.images = next.images
      .map((it) => {
        if (!it || typeof it !== 'object') return it;
        if (typeof it.url === 'string' && it.url.startsWith('data:')) return { ...it, url: '' };
        return it;
      })
      .filter(Boolean);
  }
  return next;
}

async function saveTaskRecord(task) {
  const taskId = task?.id;
  if (!taskId) return;
  await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/manifest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizeTaskForStorage(task))
  });
}

async function deleteTaskRecord(taskId) {
  if (!taskId) return;
  await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

async function saveTaskInputs(taskId, snapshot) {
  if (!taskId) return null;
  const body = {
    firstFrame: snapshot?.firstFrame || null,
    lastFrame: snapshot?.lastFrame || null,
    referenceImages: Array.isArray(snapshot?.referenceImages) ? snapshot.referenceImages : []
  };
  return await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/save-inputs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function downloadTaskVideo(taskId, index, url) {
  return await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/videos/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, index })
  });
}

async function fetchGenerationTaskStatus(apiKey, taskId) {
  const url = `/api/generate/${encodeURIComponent(taskId)}`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `Polling failed: ${resp.status}`);
  }
  return await resp.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function refreshTaskDetailIfOpen(taskId) {
  if (!taskId) return;
  if (currentOpenTaskId !== taskId) return;
  const overlay = document.getElementById('taskDetailOverlay');
  if (!overlay || overlay.hidden || !overlay.classList.contains('active')) return;
  const video = document.getElementById('taskDetailVideo');
  const prevSrc = video?.currentSrc || video?.src || '';
  const prevTime = Number.isFinite(Number(video?.currentTime)) ? Number(video.currentTime) : 0;
  const prevPlaying = !!(video && !video.paused && !video.ended);

  openTaskDetail(taskId);

  if (!video) return;
  const nextSrc = video.currentSrc || video.src || '';
  if (!nextSrc || !prevTime) return;

  const seekTo = (t) => {
    try {
      const dur = Number.isFinite(Number(video.duration)) ? Number(video.duration) : null;
      const clamped = dur ? Math.min(Math.max(0, t), Math.max(0, dur - 0.2)) : Math.max(0, t);
      video.currentTime = clamped;
    } catch {}
  };

  if (video.readyState >= 1) {
    seekTo(prevTime);
    if (prevPlaying) video.play().catch(() => {});
    return;
  }

  const onMeta = () => {
    video.removeEventListener('loadedmetadata', onMeta);
    seekTo(prevTime);
    if (prevPlaying) video.play().catch(() => {});
  };
  video.addEventListener('loadedmetadata', onMeta);
}

async function pollAndUpdateTask(apiKey, taskId) {
  if (!taskId) return;
  if (taskPollingState.active.has(taskId)) return;
  taskPollingState.active.add(taskId);
  const POLLING_INTERVAL = 2000;
  const MAX_ATTEMPTS = 150;
  let attempts = 0;
  try {
    while (attempts < MAX_ATTEMPTS) {
      try {
        const data = await fetchGenerationTaskStatus(apiKey, taskId);
        const status = data?.status;
        if (status === 'succeeded') {
          if (window.Tasks?.markTaskSucceeded) await window.Tasks.markTaskSucceeded(taskId, data);
          return;
        }
        if (status === 'failed') {
          const msg = data?.error?.message || data?.content?.error?.message || data?.result?.error?.message || 'Task failed';
          if (window.Tasks?.markTaskFailed) await window.Tasks.markTaskFailed(taskId, msg);
          return;
        }
      } catch (e) {
        console.warn('Polling error (retrying):', e);
      }
      await sleep(POLLING_INTERVAL);
      attempts++;
    }
  } finally {
    taskPollingState.active.delete(taskId);
  }
}

async function resumePendingTaskPolling() {
  if (taskPollingState.started) return;
  taskPollingState.started = true;
  try {
    const apiKey = await window.Storage?.get?.('apiKey');
    if (!apiKey) return;
    const pending = tasks
      .filter((t) => t && t.id && t.status !== 'succeeded' && t.status !== 'failed')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    pending.forEach((t, i) => {
      setTimeout(() => {
        pollAndUpdateTask(apiKey, t.id);
      }, i * 200);
    });
  } catch (e) {
    console.warn('Failed to resume task polling:', e);
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTaskTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function safeText(text) {
  return typeof text === 'string' ? text : '';
}

function getTaskModelId(task) {
  return task?.params?.model || task?.model || '';
}

function getTaskModelFilterName(modelId) {
  if (!modelId || modelId === 'all') return '全部';
  const opts = document.querySelectorAll('#modelSelector .model-option');
  for (const opt of opts) {
    if ((opt.dataset.model || '') !== modelId) continue;
    const name = opt.querySelector('.model-option-name')?.textContent?.trim();
    if (name) return name;
  }
  return modelId;
}

function updateTaskModelFilterText() {
  const textEl = document.getElementById('taskModelFilterText');
  if (!textEl) return;
  textEl.textContent = `视频模型 - ${getTaskModelFilterName(taskFeedFilters.modelId)}`;
}

function syncTaskFilterControls() {
  const starBtn = document.getElementById('taskStarFilterBtn');
  if (starBtn) starBtn.setAttribute('aria-pressed', String(!!taskFeedFilters.starredOnly));
  updateTaskModelFilterText();

  const dropdown = document.getElementById('taskModelFilterDropdown');
  if (!dropdown) return;
  dropdown.querySelectorAll('.task-filter-model-option').forEach((el) => {
    el.classList.toggle('active', (el.dataset.modelId || 'all') === taskFeedFilters.modelId);
  });
}

function buildTaskModelFilterDropdown() {
  const dropdown = document.getElementById('taskModelFilterDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  const models = [{ id: 'all', name: '全部' }];
  document.querySelectorAll('#modelSelector .model-option').forEach((opt) => {
    const id = opt.dataset.model || '';
    if (!id) return;
    const name = opt.querySelector('.model-option-name')?.textContent?.trim() || id;
    models.push({ id, name });
  });

  const frag = document.createDocumentFragment();
  for (const m of models) {
    const item = document.createElement('div');
    item.className = 'task-filter-model-option';
    item.dataset.modelId = m.id;
    item.textContent = m.name;
    if (m.id === taskFeedFilters.modelId) item.classList.add('active');
    frag.appendChild(item);
  }
  dropdown.appendChild(frag);
}

function initTaskFeedFilters() {
  const starBtn = document.getElementById('taskStarFilterBtn');
  const modelSelector = document.getElementById('taskModelFilterSelector');
  if (!starBtn || !modelSelector) return;
  if (modelSelector.dataset.bound) return;
  modelSelector.dataset.bound = '1';

  buildTaskModelFilterDropdown();
  syncTaskFilterControls();

  starBtn.addEventListener('click', () => {
    taskFeedFilters.starredOnly = !taskFeedFilters.starredOnly;
    syncTaskFilterControls();
    renderTaskFeed();
  });

  modelSelector.addEventListener('click', (e) => {
    const opt = e.target.closest('.task-filter-model-option');
    if (opt && modelSelector.contains(opt)) {
      const modelId = opt.dataset.modelId || 'all';
      taskFeedFilters.modelId = modelId;
      modelSelector.classList.remove('active');
      syncTaskFilterControls();
      renderTaskFeed();
      e.stopPropagation();
      return;
    }
    modelSelector.classList.toggle('active');
    e.stopPropagation();
  });

  document.addEventListener('click', (e) => {
    if (!modelSelector.classList.contains('active')) return;
    if (modelSelector.contains(e.target)) return;
    modelSelector.classList.remove('active');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    modelSelector.classList.remove('active');
  });

  window.addEventListener('wheel', () => {
    modelSelector.classList.remove('active');
  }, { passive: true });
}

function getTokenEstimateSnapshot() {
  const tokenEl = document.getElementById('tokenValue');
  const priceEl = document.getElementById('tokenPriceDisplay');
  const rawTokens = tokenEl?.textContent?.trim() || '--';
  const tokens = rawTokens === '--' ? null : Number(rawTokens.replace(/,/g, ''));
  const priceText = priceEl?.textContent?.replace(/\s+/g, ' ')?.trim() || '';
  return {
    tokens: Number.isFinite(tokens) ? tokens : null,
    priceText
  };
}

function getActiveModelDisplay() {
  const name = document.querySelector('.model-name')?.textContent?.trim() || '';
  const version = document.querySelector('.model-version')?.textContent?.trim() || '';
  return `${name}${version ? ` (${version})` : ''}`.trim() || '-';
}

function extractImagesFromPayload(payload) {
  const items = Array.isArray(payload?.content) ? payload.content : [];
  const images = [];
  for (const it of items) {
    if (it?.type !== 'image_url') continue;
    const url = it?.image_url?.url;
    if (!url) continue;
    images.push({
      role: it.role || '',
      url
    });
  }
  return images;
}

function extractVideoUrlsFromResult(result) {
  const direct = result?.content?.video_url || result?.result?.video_url;
  if (typeof direct === 'string' && direct) return [direct];
  const list = result?.content?.video_urls || result?.result?.video_urls || result?.content?.videos || result?.result?.videos;
  if (Array.isArray(list)) {
    const urls = [];
    for (const v of list) {
      if (typeof v === 'string') urls.push(v);
      else if (v?.url) urls.push(v.url);
      else if (v?.video_url) urls.push(v.video_url);
    }
    return urls.filter(Boolean);
  }
  return [];
}

function findTaskIndex(taskId) {
  return tasks.findIndex(t => t.id === taskId);
}

async function persistTasks() {
  try {
    await Promise.all(tasks.map((t) => saveTaskRecord(t).catch(() => null)));
  } catch (e) {
    console.warn('Failed to save tasks:', e);
  }
}

function applyTaskEmptyState() {
  const title = document.getElementById('generateEmptyTitle');
  const feed = document.getElementById('taskFeed');
  const toolbar = document.getElementById('taskFeedToolbar');
  const area = document.getElementById('generateArea');
  const has = tasks.length > 0;
  if (title) title.hidden = has;
  if (feed) feed.hidden = !has;
  if (toolbar) toolbar.hidden = !has;
  if (area) area.classList.toggle('has-tasks', has);
}

function buildChip(text) {
  const chip = document.createElement('span');
  chip.className = 'task-chip';
  chip.textContent = text;
  return chip;
}

function findTaskImageUrlByRole(task, role) {
  const images = Array.isArray(task?.images) ? task.images : [];
  for (const img of images) {
    if (img?.role === role && img?.url) return img.url;
  }
  return '';
}

let taskFramePreviewPopover = null;
let taskFramePreviewHoverTimer = null;
let taskFramePreviewHoverToken = 0;
let taskFramePreviewRenderToken = 0;

function getTaskFramePreviewPopover() {
  if (taskFramePreviewPopover) return taskFramePreviewPopover;
  const el = document.createElement('div');
  el.className = 'task-frame-preview-popover';
  const grid = document.createElement('div');
  grid.className = 'task-frame-preview-grid';
  el.appendChild(grid);
  document.body.appendChild(el);
  taskFramePreviewPopover = el;

  window.addEventListener('resize', () => {
    el.classList.remove('active');
  });
  window.addEventListener('scroll', () => {
    el.classList.remove('active');
  }, true);

  return el;
}

function showTaskFramePreviewPopover(anchor, items) {
  if (!anchor || !Array.isArray(items) || items.length === 0) return;
  const popover = getTaskFramePreviewPopover();
  const grid = popover.querySelector('.task-frame-preview-grid');
  if (!grid) return;
  grid.innerHTML = '';
  taskFramePreviewRenderToken += 1;
  const renderToken = taskFramePreviewRenderToken;
  const imgs = [];
  for (const it of items) {
    if (!it?.url) continue;
    const img = document.createElement('img');
    img.className = 'task-frame-preview-img';
    img.src = it.url;
    img.alt = it.alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    grid.appendChild(img);
    imgs.push(img);
  }
  if (!grid.children.length) return;

  popover.classList.remove('active');

  const waitForImage = (img) => new Promise((resolve) => {
    if (img.complete) return resolve();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    if (typeof img.decode === 'function') {
      img.decode().then(done).catch(() => {});
    }
  });

  Promise.all(imgs.map(waitForImage)).then(() => {
    if (renderToken !== taskFramePreviewRenderToken) return;
    if (!document.body.contains(anchor)) return;

    requestAnimationFrame(() => {
      if (renderToken !== taskFramePreviewRenderToken) return;
      const rect = anchor.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const popWidth = popRect.width;
      const popHeight = popRect.height;
      const gap = 10;

      popover.style.position = 'fixed';
      popover.style.zIndex = '9999';

      const preferBelow = rect.bottom + gap + popHeight <= window.innerHeight;
      const canAbove = rect.top - gap - popHeight >= 0;
      const top = preferBelow || !canAbove
        ? rect.bottom + gap
        : rect.top - gap - popHeight;

      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - popWidth - 8));

      popover.style.top = `${Math.max(8, Math.min(top, window.innerHeight - popHeight - 8))}px`;
      popover.style.left = `${left}px`;

      requestAnimationFrame(() => {
        if (renderToken !== taskFramePreviewRenderToken) return;
        popover.classList.add('active');
      });
    });
  });
}

function hideTaskFramePreviewPopover() {
  if (!taskFramePreviewPopover) return;
  taskFramePreviewRenderToken += 1;
  taskFramePreviewPopover.classList.remove('active');
}

function buildFrameChip(task, label) {
  const firstUrl = findTaskImageUrlByRole(task, 'first_frame');
  const lastUrl = findTaskImageUrlByRole(task, 'last_frame');
  const urls = [];
  if (firstUrl) urls.push({ url: firstUrl, alt: '首帧' });
  if (label === '首尾帧' && lastUrl) urls.push({ url: lastUrl, alt: '尾帧' });

  if (!urls.length) return buildChip(label);

  const chip = document.createElement('span');
  chip.className = 'task-frame-chip';

  const thumbs = document.createElement('span');
  thumbs.className = 'task-frame-thumbs';
  if (urls.length >= 2) thumbs.classList.add('dual');

  for (const it of urls) {
    const img = document.createElement('img');
    img.className = 'task-frame-thumb';
    img.src = it.url;
    img.alt = it.alt;
    img.loading = 'lazy';
    thumbs.appendChild(img);
  }

  const text = document.createElement('span');
  text.className = 'task-frame-chip-text';
  text.textContent = label;

  chip.appendChild(thumbs);
  chip.appendChild(text);

  chip.addEventListener('mouseenter', () => {
    taskFramePreviewHoverToken += 1;
    const token = taskFramePreviewHoverToken;
    if (taskFramePreviewHoverTimer) clearTimeout(taskFramePreviewHoverTimer);
    taskFramePreviewHoverTimer = setTimeout(() => {
      if (token !== taskFramePreviewHoverToken) return;
      showTaskFramePreviewPopover(chip, urls);
    }, 150);
  });
  chip.addEventListener('mouseleave', () => {
    taskFramePreviewHoverToken += 1;
    if (taskFramePreviewHoverTimer) clearTimeout(taskFramePreviewHoverTimer);
    hideTaskFramePreviewPopover();
  });

  return chip;
}

function normalizeModelNameForPill(modelDisplay) {
  const text = safeText(modelDisplay).trim();
  if (!text) return '-';
  const idx = text.indexOf('(');
  return idx > 0 ? text.slice(0, idx).trim() : text;
}

function getTaskInputModeLabel(task) {
  const p = task?.params || {};
  if (p.referenceImageMode) return '参考图';
  const images = Array.isArray(task?.images) ? task.images : [];
  const roles = new Set(images.map(i => i?.role).filter(Boolean));
  const hasFirst = roles.has('first_frame');
  const hasLast = roles.has('last_frame');
  if (hasFirst && hasLast) return '首尾帧';
  if (hasFirst) return '首帧';
  if (images.length) return '图生视频';
  return '文生视频';
}

function buildSampleTag() {
  const tag = document.createElement('span');
  tag.className = 'task-sample-tag';
  tag.textContent = '样片';
  return tag;
}

function getAspectRatioForTask(task) {
  const p = task?.params || {};
  const ratio = safeText(p.ratio).trim();
  const info = p.uploadedImageInfo;
  if ((ratio === 'adaptive' || ratio === '智能') && info?.width && info?.height) {
    return `${info.width} / ${info.height}`;
  }
  if (ratio && ratio.includes(':')) {
    const [a, b] = ratio.split(':').map(s => Number(s));
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) return `${a} / ${b}`;
  }
  return '16 / 9';
}

function parseAspectRatioText(text) {
  const raw = safeText(text).trim();
  if (!raw) return null;
  const parts = raw.split('/').map(s => Number(s.trim()));
  if (parts.length !== 2) return null;
  const w = parts[0];
  const h = parts[1];
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h, ratio: w / h };
}

function getTaskMediaSizeClass(task) {
  const parsed = parseAspectRatioText(getAspectRatioForTask(task));
  if (!parsed) return 'task-media-size-landscape';
  const { w, h } = parsed;
  const diff = Math.abs(w - h) / Math.max(w, h);
  if (diff <= 0.08) return 'task-media-size-square';
  if (w > h) return 'task-media-size-landscape';
  return 'task-media-size-portrait';
}

function buildModelPill(modelDisplay) {
  const pill = document.createElement('div');
  pill.className = 'task-model-pill';
  const icon = document.createElement('div');
  icon.className = 'task-model-pill-icon';
  icon.innerHTML = `<svg t="1769528331257" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5510" xmlns:xlink="http://www.w3.org/1999/xlink" width="14" height="14"><path d="M154.68661162 328.42831573l-1.28709316 0.64354657v364.89095508l357.81194092 188.23739678V506.36896719L154.68661162 328.42831573z" fill="#FFFFFF" p-id="5511"></path><path d="M868.37985459 328.75008945L511.21145938 140.83446552 168.52286445 321.02752959l-13.83625283 7.40078613 356.52484775 177.94065147 4.18305323-1.93064063 353.95066143-175.04469052V329.0718623l-0.96531944-0.32177285zM515.3945126 504.43832656l-4.18305323 1.93064063 4.18305323-1.93064063z" fill="#91D5FF" p-id="5512"></path><path d="M939.8135331 294.32034336a59.84983916 59.84983916 0 0 0-25.42009307-26.70718623L538.56219219 68.75723955a58.88451885 58.88451885 0 0 0-54.70146563 0L108.35125244 266.32606396a58.24097227 58.24097227 0 0 0-15.44511973 13.83625284 64.35466612 64.35466612 0 0 0-9.65320049 12.54915966 59.84983916 59.84983916 0 0 0-6.43546581 25.7418668v386.12799405a59.20629258 59.20629258 0 0 0 32.17733261 52.1272793l375.50947413 197.56882352a59.20629258 59.20629258 0 0 0 26.70718622 7.72255987h4.50482696a56.31033252 56.31033252 0 0 0 22.84590586-6.11369297l375.509475-197.56882441a59.20629258 59.20629258 0 0 0 32.17733261-52.12727842V318.45334326a56.63210625 56.63210625 0 0 0-6.4354667-24.1329999z m-70.46835908 35.07329268l-353.95066142 175.04469052-4.18305323 2.25241348v375.50947412L153.07774472 693.96281739V329.0718623l13.83625284-7.40078613 344.29746182-180.83661064 357.16839521 187.91562392z" fill="#40A9FF" p-id="5513"></path></svg>`;
  const name = document.createElement('div');
  name.className = 'task-model-pill-name';
  name.textContent = normalizeModelNameForPill(modelDisplay);
  pill.appendChild(icon);
  pill.appendChild(name);
  return pill;
}

function buildIconButton(label, svgPathD) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'task-card-action';
  btn.setAttribute('aria-label', label);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', svgPathD);
  svg.appendChild(p);
  btn.appendChild(svg);
  const span = document.createElement('span');
  span.textContent = label;
  btn.appendChild(span);
  return btn;
}

function getTaskFeedRenderKey(task) {
  const promptText = safeText(task.prompt).trim();
  const modeLabel = getTaskInputModeLabel(task);
  const previewUrl =
    findTaskImageUrlByRole(task, 'first_frame') ||
    findTaskImageUrlByRole(task, 'last_frame') ||
    findTaskImageUrlByRole(task, 'reference_image') ||
    (typeof task?.params?.firstFrame === 'string' ? task.params.firstFrame : '') ||
    (typeof task?.params?.lastFrame === 'string' ? task.params.lastFrame : '') ||
    (Array.isArray(task?.images) ? (task.images.find(it => it?.url)?.url || '') : '');
  const videoUrl = task?.videoUrls && task.videoUrls[0] ? task.videoUrls[0] : '';
  const parts = [
    task.id || '',
    task.status || '',
    task.starred ? '1' : '0',
    task.modelDisplay || '',
    String(task.createdAt || 0),
    promptText,
    modeLabel,
    task.params?.resolution || '',
    task.params?.ratio || '',
    task.params?.durationMode || '',
    task.params?.duration || '',
    task.params?.frames || '',
    task.params?.quantity || '',
    getAspectRatioForTask(task),
    previewUrl,
    videoUrl,
    taskFeedLayout
  ];
  return parts.join('\u0001');
}

function buildTaskFeedItem(task) {
  const item = document.createElement('div');
  item.className = `task-item${taskFeedLayout === 'grid' ? ' task-item-grid' : ''}`;
  item.dataset.taskId = task.id;
  item.dataset.renderKey = getTaskFeedRenderKey(task);
  item.dataset.layout = taskFeedLayout;

  const time = document.createElement('div');
  time.className = 'task-time';
  time.textContent = formatTaskTime(task.createdAt || Date.now());

  const prompt = document.createElement('div');
  prompt.className = 'task-prompt';
  if (task.params?.draft) prompt.appendChild(buildSampleTag());
  const promptText = document.createElement('span');
  promptText.className = 'task-prompt-text';
  promptText.textContent = safeText(task.prompt).trim() || '（无 Prompt）';
  prompt.appendChild(promptText);

  const paramRow = document.createElement('div');
  paramRow.className = 'task-param-row';

  const paramLeft = document.createElement('div');
  paramLeft.className = 'task-param-left';

  const modeLabel = getTaskInputModeLabel(task);
  if (modeLabel === '首帧' || modeLabel === '首尾帧') paramLeft.appendChild(buildFrameChip(task, modeLabel));
  else paramLeft.appendChild(buildChip(modeLabel));
  if (task.params?.resolution) paramLeft.appendChild(buildChip(task.params.resolution));
  if (task.params?.ratio) paramLeft.appendChild(buildChip(task.params.ratio === 'adaptive' ? '智能比例' : task.params.ratio));
  if (task.params?.durationMode === 'auto') paramLeft.appendChild(buildChip('智能时长'));
  else if (task.params?.durationMode === 'frames') paramLeft.appendChild(buildChip(`${task.params.frames}帧`));
  else if (task.params?.duration) paramLeft.appendChild(buildChip(`${task.params.duration}秒`));
  if (task.params?.quantity) paramLeft.appendChild(buildChip(`${task.params.quantity}条`));

  const paramRight = document.createElement('div');
  paramRight.className = 'task-param-right';
  paramRight.appendChild(buildModelPill(task.modelDisplay));

  paramRow.appendChild(paramLeft);
  paramRow.appendChild(paramRight);

  const media = document.createElement('div');
  media.className = 'task-media';
  media.classList.add(getTaskMediaSizeClass(task));
  applyTaskFeedMediaPresentation(media, task);
  removeTaskWatermark(media);

  const previewUrl =
    findTaskImageUrlByRole(task, 'first_frame') ||
    findTaskImageUrlByRole(task, 'last_frame') ||
    findTaskImageUrlByRole(task, 'reference_image') ||
    (typeof task?.params?.firstFrame === 'string' ? task.params.firstFrame : '') ||
    (typeof task?.params?.lastFrame === 'string' ? task.params.lastFrame : '') ||
    (Array.isArray(task?.images) ? (task.images.find(it => it?.url)?.url || '') : '');

  const videoUrl = task?.videoUrls && task.videoUrls[0] ? task.videoUrls[0] : '';
  const shouldLoadVideo = task.status === 'succeeded' && !!videoUrl;

  if (task.status !== 'succeeded' || !videoUrl) {
    media.classList.add('task-media-pending');
    if (previewUrl) {
      media.classList.add('task-media-has-preview');
      const preview = document.createElement('img');
      preview.className = 'task-media-preview';
      preview.src = previewUrl;
      preview.alt = '';
      preview.loading = 'lazy';
      preview.decoding = 'async';
      preview.draggable = false;
      media.appendChild(preview);
    }

    const placeholder = document.createElement('div');
    placeholder.className = 'task-media-placeholder';
    const label = document.createElement('div');
    label.className = 'task-media-status';
    if (task.status === 'failed') label.textContent = '生成失败';
    else if (task.status === 'succeeded') label.textContent = '加载中...';
    else label.textContent = '生成中...';
    placeholder.appendChild(label);
    media.appendChild(placeholder);
  } else if (shouldLoadVideo) {
    media.classList.add('task-media-pending');
    if (previewUrl) {
      media.classList.add('task-media-has-preview');
      const preview = document.createElement('img');
      preview.className = 'task-media-preview';
      preview.src = previewUrl;
      preview.alt = '';
      preview.loading = 'lazy';
      preview.decoding = 'async';
      preview.draggable = false;
      media.appendChild(preview);
    }

    const placeholder = document.createElement('div');
    placeholder.className = 'task-media-placeholder';
    const label = document.createElement('div');
    label.className = 'task-media-status';
    label.textContent = '生成成功';
    placeholder.appendChild(label);
    media.appendChild(placeholder);

    media.dataset.videoSrc = videoUrl;
    media.dataset.videoStarted = '0';
    media.dataset.posterSrc = previewUrl || '';

    const toolbar = document.createElement('div');
    toolbar.className = 'task-media-hover-actions';
    const btnDownload = document.createElement('button');
    btnDownload.className = 'task-toolbar-btn';
    btnDownload.type = 'button';
    btnDownload.dataset.action = 'download';
    btnDownload.setAttribute('aria-label', '下载');
    btnDownload.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const btnStar = document.createElement('button');
    btnStar.className = `task-toolbar-btn${task.starred ? ' active' : ''}`;
    btnStar.type = 'button';
    btnStar.dataset.action = 'star';
    btnStar.setAttribute('aria-label', '收藏');
    btnStar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9 12 2"/></svg>`;
    const btnShare = document.createElement('button');
    btnShare.className = 'task-toolbar-btn';
    btnShare.type = 'button';
    btnShare.dataset.action = 'share';
    btnShare.setAttribute('aria-label', '分享');
    btnShare.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
    const btnDelete = document.createElement('button');
    btnDelete.className = 'task-toolbar-btn task-toolbar-danger';
    btnDelete.type = 'button';
    btnDelete.dataset.action = 'delete';
    btnDelete.setAttribute('aria-label', '删除');
    btnDelete.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
    toolbar.appendChild(btnDownload);
    toolbar.appendChild(btnStar);
    toolbar.appendChild(btnShare);
    toolbar.appendChild(btnDelete);
    media.appendChild(toolbar);
  }

  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const editIconPath = taskFeedLayout === 'grid'
    ? 'M21 2v6h-6 M3 22v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L21 8 M3 16l2.64 2.36A9 9 0 0 0 20.49 15'
    : 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z';
  const editBtn = buildIconButton('重新编辑', editIconPath);
  editBtn.classList.add('task-edit-btn');
  editBtn.dataset.action = 'edit';

  actions.appendChild(editBtn);

  if (taskFeedLayout === 'grid') {
    if (media.dataset.editHoverBound !== '1') {
      media.dataset.editHoverBound = '1';
      media.addEventListener('mouseenter', () => {
        taskGridEditHoverToken += 1;
        const token = taskGridEditHoverToken;
        if (taskGridEditHoverTimer) clearTimeout(taskGridEditHoverTimer);
        taskGridEditHoverTimer = setTimeout(() => {
          if (token !== taskGridEditHoverToken) return;
          media.classList.add('task-edit-hover');
        }, 150);
      });
      media.addEventListener('mouseleave', () => {
        taskGridEditHoverToken += 1;
        if (taskGridEditHoverTimer) clearTimeout(taskGridEditHoverTimer);
        media.classList.remove('task-edit-hover');
      });
    }
    media.appendChild(actions);
    item.appendChild(media);
    item.appendChild(prompt);
  } else {
    item.appendChild(time);
    item.appendChild(prompt);
    item.appendChild(paramRow);
    item.appendChild(media);
    item.appendChild(actions);
  }
  return item;
}

function getTaskFeedPreviewUrl(task) {
  return (
    findTaskImageUrlByRole(task, 'first_frame') ||
    findTaskImageUrlByRole(task, 'last_frame') ||
    findTaskImageUrlByRole(task, 'reference_image') ||
    (typeof task?.params?.firstFrame === 'string' ? task.params.firstFrame : '') ||
    (typeof task?.params?.lastFrame === 'string' ? task.params.lastFrame : '') ||
    (Array.isArray(task?.images) ? (task.images.find(it => it?.url)?.url || '') : '')
  );
}

function swapImageSrcWhenReady(img, nextUrl) {
  if (!img || !nextUrl) return;
  const current = img.getAttribute('src') || '';
  if (!current) {
    img.src = nextUrl;
    return;
  }
  if (current === nextUrl) return;
  const loader = new Image();
  loader.decoding = 'async';
  loader.onload = () => {
    img.src = nextUrl;
  };
  loader.onerror = () => {};
  loader.src = nextUrl;
  if (typeof loader.decode === 'function') {
    loader.decode().then(() => {
      img.src = nextUrl;
    }).catch(() => {});
  }
}

function applyTaskFeedMediaPresentation(media, task) {
  if (!media) return;
  media.classList.remove('task-media-fit-cover', 'task-media-fit-contain');
  if (taskFeedLayout === 'grid') {
    media.style.aspectRatio = '16 / 9';
    media.classList.add('task-media-fit-cover');
    return;
  }
  media.style.aspectRatio = getAspectRatioForTask(task);
}

function removeTaskWatermark(media) {
  if (!media) return;
  const wm = media.querySelector('.task-watermark');
  if (wm) wm.remove();
}

let taskFeedVideoObserver = null;
let taskFeedVideoLazyPaused = false;
let taskFeedScrollBottomBtn = null;
let taskFeedScrollBottomBtnRaf = 0;
let taskFeedScrollBottomBtnLastTop = 0;
let taskFeedScrollBottomBtnScrollingDown = false;
let taskFeedVideoLazyIdleTimer = 0;
let taskFeedVideoLazyLastScrollTop = 0;
let taskFeedVideoLazyLastTs = 0;
let taskFeedVideoLazySpeedEma = 0;
const TASK_FEED_VIDEO_LAZY_PAUSE_THRESHOLD_INSTANT = 2.6;
const TASK_FEED_VIDEO_LAZY_PAUSE_THRESHOLD = 1.8;
const TASK_FEED_VIDEO_LAZY_RESUME_THRESHOLD = 0.8;
const TASK_FEED_VIDEO_LAZY_IDLE_MS = 180;

function isGenerateAreaAtBottom(area, thresholdPx = 6) {
  if (!area) return true;
  return area.scrollTop + area.clientHeight >= area.scrollHeight - thresholdPx;
}

function setTaskMediaStatusText(media, text) {
  if (!media || !media.isConnected) return;
  const statusEl = media.querySelector('.task-media-placeholder .task-media-status');
  if (!statusEl) return;
  statusEl.textContent = text;
}

function updateTaskFeedScrollBottomBtnVisibility() {
  taskFeedScrollBottomBtnRaf = 0;
  const btn = taskFeedScrollBottomBtn;
  const area = document.getElementById('generateArea');
  if (!btn || !area) return;
  const hasTasks = area.classList.contains('has-tasks') && !area.classList.contains('filter-empty');
  if (!hasTasks) {
    btn.classList.remove('is-visible');
    btn.setAttribute('aria-hidden', 'true');
    return;
  }
  if (!taskFeedScrollBottomBtnScrollingDown) {
    btn.classList.remove('is-visible');
    btn.setAttribute('aria-hidden', 'true');
    return;
  }
  const remaining = area.scrollHeight - (area.scrollTop + area.clientHeight);
  const shouldShow = remaining > 400;
  btn.classList.toggle('is-visible', shouldShow);
  btn.setAttribute('aria-hidden', String(!shouldShow));
}

function scheduleUpdateTaskFeedScrollBottomBtn() {
  if (taskFeedScrollBottomBtnRaf) return;
  taskFeedScrollBottomBtnRaf = requestAnimationFrame(updateTaskFeedScrollBottomBtnVisibility);
}

function ensureTaskFeedScrollBottomButton() {
  if (taskFeedScrollBottomBtn && taskFeedScrollBottomBtn.isConnected) return taskFeedScrollBottomBtn;
  const content = document.querySelector('.content');
  const area = document.getElementById('generateArea');
  if (!content || !area) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'task-scroll-bottom-btn';
  btn.id = 'taskScrollBottomBtn';
  btn.setAttribute('aria-label', '快速到底部');
  btn.setAttribute('aria-hidden', 'true');
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;

  btn.addEventListener('click', () => {
    const el = document.getElementById('generateArea');
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  });

  content.appendChild(btn);
  taskFeedScrollBottomBtn = btn;

  taskFeedScrollBottomBtnLastTop = area.scrollTop;
  taskFeedScrollBottomBtnScrollingDown = false;
  area.addEventListener('scroll', () => {
    const top = area.scrollTop;
    const dy = top - taskFeedScrollBottomBtnLastTop;
    if (Math.abs(dy) >= 1) {
      if (dy > 0) taskFeedScrollBottomBtnScrollingDown = true;
      else if (dy < 0) taskFeedScrollBottomBtnScrollingDown = false;
      taskFeedScrollBottomBtnLastTop = top;
    }
    scheduleUpdateTaskFeedScrollBottomBtn();
  }, { passive: true });
  const mo = new MutationObserver(scheduleUpdateTaskFeedScrollBottomBtn);
  mo.observe(area, { attributes: true, attributeFilter: ['class'] });
  scheduleUpdateTaskFeedScrollBottomBtn();
  return btn;
}

function markVisibleUnloadedTaskMediasAsLoading() {
  const root = document.getElementById('generateArea');
  if (!root) return;
  const rootRect = root.getBoundingClientRect();
  const medias = Array.from(document.querySelectorAll('#taskFeed .task-media[data-video-src]'));
  medias.forEach((media) => {
    if (!media || !media.isConnected) return;
    if (media.dataset.videoStarted === '1') return;
    const r = media.getBoundingClientRect();
    if (r.bottom < rootRect.top || r.top > rootRect.bottom) return;
    setTaskMediaStatusText(media, '加载中...');
  });
}

function setTaskFeedVideoLazyPaused(paused) {
  const next = !!paused;
  if (taskFeedVideoLazyPaused === next) return;
  taskFeedVideoLazyPaused = next;
  if (next) requestAnimationFrame(markVisibleUnloadedTaskMediasAsLoading);
  if (next && taskFeedVideoObserver) taskFeedVideoObserver.disconnect();
  if (!next) refreshTaskFeedVideoLazyLoad();
}

function scheduleTaskFeedVideoLazyIdleCheck() {
  if (taskFeedVideoLazyIdleTimer) window.clearTimeout(taskFeedVideoLazyIdleTimer);
  taskFeedVideoLazyIdleTimer = window.setTimeout(() => {
    taskFeedVideoLazyIdleTimer = 0;
    taskFeedVideoLazySpeedEma *= 0.15;
    if (taskFeedVideoLazySpeedEma < TASK_FEED_VIDEO_LAZY_RESUME_THRESHOLD) {
      setTaskFeedVideoLazyPaused(false);
      return;
    }
    scheduleTaskFeedVideoLazyIdleCheck();
  }, TASK_FEED_VIDEO_LAZY_IDLE_MS);
}

function initTaskFeedVideoLazyLoadSpeedControl() {
  const area = document.getElementById('generateArea');
  if (!area) return;
  if (area.dataset.videoLazySpeedBound === '1') return;
  area.dataset.videoLazySpeedBound = '1';
  taskFeedVideoLazyLastScrollTop = area.scrollTop;
  taskFeedVideoLazyLastTs = performance.now();
  taskFeedVideoLazySpeedEma = 0;
  area.addEventListener('scroll', () => {
    const now = performance.now();
    const scrollTop = area.scrollTop;
    const dt = now - taskFeedVideoLazyLastTs;
    const dy = scrollTop - taskFeedVideoLazyLastScrollTop;
    taskFeedVideoLazyLastTs = now;
    taskFeedVideoLazyLastScrollTop = scrollTop;
    if (dt > 0) {
      const speed = Math.min(12, Math.abs(dy) / dt);
      if (speed > TASK_FEED_VIDEO_LAZY_PAUSE_THRESHOLD_INSTANT) {
        setTaskFeedVideoLazyPaused(true);
      } else {
        taskFeedVideoLazySpeedEma = taskFeedVideoLazySpeedEma * 0.65 + speed * 0.35;
        if (taskFeedVideoLazySpeedEma > TASK_FEED_VIDEO_LAZY_PAUSE_THRESHOLD) setTaskFeedVideoLazyPaused(true);
        else if (taskFeedVideoLazySpeedEma < TASK_FEED_VIDEO_LAZY_RESUME_THRESHOLD) setTaskFeedVideoLazyPaused(false);
      }
    }
    scheduleTaskFeedVideoLazyIdleCheck();
  }, { passive: true });
}

function ensureTaskMediaVideoElement(media) {
  if (!media || !media.isConnected) return null;
  const existing = media.querySelector('video.task-video');
  if (existing) return existing;

  const placeholder = media.querySelector('.task-media-placeholder');
  const statusEl = placeholder ? placeholder.querySelector('.task-media-status') : null;
  const posterSrc = media.dataset.posterSrc || '';

  const video = document.createElement('video');
  video.className = 'task-video';
  if (posterSrc) video.poster = posterSrc;
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.style.backgroundColor = 'transparent';
  video.style.opacity = '0';
  video.style.transition = 'opacity 120ms ease';

  let hasFrame = false;
  let canPlay = false;
  let revealStarted = false;

  const startReveal = () => {
    if (revealStarted) return;
    if (!canPlay) return;
    revealStarted = true;
    media.classList.add('task-media-reveal');
    window.setTimeout(() => {
      const ph = media.querySelector('.task-media-placeholder');
      if (ph) ph.remove();
      const p = media.querySelector('.task-media-preview');
      if (p) p.remove();
      media.classList.remove('task-media-pending', 'task-media-has-preview', 'task-media-reveal');
    }, 520);
  };

  const onLoadedData = () => {
    if (hasFrame) return;
    hasFrame = true;
    video.style.opacity = '1';
    startReveal();
  };

  const onCanPlay = () => {
    if (canPlay) return;
    canPlay = true;
    if (!hasFrame) video.style.opacity = '1';
    startReveal();
  };

  video.addEventListener('loadeddata', onLoadedData, { once: true });
  video.addEventListener('canplay', onCanPlay, { once: true });
  video.addEventListener('error', () => {
    if (!statusEl || !statusEl.isConnected) return;
    statusEl.textContent = '加载失败';
  }, { once: true });

  if (media.dataset.videoHoverBound !== '1') {
    media.dataset.videoHoverBound = '1';
    media.addEventListener('mouseenter', () => {
      if (!canPlay) return;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    });
    media.addEventListener('mouseleave', () => {
      if (!canPlay) return;
      video.pause();
    });
  }

  media.insertBefore(video, media.firstChild);
  return video;
}

function startLazyLoadTaskMediaVideo(media) {
  if (!media || !media.isConnected) return;
  if (taskFeedVideoLazyPaused) {
    if (media.dataset.videoStarted !== '1') setTaskMediaStatusText(media, '加载中...');
    return;
  }
  const src = media.dataset.videoSrc || '';
  if (!src) return;
  if (media.dataset.videoStarted === '1') return;
  const video = ensureTaskMediaVideoElement(media);
  if (!video) return;
  if (video.getAttribute('src')) return;

  media.dataset.videoStarted = '1';

  const statusEl = media.querySelector('.task-media-placeholder .task-media-status');
  if (statusEl) statusEl.textContent = '加载中...';

  video.src = src;
  video.load();
}

function unloadTaskMediaVideo(media) {
  if (!media || !media.isConnected) return;
  if (media.dataset.videoStarted !== '1') return;
  const video = media.querySelector('video.task-video');
  if (!video) return;
  if (!video.getAttribute('src')) return;

  const poster = video.getAttribute('poster') || media.dataset.posterSrc || '';
  if (!poster) return;

  try {
    video.pause();
  } catch {}
  video.removeAttribute('src');
  video.load();
  media.dataset.videoStarted = '0';
}

function refreshTaskFeedVideoLazyLoad() {
  if (taskFeedVideoObserver) taskFeedVideoObserver.disconnect();
  const root = document.getElementById('generateArea') || null;
  taskFeedVideoObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const media = entry.target;
      if (entry.isIntersecting) startLazyLoadTaskMediaVideo(media);
      else unloadTaskMediaVideo(media);
    });
  }, { root, rootMargin: '800px 0px 800px 0px', threshold: 0.01 });

  const medias = Array.from(document.querySelectorAll('#taskFeed .task-media[data-video-src]'));
  medias.forEach((media) => taskFeedVideoObserver.observe(media));
}

function tryUpdateExistingTaskFeedItem(existingNode, task) {
  if (!existingNode || !existingNode.isConnected) return false;
  const media = existingNode.querySelector('.task-media');
  if (!media) return false;
  removeTaskWatermark(media);

  const previewUrl = getTaskFeedPreviewUrl(task);
  const videoUrl = task?.videoUrls && task.videoUrls[0] ? task.videoUrls[0] : '';
  const needsVideo = task.status === 'succeeded' && !!videoUrl;

  if (needsVideo) {
    const hasRevealedVideo = !!media.querySelector('video.task-video') && !media.classList.contains('task-media-pending');
    if (hasRevealedVideo) {
      let toolbar = media.querySelector('.task-media-hover-actions');
      if (toolbar) {
        const btnStar = toolbar.querySelector('[data-action="star"]');
        if (btnStar) btnStar.className = `task-toolbar-btn${task.starred ? ' active' : ''}`;
      }
      media.dataset.videoSrc = videoUrl;
      media.dataset.posterSrc = previewUrl || '';
      applyTaskFeedMediaPresentation(media, task);
      existingNode.dataset.renderKey = getTaskFeedRenderKey(task);
      return true;
    }

    media.dataset.videoSrc = videoUrl;
    if (!media.dataset.videoStarted) media.dataset.videoStarted = '0';

    media.classList.remove('task-media-size-landscape', 'task-media-size-portrait', 'task-media-size-square');
    media.classList.add(getTaskMediaSizeClass(task));
    applyTaskFeedMediaPresentation(media, task);

    media.classList.add('task-media-pending');

    if (previewUrl) {
      media.classList.add('task-media-has-preview');
      let preview = media.querySelector('.task-media-preview');
      if (!preview) {
        preview = document.createElement('img');
        preview.className = 'task-media-preview';
        preview.alt = '';
        preview.loading = 'lazy';
        preview.decoding = 'async';
        preview.draggable = false;
        media.insertBefore(preview, media.firstChild);
      }
      swapImageSrcWhenReady(preview, previewUrl);
    } else {
      media.classList.remove('task-media-has-preview');
      const preview = media.querySelector('.task-media-preview');
      if (preview) preview.remove();
    }

    let placeholder = media.querySelector('.task-media-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'task-media-placeholder';
      media.appendChild(placeholder);
    }
    let statusEl = placeholder.querySelector('.task-media-status');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'task-media-status';
      placeholder.appendChild(statusEl);
    }
    statusEl.textContent = media.dataset.videoStarted === '1' ? '加载中...' : '生成成功';
    media.dataset.posterSrc = previewUrl || '';

    let toolbar = media.querySelector('.task-media-hover-actions');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'task-media-hover-actions';

      const btnDownload = document.createElement('button');
      btnDownload.className = 'task-toolbar-btn';
      btnDownload.type = 'button';
      btnDownload.dataset.action = 'download';
      btnDownload.setAttribute('aria-label', '下载');
      btnDownload.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      const btnStar = document.createElement('button');
      btnStar.className = `task-toolbar-btn${task.starred ? ' active' : ''}`;
      btnStar.type = 'button';
      btnStar.dataset.action = 'star';
      btnStar.setAttribute('aria-label', '收藏');
      btnStar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9 12 2"/></svg>`;
      const btnShare = document.createElement('button');
      btnShare.className = 'task-toolbar-btn';
      btnShare.type = 'button';
      btnShare.dataset.action = 'share';
      btnShare.setAttribute('aria-label', '分享');
      btnShare.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
      const btnDelete = document.createElement('button');
      btnDelete.className = 'task-toolbar-btn task-toolbar-danger';
      btnDelete.type = 'button';
      btnDelete.dataset.action = 'delete';
      btnDelete.setAttribute('aria-label', '删除');
      btnDelete.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

      toolbar.appendChild(btnDownload);
      toolbar.appendChild(btnStar);
      toolbar.appendChild(btnShare);
      toolbar.appendChild(btnDelete);
      media.appendChild(toolbar);
    } else {
      const btnStar = toolbar.querySelector('[data-action="star"]');
      if (btnStar) btnStar.className = `task-toolbar-btn${task.starred ? ' active' : ''}`;
    }

    existingNode.dataset.renderKey = getTaskFeedRenderKey(task);
    return true;
  }

  media.classList.remove('task-media-size-landscape', 'task-media-size-portrait', 'task-media-size-square');
  media.classList.add(getTaskMediaSizeClass(task));
  applyTaskFeedMediaPresentation(media, task);

  media.classList.add('task-media-pending');

  const labelText = task.status === 'failed' ? '生成失败' : task.status === 'succeeded' ? '加载中...' : '生成中...';

  if (previewUrl) {
    media.classList.add('task-media-has-preview');
    let preview = media.querySelector('.task-media-preview');
    if (!preview) {
      preview = document.createElement('img');
      preview.className = 'task-media-preview';
      preview.alt = '';
      preview.loading = 'lazy';
      preview.decoding = 'async';
      preview.draggable = false;
      media.insertBefore(preview, media.firstChild);
    }
    swapImageSrcWhenReady(preview, previewUrl);
  } else {
    media.classList.remove('task-media-has-preview');
    const preview = media.querySelector('.task-media-preview');
    if (preview) preview.remove();
  }

  let placeholder = media.querySelector('.task-media-placeholder');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'task-media-placeholder';
    media.appendChild(placeholder);
  }
  let statusEl = placeholder.querySelector('.task-media-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'task-media-status';
    placeholder.appendChild(statusEl);
  }
  statusEl.textContent = labelText;

  existingNode.dataset.renderKey = getTaskFeedRenderKey(task);
  return true;
}

function renderTaskFeed() {
  const feed = document.getElementById('taskFeed');
  if (!feed) return;
  const area = document.getElementById('generateArea');
  if (area) area.classList.remove('filter-empty');
  applyTaskFeedLayoutClass();

  const visibleTasks = tasks
    .filter((task) => {
      if (taskFeedFilters.starredOnly && !task?.starred) return false;
      if (taskFeedFilters.modelId !== 'all') {
        const modelId = getTaskModelId(task);
        if (modelId !== taskFeedFilters.modelId) return false;
      }
      return true;
    });

  if (tasks.length && visibleTasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'task-feed-filter-empty';
    const text = document.createElement('div');
    text.className = 'task-feed-filter-empty-text';
    text.textContent = '暂无符合筛选条件的作品';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task-feed-filter-empty-clear';
    btn.textContent = '清除筛选';
    btn.addEventListener('click', () => {
      taskFeedFilters = { starredOnly: false, modelId: 'all' };
      syncTaskFilterControls();
      renderTaskFeed();
    });
    empty.appendChild(text);
    empty.appendChild(btn);
    feed.replaceChildren(empty);
    if (area) area.classList.add('filter-empty');
    applyTaskEmptyState();
    return;
  }

  const orderedTasks = visibleTasks
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const existing = new Map();
  Array.from(feed.querySelectorAll(':scope > .task-item')).forEach((node) => {
    if (node?.dataset?.taskId) existing.set(node.dataset.taskId, node);
  });

  const desiredNodes = orderedTasks.map((task) => {
    const existingNode = existing.get(task.id);
    const key = getTaskFeedRenderKey(task);
    if (existingNode && existingNode.dataset.layout !== taskFeedLayout) return buildTaskFeedItem(task);
    if (existingNode && existingNode.dataset.renderKey === key) return existingNode;
    if (existingNode && tryUpdateExistingTaskFeedItem(existingNode, task)) return existingNode;
    return buildTaskFeedItem(task);
  });

  const desiredSet = new Set(desiredNodes);
  Array.from(feed.children).forEach((child) => {
    if (!desiredSet.has(child)) child.remove();
  });

  desiredNodes.forEach((node, index) => {
    const cur = feed.children[index];
    if (cur !== node) feed.insertBefore(node, cur || null);
  });

  applyTaskEmptyState();
  refreshTaskFeedVideoLazyLoad();
}

function setUploadBoxFromData(boxId, previewId, dataUrl) {
  const box = document.getElementById(boxId);
  const preview = document.getElementById(previewId);
  if (!box || !preview) return;
  if (!dataUrl) {
    preview.src = '';
    preview.hidden = true;
    box.classList.remove('has-image');
    const ph = box.querySelector('.upload-placeholder');
    if (ph) ph.style.display = 'flex';
    const mask = box.querySelector('.upload-mask');
    if (mask) mask.hidden = true;
    return;
  }
  preview.src = dataUrl;
  preview.hidden = false;
  box.classList.add('has-image');
  const ph = box.querySelector('.upload-placeholder');
  if (ph) ph.style.display = 'none';
  const mask = box.querySelector('.upload-mask');
  if (mask) mask.hidden = false;
}

function restoreTaskToEditor(task) {
  if (!task) return;
  const updates = {
    model: task.params?.model || task.model || window.appState?.model,
    ratio: task.params?.ratio ?? window.appState?.ratio,
    resolution: task.params?.resolution ?? window.appState?.resolution,
    durationMode: task.params?.durationMode ?? window.appState?.durationMode,
    duration: task.params?.duration ?? window.appState?.duration,
    frames: task.params?.frames ?? window.appState?.frames,
    quantity: task.params?.quantity ?? window.appState?.quantity,
    audio: task.params?.audio ?? window.appState?.audio,
    draft: task.params?.draft ?? window.appState?.draft,
    watermark: task.params?.watermark ?? window.appState?.watermark,
    cameraFixed: task.params?.cameraFixed ?? window.appState?.cameraFixed,
    seedEnabled: task.params?.seedEnabled ?? window.appState?.seedEnabled,
    seed: task.params?.seed ?? window.appState?.seed,
    prompt: safeText(task.prompt),
    referenceImageMode: task.params?.referenceImageMode ?? window.appState?.referenceImageMode,
    referenceImages: task.params?.referenceImages ?? window.appState?.referenceImages,
    uploadedImageInfo: task.params?.uploadedImageInfo ?? window.appState?.uploadedImageInfo,
    firstFrame: task.params?.firstFrame ?? window.appState?.firstFrame,
    lastFrame: task.params?.lastFrame ?? window.appState?.lastFrame
  };

  if (typeof window.updateState === 'function') {
    window.updateState(updates);
  }
  if (typeof window.applyModelSelection === 'function') {
    window.applyModelSelection(updates.model, task.modelDisplay || '');
  }

  const promptEl = document.querySelector('textarea.prompt-input');
  if (promptEl) promptEl.value = safeText(task.prompt);

  setUploadBoxFromData('firstFrameBox', 'firstFramePreview', updates.firstFrame);
  setUploadBoxFromData('lastFrameBox', 'lastFramePreview', updates.lastFrame);

  const area = document.getElementById('generateArea');
  if (area) {
    area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
  }
}

function buildDetailSection(title, node) {
  const wrap = document.createElement('div');
  wrap.className = 'task-detail-section';
  const h = document.createElement('div');
  h.className = 'task-detail-section-title';
  h.textContent = title;
  wrap.appendChild(h);
  wrap.appendChild(node);
  return wrap;
}

function buildKvRow(label, value, opts = {}) {
  const row = document.createElement('div');
  row.className = 'task-kv';
  const k = document.createElement('div');
  k.className = 'task-kv-key';
  k.textContent = label;
  const v = document.createElement('div');
  v.className = 'task-kv-val';
  if (opts.valueNode && opts.valueNode.nodeType) {
    v.classList.add('task-kv-val-multiline');
    v.appendChild(opts.valueNode);
  } else {
    v.textContent = value;
  }
  row.appendChild(k);
  row.appendChild(v);
  if (opts.copyValue) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task-kv-copy';
    btn.textContent = '复制';
    btn.addEventListener('click', async () => {
      await copyToClipboard(opts.copyValue);
      btn.textContent = '已复制';
      setTimeout(() => (btn.textContent = '复制'), 1200);
    });
    row.appendChild(btn);
  }
  return row;
}

function getPricePerMillionTokens(modelId, { isI2V, hasAudio } = {}) {
  const PRICING = {
    'doubao-seedance-1-5-pro-251215': { audio: 16, noAudio: 8 },
    'doubao-seedance-1-0-pro-250528': { i2v: 15, t2v: 15 },
    'doubao-seedance-1-0-pro-fast-251015': { i2v: 4.2, t2v: 4.2 },
    'doubao-seedance-1-0-lite-t2v-250428': { t2v: 10 },
    'doubao-seedance-1-0-lite-i2v-250428': { i2v: 10 }
  };
  const price = PRICING[modelId];
  if (!price) return 0;
  if (modelId.includes('1-5-pro')) return hasAudio ? (price.audio || 0) : (price.noAudio || 0);
  if (modelId.includes('lite-t2v')) return price.t2v || 0;
  if (modelId.includes('lite-i2v')) return price.i2v || 0;
  return isI2V ? (price.i2v || 0) : (price.t2v || 0);
}

function formatCny(val) {
  if (!Number.isFinite(Number(val)) || val < 0) return '--';
  if (val > 0 && val < 0.01) return '<0.01';
  return Number(val).toFixed(2);
}

async function copyToClipboard(text) {
  const t = safeText(text);
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      document.body.removeChild(ta);
      return false;
    }
  }
}

function updateToolbarState(task) {
  const overlay = document.getElementById('taskDetailOverlay');
  if (!overlay) return;
  overlay.querySelectorAll('.task-toolbar-btn').forEach(btn => {
    const action = btn.dataset.action;
    if (action === 'star') btn.classList.toggle('active', !!task.starred);
  });
}

async function performTaskToolbarAction(taskId, action, { closeAfterDelete = false, updateDetailToolbar = false } = {}) {
  const idx = findTaskIndex(taskId);
  if (idx < 0) return { ok: false };
  const task = tasks[idx];
  const url = task.videoUrls?.[0] || '';

  if (action === 'star') {
    task.starred = !task.starred;
  } else if (action === 'share') {
    if (url) await copyToClipboard(url);
    return { ok: true };
  } else if (action === 'download') {
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `task-${task.id || 'video'}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    return { ok: true };
  } else if (action === 'delete') {
    const ok = typeof window.confirmDialog === 'function'
      ? await window.confirmDialog('确认删除该任务记录？', { title: '删除任务', okText: '删除', cancelText: '取消', danger: true })
      : confirm('确认删除该任务记录？');
    if (!ok) return { ok: false };
    try {
      await deleteTaskRecord(taskId);
    } catch (e) {
      console.warn('删除任务文件失败:', e);
    }
    tasks.splice(idx, 1);
    await persistTasks();
    renderTaskFeed();
    if (closeAfterDelete) closeTaskDetail();
    return { ok: true, deleted: true };
  } else {
    return { ok: false };
  }

  tasks[idx] = task;
  await persistTasks();
  if (updateDetailToolbar) updateToolbarState(task);
  return { ok: true, starred: !!task.starred };
}

function openTaskDetail(taskId) {
  const idx = findTaskIndex(taskId);
  if (idx < 0) return;
  const task = tasks[idx];
  const overlay = document.getElementById('taskDetailOverlay');
  const video = document.getElementById('taskDetailVideo');
  const body = document.getElementById('taskDetailBody');
  const modelName = document.getElementById('taskDetailModelName');
  const time = document.getElementById('taskDetailTime');
  if (!overlay || !video || !body || !modelName || !time) return;

  currentOpenTaskId = taskId;
  modelName.textContent = task.modelDisplay || '-';
  time.textContent = formatTaskTime(task.createdAt || Date.now());

  body.innerHTML = '';

  const images = task.images || [];
  const imgGrid = document.createElement('div');
  imgGrid.className = 'task-detail-images';
  if (images.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'task-detail-empty';
    empty.textContent = '无输入图片';
    imgGrid.appendChild(empty);
  } else {
    images.forEach((img) => {
      const it = document.createElement('div');
      it.className = 'task-detail-image-item';
      const el = document.createElement('img');
      el.src = img.url;
      el.alt = img.role || 'image';
      el.loading = 'lazy';
      it.appendChild(el);
      it.addEventListener('click', () => {
        if (typeof window.showFullscreenPreview === 'function') window.showFullscreenPreview(img.url);
      });
      imgGrid.appendChild(it);
    });
  }
  body.appendChild(buildDetailSection('输入图片', imgGrid));

  const prompt = document.createElement('div');
  prompt.className = 'task-detail-prompt';
  prompt.textContent = safeText(task.prompt).trim() || '（无 Prompt）';
  body.appendChild(buildDetailSection('创意描述（Prompt）', prompt));

  const params = document.createElement('div');
  params.className = 'task-detail-params task-detail-params-grid';
  const p = task.params || {};
  const durationText =
    p.durationMode === 'auto'
      ? '智能时长'
      : p.durationMode === 'frames'
        ? `${p.frames || '-'} 帧`
        : `${p.duration ?? '-'} 秒`;

  params.appendChild(buildKvRow('模型', task.modelDisplay || '-'));
  params.appendChild(buildKvRow('比例', p.ratio === 'adaptive' ? '智能比例' : (p.ratio || '-')));
  params.appendChild(buildKvRow('分辨率', p.resolution || '-'));
  params.appendChild(buildKvRow('时长', durationText));
  params.appendChild(buildKvRow('数量', p.quantity ? `${p.quantity} 条` : '-'));
  params.appendChild(buildKvRow('音频', p.audio ? '开启' : '关闭'));
  params.appendChild(buildKvRow('水印', p.watermark ? '开启' : '关闭'));
  params.appendChild(buildKvRow('样片模式', p.draft ? '开启' : '关闭'));
  if (!p.referenceImageMode) {
    params.appendChild(buildKvRow('固定镜头', p.cameraFixed ? '开启' : '关闭'));
  }
  const seedDisplay = (task.status === 'succeeded' && Number.isFinite(Number(task.actualSeed)))
    ? String(task.actualSeed)
    : ((p.seed === 0 || p.seed) ? String(p.seed) : '-');
  params.appendChild(buildKvRow('种子', seedDisplay));
  body.appendChild(buildDetailSection('生成参数', params));

  const tokens = document.createElement('div');
  tokens.className = 'task-detail-params';
  const tokenText = task.actualTokens
    ? `${Number(task.actualTokens).toLocaleString()} Tokens`
    : task.estimatedTokens
      ? `${Number(task.estimatedTokens).toLocaleString()} Tokens`
      : '--';

  const modelId = task.model || task.params?.model || '';
  const isI2V = !!(task.params?.uploadedImageInfo || (task.images && task.images.length));
  const hasAudio = !!task.params?.audio;
  const pricePerMillion = modelId ? getPricePerMillionTokens(modelId, { isI2V, hasAudio }) : 0;
  const unitPriceText = pricePerMillion ? `¥${pricePerMillion}/百万tokens` : '--';
  const feeTokens = task.actualTokens ?? task.estimatedTokens ?? null;
  const isActualFee = task.status === 'succeeded' && Number.isFinite(Number(task.actualTokens));
  const feeValue = Number.isFinite(Number(feeTokens)) && pricePerMillion
    ? (Number(feeTokens) / 1000000) * pricePerMillion
    : null;

  tokens.appendChild(buildKvRow(isActualFee ? 'Tokens' : '预估Tokens', tokenText));
  tokens.appendChild(buildKvRow('价格', unitPriceText));
  tokens.appendChild(buildKvRow(isActualFee ? '费用' : '预估费用', '', {
    valueNode: (() => {
      const wrap = document.createElement('div');
      const line = document.createElement('div');
      line.textContent = `¥${formatCny(feeValue)}`;
      wrap.appendChild(line);
      return wrap;
    })()
  }));
  body.appendChild(buildDetailSection('消耗', tokens));

  const ids = document.createElement('div');
  ids.className = 'task-detail-params';
  ids.appendChild(buildKvRow('Task ID', task.id || '-', { copyValue: task.id || '' }));
  const url = task.videoUrls?.[0] || task.remoteVideoUrls?.[0] || '';
  if (url) ids.appendChild(buildKvRow('Video URL', url, { copyValue: url }));
  body.appendChild(buildDetailSection('标识', ids));

  const urlToPlay = task.videoUrls?.[0] || task.remoteVideoUrls?.[0] || '';
  if (urlToPlay) {
    video.src = urlToPlay;
    video.load();
    video.currentTime = 0;
  } else {
    video.removeAttribute('src');
    video.load();
  }

  overlay.hidden = false;
  void overlay.offsetWidth;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  updateToolbarState(task);
}

function closeTaskDetail() {
  const overlay = document.getElementById('taskDetailOverlay');
  const video = document.getElementById('taskDetailVideo');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => {
    overlay.hidden = true;
  }, 200);
  document.body.style.overflow = '';
  if (video) {
    try {
      video.pause();
    } catch {}
    video.removeAttribute('src');
    video.load();
  }
  currentOpenTaskId = null;
}

function bindTaskFeedEvents() {
  const feed = document.getElementById('taskFeed');
  if (!feed) return;
  if (feed.dataset.bound) return;
  feed.dataset.bound = '1';

  feed.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('[data-action]');
    const item = e.target.closest('.task-item');
    if (!item) return;
    const taskId = item.dataset.taskId;
    if (!taskId) return;

    if (actionBtn?.dataset.action === 'edit') {
      const idx = findTaskIndex(taskId);
      if (idx >= 0) restoreTaskToEditor(tasks[idx]);
      return;
    }

    if (actionBtn?.classList?.contains('task-toolbar-btn')) {
      e.preventDefault();
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const res = await performTaskToolbarAction(taskId, action, { closeAfterDelete: false, updateDetailToolbar: false });
      if (action === 'star' && res?.ok) {
        item.querySelectorAll('.task-toolbar-btn[data-action="star"]').forEach((btn) => {
          btn.classList.toggle('active', !!res.starred);
        });
      } else if (action === 'delete' && res?.deleted) {
        return;
      }
      return;
    }

    const media = e.target.closest('.task-media');
    if (media) {
      openTaskDetail(taskId);
    }
  });
}

function bindTaskDetailEvents() {
  const overlay = document.getElementById('taskDetailOverlay');
  const closeBtn = document.getElementById('taskDetailCloseBtn');
  const editBtn = document.getElementById('taskDetailEditBtn');
  if (!overlay) return;
  if (overlay.dataset.bound) return;
  overlay.dataset.bound = '1';

  overlay.addEventListener('click', (e) => {
    const modal = overlay.querySelector('.task-detail-modal');
    if (e.target === overlay) closeTaskDetail();
    if (modal && !modal.contains(e.target) && e.target !== overlay) closeTaskDetail();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeTaskDetail);

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('active')) return;
    if (e.key === 'Escape') closeTaskDetail();
  });

  overlay.querySelector('.task-detail-toolbar')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.task-toolbar-btn');
    if (!btn) return;
    const taskId = currentOpenTaskId;
    if (!taskId) return;
    await performTaskToolbarAction(taskId, btn.dataset.action, { closeAfterDelete: true, updateDetailToolbar: true });
  });

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const taskId = currentOpenTaskId;
      if (!taskId) return;
      const idx = findTaskIndex(taskId);
      if (idx >= 0) restoreTaskToEditor(tasks[idx]);
      closeTaskDetail();
    });
  }
}

async function initTasks() {
  try {
    const data = await fetchJson('/api/tasks', { cache: 'no-store' });
    tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  } catch (e) {
    console.warn('Failed to load tasks:', e);
  }
  applyTaskEmptyState();
  initTaskFeedLayoutToggle();
  initTaskFeedFilters();
  renderTaskFeed();
  bindTaskFeedEvents();
  bindTaskDetailEvents();
  resumePendingTaskPolling();
  ensureTaskFeedScrollBottomButton();
  initTaskFeedVideoLazyLoadSpeedControl();

  const generateArea = document.getElementById('generateArea');
  if (generateArea && tasks.length) {
    requestAnimationFrame(() => {
      generateArea.scrollTop = generateArea.scrollHeight;
    });
  }
}

async function addOrUpdateTask(task) {
  const idx = findTaskIndex(task.id);
  const isNew = idx < 0;
  if (idx >= 0) tasks[idx] = { ...tasks[idx], ...task };
  else tasks.push(task);
  await persistTasks();
  renderTaskFeed();
  if (isNew) {
    const generateArea = document.getElementById('generateArea');
    if (generateArea) {
      requestAnimationFrame(() => {
        generateArea.scrollTo({ top: generateArea.scrollHeight, behavior: 'smooth' });
      });
    }
  }
}

async function createTaskFromSnapshot(taskId, payload, snapshot) {
  const modelDisplay = getActiveModelDisplay();
  const estimate = getTokenEstimateSnapshot();
  const images = extractImagesFromPayload(payload);
  const record = {
    id: taskId,
    createdAt: Date.now(),
    status: 'running',
    model: snapshot.model,
    modelDisplay,
    prompt: snapshot.prompt || '',
    images,
    params: { ...snapshot },
    estimatedTokens: estimate.tokens,
    estimatedPriceText: estimate.priceText,
    actualTokens: null,
    videoUrls: [],
    feedback: null,
    starred: false
  };
  await addOrUpdateTask(record);
  try {
    await saveTaskRecord(record);
  } catch (e) {
    console.warn('保存任务失败:', e);
  }

  try {
    const saved = await saveTaskInputs(taskId, snapshot);
    const idx = findTaskIndex(taskId);
    if (idx >= 0 && saved) {
      const next = { ...tasks[idx] };
      const p = { ...(next.params || {}) };
      if (saved.firstFrameUrl) p.firstFrame = saved.firstFrameUrl;
      if (saved.lastFrameUrl) p.lastFrame = saved.lastFrameUrl;
      if (Array.isArray(saved.referenceImageUrls)) p.referenceImages = saved.referenceImageUrls;
      next.params = p;
      if (Array.isArray(next.images)) {
        let refIdx = 0;
        next.images = next.images.map((it) => {
          if (!it?.role) return it;
          if (it.role === 'first_frame' && saved.firstFrameUrl) return { ...it, url: saved.firstFrameUrl };
          if (it.role === 'last_frame' && saved.lastFrameUrl) return { ...it, url: saved.lastFrameUrl };
          if (it.role === 'reference_image') {
            const u = Array.isArray(saved.referenceImageUrls) ? saved.referenceImageUrls[refIdx] : '';
            refIdx += 1;
            return u ? { ...it, url: u } : it;
          }
          return it;
        });
      }
      tasks[idx] = next;
      await saveTaskRecord(next);
      renderTaskFeed();
    }
  } catch (e) {
    console.warn('保存输入文件失败:', e);
  }
  return record;
}

async function markTaskSucceeded(taskId, result) {
  const idx = findTaskIndex(taskId);
  if (idx < 0) return;
  const urls = extractVideoUrlsFromResult(result);
  const usage = result?.usage || result?.content?.usage || result?.result?.usage;
  const tokens = usage?.total_tokens || usage?.tokens || usage?.totalTokens || usage?.total;
  const seed = result?.seed ?? result?.content?.seed ?? result?.result?.seed;
  tasks[idx] = {
    ...tasks[idx],
    status: 'succeeded',
    videoUrls: [],
    remoteVideoUrls: urls.length ? urls : (tasks[idx].remoteVideoUrls || tasks[idx].videoUrls || []),
    actualTokens: Number.isFinite(Number(tokens)) ? Number(tokens) : (tasks[idx].actualTokens || null),
    actualSeed: Number.isFinite(Number(seed)) ? Number(seed) : (tasks[idx].actualSeed ?? null),
    result
  };
  await saveTaskRecord(tasks[idx]);
  renderTaskFeed();
  refreshTaskDetailIfOpen(taskId);

  const remoteUrls = urls.length
    ? urls
    : (Array.isArray(tasks[idx]?.remoteVideoUrls) ? tasks[idx].remoteVideoUrls : []);
  if (!remoteUrls.length) return;

  const localUrls = [];
  for (let i = 0; i < remoteUrls.length; i++) {
    const u = remoteUrls[i];
    if (!u) continue;
    try {
      const saved = await downloadTaskVideo(taskId, i, u);
      localUrls.push(saved?.url || u);
    } catch (e) {
      console.warn('视频下载失败:', e);
      localUrls.push(u);
    }
  }

  tasks[idx] = { ...tasks[idx], videoUrls: localUrls };
  await saveTaskRecord(tasks[idx]);
  renderTaskFeed();
  refreshTaskDetailIfOpen(taskId);
}

async function markTaskFailed(taskId, errorMessage) {
  const idx = findTaskIndex(taskId);
  if (idx < 0) return;
  tasks[idx] = { ...tasks[idx], status: 'failed', errorMessage: safeText(errorMessage) };
  await persistTasks();
  renderTaskFeed();
  refreshTaskDetailIfOpen(taskId);
}

window.Tasks = {
  initTasks,
  createTaskFromSnapshot,
  markTaskSucceeded,
  markTaskFailed,
  openTaskDetail,
  closeTaskDetail
};
