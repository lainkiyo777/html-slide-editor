export const BRIDGE_CHANNEL = 'html-slot-editor';
export const BRIDGE_VERSION = 1;
export const BRIDGE_SOURCE_PARENT = 'html-slot-editor-parent';
export const BRIDGE_SOURCE_IFRAME = 'html-slot-editor-bridge';
export const BRIDGE_HIGHLIGHT_CLASS = 'html-slot-editor-bridge-highlight';
export const BRIDGE_HIDDEN_CLASS = 'html-slot-editor-bridge-hidden';

export function createBridgeScript() {
  return `<script data-html-slot-editor-bridge="true">
(() => {
  const CHANNEL = ${JSON.stringify(BRIDGE_CHANNEL)};
  const VERSION = ${BRIDGE_VERSION};
  const SOURCE_PARENT = ${JSON.stringify(BRIDGE_SOURCE_PARENT)};
  const SOURCE_IFRAME = ${JSON.stringify(BRIDGE_SOURCE_IFRAME)};
  const HIGHLIGHT_CLASS = ${JSON.stringify(BRIDGE_HIGHLIGHT_CLASS)};
  const HIDDEN_CLASS = ${JSON.stringify(BRIDGE_HIDDEN_CLASS)};
  const ALLOWED_INCOMING = new Set(['set-slot-value', 'set-slot-enabled', 'set-active-slide', 'highlight-slot']);
  const slides = Array.from(document.querySelectorAll('.slide'));
  const hasRuntimeHashNavigation = Array.from(document.scripts).some((script) => (
    !script.hasAttribute('data-html-slot-editor-bridge')
    && script.textContent.includes('hashchange')
    && script.textContent.includes('location.hash')
  ));
  let lastReportedSlideId = null;

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function findSlotElement(slotId) {
    for (const element of document.querySelectorAll('[data-edit-slot]')) {
      if (element.dataset.editSlot === slotId) {
        return element;
      }
    }
    return null;
  }

  function send(type, payload) {
    window.parent.postMessage({
      source: SOURCE_IFRAME,
      channel: CHANNEL,
      version: VERSION,
      type,
      payload
    }, '*');
  }

  function highlightSlot(slotId) {
    for (const element of document.querySelectorAll('[data-edit-slot]')) {
      element.classList.remove(HIGHLIGHT_CLASS);
      if (element.dataset.editSlot === slotId) {
        element.classList.add(HIGHLIGHT_CLASS);
      }
    }
  }

  function applyActiveSlideState(slideId) {
    for (const slide of slides) {
      const isActive = !slideId || slide.id === slideId;
      slide.hidden = !isActive;
      slide.dataset.htmlSlotEditorActive = isActive ? 'true' : 'false';
      slide.classList.toggle('is-active', isActive);
    }
    fitDeckToPreview();
  }

  function setActiveSlide(slideId) {
    lastReportedSlideId = slideId;
    applyActiveSlideState(slideId);
    syncRuntimeNavigation(slideId);
  }

  function syncRuntimeNavigation(slideId) {
    if (!hasRuntimeHashNavigation) return;
    const slideIndex = slides.findIndex((slide) => slide.id === slideId);
    if (slideIndex < 0) return;

    const hashTarget = '#/' + (slideIndex + 1);
    if (window.location.hash !== hashTarget) {
      window.location.hash = hashTarget;
    }
  }

  function reportRuntimeActiveSlide() {
    const activeSlide = slides.find((slide) => slide.id && slide.classList.contains('is-active'));
    const slideId = activeSlide?.id ?? null;
    if (!slideId || slideId === lastReportedSlideId) return;

    lastReportedSlideId = slideId;
    applyActiveSlideState(slideId);
    send('active-slide-changed', { slideId });
  }

  function fitDeckToPreview() {
    const deckRoot = document.querySelector('.slides-offset');
    if (!deckRoot) return;

    const viewportWidth = Math.max(document.documentElement.clientWidth || window.innerWidth || 1, 1);
    const viewportHeight = Math.max(document.documentElement.clientHeight || window.innerHeight || 1, 1);
    const naturalWidth = Math.max(deckRoot.scrollWidth, deckRoot.offsetWidth, 1);
    const naturalHeight = Math.max(deckRoot.scrollHeight, deckRoot.offsetHeight, 1);
    const scale = Math.min(1, viewportWidth / naturalWidth, viewportHeight / naturalHeight);

    deckRoot.style.setProperty('transform-origin', 'top left', 'important');
    deckRoot.style.setProperty('transform', 'scale(' + scale + ')', 'important');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    deckRoot.dataset.htmlSlotEditorPreviewScale = String(scale);
  }

  function setSlotEnabled(slotId, enabled) {
    const slot = findSlotElement(slotId);
    if (!slot) return;
    slot.classList.toggle(HIDDEN_CLASS, !enabled);
    fitDeckToPreview();
  }

  function applySlotValue(slotId, value) {
    const slot = findSlotElement(slotId);
    if (!slot) return;

    if (slot.dataset.slotType === 'image') {
      if (typeof value === 'string') {
        slot.setAttribute('src', value);
        fitDeckToPreview();
        return;
      }
      if (isPlainObject(value) && typeof value.src === 'string') {
        slot.setAttribute('src', value.src);
        if (typeof value.alt === 'string') {
          slot.setAttribute('alt', value.alt);
        }
        fitDeckToPreview();
      }
      return;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      slot.textContent = String(value);
    } else if (value == null) {
      slot.textContent = '';
    }
    fitDeckToPreview();
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== window.parent) return;
    if (!isPlainObject(message)) return;
    if (message.source !== SOURCE_PARENT) return;
    if (message.channel !== CHANNEL || message.version !== VERSION) return;
    if (!ALLOWED_INCOMING.has(message.type)) return;
    if (!isPlainObject(message.payload)) return;

    if (message.type === 'set-slot-value' && typeof message.payload.slotId === 'string') {
      applySlotValue(message.payload.slotId, message.payload.value);
      return;
    }

    if (
      message.type === 'set-slot-enabled'
      && typeof message.payload.slotId === 'string'
      && typeof message.payload.enabled === 'boolean'
    ) {
      setSlotEnabled(message.payload.slotId, message.payload.enabled);
      return;
    }

    if (message.type === 'set-active-slide' && typeof message.payload.slideId === 'string') {
      setActiveSlide(message.payload.slideId);
      return;
    }

    if (message.type === 'highlight-slot' && typeof message.payload.slotId === 'string') {
      highlightSlot(message.payload.slotId);
    }
  });

  const style = document.createElement('style');
  style.textContent = [
    '.' + HIDDEN_CLASS + ' { display: none !important; }',
    '.' + HIGHLIGHT_CLASS + ' {',
    'outline: 3px solid #4f46e5 !important;',
    'outline-offset: 4px !important;',
    'box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.16), 0 0 24px rgba(79, 70, 229, 0.35) !important;',
    '}'
  ].join(' ');
  document.head.append(style);

  const firstSlide = slides[0];
  if (firstSlide?.id) setActiveSlide(firstSlide.id);
  const activeSlideObserver = new MutationObserver(reportRuntimeActiveSlide);
  slides.forEach((slide) => {
    activeSlideObserver.observe(slide, {
      attributes: true,
      attributeFilter: ['class']
    });
  });
  fitDeckToPreview();
  window.addEventListener('load', fitDeckToPreview, { once: true });
  window.addEventListener('resize', fitDeckToPreview);

  document.addEventListener('click', (event) => {
    const slot = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-edit-slot]')
      : null;
    if (!slot || typeof slot.dataset.editSlot !== 'string') return;
    send('slot-selected', { slotId: slot.dataset.editSlot });
  });

  send('ready', { status: 'ready' });
})();
</script>`;
}
