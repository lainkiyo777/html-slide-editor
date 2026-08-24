function createDeckRoot(doc) {
  const deckRoot = doc.createElement('div');
  deckRoot.classList.add('slides-offset');
  return deckRoot;
}

function inferReusableDeckRoot(roots) {
  if (roots.length === 0) return null;
  const firstParent = roots[0].parentElement;
  if (!firstParent) return null;
  if (roots.every((root) => root.parentElement === firstParent)) {
    return firstParent;
  }
  return null;
}

function wrapBodyDeckRange(doc, roots) {
  const body = doc.body;
  if (!body || roots.length === 0) return null;

  const bodyNodes = Array.from(body.childNodes);
  const firstRoot = roots[0];
  const lastRoot = roots[roots.length - 1];
  const firstIndex = bodyNodes.indexOf(firstRoot);
  const lastIndex = bodyNodes.indexOf(lastRoot);

  if (firstIndex === -1 || lastIndex === -1 || firstIndex > lastIndex) {
    return null;
  }

  const deckRoot = createDeckRoot(doc);
  body.insertBefore(deckRoot, firstRoot);
  bodyNodes.slice(firstIndex, lastIndex + 1).forEach((node) => {
    deckRoot.appendChild(node);
  });
  return deckRoot;
}

export function normalizeDeck(doc, detected) {
  const warnings = [...(detected?.warnings ?? [])];
  const roots = Array.from(detected?.roots ?? []);
  let deckRoot = doc.querySelector('.slides-offset');

  if (!deckRoot && roots.length > 0) {
    const reusableParent = inferReusableDeckRoot(roots);
    if (reusableParent && reusableParent !== doc.body) {
      deckRoot = reusableParent;
      deckRoot.classList.add('slides-offset');
    } else if (reusableParent === doc.body) {
      deckRoot = wrapBodyDeckRange(doc, roots);
    } else {
      deckRoot = createDeckRoot(doc);
      const insertionTarget = reusableParent ?? doc.body;
      insertionTarget.insertBefore(deckRoot, roots[0]);
      roots.forEach((root) => deckRoot.appendChild(root));
    }
  }

  const slides = deckRoot
    ? Array.from(deckRoot.children).filter((element) => roots.includes(element))
    : [];

  slides.forEach((slide) => {
    if (!slide.classList.contains('slide')) {
      slide.classList.add('slide');
    }
  });

  return { doc, deckRoot, slides, warnings };
}
