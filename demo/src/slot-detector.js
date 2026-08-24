const TEXT_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'BUTTON', 'SPAN']);
const EXCLUDED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'SVG']);
const LAYOUT_TAGS = new Set(['BODY', 'HTML', 'MAIN', 'SECTION', 'ARTICLE', 'ASIDE', 'NAV', 'DIV', 'UL', 'OL']);

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function truncateLabel(value, maxLength = 80) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function hasExcludedSelfOrAncestor(element, slide) {
  let current = element;
  while (current && current !== slide.parentElement) {
    if (
      EXCLUDED_TAGS.has(current.tagName) ||
      current.getAttribute('aria-hidden') === 'true' ||
      current.classList.contains('decorative') ||
      current.hasAttribute('data-static')
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function getDirectVisibleText(element) {
  return normalizeWhitespace(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' ')
  );
}

function isPureLayoutContainer(element, directText) {
  if (!LAYOUT_TAGS.has(element.tagName)) return false;
  if (directText.length === 0) return true;
  const childElements = Array.from(element.children);
  if (childElements.length === 0) return false;
  return childElements.every((child) => ['SPAN', 'B', 'STRONG', 'EM', 'SMALL', 'I', 'U'].includes(child.tagName));
}

function inferTextRole(element) {
  if (/^H[1-6]$/.test(element.tagName)) return 'title';
  return 'slot';
}

function inferTextLabel(element, directText) {
  return (
    truncateLabel(element.dataset.slotLabel) ||
    truncateLabel(directText) ||
    truncateLabel(element.textContent) ||
    inferTextRole(element) ||
    'Text'
  );
}

function inferImageLabel(element) {
  return truncateLabel(element.dataset.slotLabel) || truncateLabel(element.getAttribute('alt')) || 'Image';
}

function createTextValue(element) {
  return normalizeWhitespace(element.textContent ?? '');
}

function createImageValue(element) {
  return {
    src: element.getAttribute('src')?.trim() ?? '',
    srcset: element.getAttribute('srcset')?.trim() ?? '',
    alt: element.getAttribute('alt') ?? ''
  };
}

function isImageCandidate(element) {
  if (element.tagName !== 'IMG') return false;
  return Boolean(element.getAttribute('src')?.trim() || element.getAttribute('srcset')?.trim());
}

function isTextCandidate(element, slide) {
  const directText = getDirectVisibleText(element);
  if (TEXT_TAGS.has(element.tagName)) {
    if (element.tagName === 'SPAN') {
      return { allowed: directText.length > 0, directText };
    }
    return { allowed: normalizeWhitespace(element.textContent ?? '').length > 0, directText };
  }

  if (directText.length === 0) {
    return { allowed: false, directText };
  }

  if (isPureLayoutContainer(element, directText, slide)) {
    return { allowed: false, directText };
  }

  return { allowed: true, directText };
}

function createSlotId(slideId, role, counters, explicitId) {
  if (explicitId) return explicitId;
  const nextCount = (counters.get(role) ?? 0) + 1;
  counters.set(role, nextCount);
  return `${slideId}-${role}-${nextCount}`;
}

function createTextCandidate(element, slide, counters, directText) {
  const role = inferTextRole(element);
  return {
    id: createSlotId(slide.id, role, counters, element.dataset.editSlot?.trim()),
    slideId: slide.id,
    type: 'text',
    label: inferTextLabel(element, directText),
    element,
    source: element.tagName.toLowerCase(),
    originalValue: createTextValue(element),
    enabled: true,
    lockedLayout: true
  };
}

function createImageCandidate(element, slide, counters) {
  return {
    id: createSlotId(slide.id, 'image', counters, element.dataset.editSlot?.trim()),
    slideId: slide.id,
    type: 'image',
    label: inferImageLabel(element),
    element,
    source: element.tagName.toLowerCase(),
    originalValue: createImageValue(element),
    enabled: true,
    lockedLayout: true
  };
}

function hasBlockingTextAncestor(element, slide) {
  let current = element.parentElement;
  while (current && current !== slide.parentElement) {
    if (current.hasAttribute('data-edit-slot') || current.dataset.slotDetectorOwnsText === 'true') {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function detectSlotCandidates(slides) {
  const candidates = [];

  slides.forEach((slide) => {
    const counters = new Map();
    const elements = [slide, ...Array.from(slide.querySelectorAll('*'))];

    elements.forEach((element) => {
      delete element.dataset.slotDetectorOwnsText;

      if (hasExcludedSelfOrAncestor(element, slide)) return;

      if (isImageCandidate(element)) {
        candidates.push(createImageCandidate(element, slide, counters));
        return;
      }

      const textCheck = isTextCandidate(element, slide);
      if (!textCheck.allowed) return;

      const hasExplicitSlot = Boolean(element.dataset.editSlot?.trim());
      if (!hasExplicitSlot && hasBlockingTextAncestor(element, slide)) return;

      const candidate = createTextCandidate(element, slide, counters, textCheck.directText);
      candidates.push(candidate);

      if (textCheck.directText.length > 0 || hasExplicitSlot) {
        element.dataset.slotDetectorOwnsText = 'true';
      }
    });

    elements.forEach((element) => {
      delete element.dataset.slotDetectorOwnsText;
    });
  });

  return candidates;
}

export function applySlotMetadata(doc, candidates) {
  const warnings = [];
  const slots = [];
  const seenIds = new Set();

  candidates.forEach((candidate) => {
    if (seenIds.has(candidate.id)) {
      warnings.push({
        code: 'DUPLICATE_SLOT_ID',
        message: `Duplicate slot candidate ID "${candidate.id}" was skipped.`,
        slotId: candidate.id
      });
      return;
    }

    seenIds.add(candidate.id);
    candidate.element.dataset.editSlot = candidate.id;
    candidate.element.dataset.slotType = candidate.type;
    candidate.element.dataset.slotLabel = candidate.label;
    candidate.element.dataset.slotLockedLayout = 'true';

    slots.push({
      ...candidate,
      originalValue: candidate.type === 'image'
        ? {
            src: candidate.element.getAttribute('src')?.trim() ?? '',
            srcset: candidate.element.getAttribute('srcset')?.trim() ?? '',
            alt: candidate.element.getAttribute('alt') ?? ''
          }
        : createTextValue(candidate.element)
    });
  });

  return { slots, warnings, doc };
}
