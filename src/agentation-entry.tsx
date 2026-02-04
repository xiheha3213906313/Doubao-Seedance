import { Agentation } from "agentation";
import React from "react";
import { createRoot, type Root } from "react-dom/client";

let root: Root | null = null;
const storageKey = "doubao:agentation:enabled";

function ensureContainer() {
  const existing = document.getElementById("__agentation_root");
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = "__agentation_root";
  document.body.appendChild(el);
  return el;
}

function isEnabled() {
  try {
    const v = localStorage.getItem(storageKey);
    if (v == null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

function setEnabled(enabled: boolean) {
  try {
    localStorage.setItem(storageKey, enabled ? "1" : "0");
  } catch {}
  applyEnabled(enabled);
}

function applyEnabled(enabled: boolean) {
  if (!enabled) {
    root?.unmount();
    root = null;
    return;
  }
  if (root) return;
  const container = ensureContainer();
  root = createRoot(container);
  root.render(<Agentation />);
}

declare global {
  interface Window {
    __agentation?: {
      available: true;
      setEnabled: (enabled: boolean) => void;
      getEnabled: () => boolean;
    };
  }
}

function init() {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Reveal Developer Options in Dev Mode
  const devRow = document.getElementById('developerModeRow');
  if (devRow) {
    devRow.style.display = 'flex';
  }

  window.__agentation = {
    available: true,
    setEnabled,
    getEnabled: isEnabled
  };
  window.dispatchEvent(new Event("agentation:ready"));

  setEnabled(false);

  window.addEventListener("storage", (e) => {
    if (e.key !== storageKey) return;
    applyEnabled(isEnabled());
  });
}

init();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root?.unmount();
    root = null;
  });
}
