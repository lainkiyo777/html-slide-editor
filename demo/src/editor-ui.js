import { parseHtmlSource, serializeDocument } from './html-importer.js';
import { detectSlideRoots } from './slide-detector.js';
import { normalizeDeck } from './normalizer.js';
import { detectSlotCandidates, applySlotMetadata } from './slot-detector.js';
import { buildManifest } from './manifest.js';
import {
  createTemplateState,
  setSlotValue,
  renameSlot,
  setSlotEnabled,
  selectSlide,
  selectSlot,
  undo,
  redo,
  saveDraft,
  loadDraftResult
} from './template-state.js';
import { createBridgeScript } from './iframe-bridge.js?phase2-reverse-sync=20260814-v3';
import { createPreviewHtml, mountPreview } from './preview.js?phase2-reverse-sync=20260814-v3';
import { createFolderFileMap, findFolderEntry } from './folder-importer.js';
import { createFolderPreviewHtml } from './folder-preview.js';
import { buildExportHtml, downloadHtml } from './exporter.js';
import { generateStaticSlideThumbnail } from './static-thumbnail.js?phase3b-batch-v1';
import { runThumbnailQueue } from './thumbnail-queue.js?phase3b-batch-v1';

function clearNode(node) {
  node.replaceChildren();
}

function cloneValue(value) {
  return value !== undefined ? JSON.parse(JSON.stringify(value)) : value;
}

function slotValueToText(slot, value) {
  if (slot.type === 'image') {
    return typeof value?.src === 'string' ? value.src : '';
  }
  return typeof value === 'string' ? value : String(value ?? '');
}

function getCurrentSlide(manifest, currentSlideId) {
  return manifest.slides.find((slide) => slide.id === currentSlideId) ?? manifest.slides[0] ?? null;
}

function getCurrentSlideSlots(manifest, currentSlideId) {
  const slide = getCurrentSlide(manifest, currentSlideId);
  if (!slide) return [];
  const slotIds = new Set(slide.slotIds);
  return manifest.slots.filter((slot) => slotIds.has(slot.id));
}

function updateUndoRedoButtons(documentRef, state) {
  const undoButton = documentRef.querySelector('#undoButton');
  const redoButton = documentRef.querySelector('#redoButton');
  if (undoButton) undoButton.disabled = state.historyIndex <= 0;
  if (redoButton) redoButton.disabled = state.historyIndex >= state.history.length - 1;
}

function baseFileName(name) {
  return String(name || 'deck.html').replace(/^.*[\\/]/, '').replace(/\.html?$/i, '');
}

function updateExportButtons(finalButton, templateButton, disabled) {
  if (finalButton) finalButton.disabled = disabled;
  if (templateButton) templateButton.disabled = disabled;
}

function persistDraft(state, statusPanel) {
  if (!state) return;
  const result = saveDraft(state);
  if (!result.ok && result.warning) {
    renderStatus(statusPanel, {
      level: 'warning',
      code: result.warning.code,
      message: result.warning.message
    });
  }
}

export function renderStatus(statusPanel, { level, code, message }) {
  statusPanel.dataset.level = level;
  clearNode(statusPanel);

  const heading = document.createElement('h2');
  heading.textContent = 'Status';

  const line = document.createElement('p');
  line.className = 'status-line';
  const strong = document.createElement('strong');
  strong.textContent = String(code);
  line.append(strong);

  const body = document.createElement('p');
  body.className = 'status-message';
  body.textContent = String(message);

  statusPanel.append(heading, line, body);
}

export function renderPages({ container, manifest, currentSlideId, thumbnailBySlideId, onSelectSlide }) {
  clearNode(container);
  const heading = document.createElement('h2');
  heading.textContent = 'Pages';
  container.append(heading);

  const thumbnailTotal = Number(container.dataset.thumbnailTotal ?? 0);
  if (thumbnailTotal > 0) {
    const generated = Number(container.dataset.thumbnailGenerated ?? 0);
    const failed = Number(container.dataset.thumbnailFailed ?? 0);
    const durationMs = Number(container.dataset.thumbnailDurationMs ?? 0);
    const details = [`Thumbnails: ${generated} / ${thumbnailTotal}`];
    if (failed > 0) details.push(`${failed} failed`);
    if (durationMs > 0) details.push(`${durationMs} ms`);
    const progress = document.createElement('p');
    progress.className = 'thumbnail-progress';
    progress.textContent = details.join(' · ');
    container.append(progress);
  }

  const list = document.createElement('div');
  list.className = 'page-list';

  manifest.slides.forEach((slide) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'page-item';
    button.dataset.pageId = slide.id;
    button.dataset.selected = String(slide.id === currentSlideId);

    const thumbnailSrc = thumbnailBySlideId?.get?.(slide.id);
    if (typeof thumbnailSrc === 'string' && thumbnailSrc.startsWith('data:image/')) {
      const thumbnail = document.createElement('img');
      thumbnail.className = 'page-thumbnail';
      thumbnail.src = thumbnailSrc;
      thumbnail.alt = `${slide.label ?? `Slide ${slide.index + 1}`} thumbnail`;
      thumbnail.width = 160;
      thumbnail.height = 90;
      thumbnail.draggable = false;
      button.append(thumbnail);
    }

    const index = document.createElement('span');
    index.className = 'page-index';
    index.textContent = String(slide.index + 1);

    const label = document.createElement('span');
    label.className = 'page-label';
    label.textContent = String(slide.label ?? '');

    const count = document.createElement('span');
    count.className = 'page-slots';
    count.textContent = `${slide.slotIds.length} slots`;

    button.append(index, label, count);
    button.addEventListener('click', () => onSelectSlide(slide.id));
    list.append(button);
  });

  container.append(list);
}

export function renderSlots({ container, manifest, currentSlideId, values, labels, enabled, selectedSlotId, onSelectSlot, onChange }) {
  clearNode(container);
  const heading = document.createElement('h2');
  heading.textContent = 'Slots';
  container.append(heading);

  const slots = getCurrentSlideSlots(manifest, currentSlideId);
  if (slots.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No editable slots on this page.';
    container.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'slot-list';

  slots.forEach((slot) => {
    const card = document.createElement('section');
    card.className = 'slot-card';
    card.dataset.slotId = slot.id;
    card.dataset.selected = String(slot.id === selectedSlotId);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'slot-select';
    header.dataset.slotId = slot.id;

    const slotLabel = document.createElement('span');
    slotLabel.className = 'slot-select-label';
    slotLabel.textContent = String(labels[slot.id] ?? slot.label ?? '');

    const slotType = document.createElement('span');
    slotType.className = 'slot-type-badge';
    slotType.textContent = String(slot.type);

    header.append(slotLabel, slotType);
    header.addEventListener('click', () => onSelectSlot(slot.id));
    card.append(header);

    const meta = document.createElement('div');
    meta.className = 'slot-meta';
    const lockBadge = document.createElement('span');
    lockBadge.className = 'slot-lock-badge';
    lockBadge.textContent = 'Locked layout';
    meta.append(lockBadge);
    card.append(meta);

    const labelField = document.createElement('label');
    labelField.className = 'slot-field';
    const labelFieldTitle = document.createElement('span');
    labelFieldTitle.textContent = 'Label';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = String(labels[slot.id] ?? slot.label ?? '');
    labelInput.addEventListener('input', () => onChange({ kind: 'rename', slotId: slot.id, label: labelInput.value }));
    labelField.append(labelFieldTitle, labelInput);
    card.append(labelField);

    const enabledField = document.createElement('label');
    enabledField.className = 'slot-toggle';
    const enabledInput = document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.checked = enabled[slot.id] !== false;
    enabledInput.addEventListener('change', () => onChange({ kind: 'enabled', slotId: slot.id, enabled: enabledInput.checked }));
    enabledField.append(enabledInput, document.createTextNode('Display component'));
    card.append(enabledField);

    if (slot.type === 'image') {
      const currentValue = values[slot.id] ?? slot.currentValue ?? slot.originalValue ?? {};

      const previewValue = document.createElement('input');
      previewValue.type = 'text';
      previewValue.readOnly = true;
      previewValue.value = slotValueToText(slot, currentValue);
      previewValue.className = 'slot-readonly';
      card.append(previewValue);

      const fileField = document.createElement('label');
      fileField.className = 'slot-field';
      const fileFieldTitle = document.createElement('span');
      fileFieldTitle.textContent = 'Replace image';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.addEventListener('change', () => onChange({ kind: 'image', slotId: slot.id, file: fileInput.files?.[0] ?? null }));
      fileField.append(fileFieldTitle, fileInput);
      card.append(fileField);
    } else {
      const valueField = document.createElement('label');
      valueField.className = 'slot-field';
      const valueFieldTitle = document.createElement('span');
      valueFieldTitle.textContent = 'Text';
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.value = slotValueToText(slot, values[slot.id] ?? slot.currentValue ?? slot.originalValue ?? '');
      valueInput.addEventListener('input', () => onChange({ kind: 'value', slotId: slot.id, value: valueInput.value }));
      valueField.append(valueFieldTitle, valueInput);
      card.append(valueField);
    }

    list.append(card);
  });

  container.append(list);
}

export function renderRecognitionState({ previewFrame, manifest, currentSlideId, currentSlotId, mode }) {
  previewFrame.dataset.currentSlideId = currentSlideId ?? '';
  previewFrame.dataset.highlightedSlot = currentSlotId ?? '';
  previewFrame.dataset.recognitionMode = mode;
  previewFrame.dataset.slideCount = String(manifest.slides.length);
}

export function bootstrapEditor({
  document: documentRef,
  fileInput,
  folderInput,
  pagesPanel,
  previewFrame,
  slotsPanel,
  statusPanel,
  exportButton,
  exportTemplateButton
}) {
  const fixtureButton = documentRef.querySelector('#openFixtureButton');
  const undoButton = documentRef.querySelector('#undoButton');
  const redoButton = documentRef.querySelector('#redoButton');

  let state = null;
  let previewController = null;
  let previewBlobUrls = [];
  let previewImageSources = new Map();
  let thumbnailBySlideId = new Map();
  let thumbnailErrors = [];
  let thumbnailGeneration = 0;
  let mode = 'recognition';

  function revokePreviewBlobUrls() {
    previewBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    previewBlobUrls = [];
  }

  function disposePreview() {
    thumbnailGeneration += 1;
    thumbnailBySlideId = new Map();
    thumbnailErrors = [];
    [
      'thumbnailStatus',
      'thumbnailTotal',
      'thumbnailCompleted',
      'thumbnailGenerated',
      'thumbnailFailed',
      'thumbnailDurationMs',
      'thumbnailAverageMs',
      'thumbnailFastest',
      'thumbnailSlowest',
      'thumbnailErrors',
      'thumbnailError',
      'thumbnailScriptsBefore',
      'thumbnailScriptsAfter',
      'thumbnailLoadedImages'
    ].forEach((key) => delete pagesPanel.dataset[key]);
    previewController?.dispose();
    previewController = null;
    revokePreviewBlobUrls();
    previewImageSources = new Map();
  }

  function generateSlideThumbnails({ html, slides, generation }) {
    pagesPanel.dataset.thumbnailStatus = 'generating';
    pagesPanel.dataset.thumbnailTotal = String(slides.length);
    pagesPanel.dataset.thumbnailCompleted = '0';
    pagesPanel.dataset.thumbnailGenerated = '0';
    pagesPanel.dataset.thumbnailFailed = '0';
    delete pagesPanel.dataset.thumbnailDurationMs;
    delete pagesPanel.dataset.thumbnailAverageMs;
    delete pagesPanel.dataset.thumbnailFastest;
    delete pagesPanel.dataset.thumbnailSlowest;
    delete pagesPanel.dataset.thumbnailErrors;
    delete pagesPanel.dataset.thumbnailError;
    delete pagesPanel.dataset.thumbnailScriptsBefore;
    delete pagesPanel.dataset.thumbnailScriptsAfter;
    delete pagesPanel.dataset.thumbnailLoadedImages;
    rerender();

    runThumbnailQueue({
      slides,
      cache: thumbnailBySlideId,
      generation,
      getGeneration: () => thumbnailGeneration,
      capture: (slide) => generateStaticSlideThumbnail({
        document: documentRef,
        html,
        slideId: slide.id,
        renderWidth: 1280,
        renderHeight: 720,
        outputWidth: 160,
        outputHeight: 90,
        timeoutMs: 7000
      }),
      onProgress(progress) {
        if (generation !== thumbnailGeneration) return;
        pagesPanel.dataset.thumbnailCompleted = String(progress.completed);
        pagesPanel.dataset.thumbnailGenerated = String(progress.success);
        pagesPanel.dataset.thumbnailFailed = String(progress.failed);
        if (progress.status === 'ready') {
          pagesPanel.dataset.thumbnailScriptsBefore = String(progress.result.diagnostics.scriptElementsBeforeCleanup);
          pagesPanel.dataset.thumbnailScriptsAfter = String(progress.result.diagnostics.scriptElementsAfterCleanup);
          pagesPanel.dataset.thumbnailLoadedImages = String(progress.result.diagnostics.loadedImageCount);
        } else if (progress.error) {
          thumbnailErrors.push(progress.error);
          pagesPanel.dataset.thumbnailErrors = JSON.stringify(thumbnailErrors);
        }
        rerender();
      }
    }).then((summary) => {
      if (generation !== thumbnailGeneration || summary.cancelled) return;
      pagesPanel.dataset.thumbnailStatus = summary.failed === 0
        ? 'ready'
        : summary.success > 0 ? 'partial' : 'error';
      pagesPanel.dataset.thumbnailDurationMs = String(summary.totalDurationMs);
      pagesPanel.dataset.thumbnailAverageMs = String(summary.averageDurationMs);
      pagesPanel.dataset.thumbnailFastest = summary.fastest
        ? `${summary.fastest.slideId}:${summary.fastest.durationMs}`
        : '';
      pagesPanel.dataset.thumbnailSlowest = summary.slowest
        ? `${summary.slowest.slideId}:${summary.slowest.durationMs}`
        : '';
      rerender();
    }).catch((error) => {
      if (generation !== thumbnailGeneration) return;
      pagesPanel.dataset.thumbnailStatus = 'error';
      pagesPanel.dataset.thumbnailError = String(error?.message ?? error);
    });
  }

  function ensureEditMode() {
    if (mode === 'edit') return;
    mode = 'edit';
    renderStatus(statusPanel, {
      level: 'info',
      code: 'EDIT_MODE',
      message: 'Editing values in the locked imported layout.'
    });
  }

  function syncPreview() {
    if (!previewController || !state) return;
    previewController.post({
      type: 'set-active-slide',
      payload: { slideId: state.currentSlideId }
    });

    state.manifest.slots.forEach((slot) => {
      previewController.post({
        type: 'set-slot-enabled',
        payload: { slotId: slot.id, enabled: state.enabled[slot.id] !== false }
      });

      if (state.enabled[slot.id] === false) return;
      const value = cloneValue(state.values[slot.id]);
      if (slot.type === 'image' && value && typeof value.src === 'string') {
        value.src = previewImageSources.get(value.src) ?? value.src;
      }
      previewController.post({
        type: 'set-slot-value',
        payload: { slotId: slot.id, value }
      });
    });

    if (state.currentSlotId) {
      previewController.post({
        type: 'highlight-slot',
        payload: { slotId: state.currentSlotId }
      });
    }
  }

  function rerender() {
    if (!state) {
      clearNode(pagesPanel);
      clearNode(slotsPanel);
      previewFrame.dataset.highlightedSlot = '';
      return;
    }

    renderPages({
      container: pagesPanel,
      manifest: state.manifest,
      currentSlideId: state.currentSlideId,
      thumbnailBySlideId,
      onSelectSlide(slideId) {
        state = selectSlide(state, slideId);
        rerender();
        syncPreview();
      }
    });

    renderSlots({
      container: slotsPanel,
      manifest: state.manifest,
      currentSlideId: state.currentSlideId,
      values: state.values,
      labels: state.labels,
      enabled: state.enabled,
      selectedSlotId: state.currentSlotId,
      onSelectSlot(slotId) {
        state = selectSlot(state, slotId);
        rerender();
        if (previewController) {
          previewController.post({
            type: 'highlight-slot',
            payload: { slotId: state.currentSlotId }
          });
        }
      },
      onChange(change) {
        if (change.kind === 'rename') {
          state = renameSlot(state, change.slotId, change.label);
        } else if (change.kind === 'enabled') {
          state = setSlotEnabled(state, change.slotId, change.enabled);
        } else if (change.kind === 'value') {
          state = setSlotValue(state, change.slotId, change.value);
        } else if (change.kind === 'image' && change.file) {
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            state = setSlotValue(state, change.slotId, {
              src: String(reader.result ?? ''),
              alt: state.labels[change.slotId] ?? ''
            });
            ensureEditMode();
            rerender();
            syncPreview();
            persistDraft(state, statusPanel);
          });
          reader.readAsDataURL(change.file);
          return;
        } else {
          return;
        }

        ensureEditMode();
        rerender();
        syncPreview();
        persistDraft(state, statusPanel);
      }
    });

    renderRecognitionState({
      previewFrame,
      manifest: state.manifest,
      currentSlideId: state.currentSlideId,
      currentSlotId: state.currentSlotId,
      mode
    });

    updateUndoRedoButtons(documentRef, state);
  }

  async function loadHtml(sourceHtml, sourceFileName, { folderFiles = null } = {}) {
    disposePreview();
    mode = 'recognition';

    const parsed = parseHtmlSource(sourceHtml, sourceFileName);
    if (parsed.errors.length > 0) {
      renderStatus(statusPanel, {
        level: 'error',
        code: parsed.errors[0].code,
        message: parsed.errors[0].message
      });
      return null;
    }

    const detectedSlides = detectSlideRoots(parsed.doc);
    const normalized = normalizeDeck(parsed.doc, detectedSlides);
    const slotCandidates = detectSlotCandidates(normalized.slides);
    const applied = applySlotMetadata(normalized.doc, slotCandidates);
    const manifest = buildManifest({
      deckId: `deck-${sourceFileName}`,
      sourceFile: sourceFileName,
      slides: normalized.slides,
      slots: applied.slots
    });

    const normalizedHtml = serializeDocument(normalized.doc);
    const importedState = createTemplateState({
      sourceHtml,
      normalizedHtml,
      manifest,
      sourceFile: sourceFileName
    });
    const draftResult = loadDraftResult(importedState.deckId, importedState.sourceHash);
    state = draftResult.state ?? importedState;

    let previewHtml = normalizedHtml;
    let folderPreview = null;
    if (folderFiles) {
      folderPreview = await createFolderPreviewHtml({
        html: normalizedHtml,
        files: folderFiles,
        previewBlobUrls
      });
      previewImageSources = folderPreview.imageSources;
      previewHtml = folderPreview.html;
    }

    previewController = mountPreview({
      iframe: previewFrame,
      html: createPreviewHtml(previewHtml, createBridgeScript()),
      onReady() {
        syncPreview();
      },
      onSlotSelected(slotId) {
        state = selectSlot(state, slotId);
        rerender();
        syncPreview();
      },
      onActiveSlideChanged(slideId) {
        if (!state || slideId === state.currentSlideId) return;
        const nextState = selectSlide(state, slideId);
        if (nextState === state) return;

        state = nextState;
        rerender();
        if (state.currentSlotId) {
          previewController?.post({
            type: 'highlight-slot',
            payload: { slotId: state.currentSlotId }
          });
        }
      }
    });

    const warnings = [
      ...parsed.warnings,
      ...normalized.warnings,
      ...applied.warnings,
      ...(draftResult.warning ? [draftResult.warning] : [])
    ];
    if (folderPreview) {
      const folderDetails = [
        `Files: ${folderFiles.size}`,
        `HTML: ${sourceFileName}`,
        `CSS resolved: ${folderPreview.cssResolved}`,
        `Images resolved: ${folderPreview.imagesResolved}`,
        `Scripts resolved: ${folderPreview.scriptsResolved}`,
        `Missing assets: ${folderPreview.missingAssets}`,
        ...warnings.map((warning) => warning.message),
        ...folderPreview.diagnostics.map((item) => `${item.code}${item.path ? ` ${item.path}` : ''}`)
      ];
      renderStatus(statusPanel, {
        level: folderPreview.diagnostics.length > 0 || warnings.length > 0 ? 'warning' : 'info',
        code: 'PROJECT_FOLDER_LOADED',
        message: folderDetails.join(' · ')
      });
    } else {
      renderStatus(statusPanel, warnings.length > 0
      ? {
          level: 'warning',
          code: warnings[0].code,
          message: warnings.map((warning) => warning.message).join(' ')
        }
      : {
          level: 'info',
          code: 'RECOGNITION_READY',
          message: `Detected ${manifest.slides.length} pages and ${manifest.slots.length} editable slots.`
        });
    }

    rerender();
    syncPreview();
    persistDraft(state, statusPanel);
    updateExportButtons(exportButton, exportTemplateButton, false);
    if (folderPreview && manifest.slides.length > 0) {
      generateSlideThumbnails({
        html: previewHtml,
        slides: manifest.slides,
        generation: thumbnailGeneration
      });
    }
    return state;
  }

  async function loadFixture(sourceHtml, sourceFileName = 'fixture.html') {
    return loadHtml(sourceHtml, sourceFileName);
  }

  async function loadProjectFolder(fileList) {
    const folderFiles = createFolderFileMap(fileList);
    const indexFile = findFolderEntry(folderFiles);
    if (!indexFile) {
      renderStatus(statusPanel, {
        level: 'error',
        code: 'INDEX_HTML_NOT_FOUND',
        message: 'The selected project folder must contain index.html at its root.'
      });
      return null;
    }

    return loadHtml(await indexFile.text(), 'index.html', { folderFiles });
  }

  function handleUndo() {
    if (!state) return;
    state = undo(state);
    renderStatus(statusPanel, {
      level: 'info',
      code: 'UNDO',
      message: 'Reverted the most recent edit.'
    });
    rerender();
    syncPreview();
    persistDraft(state, statusPanel);
  }

  function handleRedo() {
    if (!state) return;
    state = redo(state);
    renderStatus(statusPanel, {
      level: 'info',
      code: 'REDO',
      message: 'Reapplied the reverted edit.'
    });
    rerender();
    syncPreview();
    persistDraft(state, statusPanel);
  }

  function handleExport(modeName) {
    if (!state) return;
    const fileStem = baseFileName(state.sourceFile);
    const suffix = modeName === 'template' ? 'template' : 'edited';
    const html = buildExportHtml({
      normalizedHtml: state.normalizedHtml,
      manifest: state.manifest,
      values: state.values,
      mode: modeName
    });
    downloadHtml(html, `${fileStem}-${suffix}.html`);
    renderStatus(statusPanel, {
      level: 'info',
      code: modeName === 'template' ? 'TEMPLATE_EXPORTED' : 'FINAL_EXPORTED',
      message: modeName === 'template'
        ? 'Downloaded a reusable template HTML with slot metadata.'
        : 'Downloaded a final HTML with current slot values applied.'
    });
    persistDraft(state, statusPanel);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const sourceHtml = await file.text();
    await loadHtml(sourceHtml, file.name);
  }

  async function handleFolderChange(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await loadProjectFolder(files);
  }

  fileInput?.addEventListener('change', handleFileChange);
  folderInput?.addEventListener('change', handleFolderChange);
  undoButton?.addEventListener('click', handleUndo);
  redoButton?.addEventListener('click', handleRedo);

  fixtureButton?.addEventListener('click', async () => {
    const response = await fetch('./fixtures/simple-deck.html?fixture=20260814-preview-highlight');
    const html = await response.text();
    await loadFixture(html, 'simple-deck.html');
  });

  if (exportButton) {
    exportButton.disabled = true;
    exportButton.addEventListener('click', () => handleExport('final'));
  }
  if (exportTemplateButton) {
    exportTemplateButton.disabled = true;
    exportTemplateButton.addEventListener('click', () => handleExport('template'));
  }

  renderStatus(statusPanel, {
    level: 'info',
    code: 'READY',
    message: 'Import an HTML deck or open the demo fixture to review pages and locked editable slots.'
  });

  return {
    loadHtml,
    loadFixture,
    loadProjectFolder,
    destroy() {
      disposePreview();
      fileInput?.removeEventListener('change', handleFileChange);
      folderInput?.removeEventListener('change', handleFolderChange);
      undoButton?.removeEventListener('click', handleUndo);
      redoButton?.removeEventListener('click', handleRedo);
    }
  };
}
