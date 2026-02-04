// ==========================================
// GENERATION LOGIC
// ==========================================

let isGenerating = false;
// Use local proxy instead of direct call to avoid CORS
const API_ENDPOINT = '/api/generate'; 

async function loadModelConfigFile() {
  const response = await fetch('/json/model-config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`读取 model-config.json 失败: HTTP ${response.status}`);
  }
  return await response.json();
}

async function initGeneration() {
  const generateBtn = document.getElementById('generateBtn');

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      if (isGenerating) return;
      let taskId = null;

      const hasPrompt = String(window.appState?.prompt || '').trim().length > 0;
      const hasReferenceImages = Array.isArray(window.appState?.referenceImages) && window.appState.referenceImages.some(Boolean);
      const hasFrameImages = !!window.appState?.firstFrame || !!window.appState?.lastFrame;
      const hasImage = hasReferenceImages || hasFrameImages;
      if (!hasPrompt && !hasImage) {
        if (typeof window.notify === 'function') window.notify('warning', '请输入提示词或上传图片后再生成');
        return;
      }

      // 1. Get API Key
      const apiKey = await Storage.get('apiKey');
      if (!apiKey) {
        if (typeof window.notify === 'function') window.notify('warning', '请先在配置中设置 API Key');
        document.getElementById('configBtn')?.click();
        return;
      }

      // 2. Load Request Body from Config File (No Modification)

      const setBtnVisualState = (state) => {
        const prevState = generateBtn.dataset.visualState || 'idle';
        const originalSwitchTimer = generateBtn.dataset.switchTimer ? Number(generateBtn.dataset.switchTimer) : 0;
        if (originalSwitchTimer) clearTimeout(originalSwitchTimer);

        generateBtn.classList.remove('is-loading', 'is-success');
        if (state === 'loading') generateBtn.classList.add('is-loading');
        if (state === 'success') generateBtn.classList.add('is-success');

        if (state !== prevState) {
          generateBtn.classList.add('is-switching');
          const t = window.setTimeout(() => generateBtn.classList.remove('is-switching'), 220);
          generateBtn.dataset.switchTimer = String(t);
        }

        generateBtn.dataset.visualState = state;
      };

      // 4. UI Feedback (Only lock during request submission)
      isGenerating = true;
      generateBtn.disabled = true;
      setBtnVisualState('loading');
      const originalStatusTimer = generateBtn.dataset.statusTimer ? Number(generateBtn.dataset.statusTimer) : 0;
      if (originalStatusTimer) clearTimeout(originalStatusTimer);

      try {
        const payload = await loadModelConfigFile();
        
        if (appState.debug) {
            const debugPayload = {
                upstream_url: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
                body: payload
            };
            
            if (window.showDebugModal) {
                window.showDebugModal(debugPayload);
            } else {
                if (typeof window.notify === 'function') window.notify('info', '调试信息已生成');
            }
            
            isGenerating = false;
            generateBtn.disabled = false;
            setBtnVisualState('idle');
            return;
        }

        taskId = await createGenerationTask(apiKey, payload);
        
        if (!taskId) throw new Error('Failed to create task');

        const snapshot = {
          model: window.appState?.model,
          ratio: window.appState?.ratio,
          resolution: window.appState?.resolution,
          durationMode: window.appState?.durationMode,
          duration: window.appState?.duration,
          frames: window.appState?.frames,
          quantity: window.appState?.quantity,
          audio: window.appState?.audio,
          draft: window.appState?.draft,
          watermark: window.appState?.watermark,
          cameraFixed: window.appState?.cameraFixed,
          seedEnabled: window.appState?.seedEnabled,
          seed: window.appState?.seed,
          prompt: window.appState?.prompt,
          uploadedImageInfo: window.appState?.uploadedImageInfo,
          firstFrame: window.appState?.firstFrame,
          lastFrame: window.appState?.lastFrame,
          referenceImageMode: window.appState?.referenceImageMode,
          referenceImages: window.appState?.referenceImages
        };

        if (window.Tasks?.createTaskFromSnapshot) {
          await window.Tasks.createTaskFromSnapshot(taskId, payload, snapshot);
        }

        setBtnVisualState('success');
        generateBtn.disabled = false;
        isGenerating = false;
        const t = window.setTimeout(() => setBtnVisualState('idle'), 2000);
        generateBtn.dataset.statusTimer = String(t);

        // 6. Poll Status (Do not lock the button)
        pollTaskStatus(apiKey, taskId)
          .then(async (result) => {
            if (window.Tasks?.markTaskSucceeded) {
              await window.Tasks.markTaskSucceeded(taskId, result);
            }
            handleGenerationSuccess(taskId, result);
          })
          .catch(async (error) => {
            console.error('Generation failed:', error);
            if (typeof window.notifyGeneration === 'function') window.notifyGeneration('error', `任务生成失败：${error.message}`);
            else if (typeof window.notify === 'function') window.notify('error', `生成失败: ${error.message}`);
            if (taskId && window.Tasks?.markTaskFailed) {
              await window.Tasks.markTaskFailed(taskId, error.message);
            }
          });
        
      } catch (error) {
        console.error('Generation failed:', error);
        if (typeof window.notifyGeneration === 'function') window.notifyGeneration('error', `任务生成失败：${error.message}`);
        else if (typeof window.notify === 'function') window.notify('error', `生成失败: ${error.message}`);
        if (taskId && window.Tasks?.markTaskFailed) {
          await window.Tasks.markTaskFailed(taskId, error.message);
        }
        isGenerating = false;
        generateBtn.disabled = false;
        setBtnVisualState('idle');
      }
    });
  }
}

async function createGenerationTask(apiKey, payload) {
  try {
    const url = API_ENDPOINT;
    
    console.log('Sending API Request:', payload);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        data = await response.json();
    } else {
        // If not json (e.g. 404 text), try to read text
        data = { error: { message: await response.text() } };
    }

    if (!response.ok) {
        // Construct Detailed Debug Info for Modal
        const debugInfo = {
            url: url,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            requestBody: payload,
            responseBody: data
        };
        
        if (window.appState?.debug && window.showDebugModal) {
            window.showDebugModal(debugInfo);
        }
        
        throw new Error(data.error?.message || `HTTP ${response.status} ${response.statusText}`);
    }

    return data.id; // Task ID

  } catch (error) {
     // Handle Network/CORS Errors specifically
     if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
         const corsDebug = {
             error: "Network Error / CORS Issue",
             message: "请求被浏览器拦截或网络连接失败。如果是本地运行，这通常是因为跨域限制(CORS)。",
             suggestion: "API 不支持从浏览器直接发起跨域请求。请尝试：\n1. 使用本地代理服务器。\n2. 检查 API Key 是否正确。\n3. 检查网络连接。",
             originalError: error.message
         };
         if (window.appState?.debug && window.showDebugModal) window.showDebugModal(corsDebug);
         throw new Error('网络错误/跨域问题：Failed to fetch');
     }
     throw error;
  }
}

async function pollTaskStatus(apiKey, taskId, onProgress) {
  const url = `${API_ENDPOINT}/${taskId}`;
  const POLLING_INTERVAL = 2000; // 2s
  const MAX_ATTEMPTS = 150; // 5 mins

  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (!response.ok) {
             // If 404, maybe wait a bit? Or fail.
             throw new Error(`Polling failed: ${response.status}`);
        }

        const data = await response.json();
        const status = data.status; // 'queued', 'running', 'succeeded', 'failed'

        if (status === 'succeeded') {
            return data;
        } else if (status === 'failed') {
            throw new Error(data.error?.message || 'Task failed');
        } else {
            // queued or running
            if (onProgress) onProgress(status);
        }

    } catch (e) {
        console.warn('Polling error (retrying):', e);
    }

    await new Promise(r => setTimeout(r, POLLING_INTERVAL));
    attempts++;
  }

  throw new Error('Timeout waiting for generation');
}

function handleGenerationSuccess(taskId, result) {
    const usage = result?.usage || result?.content?.usage || result?.result?.usage;
    const tokens = usage?.total_tokens || usage?.tokens || usage?.totalTokens || usage?.total;
    if (Number.isFinite(Number(tokens)) && typeof window.updateState === 'function') {
        const modelId = window.appState?.model || document.querySelector('.model-option.active')?.dataset?.model || '';
        const pricePerMillion = typeof window.getCurrentPricePerMillionTokens === 'function' ? window.getCurrentPricePerMillionTokens(modelId) : null;
        window.updateState({
            lastUsageTokens: Number(tokens),
            lastUsageModel: modelId,
            lastUsagePricePerMillion: Number.isFinite(Number(pricePerMillion)) ? Number(pricePerMillion) : null
        });
    }
    if (typeof window.notifyGeneration === 'function') window.notifyGeneration('success', '任务生成成功');
    else if (typeof window.notify === 'function') window.notify('info', '生成成功');
}
