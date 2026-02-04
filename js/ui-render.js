function renderUI() {
  quickPanel.ratioBtns.forEach((btn) => {
    const val = btn.dataset.ratio || normalizeRatio(btn.textContent);
    btn.classList.toggle('active', val === appState.ratio);
  });

  const specs = window.MODEL_SPECS || {};
  const spec = specs[appState.model] || specs['default'] || {};
  if (window.updateRatioOptionsVisibility) {
    window.updateRatioOptionsVisibility(spec);
  }

  quickPanel.resBtns.forEach((btn) => {
    const val = btn.dataset.res || btn.textContent.trim();

    if (appState.draft) {
      if (val !== '480p') {
        btn.classList.add('disabled-option');
        btn.onmouseenter = window.showDraftTooltip;
        btn.onmouseleave = window.hideDraftTooltip;
      } else {
        btn.classList.remove('disabled-option');
        btn.onmouseenter = null;
        btn.onmouseleave = null;
      }
    } else if (appState.referenceImageMode) {
      btn.classList.remove('disabled-option');
      btn.onmouseenter = null;
      btn.onmouseleave = null;
      if (val === '1080p') {
        btn.style.display = 'none';
        return;
      } else {
        btn.style.display = '';
      }
    } else {
      btn.classList.remove('disabled-option');
      btn.onmouseenter = null;
      btn.onmouseleave = null;
      btn.style.display = '';
    }

    if (val === appState.resolution) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  quickPanel.durModeBtns.forEach((btn) => {
    if (btn.dataset.mode === appState.durationMode) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  if (appState.durationMode === 'frames') {
    if (quickPanel.durationWrapper) quickPanel.durationWrapper.style.display = 'none';
    if (quickPanel.framesWrapper) quickPanel.framesWrapper.style.display = 'block';

    if (quickPanel.framesSlider) quickPanel.framesSlider.value = appState.frames;
    if (quickPanel.framesValue) quickPanel.framesValue.textContent = appState.frames;

    if (quickPanel.approxTime) {
      const time = (appState.frames / 24).toFixed(2);
      quickPanel.approxTime.textContent = `≈ ${time}s`;
    }
  } else {
    if (quickPanel.durationWrapper) quickPanel.durationWrapper.style.display = 'flex';
    if (quickPanel.framesWrapper) quickPanel.framesWrapper.style.display = 'none';

    if (quickPanel.durationSlider) {
      quickPanel.durationSlider.value = appState.duration;
      if (appState.durationMode === 'auto') {
        quickPanel.durationSlider.disabled = true;
        quickPanel.durationSlider.parentElement.style.opacity = '0.5';
        if (quickPanel.durationValue) quickPanel.durationValue.textContent = '智能';
      } else {
        quickPanel.durationSlider.disabled = false;
        quickPanel.durationSlider.parentElement.style.opacity = '1';
        if (quickPanel.durationValue) quickPanel.durationValue.textContent = appState.duration;
      }
    }
  }

  if (quickPanel.quantitySlider) {
    quickPanel.quantitySlider.value = appState.quantity;
    if (quickPanel.quantityValue) quickPanel.quantityValue.textContent = appState.quantity;
  }

  if (quickPanel.seedInput) quickPanel.seedInput.value = appState.seed;
  if (quickPanel.seedSection) quickPanel.seedSection.style.display = appState.seedEnabled ? '' : 'none';
  if (quickPanel.cameraFixedBtn) {
    quickPanel.cameraFixedBtn.style.display = (!appState.referenceImageMode && appState.cameraFixedEnabled) ? 'flex' : 'none';
    if (appState.cameraFixed) quickPanel.cameraFixedBtn.classList.add('active');
    else quickPanel.cameraFixedBtn.classList.remove('active');
  }

  if (quickPanel.audioSwitch) quickPanel.audioSwitch.checked = appState.audio;
  if (quickPanel.audioBtn) {
    if (appState.audio) quickPanel.audioBtn.classList.add('active');
    else quickPanel.audioBtn.classList.remove('active');
  }

  if (quickPanel.draftBtn) {
    if (appState.draft) quickPanel.draftBtn.classList.add('active');
    else quickPanel.draftBtn.classList.remove('active');
  }

  const referenceImageBtn = document.getElementById('referenceImageBtn');
  if (referenceImageBtn) {
    if (appState.referenceImageMode) referenceImageBtn.classList.add('active');
    else referenceImageBtn.classList.remove('active');
  }

  updateInputAreaVisibility();

  configModal.ratioBtns.forEach((btn) => {
    const val = btn.dataset.ratio || normalizeRatio(btn.textContent);
    if (val === appState.ratio) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  configModal.resBtns.forEach((btn) => {
    const val = btn.textContent.trim();
    if (val === appState.resolution) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  configModal.durBtns.forEach((btn) => {
    const text = btn.textContent.trim();
    let isActive = false;
    if (text === '智能长度' && appState.durationMode === 'auto') isActive = true;
    else if (text === '4秒' && appState.durationMode === 'seconds' && appState.duration === 4) isActive = true;
    else if (text === '10秒' && appState.durationMode === 'seconds' && appState.duration === 10) isActive = true;

    if (isActive) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  if (configModal.quantityInput) configModal.quantityInput.value = appState.quantity;
  if (configModal.watermarkSwitch) configModal.watermarkSwitch.checked = appState.watermark;
  if (configModal.seedSwitch) configModal.seedSwitch.checked = appState.seedEnabled;
  if (configModal.cameraFixedSwitch) configModal.cameraFixedSwitch.checked = appState.cameraFixedEnabled;

  updateSummaryText();
  updateTokenEstimate();

  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) {
    const hasPrompt = String(appState.prompt || '').trim().length > 0;
    const hasReferenceImages = Array.isArray(appState.referenceImages) && appState.referenceImages.some(Boolean);
    const hasFrameImages = !!appState.firstFrame || !!appState.lastFrame;
    const hasImage = hasReferenceImages || hasFrameImages;
    const inputMissing = !hasPrompt && !hasImage;
    const isBusy = generateBtn.classList.contains('is-loading') || generateBtn.dataset.visualState === 'loading';
    generateBtn.disabled = isBusy || inputMissing;
  }
}

function updateSummaryText() {
  const settingsText = document.querySelector('.video-settings .settings-text');
  if (!settingsText) return;

  const divider = '<span class="setting-divider"></span>';
  const icon = `<div class="settings-icon">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"></line>
      <line x1="4" y1="10" x2="4" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12" y2="3"></line>
      <line x1="20" y1="21" x2="20" y2="16"></line>
      <line x1="20" y1="12" x2="20" y2="3"></line>
      <line x1="1" y1="14" x2="7" y2="14"></line>
      <line x1="9" y1="8" x2="15" y2="8"></line>
      <line x1="17" y1="16" x2="23" y2="16"></line>
    </svg>
  </div>`;

  const durationText =
    appState.durationMode === 'auto'
      ? '智能时长'
      : appState.durationMode === 'frames'
        ? `${appState.frames}帧`
        : `${appState.duration}秒`;

  settingsText.innerHTML = `
    ${icon}
    <span>${(appState.ratio === 'adaptive' || appState.ratio === '智能') ? '智能比例' : appState.ratio}</span>
    ${divider}
    <span>${appState.resolution}</span>
    ${divider}
    <span>${durationText}</span>
    ${divider}
    <span>${appState.quantity}条</span>
  `;
}

function updateInputAreaVisibility() {
  const framesContainer = document.querySelector('.frames-container');
  const refContainer = document.getElementById('referenceImagesContainer');

  if (appState.referenceImageMode) {
    if (framesContainer) framesContainer.style.display = 'none';
    if (refContainer) {
      refContainer.style.display = 'flex';
      renderReferenceImageSlots();
    }
  } else {
    if (refContainer) refContainer.style.display = 'none';
    if (framesContainer) framesContainer.style.display = 'flex';

    const specs = window.MODEL_SPECS || {};
    const spec = specs[appState.model] || specs['default'] || {};
    if (window.updateInputFramesVisibility) {
      window.updateInputFramesVisibility(spec);
    }
  }
}

function renderReferenceImageSlots() {
  const container = document.getElementById('referenceImagesContainer');
  if (!container) return;

  container.innerHTML = '';

  const images = appState.referenceImages || [];
  let slotCount = images.length + 1;
  if (slotCount > 4) slotCount = 4;

  for (let i = 0; i < slotCount; i++) {
    const hasImage = !!images[i];
    const slot = document.createElement('div');
    slot.className = `upload-box style-card ${hasImage ? 'has-image' : ''}`;
    slot.style.flexShrink = '0';

    slot.innerHTML = `
            <input type="file" accept="image/*" hidden>
            <div class="upload-placeholder" style="${hasImage ? 'display:none' : 'display:flex'}">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>参考图 ${i + 1}</span>
            </div>
            <img class="upload-preview" src="${hasImage ? images[i] : ''}" ${hasImage ? '' : 'hidden'}>
            
            <div class="upload-mask" ${hasImage ? '' : 'hidden'}>
              <button class="mask-btn btn-delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <div class="mask-actions">
                <button class="mask-btn btn-preview-trigger">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
                <button class="mask-btn btn-replace">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6"/>
                    <path d="M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>
              </div>
            </div>
        `;

    const input = slot.querySelector('input');
    const deleteBtn = slot.querySelector('.btn-delete');
    const replaceBtn = slot.querySelector('.btn-replace');
    const previewBtn = slot.querySelector('.btn-preview-trigger');
    const previewImg = slot.querySelector('img.upload-preview');

    const applyFile = (file) => {
      if (!file || !file.type || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const newImages = [...(appState.referenceImages || [])];
        newImages[i] = ev.target.result;
        updateState({ referenceImages: newImages });
      };
      reader.readAsDataURL(file);
    };

    slot.addEventListener('click', (e) => {
      if (!e.target.closest('.mask-btn')) {
        input.click();
      }
    });

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        applyFile(file);
      }
    });

    if (replaceBtn) {
      replaceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.click();
      });
    }

    if (previewBtn) {
      const popover = document.getElementById('imagePreviewPopover');
      previewBtn.addEventListener('mouseenter', () => {
        if (!popover || !previewImg || !previewImg.src) return;
        const popoverImg = popover.querySelector('img');
        if (!popoverImg) return;
        popoverImg.src = previewImg.src;
        popover.classList.add('active');
        requestAnimationFrame(() => {
          const rect = previewBtn.getBoundingClientRect();
          const popRect = popover.getBoundingClientRect();
          const popWidth = popRect.width;
          const popHeight = popRect.height;
          popover.style.position = 'fixed';
          popover.style.zIndex = '9999';
          if (rect.top > popHeight + 10) {
            popover.style.top = (rect.top - popHeight - 10) + 'px';
          } else {
            popover.style.top = (rect.bottom + 10) + 'px';
          }
          popover.style.left = (rect.left + rect.width / 2 - popWidth / 2) + 'px';
        });
      });

      previewBtn.addEventListener('mouseleave', () => {
        const popover = document.getElementById('imagePreviewPopover');
        if (popover) popover.classList.remove('active');
      });

      previewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (previewImg?.src && typeof window.showFullscreenPreview === 'function') {
          window.showFullscreenPreview(previewImg.src);
        } else if (previewImg?.src && typeof showFullscreenPreview === 'function') {
          showFullscreenPreview(previewImg.src);
        }
      });
    }

    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.add('drag-over');
    });

    slot.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.remove('drag-over');
    });

    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      applyFile(files[0]);
    });

    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newImages = [...(appState.referenceImages || [])];
        newImages.splice(i, 1);
        updateState({ referenceImages: newImages });
      });
    }

    container.appendChild(slot);
  }
}

function updateTokenEstimate() {
  const display = document.getElementById('tokenValue');
  if (!display) return;

  let width, height;

  if (appState.ratio === 'adaptive' || appState.ratio === '智能') {
    if (appState.uploadedImageInfo && appState.uploadedImageInfo.width) {
      const imgW = Number(appState.uploadedImageInfo.width);
      const imgH = Number(appState.uploadedImageInfo.height);
      const imgRatio = imgW > 0 && imgH > 0 ? imgW / imgH : null;
      const candidates = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'];
      let best = '16:9';
      let bestScore = Number.POSITIVE_INFINITY;
      if (imgRatio) {
        for (const r of candidates) {
          const parts = r.split(':').map(Number);
          if (parts.length !== 2 || !parts[0] || !parts[1]) continue;
          const ar = parts[0] / parts[1];
          const score = Math.abs(Math.log(ar) - Math.log(imgRatio));
          if (score < bestScore) {
            bestScore = score;
            best = r;
          }
        }
      }
      const dims = getDimensions(best, appState.resolution);
      if (dims) {
        width = dims.w;
        height = dims.h;
      } else {
        display.textContent = '--';
        return;
      }
    } else {
      const dims = getDimensions('16:9', appState.resolution);
      if (dims) {
        width = dims.w;
        height = dims.h;
      } else {
        display.textContent = '--';
        return;
      }
    }
  } else {
    const dims = getDimensions(appState.ratio, appState.resolution);
    if (dims) {
      width = dims.w;
      height = dims.h;
    } else {
      display.textContent = '--';
      return;
    }
  }

  let duration = appState.duration;
  if (appState.durationMode === 'auto') {
    display.textContent = '--';
    return;
  }
  if (appState.durationMode === 'frames') {
    duration = appState.frames / 24;
  }

  const count = appState.quantity;
  const fps = 24;
  const totalPixels = width * height;
  const tokens = Math.round((totalPixels * fps * duration) / 1024 * count);

  const activeModelEl = document.querySelector('.model-option.active');
  const modelId = activeModelEl ? activeModelEl.dataset.model : 'default';
  const pricePerMillion = getCurrentPricePerMillionTokens(modelId);

  const estimatedPrice = tokens / 1000000 * pricePerMillion;
  const shouldUseActual =
    Number.isFinite(Number(appState.lastUsageTokens)) &&
    appState.lastUsageModel === modelId &&
    Number.isFinite(Number(appState.lastUsagePricePerMillion));
  const actualUnitPrice = shouldUseActual ? Number(appState.lastUsagePricePerMillion) : pricePerMillion;
  const actualPrice = shouldUseActual ? (Number(appState.lastUsageTokens) / 1000000) * actualUnitPrice : null;

  animateTokenValue(display, tokens, estimatedPrice, actualUnitPrice, {
    width: width,
    height: height,
    fps: fps,
    duration: duration,
    count: count,
    feeLabel: shouldUseActual ? '实际费用' : '预估费用',
    feeValue: shouldUseActual ? actualPrice : estimatedPrice
  });
}

let currentTokenValue = 0;
let animationFrameId = null;

function animateTokenValue(element, targetValue, targetPrice, pricePerMillion, calcParams) {
  const startValue = currentTokenValue;
  const duration = 500;
  let startTime = null;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  const priceDisplay = document.getElementById('tokenPriceDisplay');
  const footerDisplay = document.querySelector('.token-popover-content .popover-footer');

  if (footerDisplay) {
    const hasImage = appState.uploadedImageInfo && appState.uploadedImageInfo.width;

    if (hasImage && calcParams && calcParams.width && calcParams.height) {
      const durationStr = Number.isInteger(calcParams.duration) ? calcParams.duration : calcParams.duration.toFixed(2);
      footerDisplay.style.color = '#374151';
      footerDisplay.textContent = `预计消耗 ${targetValue.toLocaleString()} tokens (${calcParams.width}宽*${calcParams.height}高*${calcParams.fps}帧*${durationStr}s)/1024*${calcParams.count}条`;
    } else {
      footerDisplay.style.color = '';
      footerDisplay.textContent = '在智能比例/智能时长模式下，任务生成前暂无法精确预估 Tokens与费用，实际消耗以最终生成结果为准';
    }
  }

  const formatTokenDisplay = (val) => {
    return val.toLocaleString();
  };

  const updatePriceDisplay = (price) => {
    if (!priceDisplay) return;

    if (price !== undefined && price >= 0) {
      let priceStr = price < 0.01 && price > 0 ? '<0.01' : price.toFixed(2);
      const unitPriceStr = pricePerMillion ? `价格: ¥${pricePerMillion}/百万tokens` : '';
      const feeLabel = calcParams?.feeLabel || '预估费用';

      priceDisplay.innerHTML = `
                <div class="token-price-row">
                  <div class="token-unit-price">${unitPriceStr}</div>
                  <div class="token-fee">${feeLabel}: ¥${priceStr}</div>
                </div>
            `;

      priceDisplay.style.display = 'flex';
    } else {
      priceDisplay.style.display = 'none';
    }
  };

  if (startValue === targetValue && element.textContent !== '--') {
    element.textContent = formatTokenDisplay(targetValue);
    updatePriceDisplay(calcParams?.feeValue ?? targetPrice);
    return;
  }

  const step = (timestamp) => {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / duration, 1);

    const easeProgress = 1 - (1 - progress) * (1 - progress);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeProgress);

    const valuePrice = calcParams?.feeValue ?? targetPrice;
    const currentPrice = targetValue ? valuePrice * (currentValue / targetValue) : valuePrice;

    element.textContent = formatTokenDisplay(currentValue);
    updatePriceDisplay(currentPrice);

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      element.textContent = formatTokenDisplay(targetValue);
      updatePriceDisplay(calcParams?.feeValue ?? targetPrice);
      currentTokenValue = targetValue;
      animationFrameId = null;
    }
  };

  animationFrameId = requestAnimationFrame(step);
}

function getDimensions(ratio, res) {
  const modelId = String(appState.model || '');
  const family = modelId.includes('1-5-pro') ? 'seedance_1_5_pro' : 'seedance_1_0';

  const TABLE = {
    seedance_1_0: {
      '480p': { '16:9': { w: 864, h: 480 }, '4:3': { w: 736, h: 544 }, '1:1': { w: 640, h: 640 }, '3:4': { w: 544, h: 736 }, '9:16': { w: 480, h: 864 }, '21:9': { w: 960, h: 416 } },
      '720p': { '16:9': { w: 1248, h: 704 }, '4:3': { w: 1120, h: 832 }, '1:1': { w: 960, h: 960 }, '3:4': { w: 832, h: 1120 }, '9:16': { w: 704, h: 1248 }, '21:9': { w: 1504, h: 640 } },
      '1080p': { '16:9': { w: 1920, h: 1088 }, '4:3': { w: 1664, h: 1248 }, '1:1': { w: 1440, h: 1440 }, '3:4': { w: 1248, h: 1664 }, '9:16': { w: 1088, h: 1920 }, '21:9': { w: 2176, h: 928 } }
    },
    seedance_1_5_pro: {
      '480p': { '16:9': { w: 864, h: 496 }, '4:3': { w: 752, h: 560 }, '1:1': { w: 640, h: 640 }, '3:4': { w: 560, h: 752 }, '9:16': { w: 496, h: 864 }, '21:9': { w: 992, h: 432 } },
      '720p': { '16:9': { w: 1280, h: 720 }, '4:3': { w: 1112, h: 834 }, '1:1': { w: 960, h: 960 }, '3:4': { w: 834, h: 1112 }, '9:16': { w: 720, h: 1280 }, '21:9': { w: 1470, h: 630 } },
      '1080p': { '16:9': { w: 1920, h: 1080 }, '4:3': { w: 1664, h: 1248 }, '1:1': { w: 1440, h: 1440 }, '3:4': { w: 1248, h: 1664 }, '9:16': { w: 1080, h: 1920 }, '21:9': { w: 2206, h: 946 } }
    }
  };

  return TABLE?.[family]?.[res]?.[ratio] || null;
}

window.renderUI = renderUI;
