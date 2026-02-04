// ==========================================
// MAIN ENTRY POINT
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Storage and load state
  try {
    if (window.Storage) {
      await Storage.init();
      // Remove state restoration to reset config on refresh
      // const savedState = await Storage.get('appState');
      // if (savedState) {
      //   Object.assign(window.appState, savedState);
      // }
    }
  } catch (e) {
    console.error('Failed to initialize storage:', e);
  }

  initUI();
  initUpload();
  initGeneration();
  window.Tasks?.initTasks?.();

  const refBtn = document.getElementById('referenceImageBtn');
  if (refBtn && !refBtn.dataset.bound) {
    refBtn.dataset.bound = '1';
    refBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!window.MODEL_SPECS) return;
      const spec = window.MODEL_SPECS[window.appState?.model] || window.MODEL_SPECS['default'];
      if (!spec?.supportReferenceImage) return;
      const next = !window.appState.referenceImageMode;
      const updates = { referenceImageMode: next };
      if (next) {
        if (window.appState.resolution === '1080p') updates.resolution = '720p';
      }
      window.updateState?.(updates);
    });
  }
  
  // Initialize UI state
  renderUI();

  // Force save initial config to reset file
  if (window.updateState) {
      window.updateState({});
  }

  const runEnterAnimations = () => {
    const root = document.querySelector('.app');
    if (!root) return;
    const elements = Array.from(root.querySelectorAll('*'));
    const animated = [];
    for (const el of elements) {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none') continue;
      if (cs.visibility === 'hidden') continue;
      if (Number(cs.opacity) < 0.99) continue;
      if (el.closest('.modal-overlay')) continue;
      el.classList.add('ui-enter');
      animated.push(el);
    }
    window.setTimeout(() => {
      animated.forEach((el) => el.classList.remove('ui-enter'));
    }, 1100);
  };

  document.body.classList.remove('page-preload');
  requestAnimationFrame(runEnterAnimations);

  console.log('Doubao Seedance UI Initialized');
});
