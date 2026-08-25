export const DEFAULT_PAGES_WIDTH = 280;
export const MIN_PAGES_WIDTH = 220;
export const MAX_PAGES_WIDTH = 440;
export const PAGES_WIDTH_STORAGE_KEY = 'html-slot-editor:pages-width:v1';
export const DEFAULT_SLOTS_WIDTH = 340;
export const MIN_SLOTS_WIDTH = 260;
export const MAX_SLOTS_WIDTH = 520;
export const SLOTS_WIDTH_STORAGE_KEY = 'html-slot-editor:slots-width:v1';

export function clampPagesWidth(value, min = MIN_PAGES_WIDTH, max = MAX_PAGES_WIDTH) {
  if (value === null || value === undefined || value === '') return DEFAULT_PAGES_WIDTH;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_PAGES_WIDTH;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

export function clampSlotsWidth(value, min = MIN_SLOTS_WIDTH, max = MAX_SLOTS_WIDTH) {
  if (value === null || value === undefined || value === '') return DEFAULT_SLOTS_WIDTH;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_SLOTS_WIDTH;
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

function readStoredWidth(storage, storageKey) {
  try {
    return storage?.getItem(storageKey);
  } catch {
    return null;
  }
}

function persistWidth(storage, storageKey, width) {
  try {
    storage?.setItem(storageKey, String(width));
  } catch {
    // Width adjustment should continue even when storage is unavailable.
  }
}

function createPanelResizer({
  documentRef,
  shell,
  handle,
  storage,
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
  cssVariable,
  clampWidth,
  widthFromPointer,
  arrowLeftDelta,
  arrowRightDelta
}) {
  if (!documentRef || !shell || !handle) {
    return {
      getWidth: () => defaultWidth,
      setWidth: () => defaultWidth,
      destroy() {}
    };
  }

  const resolvedStorage = resolveStorage(storage);
  let width = clampWidth(readStoredWidth(resolvedStorage, storageKey));
  let dragging = false;
  let activePointerId = null;

  function applyWidth(nextWidth, { persist = true } = {}) {
    width = clampWidth(nextWidth);
    shell.style.setProperty(cssVariable, `${width}px`);
    handle.setAttribute('aria-valuenow', String(width));
    if (persist) persistWidth(resolvedStorage, storageKey, width);
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
    const shellRect = shell.getBoundingClientRect?.() ?? { left: 0, right: 0 };
    applyWidth(widthFromPointer(event, shellRect));
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
      applyWidth(width + arrowLeftDelta);
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      applyWidth(width + arrowRightDelta);
      event.preventDefault();
    }
  }

  handle.setAttribute('aria-valuemin', String(minWidth));
  handle.setAttribute('aria-valuemax', String(maxWidth));
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

export function createPagesResizer({
  document: documentRef = globalThis.document,
  shell,
  handle,
  storage
} = {}) {
  return createPanelResizer({
    documentRef,
    shell,
    handle,
    storage,
    defaultWidth: DEFAULT_PAGES_WIDTH,
    minWidth: MIN_PAGES_WIDTH,
    maxWidth: MAX_PAGES_WIDTH,
    storageKey: PAGES_WIDTH_STORAGE_KEY,
    cssVariable: '--pages-width',
    clampWidth: clampPagesWidth,
    widthFromPointer: (event, shellRect) => event.clientX - shellRect.left,
    arrowLeftDelta: -16,
    arrowRightDelta: 16
  });
}

export function createSlotsResizer({
  document: documentRef = globalThis.document,
  shell,
  handle,
  storage
} = {}) {
  return createPanelResizer({
    documentRef,
    shell,
    handle,
    storage,
    defaultWidth: DEFAULT_SLOTS_WIDTH,
    minWidth: MIN_SLOTS_WIDTH,
    maxWidth: MAX_SLOTS_WIDTH,
    storageKey: SLOTS_WIDTH_STORAGE_KEY,
    cssVariable: '--slots-width',
    clampWidth: clampSlotsWidth,
    widthFromPointer: (event, shellRect) => shellRect.right - event.clientX,
    arrowLeftDelta: 16,
    arrowRightDelta: -16
  });
}
