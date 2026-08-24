function createDiagnostic(code, message, extra = {}) {
  return { code, message, ...extra };
}

function createSlideLabel(slide, index) {
  return slide.getAttribute('aria-label')?.trim() || slide.dataset.slideLabel?.trim() || `Slide ${index + 1}`;
}

function toCurrentValue(slot) {
  if (slot.type === 'image') {
    return { ...slot.originalValue };
  }
  return slot.originalValue;
}

export function buildManifest({ deckId, sourceFile, slides, slots }) {
  const manifestSlides = slides.map((slide, index) => ({
    id: slide.id,
    index,
    label: createSlideLabel(slide, index),
    slotIds: slots.filter((slot) => slot.slideId === slide.id).map((slot) => slot.id)
  }));

  return {
    version: 1,
    deckId,
    sourceFile,
    slides: manifestSlides,
    slots: slots.map((slot) => ({
      id: slot.id,
      slideId: slot.slideId,
      type: slot.type,
      label: slot.label,
      selector: `[data-edit-slot="${slot.id}"]`,
      originalValue: slot.originalValue,
      currentValue: toCurrentValue(slot),
      enabled: slot.enabled,
      lockedLayout: slot.lockedLayout,
      detection: {
        source: slot.source,
        confidence: 1
      }
    }))
  };
}

export function findSlotElement(doc, slotId) {
  let match = null;
  for (const element of doc.querySelectorAll('[data-edit-slot]')) {
    if (element.dataset.editSlot !== slotId) continue;
    if (match) return null;
    match = element;
  }
  return match;
}

export function validateManifest(manifest, doc) {
  const diagnostics = [];
  const slideIds = new Set(manifest.slides.map((slide) => slide.id));
  const slotIdCounts = new Map();

  manifest.slots.forEach((slot) => {
    slotIdCounts.set(slot.id, (slotIdCounts.get(slot.id) ?? 0) + 1);
  });

  manifest.slots.forEach((slot) => {
    if ((slotIdCounts.get(slot.id) ?? 0) > 1) {
      diagnostics.push(createDiagnostic('DUPLICATE_SLOT_ID', `Slot id "${slot.id}" appears multiple times.`, { slotId: slot.id }));
    }

    if (!slideIds.has(slot.slideId)) {
      diagnostics.push(createDiagnostic('MISSING_SLIDE', `Slot "${slot.id}" points to a missing slide "${slot.slideId}".`, {
        slotId: slot.id,
        slideId: slot.slideId
      }));
    }

    const matchingElements = Array.from(doc.querySelectorAll('[data-edit-slot]')).filter(
      (element) => element.dataset.editSlot === slot.id
    );

    if (matchingElements.length === 0) {
      diagnostics.push(createDiagnostic('MISSING_SLOT_ELEMENT', `No DOM element was found for slot "${slot.id}".`, {
        slotId: slot.id
      }));
    } else if (matchingElements.length > 1) {
      diagnostics.push(createDiagnostic('MULTIPLE_SLOT_ELEMENTS', `Multiple DOM elements were found for slot "${slot.id}".`, {
        slotId: slot.id,
        count: matchingElements.length
      }));
    }
  });

  return diagnostics;
}
