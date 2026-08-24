function createDiagnostic(code, message, extra = {}) {
  return { code, message, ...extra };
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function hasExternalResource(element) {
  const attrNames = ['src', 'href', 'srcset', 'poster'];
  return attrNames.some((name) => {
    const value = element.getAttribute(name);
    return typeof value === 'string' && /^(https?:)?\/\//i.test(value.trim());
  });
}

export function parseHtmlSource(sourceHtml, sourceFileName = 'imported.html') {
  const warnings = [];
  const errors = [];

  if (isBlank(sourceHtml)) {
    const emptyDoc = new DOMParser().parseFromString('<!doctype html><html><body></body></html>', 'text/html');
    errors.push(createDiagnostic('EMPTY_HTML', 'HTML source is empty.'));
    return { doc: emptyDoc, sourceFile: sourceFileName, warnings, errors };
  }

  const doc = new DOMParser().parseFromString(sourceHtml, 'text/html');
  const scripts = Array.from(doc.querySelectorAll('script'));
  if (scripts.length > 0) {
    warnings.push(createDiagnostic('SCRIPT_PRESENT', 'Imported HTML contains scripts.', { count: scripts.length }));
  }

  const externalResourceElements = Array.from(doc.querySelectorAll('[src], [href], [srcset], [poster]'))
    .filter(hasExternalResource);
  if (externalResourceElements.length > 0) {
    warnings.push(createDiagnostic('EXTERNAL_RESOURCE', 'Imported HTML references external resources.', {
      count: externalResourceElements.length
    }));
  }

  return { doc, sourceFile: sourceFileName, warnings, errors };
}

export function serializeDocument(doc) {
  const doctype = doc.doctype
    ? `<!doctype ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ''}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ''}>`
    : '<!doctype html>';
  return `${doctype}\n${doc.documentElement.outerHTML}`;
}
