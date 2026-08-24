export const SLIDE_SELECTORS = [
  '[data-slide]',
  '.slide',
  '.reveal .slides > section',
  '.slides > section',
  'body > section'
];

function createWarning(code, message, extra = {}) {
  return { code, message, ...extra };
}

function disambiguateSlideId(baseId, usedIds) {
  let nextId = baseId;
  let suffix = 2;
  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(nextId);
  return nextId;
}

function collectReservedIds(doc, roots) {
  const rootSet = new Set(roots);
  const reservedIds = new Set();

  Array.from(doc.querySelectorAll('[id]')).forEach((element) => {
    const currentId = element.id?.trim();
    if (!currentId || rootSet.has(element)) return;
    reservedIds.add(currentId);
  });

  return reservedIds;
}

function assignStableIds(doc, roots) {
  const usedIds = collectReservedIds(doc, roots);
  return roots.map((root, index) => {
    const candidateId = root.id?.trim() || `slide-${index + 1}`;
    const stableId = disambiguateSlideId(candidateId, usedIds);
    root.id = stableId;
    return root;
  });
}

export function detectSlideRoots(doc) {
  const warnings = [];
  let roots = [];

  for (const selector of SLIDE_SELECTORS) {
    const matches = Array.from(doc.querySelectorAll(selector));
    if (matches.length > 0) {
      roots = assignStableIds(doc, matches);
      break;
    }
  }

  if (roots.length === 0) {
    warnings.push(createWarning('NO_SLIDE_ROOT', 'No supported slide root was detected.'));
  } else if (roots.length === 1) {
    warnings.push(createWarning('SINGLE_SLIDE_CANDIDATE', 'Only one slide root was detected; confirm single-page import.'));
  }

  return { roots, warnings };
}
