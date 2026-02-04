// ==========================================
// IMAGE UPLOAD & SWAP LOGIC
// ==========================================

function initUpload() {
  setupUpload('firstFrameInput', 'firstFrameBox', 'firstFramePreview');
  setupUpload('lastFrameInput', 'lastFrameBox', 'lastFramePreview');
  initSwapIcon();
}

function setupUpload(inputId, boxId, previewId, isMulti = false) {
  const input = document.getElementById(inputId);
  const box = document.getElementById(boxId);
  const preview = document.getElementById(previewId);
  const previewGrid = document.getElementById('refPreviewGrid');

  if (!input || !box) return;

  // --- Handle Overlay Actions ---
  const overlay = box.querySelector('.upload-mask');
  
  if (overlay) {
    // Delete
    const btnDelete = overlay.querySelector('.btn-delete');
    if (btnDelete) {
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation(); 
        clearUpload(box, input, preview);
      });
    }

    // Replace
    const btnReplace = overlay.querySelector('.btn-replace');
    if (btnReplace) {
      btnReplace.addEventListener('click', (e) => {
        e.stopPropagation();
        input.click();
      });
    }

    // Preview Hover
    const btnPreview = overlay.querySelector('.btn-preview-trigger');
    const popover = document.getElementById('imagePreviewPopover');
    
    if (btnPreview && popover && preview) {
        let hoverTimer = null;
        let hoverToken = 0;

        const positionPopover = () => {
            const rect = btnPreview.getBoundingClientRect();
            const popRect = popover.getBoundingClientRect();
            const popWidth = popRect.width;
            const popHeight = popRect.height;
            const gap = 10;

            popover.style.position = 'fixed';
            popover.style.zIndex = '9999';

            const top = rect.top - popHeight - gap;
            popover.style.top = Math.max(8, top) + 'px';

            let left = rect.left + (rect.width / 2) - (popWidth / 2);
            left = Math.max(8, Math.min(left, window.innerWidth - popWidth - 8));
            popover.style.left = left + 'px';
        };

        btnPreview.addEventListener('mouseenter', () => {
            hoverToken += 1;
            const token = hoverToken;
            if (hoverTimer) clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                if (token !== hoverToken) return;
                const popoverImg = popover.querySelector('img');
                if (popoverImg && preview.src) {
                    popover.classList.remove('active');
                    popoverImg.onload = () => {
                        if (token !== hoverToken) return;
                        positionPopover();
                        popover.classList.add('active');
                    };
                    popoverImg.onerror = () => {};
                    popoverImg.src = preview.src;
                    if (popoverImg.complete) {
                        popoverImg.onload();
                    }
                }
            }, 150);
        });

        btnPreview.addEventListener('mouseleave', () => {
            hoverToken += 1;
            if (hoverTimer) clearTimeout(hoverTimer);
            const popoverImg = popover.querySelector('img');
            if (popoverImg) {
                popoverImg.onload = null;
                popoverImg.onerror = null;
            }
            popover.classList.remove('active');
        });

        // Preview Click (Fullscreen)
        btnPreview.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (preview.src) {
                showFullscreenPreview(preview.src);
            }
        });
    }
  }

  // Box Click - Trigger Upload
  box.addEventListener('click', (e) => {
    // Only trigger if not clicking buttons
    if (!e.target.closest('.mask-btn')) {
        input.click();
    }
  });

  // Drag & Drop Support
  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    box.classList.add('drag-over');
  });

  box.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    box.classList.remove('drag-over');
  });

  box.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    box.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    
    handleFiles(files, isMulti, previewGrid, preview, box);
  });

  input.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    handleFiles(files, isMulti, previewGrid, preview, box);
  });
}

function handleFiles(files, isMulti, previewGrid, preview, box) {
    if (isMulti && previewGrid) {
      // Multi image logic
      previewGrid.innerHTML = '';
      previewGrid.hidden = false;
      box.classList.add('has-image');
      box.querySelector('.upload-placeholder').style.display = 'none';

      files.slice(0, 4).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = document.createElement('img');
          img.src = ev.target.result;
          img.className = 'ref-preview-item';
          previewGrid.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    } else if (preview) {
      // Single image logic
      const file = files[0];
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imgObj = new Image();
        imgObj.onload = () => {
             if (window.updateState) {
                 const updates = {
                     uploadedImageInfo: {
                         width: imgObj.width,
                         height: imgObj.height
                     }
                 };

                 if (box.id === 'firstFrameBox') {
                     updates.firstFrame = ev.target.result;
                 } else if (box.id === 'lastFrameBox') {
                     updates.lastFrame = ev.target.result;
                 }

                 window.updateState(updates);
             }
        };
        imgObj.src = ev.target.result;

        preview.src = ev.target.result;
        preview.hidden = false;
        box.classList.add('has-image');
        box.querySelector('.upload-placeholder').style.display = 'none';
        
        const mask = box.querySelector('.upload-mask');
        if (mask) mask.hidden = false;
      };
      reader.readAsDataURL(file);
    }
}

function clearUpload(box, input, preview) {
    input.value = '';
    if (preview) {
        preview.src = '';
        preview.hidden = true;
    }
    box.classList.remove('has-image');
    box.querySelector('.upload-placeholder').style.display = 'flex';
    
    const mask = box.querySelector('.upload-mask');
    if (mask) mask.hidden = true;

    // 清除 state
    if (window.updateState) {
        const updates = { uploadedImageInfo: null };
        if (box.id === 'firstFrameBox') updates.firstFrame = null;
        if (box.id === 'lastFrameBox') updates.lastFrame = null;
        window.updateState(updates);
    }
}

function initSwapIcon() {
  const swapIcon = document.querySelector('.swap-icon');
  if (swapIcon) {
    swapIcon.addEventListener('click', () => {
      const firstPreview = document.getElementById('firstFramePreview');
      const lastPreview = document.getElementById('lastFramePreview');
      const firstBox = document.getElementById('firstFrameBox');
      const lastBox = document.getElementById('lastFrameBox');

      // Swap Src
      const tempSrc = firstPreview.src;
      const tempHidden = firstPreview.hidden;

      firstPreview.src = lastPreview.src;
      firstPreview.hidden = lastPreview.hidden;
      
      lastPreview.src = tempSrc;
      lastPreview.hidden = tempHidden;

      // Update Box Styles
      updateBoxStyle(firstBox, firstPreview.hidden);
      updateBoxStyle(lastBox, lastPreview.hidden);

      // Swap State
      if (window.appState && window.updateState) {
          const firstData = window.appState.firstFrame;
          const lastData = window.appState.lastFrame;
          window.updateState({
              firstFrame: lastData,
              lastFrame: firstData
          });
      }
    });
  }
}

function updateBoxStyle(box, isHidden) {
  const mask = box.querySelector('.upload-mask');
  if (isHidden) {
    box.classList.remove('has-image');
    box.querySelector('.upload-placeholder').style.display = 'flex';
    if (mask) mask.hidden = true;
  } else {
    box.classList.add('has-image');
    box.querySelector('.upload-placeholder').style.display = 'none';
    if (mask) mask.hidden = false;
  }
}

// --- Fullscreen Preview Logic ---
let currentScale = 1;
const ZOOM_STEP = 0.1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;

function showFullscreenPreview(src) {
  const overlay = document.getElementById('fullscreenPreviewOverlay');
  const img = document.getElementById('fullscreenPreviewImage');
  const closeBtn = document.getElementById('fullscreenCloseBtn');
  
  if (!overlay || !img) return;
  
  img.src = src;
  overlay.hidden = false;
  // Trigger reflow
  void overlay.offsetWidth;
  overlay.classList.add('active');
  
  // Reset Zoom
  currentScale = 1;
  img.style.transform = `scale(${currentScale})`;
  
  // Disable body scroll
  document.body.style.overflow = 'hidden';
  
  // Events
  const handleClose = () => {
    overlay.classList.remove('active');
    setTimeout(() => {
        overlay.hidden = true;
        img.src = '';
        document.body.style.overflow = '';
    }, 300);
    
    // Cleanup events
    overlay.removeEventListener('click', handleOverlayClick);
    closeBtn.removeEventListener('click', handleClose);
    window.removeEventListener('keydown', handleEsc);
    overlay.removeEventListener('wheel', handleWheel);
  };
  
  const handleOverlayClick = (e) => {
    if (e.target === overlay || e.target === document.querySelector('.fullscreen-preview-content')) {
        handleClose();
    }
  };
  
  const handleEsc = (e) => {
      if (e.key === 'Escape') handleClose();
  };
  
  const handleWheel = (e) => {
      e.preventDefault();
      
      if (e.deltaY < 0) {
          // Zoom In
          currentScale = Math.min(currentScale + ZOOM_STEP, MAX_SCALE);
      } else {
          // Zoom Out
          currentScale = Math.max(currentScale - ZOOM_STEP, MIN_SCALE);
      }
      
      img.style.transform = `scale(${currentScale})`;
  };

  overlay.addEventListener('click', handleOverlayClick);
  closeBtn.addEventListener('click', handleClose);
  window.addEventListener('keydown', handleEsc);
  overlay.addEventListener('wheel', handleWheel, { passive: false });
}
