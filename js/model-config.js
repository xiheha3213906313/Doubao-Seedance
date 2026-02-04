// Update Model Configuration based on selected model
function updateModelConfig(model) {
  // Update model in state and trigger JSON save
  // Always update to ensure config file is created/updated
  updateState({ model: model });

  const specs = window.MODEL_SPECS || {};
  const spec = specs[model] || specs['default'] || {};
  
  // Update Frame Inputs Visibility
  updateInputFramesVisibility(spec);

  // Update Duration Slider
  if (quickPanel.durationSlider) {
    quickPanel.durationSlider.min = spec.minDur;
    quickPanel.durationSlider.max = spec.maxDur;
    
    // Clamp current duration
    let newDuration = appState.duration;
    if (newDuration < spec.minDur) newDuration = spec.minDur;
    if (newDuration > spec.maxDur) newDuration = spec.maxDur;
    
    if (newDuration !== appState.duration) {
      updateState({ duration: newDuration });
    }
  }

  // Update Frames Slider
  if (quickPanel.framesSlider && spec.durationModes.includes('frames')) {
    // 假设 FPS = 24
    // Calculate min/max frames based on duration OR use explicit limits
    const minFrames = spec.minFrames || Math.ceil(spec.minDur * 24);
    const maxFrames = spec.maxFrames || Math.floor(spec.maxDur * 24);
    
    quickPanel.framesSlider.min = minFrames;
    quickPanel.framesSlider.max = maxFrames;
    
    // Update Hint Text
    const hintEl = document.querySelector('.frames-hint span:first-child');
    if (hintEl) {
        hintEl.textContent = `有效帧数范围:${minFrames}-${maxFrames}`;
    }

    // Clamp current frames
    let newFrames = appState.frames;
    if (newFrames < minFrames) newFrames = minFrames;
    if (newFrames > maxFrames) newFrames = maxFrames;
    
    if (newFrames !== appState.frames) {
      updateState({ frames: newFrames });
    }
  }

  // Update Audio Visibility/State
  if (quickPanel.audioBtn) {
    if (spec.audio) {
      quickPanel.audioBtn.style.display = 'flex';
    } else {
      quickPanel.audioBtn.style.display = 'none';
      if (appState.audio) {
        updateState({ audio: false });
      }
    }
  }

  // Update Duration Mode Buttons Visibility (Quick Panel)
  const modes = spec.durationModes || ['seconds', 'auto'];
  quickPanel.durModeBtns.forEach(btn => {
    const mode = btn.dataset.mode;
    if (modes.includes(mode)) {
      btn.style.display = ''; // Use default display (flex/block from css)
    } else {
      btn.style.display = 'none';
    }
    
    // Check if current active mode is valid
    if (appState.durationMode === mode && !modes.includes(mode)) {
       updateState({ durationMode: modes[0] });
    }
  });

  // Update Duration Mode Buttons Visibility (Config Modal)
  if (configModal.durBtns) {
    configModal.durBtns.forEach(btn => {
      const mode = btn.dataset.mode;
      if (modes.includes(mode)) {
        btn.style.display = '';
      } else {
        btn.style.display = 'none';
      }
    });
  }

  // Update Frames Wrapper Visibility in Modal
  if (configModal.framesWrapper) {
      if (appState.durationMode === 'frames') {
          configModal.framesWrapper.style.display = 'block';
          if (configModal.framesSlider) configModal.framesSlider.value = appState.frames;
          if (configModal.framesValue) configModal.framesValue.textContent = appState.frames;
      } else {
          configModal.framesWrapper.style.display = 'none';
      }
  }

  // Update Ratio Options Visibility (Adaptive)
  updateRatioOptionsVisibility(spec);

  // Update Draft Button Visibility
  const draftBtn = document.getElementById('draftBtn');
  if (draftBtn) {
    draftBtn.style.display = spec.supportDraft ? 'flex' : 'none';
    if (!spec.supportDraft && appState.draft) {
      updateState({ draft: false });
    }
  }

  // Update Reference Image Button Visibility
  const refBtn = document.getElementById('referenceImageBtn');
  if (refBtn) {
      refBtn.style.display = spec.supportReferenceImage ? 'flex' : 'none';
      if (!spec.supportReferenceImage && appState.referenceImageMode) {
          updateState({ referenceImageMode: false });
      }
  }

  if (appState.referenceImageMode) {
      const firstFrameBox = document.getElementById('firstFrameBox');
      const lastFrameBox = document.getElementById('lastFrameBox');
      const swapIcon = document.querySelector('.swap-icon');
      if (firstFrameBox) firstFrameBox.style.display = 'none';
      if (lastFrameBox) lastFrameBox.style.display = 'none';
      if (swapIcon) swapIcon.style.display = 'none';
  }
}

// Update Ratio Options Visibility based on supportAdaptive
function updateRatioOptionsVisibility(spec) {
  // Quick Panel Adaptive Button
  const quickAdaptiveBtn = document.querySelector('.settings-panel .ratio-btn[data-ratio="adaptive"]');
  if (quickAdaptiveBtn) {
    if (spec.supportAdaptive) {
      quickAdaptiveBtn.style.display = '';
    } else {
      quickAdaptiveBtn.style.display = 'none';
      // If currently selected, switch to 16:9
      if (appState.ratio === 'adaptive' || appState.ratio === '智能') {
          updateState({ ratio: '16:9' });
      }
    }
  }
}

// Update Input Frames Visibility based on model specifications
function updateInputFramesVisibility(spec) {
  const firstFrameBox = document.getElementById('firstFrameBox');
  const lastFrameBox = document.getElementById('lastFrameBox');
  const swapIcon = document.querySelector('.swap-icon');
  
  if (!firstFrameBox || !lastFrameBox) return;

  const hasFirst = spec.frames && spec.frames.includes('first');
  const hasLast = spec.frames && spec.frames.includes('last');

  // Logic:
  // - If both: Show both + Swap Icon
  // - If only first: Show first, hide last, hide swap
  // - If neither (T2V only): Hide both (or maybe show first but disabled? User asked to toggle display)
  //   Let's assume hide entire frames container if neither.

  if (hasFirst) {
      firstFrameBox.style.display = 'flex';
  } else {
      firstFrameBox.style.display = 'none';
  }

  if (hasLast) {
      lastFrameBox.style.display = 'flex';
  } else {
      lastFrameBox.style.display = 'none';
  }

  if (hasFirst && hasLast) {
      if (swapIcon) swapIcon.style.display = 'flex';
  } else {
      if (swapIcon) swapIcon.style.display = 'none';
  }
}

// Export to global scope
window.updateModelConfig = updateModelConfig;
window.updateInputFramesVisibility = updateInputFramesVisibility;
window.updateRatioOptionsVisibility = updateRatioOptionsVisibility;
