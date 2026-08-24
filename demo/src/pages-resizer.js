export const DEFAULT_PAGES_WIDTH = 280;
export const MIN_PAGES_WIDTH = 220;
export const MAX_PAGES_WIDTH = 440;
export const PAGES_WIDTH_STORAGE_KEY = 'html-slot-editor:pages-width:v1';

export function clampPagesWidth(value, min = MIN_PAGES_WIDTH, max = MAX_PAGES_WIDTH) {
  if (value === null || value === undefined || value === '') return DEFAULT_PAGES_WIDTH;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_PAGES_WIDTH;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readStoredWidth(storage) {
  try {
    return storage?.getItem(PAGES_WIDTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistWidth(storage, width) {
  try {
    storage?.setItem(PAGES_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Width adjustment should continue even when storage is unavailable.
  }
}

export function createPagesResizer({
  document: documentRef = globalThis.document,
  shell,
  handle,
  storage
} = {}) {
  if (!documentRef || !shell || !handle) {
    return {
      getWidth: () => DEFAULT_PAGES_WIDTH,
      setWidth: () => DEFAULT_PAGES_WIDTH,
      destroy() {}
    };
  }

  const resolvedStorage = resolveStorage(storage);
  let width = clampPagesWidth(readStoredWidth(resolvedStorage));
  let dragging = false;
  let activePointerId = null;

  function applyWidth(nextWidth, { persist = true } = {}) {
    width = clampPagesWidth(nextWidth);
    shell.style.setProperty('--pages-width', `${width}px`);
    handle.setAttribute('aria-valuenow', String(width));
    if (persist) persistWidth(resolvedStorage, width);
    return width;
  }

  function onPointerDown(event) {
    if (typeof event.button === 'number' && event.button !== 0) return;
    dragging = true;
    activePointerId = event.pointerId ?? null;
    handle.classList.add('is-dragging');
    try {
      handle.setPointerCapture?.(activePointerId);
    } catch {
      // Synthetic events and browsers without pointer capture can still drag.
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragging) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    const shellRect = shell.getBoundingClientRect?.() ?? { left: 0 };
    applyWidth(event.clientX - shellRect.left);
  }

  function stopDragging(event) {
    if (!dragging) return;
    if (activePointerId !== null && event.pointerId !== undefined && event.pointerId !== activePointerId) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    try {
      handle.releasePointerCapture?.(activePointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    activePointerId = null;
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      applyWidth(width - 16);
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      applyWidth(width + 16);
      event.preventDefault();
    }
  }

  handle.setAttribute('aria-valuemin', String(MIN_PAGES_WIDTH));
  handle.setAttribute('aria-valuemax', String(MAX_PAGES_WIDTH));
  applyWidth(width, { persist: false });
  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('keydown', onKeyDown);
  documentRef.addEventListener('pointermove', onPointerMove);
  documentRef.addEventListener('pointerup', stopDragging);
  documentRef.addEventListener('pointercancel', stopDragging);

  return {
    getWidth: () => width,
    setWidth: (nextWidth) => applyWidth(nextWidth),
    destroy() {
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('keydown', onKeyDown);
      documentRef.removeEventListener('pointermove', onPointerMove);
      documentRef.removeEventListener('pointerup', stopDragging);
      documentRef.removeEventListener('pointercancel', stopDragging);
      handle.classList.remove('is-dragging');
    }
  };
}
