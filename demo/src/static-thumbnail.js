import { serializeDocument } from './html-importer.js';

const ACTIVE_CONTENT_SELECTOR = 'iframe, object, embed, meta[http-equiv="refresh"]';
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const DEFAULT_RENDER_WIDTH = 1280;
const DEFAULT_RENDER_HEIGHT = 720;
const DEFAULT_OUTPUT_WIDTH = 160;
const DEFAULT_OUTPUT_HEIGHT = 90;
const HTML2CANVAS_URL = new URL('../vendor/html2canvas.min.js', import.meta.url).href;

function removeExecutableAttributes(doc) {
  doc.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (URL_ATTRIBUTES.has(name) && /^javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
}

function applyCurrentSlideContract(doc, slideId) {
  const target = doc.getElementById(slideId)
    ?? Array.from(doc.querySelectorAll('[data-slide-id]'))
      .find((slide) => slide.getAttribute('data-slide-id') === slideId);
  if (!target) throw new Error(`Static thumbnail slide "${slideId}" was not found.`);

  // Thumbnail PoC adapter for the current Demo slide contract (.slide + .is-active).
  doc.querySelectorAll('.slide, [data-slide-id]').forEach((slide) => {
    if (slide !== target) slide.remove();
  });
  target.hidden = false;
  target.removeAttribute('aria-hidden');
  target.classList.add('is-active');
  target.dataset.htmlSlotEditorActive = 'true';
}

function freezeStaticState(doc) {
  const style = doc.createElement('style');
  style.dataset.staticThumbnailStability = 'true';
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
  doc.head.append(style);
}

function waitForLoad(iframe, hostWindow, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = hostWindow.setTimeout(() => {
      reject(new Error(`Static thumbnail renderer timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    iframe.addEventListener('load', () => {
      hostWindow.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
}

async function waitForTargetImages(target) {
  const images = Array.from(target.querySelectorAll('img'));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
  const failedImage = images.find((image) => !image.complete || image.naturalWidth <= 0);
  if (failedImage) throw new Error('A static thumbnail image failed to load.');
  return images.length;
}

function waitForPaint(hostWindow) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    hostWindow.requestAnimationFrame(finish);
    hostWindow.setTimeout(finish, 50);
  });
}

function isTransparentColor(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return !normalized
    || normalized === 'transparent'
    || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(normalized);
}

function findInheritedTextColor(element, rendererWindow) {
  let ancestor = element.parentElement;
  while (ancestor) {
    const color = rendererWindow.getComputedStyle(ancestor).color;
    if (!isTransparentColor(color)) return color;
    ancestor = ancestor.parentElement;
  }
  return '#111216';
}

function applyCaptureCompatibility(root, rendererWindow) {
  const elements = [root, ...root.querySelectorAll('*')];
  elements.forEach((element) => {
    const computed = rendererWindow.getComputedStyle(element);
    if (computed.backgroundClip !== 'text' || computed.backgroundImage === 'none') return;

    // html2canvas 1.4.1 paints text-clipped gradients across the full element
    // box. Keep the canonical/static DOM untouched until capture, then degrade
    // only that visual effect to the nearest inherited solid text color.
    const fallbackColor = findInheritedTextColor(element, rendererWindow);
    element.style.setProperty('background', 'none', 'important');
    element.style.setProperty('background-image', 'none', 'important');
    element.style.setProperty('-webkit-background-clip', 'initial', 'important');
    element.style.setProperty('background-clip', 'initial', 'important');
    element.style.setProperty('color', fallbackColor, 'important');
    element.style.setProperty('-webkit-text-fill-color', fallbackColor, 'important');
  });
}

function loadTrustedCaptureLibrary(rendererDocument, hostWindow, timeoutMs) {
  return new Promise((resolve, reject) => {
    const script = rendererDocument.createElement('script');
    const timeoutId = hostWindow.setTimeout(() => {
      script.remove();
      reject(new Error(`Static thumbnail capture library timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    script.dataset.staticThumbnailTrustedLibrary = 'html2canvas-1.4.1';
    script.src = HTML2CANVAS_URL;
    script.addEventListener('load', () => {
      hostWindow.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      hostWindow.clearTimeout(timeoutId);
      reject(new Error('Static thumbnail capture library failed to load.'));
    }, { once: true });
    rendererDocument.head.append(script);
  });
}

export function createStaticThumbnailDocument({ html, slideId }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scriptElementsBeforeCleanup = doc.querySelectorAll('script').length;
  doc.querySelectorAll('script').forEach((script) => script.remove());
  doc.querySelectorAll(ACTIVE_CONTENT_SELECTOR).forEach((element) => element.remove());
  removeExecutableAttributes(doc);
  applyCurrentSlideContract(doc, slideId);
  freezeStaticState(doc);

  return {
    html: serializeDocument(doc),
    scriptElementsBeforeCleanup,
    scriptElementsAfterCleanup: doc.querySelectorAll('script').length
  };
}

export async function mountStaticThumbnailRenderer({
  document: documentRef,
  html,
  slideId,
  width = DEFAULT_RENDER_WIDTH,
  height = DEFAULT_RENDER_HEIGHT,
  timeoutMs = 5000
}) {
  const prepared = createStaticThumbnailDocument({ html, slideId });
  const hostWindow = documentRef.defaultView ?? window;
  const iframe = documentRef.createElement('iframe');
  iframe.dataset.staticThumbnailRenderer = 'true';
  iframe.title = `Static thumbnail renderer for ${slideId}`;
  iframe.tabIndex = -1;
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    border: '0',
    pointerEvents: 'none'
  });

  const loaded = waitForLoad(iframe, hostWindow, timeoutMs);
  iframe.srcdoc = prepared.html;
  (documentRef.body ?? documentRef.documentElement).append(iframe);

  try {
    await loaded;
    const rendererDocument = iframe.contentDocument;
    if (!rendererDocument) throw new Error('Parent cannot access the static thumbnail renderer document.');
    if (rendererDocument.querySelectorAll('script').length !== 0) {
      throw new Error('Static thumbnail renderer received executable user scripts.');
    }
    const target = rendererDocument.getElementById(slideId)
      ?? Array.from(rendererDocument.querySelectorAll('[data-slide-id]'))
        .find((slide) => slide.getAttribute('data-slide-id') === slideId);
    if (!target) throw new Error(`Static thumbnail slide "${slideId}" was not found after renderer load.`);
    await Promise.resolve(rendererDocument.fonts?.ready);
    const loadedImageCount = await waitForTargetImages(target);
    await waitForPaint(iframe.contentWindow);

    return {
      iframe,
      document: rendererDocument,
      target,
      diagnostics: {
        scriptElementsBeforeCleanup: prepared.scriptElementsBeforeCleanup,
        scriptElementsAfterCleanup: prepared.scriptElementsAfterCleanup,
        loadedImageCount
      },
      dispose() {
        iframe.remove();
      }
    };
  } catch (error) {
    iframe.remove();
    throw error;
  }
}

export async function generateStaticSlideThumbnail({
  document: documentRef,
  html,
  slideId,
  renderWidth = DEFAULT_RENDER_WIDTH,
  renderHeight = DEFAULT_RENDER_HEIGHT,
  outputWidth = DEFAULT_OUTPUT_WIDTH,
  outputHeight = DEFAULT_OUTPUT_HEIGHT,
  timeoutMs = 5000
}) {
  const hostWindow = documentRef.defaultView ?? window;
  const startedAt = hostWindow.performance.now();
  const renderer = await mountStaticThumbnailRenderer({
    document: documentRef,
    html,
    slideId,
    width: renderWidth,
    height: renderHeight,
    timeoutMs
  });

  try {
    // User scripts are already absent; only this pinned, trusted capture library is injected.
    await loadTrustedCaptureLibrary(renderer.document, hostWindow, timeoutMs);
    const html2canvas = renderer.iframe.contentWindow?.html2canvas;
    if (typeof html2canvas !== 'function') {
      throw new Error('Static thumbnail capture library is unavailable in the renderer.');
    }
    // The current Demo deck paints its theme background on .deck while each
    // .slide stays transparent. Capture that visual surface so transparent
    // slide pixels do not expose the dark Page-card fallback background.
    const captureTarget = renderer.target.closest('.deck') ?? renderer.target;
    applyCaptureCompatibility(captureTarget, renderer.iframe.contentWindow);
    await waitForPaint(renderer.iframe.contentWindow);
    const targetRect = captureTarget.getBoundingClientRect();
    const sourceWidth = Math.max(1, Math.round(targetRect.width));
    const sourceHeight = Math.max(1, Math.round(targetRect.height));
    const renderedCanvas = await html2canvas(captureTarget, {
      backgroundColor: null,
      logging: false,
      scale: 1,
      useCORS: true,
      imageTimeout: timeoutMs,
      width: sourceWidth,
      height: sourceHeight,
      windowWidth: renderWidth,
      windowHeight: renderHeight
    });
    const outputCanvas = documentRef.createElement('canvas');
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const context = outputCanvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.drawImage(renderedCanvas, 0, 0, outputWidth, outputHeight);
    const dataUrl = outputCanvas.toDataURL('image/png');

    return {
      dataUrl,
      width: outputWidth,
      height: outputHeight,
      sourceWidth,
      sourceHeight,
      durationMs: Math.round(hostWindow.performance.now() - startedAt),
      diagnostics: renderer.diagnostics
    };
  } finally {
    renderer.dispose();
  }
}
