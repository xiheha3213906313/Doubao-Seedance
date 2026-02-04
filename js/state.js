// ==========================================
// STATE MANAGEMENT & SYNC
// ==========================================

const appState = {
  model: 'doubao-seedance-1-5-pro-251215',
  ratio: 'adaptive',
  resolution: '1080p',
  durationMode: 'seconds',
  duration: 4,
  frames: 29,
  quantity: 1,
  audio: false,
  draft: false, // Added draft mode
  watermark: false,
  cameraFixedEnabled: false,
  cameraFixed: false,
  seedEnabled: false,
  seed: '',
  lastUsageTokens: null,
  lastUsageModel: '',
  lastUsagePricePerMillion: null,
  prompt: '', // Added prompt to state
  firstFrame: null,
  lastFrame: null,
  debug: false
};

// Helper to save model config to JSON file (via Server)
async function saveModelConfig() {
  const configData = getModelConfigData();
  
  try {
    const response = await fetch('/api/save-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(configData)
    });

    if (!response.ok) {
      console.warn('Server config save failed:', response.status);
    } else {
      // console.log('Config saved successfully');
    }
  } catch (err) {
    // Silent fail if server is not running (e.g., opened as file://)
    console.warn('Could not connect to local server to save config. Ensure "node server.js" is running.');
  }
}

// Helper to extract only model-related config
function getModelConfigData() {
  const specs = window.MODEL_SPECS || {};
  const spec = specs[appState.model] || specs['default'] || {};

  // 1. Model
  const config = {
    model: appState.model
  };

  // 2. Content
  config.content = [];
  
  // Always add text object, even if prompt is empty
  config.content.push({
      type: "text",
      text: appState.prompt || ""
  });

  // Check for Reference Image Mode
  if (appState.referenceImageMode) {
      if (appState.referenceImages && appState.referenceImages.length > 0) {
          // Add Reference Images
          appState.referenceImages.forEach((imgData) => {
              if (imgData) {
                  config.content.push({
                      type: "image_url",
                      image_url: {
                          url: imgData
                      },
                      role: "reference_image"
                  });
              }
          });
      }
  } else {
      // Add First Frame
      if (appState.firstFrame) {
          config.content.push({
              type: "image_url",
              image_url: {
                  url: appState.firstFrame
              },
              role: "first_frame"
          });
      }

      // Add Last Frame
      if (appState.lastFrame) {
          config.content.push({
              type: "image_url",
              image_url: {
                  url: appState.lastFrame
              },
              role: "last_frame"
          });
      }
  }

  // 3. Resolution (moved up)
  config.resolution = appState.resolution;

  // 4. Ratio
  config.ratio = appState.ratio;
  if (appState.referenceImageMode && config.resolution === '1080p') {
      config.resolution = '720p';
  }

  // 5. Duration / Frames
  if (appState.durationMode === 'auto') {
      if (appState.model === 'doubao-seedance-1-5-pro-251215') {
          config.duration = -1;
      } else {
          config.duration = appState.duration;
      }
  } else if (appState.durationMode === 'frames') {
      config.frames = appState.frames;
  } else {
      // seconds
      config.duration = appState.duration;
  }

  // 6. Seed
  if (appState.seedEnabled && appState.seed !== '' && appState.seed != null) {
      const seedNum = parseInt(appState.seed);
      if (Number.isFinite(seedNum)) config.seed = seedNum;
  }

  // Draft Mode
  if (appState.draft) {
      config.draft = true;
  }

  // 7. Camera Fixed (New)
  if (!appState.referenceImageMode) {
      config.camera_fixed = !!appState.cameraFixed;
  }

  // 8. Watermark
  if (typeof appState.watermark === 'boolean') {
      config.watermark = appState.watermark;
  }
  
  // 126. Audio Logic (Not in user example list, but functionally needed for audio models)
  if (spec.audio) {
      config.generate_audio = appState.audio;
  }

  // Draft Logic Enforcement
  if (appState.draft) {
      // According to documentation: 仅支持 480p 分辨率（使用其他分辨率会报错），不支持返回尾帧功能，不支持离线推理功能。
      config.resolution = "480p";
      // Ensure model is compatible (Seedance 1.5 pro)
      if (appState.model !== 'doubao-seedance-1-5-pro-251215') {
          // You might want to handle this or just let it fail/warn
          // For now we assume the user knows, or we can force it if needed.
      }
  }

  return config;
}

// Helper to normalize ratio string
function normalizeRatio(text) {
  text = text.trim();
  // If text is "智能", it should map to "adaptive" if not already set by data-ratio
  // But usually data-ratio is set. This is a fallback.
  return (text === '智能' || text === '智能比例') ? 'adaptive' : text;
}

// Update State function
function updateState(updates) {
  Object.assign(appState, updates);
  
  // Side Effect: Enforce 480p in Draft Mode
  if (appState.draft) {
      appState.resolution = '480p';
  }
  if (!appState.cameraFixedEnabled) {
      appState.cameraFixed = false;
  }
  if (appState.referenceImageMode) {
      appState.cameraFixed = false;
  }

  // Save model config to JSON file (for external use)
  saveModelConfig();
  
  if (typeof window.renderUI === 'function') {
    window.renderUI();
  }
}

// Expose updateState to global scope for other scripts
window.updateState = updateState;
window.appState = appState;
window.renderUI = window.renderUI || function () {};

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

function getCurrentPricePerMillionTokens(modelId) {
  return getPricePerMillionTokens(modelId, { isI2V: !!appState.uploadedImageInfo, hasAudio: !!appState.audio });
}

window.getCurrentPricePerMillionTokens = getCurrentPricePerMillionTokens;
