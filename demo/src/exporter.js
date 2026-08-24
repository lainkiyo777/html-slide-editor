const BRIDGE_SCRIPT_SELECTOR = 'script[data-html-slot-editor-bridge="true"]';
const TEMPLATE_MANIFEST_ID = 'html-slot-editor-manifest';
const HIGHLIGHT_CLASS = 'html-slot-editor-bridge-highlight';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeManifestJson(json) {
  return json.replace(/</g, '\\u003c');
}

function findSlotElements(doc) {
  return Array.from(doc.querySelectorAll('[data-edit-slot]'));
}

function findSlotElement(doc, slotId) {
  return findSlotElements(doc).find((element) => element.dataset.editSlot === slotId) ?? null;
}

function applySlotValue(element, slot, value) {
  if (!element) return;

  if (slot.type === 'image') {
    if (typeof value === 'string') {
      element.setAttribute('src', value);
      return;
    }
    if (value && typeof value === 'object' && typeof value.src === 'string') {
      element.setAttribute('src', value.src);
      if (typeof value.alt === 'string') {
        element.setAttribute('alt', value.alt);
      }
    }
    return;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    element.textContent = String(value);
  } else if (value == null) {
    element.textContent = '';
  }
}

function stripEditorArtifacts(doc) {
  doc.querySelectorAll(BRIDGE_SCRIPT_SELECTOR).forEach((element) => element.remove());
  doc.querySelectorAll(`#${TEMPLATE_MANIFEST_ID}`).forEach((element) => element.remove());

  doc.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((element) => {
    element.classList.remove(HIGHLIGHT_CLASS);
  });

  doc.querySelectorAll('[contenteditable]').forEach((element) => {
    element.removeAttribute('contenteditable');
  });

  doc.querySelectorAll('[data-selected]').forEach((element) => {
    element.removeAttribute('data-selected');
  });
}

function removeDisabledSlotMetadata(doc, manifest) {
  manifest.slots
    .filter((slot) => slot.enabled === false)
    .forEach((slot) => {
      const element = findSlotElement(doc, slot.id);
      if (!element) return;
      element.removeAttribute('data-edit-slot');
      element.removeAttribute('data-slot-type');
      element.removeAttribute('data-slot-label');
      element.removeAttribute('data-slot-locked-layout');
    });
}

function buildTemplateManifest(manifest, values) {
  return {
    ...manifest,
    slides: manifest.slides.map((slide) => ({
      ...slide,
      slotIds: [...slide.slotIds]
    })),
    slots: manifest.slots.map((slot) => ({
      ...slot,
      currentValue: cloneJson(
        slot.enabled === false
          ? (slot.originalValue ?? slot.currentValue)
          : (values[slot.id] ?? slot.currentValue ?? slot.originalValue)
      )
    }))
  };
}

export function buildExportHtml({ normalizedHtml, manifest, values, mode }) {
  const doc = new DOMParser().parseFromString(normalizedHtml, 'text/html');
  stripEditorArtifacts(doc);

  manifest.slots.forEach((slot) => {
    const element = findSlotElement(doc, slot.id);
    if (!element) return;
    const exportValue = slot.enabled === false
      ? cloneJson(slot.originalValue ?? slot.currentValue)
      : cloneJson(values[slot.id] ?? slot.currentValue ?? slot.originalValue);
    applySlotValue(element, slot, exportValue);
  });

  removeDisabledSlotMetadata(doc, manifest);

  if (mode === 'template') {
    const manifestScript = doc.createElement('script');
    manifestScript.id = TEMPLATE_MANIFEST_ID;
    manifestScript.type = 'application/json';
    manifestScript.textContent = escapeManifestJson(JSON.stringify(buildTemplateManifest(manifest, values)));
    (doc.body ?? doc.documentElement).append(manifestScript);
  }

  const doctype = doc.doctype
    ? `<!doctype ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ''}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ''}>`
    : '<!doctype html>';

  return `${doctype}\n${doc.documentElement.outerHTML}`;
}

export function downloadHtml(html, fileName) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
