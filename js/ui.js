// ==========================================
// UI INTERACTIONS (Panels, Navigation, Model Selector)
// ==========================================

// DOM Elements - Quick Panel
const quickPanel = {
  ratioBtns: document.querySelectorAll('.settings-panel .ratio-btn'),
  resBtns: document.querySelectorAll('.settings-panel .resolution-options .segment-btn'),
  durModeBtns: document.querySelectorAll('.settings-panel .duration-mode-options .segment-btn'),
  durationSlider: document.querySelector('.settings-panel .duration-slider'),
  durationValue: document.getElementById('durationValueDisplay'),
  durationWrapper: document.getElementById('durationSecondsWrapper'),
  framesWrapper: document.getElementById('durationFramesWrapper'),
  framesSlider: document.querySelector('.settings-panel .frames-slider'),
  framesValue: document.getElementById('framesValueDisplay'),
  approxTime: document.getElementById('approxTimeDisplay'),
  quantitySlider: document.querySelector('.settings-panel .quantity-slider'),
  quantityValue: document.getElementById('quantityValueDisplay'),
  seedSection: document.getElementById('seedSettingsSection'),
  seedInput: document.getElementById('seedValueInput'),
  seedRandomBtn: document.getElementById('seedRandomBtn'),
  cameraFixedBtn: document.getElementById('cameraFixedBtn'),
  audioBtn: document.getElementById('audioBtn'),
  draftBtn: document.getElementById('draftBtn')
};

// DOM Elements - Config Modal
const configModal = {
  ratioBtns: document.querySelectorAll('.modal .ratio-btn'),
  resBtns: document.querySelectorAll('.modal .res-btn'),
  durBtns: document.querySelectorAll('.modal .dur-btn'), 
  quantityInput: document.querySelector('.modal .quantity-input'),
  watermarkSwitch: document.getElementById('watermarkSwitch'),
  seedSwitch: document.getElementById('seedSwitch'),
  cameraFixedSwitch: document.getElementById('cameraFixedSwitch'),
  debugSwitch: document.getElementById('debugSwitch'),
  developerModeSwitch: document.getElementById('developerModeSwitch'),
  developerOptions: document.getElementById('developerOptions'),
  agentationSwitch: document.getElementById('agentationSwitch'),
  agentationToggleRow: document.getElementById('agentationToggleRow'),
  apiKeyInput: document.querySelector('.api-input'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  dropZone: document.querySelector('.api-config-box'),
  importHint: document.getElementById('importHint'),
  progress: document.getElementById('importExportProgress'),
  progressText: document.getElementById('importExportProgressText'),
  exportCompressionSelect: document.getElementById('exportCompressionSelect'),
  exportCompressionBtn: document.getElementById('exportCompressionBtn'),
  exportCompressionMenu: document.getElementById('exportCompressionMenu')
};

// DOM Elements - Model Selector
const modelSelector = document.getElementById('modelSelector');
const modelOptions = document.querySelectorAll('.model-option');
const modelNameDisplay = document.querySelector('.model-name');
const modelVersionDisplay = document.querySelector('.model-version');
const promptInput = document.querySelector('.prompt-input');

function initUI() {
  initQuickPanelListeners();
  initStorageHandlers();
  initModelSelectorListeners();
  initConfigModalListeners();
  initPanelToggles();
  initSidebar();
  initKeyboardShortcuts();
  initDebugModal();
  initPromptListener();
  initInputCardCompactBehavior();
  
  // Init with active model
  const activeModel = document.querySelector('.model-option.active');
  if (activeModel) {
    updateModelConfig(activeModel.dataset.model);
  }

  if (promptInput) {
    promptInput.value = appState.prompt || '';
  }
}

function initPromptListener() {
    if (promptInput) {
        promptInput.addEventListener('input', (e) => {
            updateState({ prompt: e.target.value });
        });
    }
}

function initInputCardCompactBehavior() {
  const generateArea = document.getElementById('generateArea');
  const inputCard = document.querySelector('.input-card');
  if (!generateArea || !inputCard) return;

  const bottomThresholdPx = 6;
  let rafId = 0;
  let compactModeEnabled = false;

  const isAtBottom = () => {
    const scrollTop = generateArea.scrollTop;
    const clientHeight = generateArea.clientHeight;
    const scrollHeight = generateArea.scrollHeight;
    return scrollTop + clientHeight >= scrollHeight - bottomThresholdPx;
  };

  const updateCompactState = () => {
    rafId = 0;
    const hasTasks = generateArea.classList.contains('has-tasks');
    if (!hasTasks) {
      inputCard.classList.remove('is-compact');
      inputCard.classList.remove('force-expanded');
      compactModeEnabled = false;
      return;
    }
    if (!compactModeEnabled) {
      inputCard.classList.remove('is-compact');
      return;
    }
    if (inputCard.classList.contains('force-expanded')) return;
    inputCard.classList.toggle('is-compact', !isAtBottom());
  };

  const scheduleUpdate = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(updateCompactState);
  };

  generateArea.addEventListener('scroll', scheduleUpdate, { passive: true });
  generateArea.addEventListener('wheel', () => {
    inputCard.classList.remove('force-expanded');
    compactModeEnabled = true;
    scheduleUpdate();
  }, { passive: true });

  const mo = new MutationObserver(scheduleUpdate);
  mo.observe(generateArea, { attributes: true, attributeFilter: ['class'] });

  inputCard.addEventListener('mouseenter', () => {
    if (!inputCard.classList.contains('is-compact')) return;
    inputCard.classList.add('force-expanded');
    inputCard.classList.remove('is-compact');
  });

  scheduleUpdate();
}

function initQuickPanelListeners() {
  // Ratio buttons
  quickPanel.ratioBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = btn.dataset.ratio || normalizeRatio(btn.textContent);
      updateState({ ratio: val });
    });
  });

  // Resolution buttons
  quickPanel.resBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = btn.dataset.res || btn.textContent.trim();

      if (appState.draft && val !== '480p') return;

      updateState({ resolution: val });
    });
  });

  // Resolution UI Update
  quickPanel.resBtns.forEach(btn => {
    const val = btn.dataset.res || btn.textContent.trim();
    
    // Handle Draft Mode Disable Logic
    if (appState.draft) {
      if (val !== '480p') {
        btn.classList.add('disabled-option');
        // Setup Hover for Tooltip
        btn.onmouseenter = showDraftTooltip;
        btn.onmouseleave = hideDraftTooltip;
      } else {
        btn.classList.remove('disabled-option');
        btn.onmouseenter = null;
        btn.onmouseleave = null;
      }
    } else {
      btn.classList.remove('disabled-option');
      btn.onmouseenter = null;
      btn.onmouseleave = null;
    }

    if (val === appState.resolution) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // Duration mode buttons
  quickPanel.durModeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateState({ durationMode: btn.dataset.mode });
    });
  });

  // Duration slider
  if (quickPanel.durationSlider) {
    quickPanel.durationSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      updateState({ 
        duration: parseInt(e.target.value),
        durationMode: 'seconds'
      });
    });
    quickPanel.durationSlider.addEventListener('click', e => e.stopPropagation());
  }

  // Frames slider
  if (quickPanel.framesSlider) {
    quickPanel.framesSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      updateState({ 
        frames: parseInt(e.target.value),
        durationMode: 'frames'
      });
    });
    quickPanel.framesSlider.addEventListener('click', e => e.stopPropagation());
  }

  // Quantity slider
  if (quickPanel.quantitySlider) {
    quickPanel.quantitySlider.addEventListener('input', (e) => {
      e.stopPropagation();
      updateState({ quantity: parseInt(e.target.value) });
    });
    quickPanel.quantitySlider.addEventListener('click', e => e.stopPropagation());
  }

  if (quickPanel.seedInput) {
    quickPanel.seedInput.addEventListener('input', (e) => {
      e.stopPropagation();
      updateState({ seed: e.target.value, seedEnabled: true });
    });
    quickPanel.seedInput.addEventListener('click', e => e.stopPropagation());
  }

  if (quickPanel.seedRandomBtn) {
    quickPanel.seedRandomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const getRandomSeed = () => {
        const max = 4294967297n;
        const maxRange = 1n << 64n;
        const limit = (maxRange / max) * max;

        if (window.crypto?.getRandomValues) {
          while (true) {
            const a = new Uint32Array(2);
            window.crypto.getRandomValues(a);
            const r = (BigInt(a[0]) << 32n) | BigInt(a[1]);
            if (r >= limit) continue;
            const v = r % max;
            if (v === 0n) return -1;
            return Number(v - 1n);
          }
        }

        if (Math.random() < 0.25) return -1;
        return Math.floor(Math.random() * 4294967296);
      };

      const seed = getRandomSeed();
      if (quickPanel.seedInput) quickPanel.seedInput.value = String(seed);
      updateState({ seed: String(seed), seedEnabled: true });
    });
  }

  if (quickPanel.cameraFixedBtn) {
    quickPanel.cameraFixedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!appState.cameraFixedEnabled) return;
      updateState({ cameraFixed: !appState.cameraFixed });
    });
  }

  // Audio button
  if (quickPanel.audioBtn) {
    quickPanel.audioBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateState({ audio: !appState.audio });
    });
  }

  if (quickPanel.draftBtn) {
    quickPanel.draftBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateState({ draft: !appState.draft });
    });
  }

  if (quickPanel.referenceImageBtn) {
    quickPanel.referenceImageBtn.dataset.bound = '1';
    quickPanel.referenceImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !appState.referenceImageMode;
      const updates = { referenceImageMode: next };
      if (next) {
        if (appState.resolution === '1080p') updates.resolution = '720p';
      }
      updateState(updates);
    });
  }
}

function initStorageHandlers() {
  let exportCompression = 'store';
  Storage.get('exportCompression').then((v) => {
    const val = String(v || '').toLowerCase();
    exportCompression = (val === 'fast' || val === 'normal' || val === 'max' || val === 'store') ? val : 'store';
    if (configModal.exportCompressionBtn) {
      configModal.exportCompressionBtn.textContent = exportCompression === 'max'
        ? '最大压缩'
        : (exportCompression === 'normal' ? '标准压缩' : (exportCompression === 'fast' ? '快速压缩' : '仅存储'));
    }
  });

  const setBusy = (active, text) => {
    const overlayId = 'globalBusyOverlay';
    let overlay = document.getElementById(overlayId);
    if (active) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'global-busy-overlay';
        document.body.appendChild(overlay);
      }
      overlay.hidden = false;
      if (configModal.progress) configModal.progress.hidden = false;
      if (configModal.progressText) configModal.progressText.textContent = text || '处理中…';
      if (configModal.importHint) configModal.importHint.style.visibility = 'hidden';
      if (configModal.exportBtn) configModal.exportBtn.disabled = true;
      if (configModal.importBtn) configModal.importBtn.disabled = true;
    } else {
      if (overlay) overlay.hidden = true;
      if (configModal.progress) configModal.progress.hidden = true;
      if (configModal.importHint) configModal.importHint.style.visibility = '';
      if (configModal.exportBtn) configModal.exportBtn.disabled = false;
      if (configModal.importBtn) configModal.importBtn.disabled = false;
    }
  };

  const isBusy = () => {
    const overlay = document.getElementById('globalBusyOverlay');
    return !!overlay && !overlay.hidden;
  };

  // Load API Key on init
  Storage.get('apiKey').then(key => {
    if (key && configModal.apiKeyInput) {
      configModal.apiKeyInput.value = key;
    }
  });

  // Save API Key on input
  if (configModal.apiKeyInput) {
    configModal.apiKeyInput.addEventListener('input', (e) => {
      Storage.save('apiKey', e.target.value);
    });
  }

  // Export Data
  if (configModal.exportBtn) {
    configModal.exportBtn.addEventListener('click', async () => {
      try {
        if (isBusy()) return;
        const exportHintText = '正在打包，完成后将自动开始下载（数据较大时可能需要较久）';
        setBusy(true, exportHintText);
        const startResp = await fetch(`/api/export/start?compression=${encodeURIComponent(exportCompression)}`, { cache: 'no-store' });
        const startData = await startResp.json().catch(() => null);
        if (!startResp.ok) throw new Error(startData?.error?.message || `HTTP ${startResp.status}`);
        const jobId = String(startData?.jobId || '');
        if (!jobId) throw new Error('Missing export job id');

        const frameId = 'exportDownloadFrame';
        let iframe = document.getElementById(frameId);
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = frameId;
          iframe.style.display = 'none';
          iframe.title = 'export-download';
          document.body.appendChild(iframe);
        }

        let done = false;
        let timer = null;
        const poll = async () => {
          const resp = await fetch(`/api/export/status?id=${encodeURIComponent(jobId)}&t=${Date.now()}`, { cache: 'no-store' });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
          const status = String(data?.status || '');
          if (status === 'failed') throw new Error(data?.errorMessage || 'Export failed');
          if (status === 'ready') {
            done = true;
            if (timer) clearInterval(timer);
            setBusy(false);
            iframe.src = `/api/export/download?id=${encodeURIComponent(jobId)}&t=${Date.now()}`;
            return;
          }
          setBusy(true, exportHintText);
        };

        timer = setInterval(() => {
          if (done) return;
          poll().catch((e) => {
            if (done) return;
            clearInterval(timer);
            setBusy(false);
            if (typeof window.notify === 'function') window.notify('error', e?.message || '导出失败');
          });
        }, 1000);
        poll().catch((e) => {
          if (done) return;
          clearInterval(timer);
          setBusy(false);
          if (typeof window.notify === 'function') window.notify('error', e?.message || '导出失败');
        });
      } catch (err) {
        console.error('Export failed:', err);
        setBusy(false);
        if (typeof window.notify === 'function') window.notify('error', '导出失败');
      }
    });
  }

  // Import Data (Click)
  if (configModal.importBtn) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.7z,.zip';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    configModal.importBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        await handleImportFile(e.target.files[0]);
      }
    });
  }

  if (configModal.exportCompressionSelect && configModal.exportCompressionBtn && configModal.exportCompressionMenu) {
    if (configModal.exportCompressionMenu.parentElement !== document.body) {
      document.body.appendChild(configModal.exportCompressionMenu);
    }

    const closeMenu = () => {
      configModal.exportCompressionMenu.hidden = true;
      configModal.exportCompressionMenu.style.left = '';
      configModal.exportCompressionMenu.style.top = '';
    };

    configModal.exportCompressionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isBusy()) return;
      const nextOpen = !!configModal.exportCompressionMenu.hidden;
      configModal.exportCompressionMenu.hidden = !nextOpen;
      if (nextOpen) {
        const btnRect = configModal.exportCompressionBtn.getBoundingClientRect();
        const menu = configModal.exportCompressionMenu;
        menu.style.left = '-99999px';
        menu.style.top = '-99999px';
        menu.hidden = false;
        const menuRect = menu.getBoundingClientRect();
        const gap = 8;
        const desiredLeft = btnRect.right - menuRect.width;
        const minLeft = 12;
        const maxLeft = Math.max(minLeft, window.innerWidth - menuRect.width - 12);
        let left = Math.min(Math.max(minLeft, desiredLeft), maxLeft);
        let top = btnRect.bottom + gap;
        if (top + menuRect.height > window.innerHeight - 12) {
          top = Math.max(12, btnRect.top - gap - menuRect.height);
        }
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
      }
    });

    configModal.exportCompressionMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.select-item');
      if (!item) return;
      const val = String(item.dataset.value || '').toLowerCase();
      if (!(val === 'store' || val === 'fast' || val === 'normal' || val === 'max')) return;
      exportCompression = val;
      Storage.save('exportCompression', exportCompression);
      configModal.exportCompressionBtn.textContent = exportCompression === 'max'
        ? '最大压缩'
        : (exportCompression === 'normal' ? '标准压缩' : (exportCompression === 'fast' ? '快速压缩' : '仅存储'));
      closeMenu();
    });

    document.addEventListener('click', (e) => {
      if (configModal.exportCompressionSelect.contains(e.target)) return;
      if (configModal.exportCompressionMenu.contains(e.target)) return;
      closeMenu();
    });

    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, { passive: true });
    const configModalScroller = document.querySelector('#configModal .modal');
    if (configModalScroller) {
      configModalScroller.addEventListener('scroll', closeMenu, { passive: true });
    }
  }

  // Drag & Drop
  if (configModal.dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      configModal.dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    configModal.dropZone.addEventListener('dragenter', () => configModal.dropZone.classList.add('drag-over'));
    configModal.dropZone.addEventListener('dragover', () => configModal.dropZone.classList.add('drag-over'));
    configModal.dropZone.addEventListener('dragleave', () => configModal.dropZone.classList.remove('drag-over'));
    
    configModal.dropZone.addEventListener('drop', async (e) => {
      configModal.dropZone.classList.remove('drag-over');
      if (isBusy()) return;
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        await handleImportFile(files[0]);
      }
    });
  }
}

async function handleImportFile(file) {
  const name = String(file?.name || '').toLowerCase();

  const isArchive = name.endsWith('.7z') || name.endsWith('.zip');
  if (!isArchive) {
    if (typeof window.notify === 'function') window.notify('warning', '请上传 .7z / .zip 文件');
    return;
  }

  try {
    const overlay = document.getElementById('globalBusyOverlay');
    if (overlay && !overlay.hidden) return;
    const overlayId = 'globalBusyOverlay';
    let busyOverlay = document.getElementById(overlayId);
    if (!busyOverlay) {
      busyOverlay = document.createElement('div');
      busyOverlay.id = overlayId;
      busyOverlay.className = 'global-busy-overlay';
      document.body.appendChild(busyOverlay);
    }
    busyOverlay.hidden = false;
    if (configModal.progress) configModal.progress.hidden = false;
    if (configModal.progressText) configModal.progressText.textContent = '正在解压并覆盖导入…';
    if (configModal.importHint) configModal.importHint.style.visibility = 'hidden';
    if (configModal.exportBtn) configModal.exportBtn.disabled = true;
    if (configModal.importBtn) configModal.importBtn.disabled = true;
    const buf = await file.arrayBuffer();
    const resp = await fetch('/api/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': file.name || ''
      },
      body: buf
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
    if (typeof window.notify === 'function') window.notify('info', '导入成功，正在刷新...');
    window.location.reload();
  } catch (err) {
    console.error('Import failed:', err);
    setTimeout(() => {
      const overlay = document.getElementById('globalBusyOverlay');
      if (overlay) overlay.hidden = true;
      if (configModal.progress) configModal.progress.hidden = true;
      if (configModal.importHint) configModal.importHint.style.visibility = '';
      if (configModal.exportBtn) configModal.exportBtn.disabled = false;
      if (configModal.importBtn) configModal.importBtn.disabled = false;
    }, 0);
    if (typeof window.notify === 'function') window.notify('error', '导入失败');
  }
}

function initModelSelectorListeners() {
  if (modelSelector) {
    modelSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      modelSelector.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!modelSelector.contains(e.target)) {
        modelSelector.classList.remove('active');
      }
    });

    document.addEventListener('wheel', () => {
      if (modelSelector.classList.contains('active')) {
        modelSelector.classList.remove('active');
      }
    }, { passive: true });
  }

  modelOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      // Update Active State
      modelOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      
      // Update Display Text
      const name = opt.querySelector('.model-option-name').textContent;
      if (modelNameDisplay) modelNameDisplay.textContent = name;

      // Update Version Display
      if (modelVersionDisplay) {
        const modelId = opt.dataset.model;
        const versionMatch = modelId.match(/-(\d{6})$/);
        if (versionMatch) {
            modelVersionDisplay.textContent = versionMatch[1];
        } else {
            modelVersionDisplay.textContent = '';
        }
      }
      
      // Update Config based on model
      updateModelConfig(opt.dataset.model);

      // Force UI update to recalculate price/tokens for new model
      if (window.updateState) {
          window.updateState({});
      }

      // Close Dropdown
      modelSelector.classList.remove('active');
    });
  });
}

function applyModelSelection(modelId, modelDisplayText = '') {
  const id = (modelId || '').trim();
  if (!id) return;
  const opts = Array.from(modelOptions || []);
  const matched = opts.find(o => (o?.dataset?.model || '') === id) || null;
  opts.forEach(o => o.classList.remove('active'));

  if (matched) {
    matched.classList.add('active');
    const name = matched.querySelector('.model-option-name')?.textContent?.trim() || id;
    if (modelNameDisplay) modelNameDisplay.textContent = name;
    if (modelVersionDisplay) {
      const versionMatch = id.match(/-(\d{6})$/);
      modelVersionDisplay.textContent = versionMatch ? versionMatch[1] : '';
    }
  } else {
    const label = (modelDisplayText || id).trim();
    if (modelNameDisplay) modelNameDisplay.textContent = `未知模型：${label}`;
    if (modelVersionDisplay) modelVersionDisplay.textContent = '';
  }

  if (modelSelector) modelSelector.classList.remove('active');
  if (typeof window.updateModelConfig === 'function') window.updateModelConfig(id);
  if (typeof window.updateState === 'function') window.updateState({});
}

window.applyModelSelection = applyModelSelection;

function initConfigModalListeners() {
  // Ratio buttons
  configModal.ratioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.ratio || normalizeRatio(btn.textContent);
      updateState({ ratio: val });
    });
  });

  // Resolution buttons
  configModal.resBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      updateState({ resolution: btn.textContent.trim() });
    });
  });

  // Duration buttons
  configModal.durBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === 'auto') {
          updateState({ durationMode: 'auto' });
      } else if (mode === 'seconds') {
          const val = parseInt(btn.dataset.val);
          updateState({ durationMode: 'seconds', duration: val });
      } else if (mode === 'frames') {
          updateState({ durationMode: 'frames', frames: 29 });
      }
    });
  });

  // Frames slider (Modal)
  if (configModal.framesSlider) {
    configModal.framesSlider.addEventListener('input', (e) => {
      updateState({ 
          frames: parseInt(e.target.value),
          durationMode: 'frames' 
      });
    });
  }

  // Quantity input
  if (configModal.quantityInput) {
    configModal.quantityInput.addEventListener('input', (e) => {
      let val = parseInt(e.target.value);
      if (val < 1) val = 1;
      if (val > 4) val = 4;
      updateState({ quantity: val });
    });
  }

  // Watermark switch
  if (configModal.watermarkSwitch) {
    configModal.watermarkSwitch.addEventListener('change', (e) => {
      updateState({ watermark: e.target.checked });
    });
  }

  if (configModal.seedSwitch) {
    configModal.seedSwitch.addEventListener('change', (e) => {
      updateState({ seedEnabled: e.target.checked });
    });
  }

  if (configModal.cameraFixedSwitch) {
    configModal.cameraFixedSwitch.addEventListener('change', (e) => {
      updateState({ cameraFixedEnabled: e.target.checked });
    });
  }

  if (configModal.developerModeSwitch && configModal.developerOptions) {
    const agentationStorageKey = 'doubao:agentation:enabled';
    const resetChildren = () => {
      if (configModal.debugSwitch) {
        configModal.debugSwitch.checked = false;
        updateState({ debug: false });
      }
      if (configModal.agentationSwitch) {
        configModal.agentationSwitch.checked = false;
        try {
          localStorage.setItem(agentationStorageKey, '0');
        } catch {}
        if (window.__agentation && typeof window.__agentation.setEnabled === 'function') {
          window.__agentation.setEnabled(false);
        }
      }
    };
    const applyEnabled = (enabled) => {
      configModal.developerModeSwitch.checked = enabled;
      configModal.developerOptions.style.display = enabled ? '' : 'none';
      if (!enabled) resetChildren();
    };

    try {
      localStorage.removeItem('doubao:developer:enabled');
    } catch {}
    applyEnabled(false);
    configModal.developerModeSwitch.addEventListener('change', (e) => {
      const enabled = !!e.target.checked;
      applyEnabled(enabled);
      if (enabled) {
        const scroller = document.querySelector('#configModal .modal');
        if (scroller) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
            });
          });
        }
      }
    });
  } else if (configModal.developerOptions) {
    configModal.developerOptions.style.display = 'none';
  }

  // Debug switch
  if (configModal.debugSwitch) {
    configModal.debugSwitch.checked = false;
    updateState({ debug: false });
    configModal.debugSwitch.addEventListener('change', (e) => {
      updateState({ debug: e.target.checked });
      if (!e.target.checked) {
        document.getElementById('debugModal')?.classList.remove('active');
      }
    });
  }

  if (configModal.agentationToggleRow && configModal.agentationSwitch) {
    const storageKey = 'doubao:agentation:enabled';
    const readEnabled = () => {
      try {
        const v = localStorage.getItem(storageKey);
        if (v == null) return true;
        return v === '1';
      } catch {
        return true;
      }
    };
    const setEnabled = (enabled) => {
      try {
        localStorage.setItem(storageKey, enabled ? '1' : '0');
      } catch {}
      if (window.__agentation && typeof window.__agentation.setEnabled === 'function') {
        window.__agentation.setEnabled(enabled);
      }
    };

    const sync = () => {
      const available = !!(window.__agentation && window.__agentation.available);
      if (!available) {
        configModal.agentationToggleRow.style.display = 'none';
        return;
      }
      configModal.agentationToggleRow.style.display = '';
      configModal.agentationSwitch.checked = readEnabled();
    };

    setEnabled(false);
    configModal.agentationSwitch.checked = false;
    sync();
    window.addEventListener('agentation:ready', sync);
    configModal.agentationSwitch.addEventListener('change', (e) => {
      setEnabled(!!e.target.checked);
    });
  }
}

function initPanelToggles() {
  // Video Settings Panel Toggle
  const videoSettings = document.getElementById('videoSettings');
  const settingsPanel = document.getElementById('settingsPanel');
  
  if (videoSettings && settingsPanel) {
    videoSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = settingsPanel.classList.contains('active');
      document.querySelectorAll('.settings-panel.active').forEach(p => p.classList.remove('active'));
      
      if (!isActive) settingsPanel.classList.add('active');
      else settingsPanel.classList.remove('active');
    });

    settingsPanel.addEventListener('click', e => e.stopPropagation());
    
    document.addEventListener('click', (e) => {
      if (!videoSettings.contains(e.target) && !settingsPanel.contains(e.target)) {
        settingsPanel.classList.remove('active');
      }
    });
  }

  // Config Modal Toggle
  const configBtn = document.getElementById('configBtn');
  const configModalEl = document.getElementById('configModal');
  const closeModal = document.getElementById('closeModal');

  if (configBtn && configModalEl) {
    configBtn.addEventListener('click', () => {
      configModalEl.classList.add('active');
    });
    
    if (closeModal) closeModal.addEventListener('click', () => configModalEl.classList.remove('active'));
    
    configModalEl.addEventListener('click', (e) => {
      if (e.target === configModalEl) configModalEl.classList.remove('active');
    });
  }
}

function initSidebar() {
  // Sidebar Toggle
  const mediaToggle = document.getElementById('mediaToggle');
  const mediaSubmenu = document.getElementById('mediaSubmenu');
  if (mediaToggle && mediaSubmenu) {
    mediaToggle.addEventListener('click', () => {
      mediaSubmenu.classList.toggle('expanded');
      mediaToggle.parentElement.classList.toggle('expanded');
    });
    // Init
    mediaSubmenu.classList.add('expanded');
    mediaToggle.parentElement.classList.add('expanded');
  }

  // Navigation Items Active State
  document.querySelectorAll('.nav-item, .submenu-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item, .submenu-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      if (item.classList.contains('submenu-item') && mediaToggle) {
        mediaToggle.classList.add('active');
      }
    });
  });
}

function initKeyboardShortcuts() {
  const settingsPanel = document.getElementById('settingsPanel');
  const configModalEl = document.getElementById('configModal');
  const generateBtn = document.getElementById('generateBtn');

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      settingsPanel?.classList.remove('active');
      configModalEl?.classList.remove('active');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      generateBtn?.click();
    }
  });
}

function initDebugModal() {
  const debugModal = document.getElementById('debugModal');
  const closeDebugModal = document.getElementById('closeDebugModal');
  const copyDebugBtn = document.getElementById('copyDebugBtn');
  const debugCode = document.getElementById('debugCode');
  const debugViewSelect = document.getElementById('debugViewSelect');

  if (!debugModal) return;

  // Close
  if (closeDebugModal) {
    closeDebugModal.addEventListener('click', () => {
      debugModal.classList.remove('active');
    });
  }
  
  // Close on click outside
  debugModal.addEventListener('click', (e) => {
    if (e.target === debugModal) {
      debugModal.classList.remove('active');
    }
  });

  // Copy
  if (copyDebugBtn && debugCode) {
    copyDebugBtn.addEventListener('click', () => {
      const text = debugCode.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const originalText = copyDebugBtn.textContent;
        copyDebugBtn.textContent = '已复制!';
        setTimeout(() => {
          copyDebugBtn.textContent = originalText;
        }, 2000);
      }).catch(err => {
        console.error('Copy failed:', err);
        if (typeof window.notify === 'function') window.notify('error', '复制失败');
      });
    });
  }

  if (debugViewSelect && debugCode) {
    debugViewSelect.addEventListener('change', () => {
      const view = debugViewSelect.value;
      if (view === 'curl') {
        debugCode.textContent = debugModal.dataset.debugCurl || '';
      } else if (view === 'body') {
        debugCode.textContent = debugModal.dataset.debugBodyJson || '';
      } else {
        debugCode.textContent = debugModal.dataset.debugRequestJson || '';
      }
    });
  }
}

// Tooltip Helpers
window.showDraftTooltip = function(ev) {
    const tooltip = document.querySelector('.draft-tooltip');
    if (!tooltip) return;
    const btn = ev?.currentTarget || this;
    if (btn && btn instanceof HTMLElement) {
      const centerX = btn.offsetLeft + btn.offsetWidth / 2;
      tooltip.style.left = `${centerX}px`;
      tooltip.style.transform = 'translateX(-50%)';
    }
    tooltip.classList.add('active');
};

window.hideDraftTooltip = function() {
    const tooltip = document.querySelector('.draft-tooltip');
    if (tooltip) tooltip.classList.remove('active');
};

// Expose showDebugModal globally
window.showDebugModal = function(data) {
  if (!window.appState?.debug) return;
  const debugModal = document.getElementById('debugModal');
  const debugCode = document.getElementById('debugCode');
  const debugViewSelect = document.getElementById('debugViewSelect');
  
  if (debugModal && debugCode) {
    const abbreviateLongString = (value) => {
      if (typeof value !== 'string') return value;
      if (value.startsWith('data:image/') && value.length > 240) {
        return `${value.slice(0, 80)}...<${value.length} chars>...${value.slice(-40)}`;
      }
      if (value.length > 4000) {
        return `${value.slice(0, 2000)}...<${value.length} chars>...${value.slice(-400)}`;
      }
      return value;
    };

    const sanitizeForDisplay = (obj) => {
      if (obj == null) return obj;
      if (Array.isArray(obj)) return obj.map(sanitizeForDisplay);
      if (typeof obj === 'object') {
        const out = {};
        Object.keys(obj).forEach((k) => {
          out[k] = sanitizeForDisplay(obj[k]);
        });
        return out;
      }
      return abbreviateLongString(obj);
    };

    const upstreamUrl =
      data?.upstream_url ||
      data?.upstream?.url ||
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';

    const body = data?.body ?? data?.payload ?? data?.request?.body ?? data;
    const bodyDisplayJson = JSON.stringify(sanitizeForDisplay(body), null, 2);
    const bodyRawJson = JSON.stringify(body, null, 2);
    const escapedBodyForBashSingleQuotes = bodyRawJson.replace(/'/g, `'\"'\"'`);
    const curl = [
      `curl -X POST ${upstreamUrl} \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "Authorization: Bearer $ARK_API_KEY" \\`,
      `  -d '${escapedBodyForBashSingleQuotes}'`
    ].join('\n');

    const requestObj =
      data && typeof data === 'object' && ('body' in data || 'upstream_url' in data)
        ? { upstream_url: upstreamUrl, body }
        : { request: data };
    const requestJson = JSON.stringify(sanitizeForDisplay(requestObj), null, 2);

    debugModal.dataset.debugRequestJson = requestJson;
    debugModal.dataset.debugBodyJson = bodyDisplayJson;
    debugModal.dataset.debugCurl = curl;

    if (debugViewSelect) debugViewSelect.value = 'request';
    debugCode.textContent = requestJson;
    debugModal.classList.add('active');
  }
};

(() => {
  const ensureNoticeHost = () => {
    const existing = document.getElementById('floatingNoticeHost');
    if (existing) return existing;
    const host = document.createElement('div');
    host.id = 'floatingNoticeHost';
    host.className = 'floating-notice-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
    return host;
  };

  const closeNotice = (notice) => {
    if (!notice || !notice.isConnected) return;
    notice.classList.remove('is-visible');
    window.setTimeout(() => {
      const host = notice.parentElement;
      notice.remove();
      if (host && host.id === 'floatingNoticeHost') {
        const remaining = host.querySelector('.floating-notice');
        if (!remaining) host.classList.remove('active');
      }
    }, 180);
  };

  window.notify = function(type, message) {
    const normalizedType = type === 'warning' || type === 'error' || type === 'info' ? type : 'info';
    const titleText = normalizedType === 'error' ? '错误' : normalizedType === 'warning' ? '警告' : '提示';
    const contentText = message == null ? '' : String(message);
    const host = ensureNoticeHost();
    host.classList.add('active');

    const notice = document.createElement('div');
    notice.className = `floating-notice is-${normalizedType}`;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'floating-notice-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'floating-notice-title';
    titleEl.textContent = titleText;

    const contentEl = document.createElement('div');
    contentEl.className = 'floating-notice-content';
    contentEl.textContent = contentText;

    bodyEl.appendChild(titleEl);
    bodyEl.appendChild(contentEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'floating-notice-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    closeBtn.addEventListener('click', () => {
      closeNotice(notice);
    });

    notice.appendChild(bodyEl);
    notice.appendChild(closeBtn);
    host.appendChild(notice);

    requestAnimationFrame(() => {
      notice.classList.add('is-visible');
    });
  };

  const ensureGenerationToastHost = () => {
    const existing = document.getElementById('generationToastHost');
    if (existing) return existing;
    const host = document.createElement('div');
    host.id = 'generationToastHost';
    host.className = 'generation-toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
    return host;
  };

  const generationToastQueue = [];
  let generationToastBusy = false;

  const showNextGenerationToast = () => {
    if (generationToastBusy) return;
    const next = generationToastQueue.shift();
    if (!next) return;
    generationToastBusy = true;

    const host = ensureGenerationToastHost();
    host.classList.add('active');

    const toast = document.createElement('div');
    const type = next.type === 'success' || next.type === 'error' ? next.type : 'success';
    toast.className = `generation-toast is-${type}`;
    toast.textContent = next.message == null ? (type === 'success' ? '任务生成成功' : '任务生成失败') : String(next.message);
    host.appendChild(toast);

    toast.getBoundingClientRect();
    requestAnimationFrame(() => toast.classList.add('is-visible'));

    const finish = () => {
      if (!toast.isConnected) return;
      toast.remove();
      const remaining = host.querySelector('.generation-toast');
      if (!remaining) host.classList.remove('active');
      generationToastBusy = false;
      showNextGenerationToast();
    };

    const close = () => {
      if (!toast.isConnected) return;
      toast.classList.add('is-exiting');
      let done = false;
      const onEnd = () => {
        if (done) return;
        done = true;
        toast.removeEventListener('transitionend', onEnd);
        finish();
      };
      toast.addEventListener('transitionend', onEnd);
      window.setTimeout(onEnd, 260);
    };

    window.setTimeout(close, 2000);
  };

  window.notifyGeneration = function(type, message) {
    generationToastQueue.push({ type, message });
    showNextGenerationToast();
  };

  let confirmBusy = false;
  window.confirmDialog = function(message, options = {}) {
    const overlay = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const closeBtn = document.getElementById('closeConfirmModal');
    if (!overlay || !titleEl || !msgEl || !okBtn || !cancelBtn) return Promise.resolve(false);
    if (confirmBusy) return Promise.resolve(false);

    confirmBusy = true;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('active');
    titleEl.textContent = options.title == null ? '提示' : String(options.title);
    msgEl.textContent = message == null ? '' : String(message);

    const originalOkClass = okBtn.className;
    const originalOkText = okBtn.textContent;
    okBtn.textContent = options.okText == null ? '确定' : String(options.okText);
    cancelBtn.textContent = options.cancelText == null ? '取消' : String(options.cancelText);
    okBtn.className = options.danger ? 'btn-danger' : 'btn-primary';

    return new Promise((resolve) => {
      let finished = false;
      const cleanup = (result) => {
        if (finished) return;
        finished = true;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        okBtn.className = originalOkClass;
        okBtn.textContent = originalOkText;
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn?.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlayClick);
        document.removeEventListener('keydown', onKeydown);
        confirmBusy = false;
        resolve(result);
      };

      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onOverlayClick = (e) => {
        if (e.target === overlay) onCancel();
      };
      const onKeydown = (e) => {
        if (!overlay.classList.contains('active')) return;
        if (e.key === 'Escape') onCancel();
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn?.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlayClick);
      document.addEventListener('keydown', onKeydown);
    });
  };
})();
