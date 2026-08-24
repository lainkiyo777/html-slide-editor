import {
  BRIDGE_CHANNEL,
  BRIDGE_SOURCE_IFRAME,
  BRIDGE_SOURCE_PARENT,
  BRIDGE_VERSION
} from './iframe-bridge.js';
import { serializeDocument } from './html-importer.js';

const ALLOWED_PARENT_TYPES = new Set(['set-slot-value', 'set-slot-enabled', 'set-active-slide', 'highlight-slot']);
const ALLOWED_IFRAME_TYPES = new Set(['ready', 'slot-selected', 'active-slide-changed']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateIframePayload(type, payload) {
  if (!isPlainObject(payload)) return false;
  if (type === 'ready') {
    return typeof payload.status === 'string';
  }
  if (type === 'slot-selected') {
    return typeof payload.slotId === 'string' && payload.slotId.length > 0;
  }
  if (type === 'active-slide-changed') {
    return typeof payload.slideId === 'string' && payload.slideId.length > 0;
  }
  return false;
}

function validateParentPayload(type, payload) {
  if (!isPlainObject(payload)) return false;
  if (type === 'set-slot-value') {
    return typeof payload.slotId === 'string' && Object.prototype.hasOwnProperty.call(payload, 'value');
  }
  if (type === 'set-slot-enabled') {
    return typeof payload.slotId === 'string' && payload.slotId.length > 0 && typeof payload.enabled === 'boolean';
  }
  if (type === 'set-active-slide') {
    return typeof payload.slideId === 'string' && payload.slideId.length > 0;
  }
  if (type === 'highlight-slot') {
    return typeof payload.slotId === 'string' && payload.slotId.length > 0;
  }
  return false;
}

export function createPreviewHtml(normalizedHtml, bridgeScript) {
  const doc = new DOMParser().parseFromString(normalizedHtml, 'text/html');
  const bridgeDoc = new DOMParser().parseFromString(bridgeScript, 'text/html');
  const bridgeElement = bridgeDoc.querySelector('script[data-html-slot-editor-bridge]');

  if (bridgeElement) {
    doc.body.append(doc.importNode(bridgeElement, true));
  }

  return serializeDocument(doc);
}

export function mountPreview({ iframe, html, onReady, onSlotSelected, onActiveSlideChanged }) {
  const hostWindow = iframe?.ownerDocument?.defaultView ?? window;

  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.srcdoc = html;

  function handleMessage(event) {
    if (event.source !== iframe.contentWindow) return;
    const message = event.data;
    if (!isPlainObject(message)) return;
    if (message.source !== BRIDGE_SOURCE_IFRAME) return;
    if (message.channel !== BRIDGE_CHANNEL) return;
    if (message.version !== BRIDGE_VERSION) return;
    if (!ALLOWED_IFRAME_TYPES.has(message.type)) return;
    if (!validateIframePayload(message.type, message.payload)) return;

    if (message.type === 'ready') {
      onReady?.(message.payload);
      return;
    }

    if (message.type === 'slot-selected') {
      onSlotSelected?.(message.payload.slotId);
      return;
    }

    if (message.type === 'active-slide-changed') {
      onActiveSlideChanged?.(message.payload.slideId);
    }
  }

  hostWindow.addEventListener('message', handleMessage);

  return {
    post(message) {
      if (!isPlainObject(message)) {
        throw new Error('Preview messages must be plain objects.');
      }
      if (!ALLOWED_PARENT_TYPES.has(message.type)) {
        throw new Error(`Unsupported preview message type "${message.type}".`);
      }
      if (!validateParentPayload(message.type, message.payload)) {
        throw new Error(`Invalid payload for preview message "${message.type}".`);
      }

      iframe.contentWindow?.postMessage(
        {
          source: BRIDGE_SOURCE_PARENT,
          channel: BRIDGE_CHANNEL,
          version: BRIDGE_VERSION,
          type: message.type,
          payload: message.payload
        },
        '*'
      );
    },
    dispose() {
      hostWindow.removeEventListener('message', handleMessage);
    }
  };
}
