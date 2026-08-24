import { serializeDocument } from './html-importer.js';

function diagnostic(code, message, extra = {}) {
  return { code, message, ...extra };
}

function isExternalReference(value) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value);
}

const CLASSIC_SCRIPT_TYPES = new Set([
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'text/ecmascript'
]);

function isClassicScript(script) {
  const type = script.getAttribute('type')?.trim().toLowerCase();
  return !type || CLASSIC_SCRIPT_TYPES.has(type);
}

function resolveSimpleProjectPath(reference, baseFile = 'index.html') {
  const value = String(reference || '').trim();
  if (!value || isExternalReference(value) || value.startsWith('/')) return null;

  const pathOnly = value.split(/[?#]/, 1)[0].replaceAll('\\', '/');
  const baseParts = String(baseFile).split('/');
  baseParts.pop();
  const parts = [...baseParts, ...pathOnly.split('/')].filter(Boolean);
  const result = [];

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') return null;
    result.push(part);
  }

  return result.join('/');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error(`Could not read ${file.name}.`)));
    reader.readAsDataURL(file);
  });
}

function addUnsupportedDiagnostics(doc, diagnostics) {
  const unsupported = [
    ...Array.from(doc.querySelectorAll('script[src]')).filter((script) => !isClassicScript(script)),
    ...doc.querySelectorAll('link[rel~="stylesheet"][href^="http"], img[srcset], source[src], video[src], audio[src]')
  ];
  if (unsupported.length > 0) {
    diagnostics.push(diagnostic(
      'UNSUPPORTED_IN_FOLDER_DEMO',
      `${unsupported.length} resource reference(s) are outside the folder demo scope.`,
      { count: unsupported.length }
    ));
  }
}

export async function createFolderPreviewHtml({ html, files, previewBlobUrls = [] }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const diagnostics = [];
  let cssResolved = 0;
  let imagesResolved = 0;
  let scriptsResolved = 0;
  let missingAssets = 0;
  const imageSources = new Map();

  addUnsupportedDiagnostics(doc, diagnostics);

  for (const link of Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))) {
    const reference = link.getAttribute('href');
    const projectPath = resolveSimpleProjectPath(reference);
    if (!projectPath) continue;

    const file = files?.get(projectPath);
    if (!file) {
      missingAssets += 1;
      diagnostics.push(diagnostic('MISSING_ASSET', `Missing folder asset: ${projectPath}`, {
        reference,
        path: projectPath
      }));
      link.remove();
      continue;
    }

    const style = doc.createElement('style');
    style.dataset.previewSource = projectPath;
    style.textContent = await file.text();
    link.replaceWith(style);
    cssResolved += 1;
  }

  for (const image of Array.from(doc.querySelectorAll('img[src]'))) {
    const reference = image.getAttribute('src');
    const projectPath = resolveSimpleProjectPath(reference);
    if (!projectPath) continue;

    const file = files?.get(projectPath);
    if (!file) {
      missingAssets += 1;
      diagnostics.push(diagnostic('MISSING_ASSET', `Missing folder asset: ${projectPath}`, {
        reference,
        path: projectPath
      }));
      image.removeAttribute('src');
      continue;
    }

    const objectUrl = URL.createObjectURL(file);
    previewBlobUrls.push(objectUrl);
    // A sandboxed srcdoc has an opaque origin and cannot reliably decode a
    // Blob URL created by its parent. Keep the Blob URL tracked for lifecycle
    // cleanup, but use a data URL for the actual Preview image source.
    const previewSource = await readFileAsDataUrl(file);
    imageSources.set(projectPath, previewSource);
    image.setAttribute('src', previewSource);
    imagesResolved += 1;
  }

  for (const script of Array.from(doc.querySelectorAll('script[src]'))) {
    if (!isClassicScript(script)) continue;

    const reference = script.getAttribute('src');
    const projectPath = resolveSimpleProjectPath(reference);
    if (!projectPath) continue;

    const file = files?.get(projectPath);
    if (!file) {
      missingAssets += 1;
      diagnostics.push(diagnostic('MISSING_ASSET', `Missing folder asset: ${projectPath}`, {
        reference,
        path: projectPath
      }));
      script.remove();
      continue;
    }

    const inlineScript = doc.createElement('script');
    for (const attribute of Array.from(script.attributes)) {
      if (attribute.name === 'src') continue;
      inlineScript.setAttribute(attribute.name, attribute.value);
    }
    inlineScript.dataset.previewSource = projectPath;
    inlineScript.textContent = await file.text();
    script.replaceWith(inlineScript);
    scriptsResolved += 1;
  }

  return {
    html: serializeDocument(doc),
    cssResolved,
    imagesResolved,
    scriptsResolved,
    missingAssets,
    diagnostics,
    imageSources
  };
}
