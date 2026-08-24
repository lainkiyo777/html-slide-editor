const STATE_VERSION = 1;
const HISTORY_LIMIT = 100;
const DRAFT_KEY_PREFIX = 'html-slot-editor:v1:';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeManifest(manifest) {
  const clonedManifest = cloneJson(manifest);
  clonedManifest.slides = Array.isArray(clonedManifest.slides) ? clonedManifest.slides : [];
  clonedManifest.slots = Array.isArray(clonedManifest.slots) ? clonedManifest.slots : [];
  return clonedManifest;
}

function deriveValues(manifest) {
  return Object.fromEntries(
    manifest.slots.map((slot) => [slot.id, cloneJson(slot.currentValue ?? slot.originalValue ?? '')])
  );
}

function deriveLabels(manifest) {
  return Object.fromEntries(manifest.slots.map((slot) => [slot.id, slot.label ?? '']));
}

function deriveEnabled(manifest) {
  return Object.fromEntries(manifest.slots.map((slot) => [slot.id, slot.enabled !== false]));
}

function syncManifestFields(manifest, values, labels, enabled) {
  return {
    ...manifest,
    slots: manifest.slots.map((slot) => ({
      ...slot,
      currentValue: cloneJson(values[slot.id]),
      label: labels[slot.id] ?? slot.label ?? '',
      enabled: enabled[slot.id] !== false
    }))
  };
}

function buildSnapshot(state) {
  return {
    manifest: cloneJson(state.manifest),
    values: cloneJson(state.values),
    labels: cloneJson(state.labels),
    enabled: cloneJson(state.enabled),
    currentSlideId: state.currentSlideId,
    currentSlotId: state.currentSlotId,
    warnings: cloneJson(state.warnings),
    updatedAt: state.updatedAt ?? null
  };
}

function trimHistory(history, historyIndex) {
  if (history.length <= HISTORY_LIMIT) {
    return { history, historyIndex };
  }
  const trimmedHistory = history.slice(history.length - HISTORY_LIMIT);
  const removedCount = history.length - trimmedHistory.length;
  return {
    history: trimmedHistory,
    historyIndex: Math.max(0, historyIndex - removedCount)
  };
}

function buildState(base, snapshot, history, historyIndex) {
  return {
    version: STATE_VERSION,
    deckId: base.deckId,
    sourceHtml: base.sourceHtml,
    normalizedHtml: base.normalizedHtml,
    sourceFile: base.sourceFile,
    sourceHash: base.sourceHash,
    manifest: cloneJson(snapshot.manifest),
    values: cloneJson(snapshot.values),
    labels: cloneJson(snapshot.labels),
    enabled: cloneJson(snapshot.enabled),
    currentSlideId: snapshot.currentSlideId ?? null,
    currentSlotId: snapshot.currentSlotId ?? null,
    warnings: cloneJson(snapshot.warnings ?? []),
    updatedAt: snapshot.updatedAt ?? base.updatedAt ?? null,
    history: cloneJson(history),
    historyIndex
  };
}

function applyMutation(state, mutator) {
  const draft = {
    manifest: cloneJson(state.manifest),
    values: cloneJson(state.values),
    labels: cloneJson(state.labels),
    enabled: cloneJson(state.enabled),
    currentSlideId: state.currentSlideId,
    currentSlotId: state.currentSlotId,
    warnings: cloneJson(state.warnings)
  };

  const changed = mutator(draft);
  if (!changed) return state;

  draft.manifest = syncManifestFields(draft.manifest, draft.values, draft.labels, draft.enabled);

  const historyBase = state.history.slice(0, state.historyIndex + 1);
  const nextSnapshot = buildSnapshot(draft);
  const nextHistory = [...historyBase, nextSnapshot];
  const bounded = trimHistory(nextHistory, nextHistory.length - 1);

  return buildState(state, nextSnapshot, bounded.history, bounded.historyIndex);
}

function findSlide(manifest, slideId) {
  return manifest.slides.find((slide) => slide.id === slideId) ?? null;
}

function findSlot(manifest, slotId) {
  return manifest.slots.find((slot) => slot.id === slotId) ?? null;
}

function findFirstSlotIdForSlide(manifest, slideId) {
  return findSlide(manifest, slideId)?.slotIds?.[0] ?? null;
}

function validateSerializedState(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.version !== STATE_VERSION) return null;
  if (typeof raw.sourceHtml !== 'string' || typeof raw.normalizedHtml !== 'string' || typeof raw.sourceFile !== 'string') {
    return null;
  }
  if (typeof raw.sourceHash !== 'string') return null;
  if (!isPlainObject(raw.manifest) || !Array.isArray(raw.history) || typeof raw.historyIndex !== 'number') {
    return null;
  }
  return raw;
}

export function createTemplateState({ sourceHtml, normalizedHtml, manifest, sourceFile }) {
  const normalizedManifest = normalizeManifest(manifest);
  const initialSlideId = normalizedManifest.slides[0]?.id ?? null;
  const initialSlotId = initialSlideId ? findFirstSlotIdForSlide(normalizedManifest, initialSlideId) : null;
  const values = deriveValues(normalizedManifest);
  const labels = deriveLabels(normalizedManifest);
  const enabled = deriveEnabled(normalizedManifest);
  const syncedManifest = syncManifestFields(normalizedManifest, values, labels, enabled);

  const baseState = {
    version: STATE_VERSION,
    deckId: normalizedManifest.deckId ?? 'generated-deck-id',
    sourceHtml,
    normalizedHtml,
    sourceFile,
    sourceHash: hashString(sourceHtml),
    manifest: syncedManifest,
    values,
    labels,
    enabled,
    currentSlideId: initialSlideId,
    currentSlotId: initialSlotId,
    warnings: [],
    updatedAt: null
  };

  const initialSnapshot = buildSnapshot(baseState);
  return {
    ...baseState,
    history: [initialSnapshot],
    historyIndex: 0
  };
}

export function setSlotValue(state, slotId, value) {
  return applyMutation(state, (draft) => {
    if (!(slotId in draft.values)) return false;
    draft.values[slotId] = cloneJson(value);
    draft.currentSlotId = slotId;
    return true;
  });
}

export function renameSlot(state, slotId, label) {
  return applyMutation(state, (draft) => {
    if (!(slotId in draft.labels)) return false;
    draft.labels[slotId] = String(label);
    draft.currentSlotId = slotId;
    return true;
  });
}

export function setSlotEnabled(state, slotId, enabled) {
  return applyMutation(state, (draft) => {
    if (!(slotId in draft.enabled)) return false;
    draft.enabled[slotId] = Boolean(enabled);
    draft.currentSlotId = slotId;
    return true;
  });
}

export function selectSlide(state, slideId) {
  return applyMutation(state, (draft) => {
    if (!findSlide(draft.manifest, slideId)) return false;
    draft.currentSlideId = slideId;
    draft.currentSlotId = findFirstSlotIdForSlide(draft.manifest, slideId);
    return true;
  });
}

export function selectSlot(state, slotId) {
  return applyMutation(state, (draft) => {
    const slot = findSlot(draft.manifest, slotId);
    if (!slot) return false;
    draft.currentSlotId = slotId;
    draft.currentSlideId = slot.slideId ?? draft.currentSlideId ?? null;
    return true;
  });
}

export function undo(state) {
  if (state.historyIndex <= 0) return state;
  const nextIndex = state.historyIndex - 1;
  return buildState(state, state.history[nextIndex], state.history, nextIndex);
}

export function redo(state) {
  if (state.historyIndex >= state.history.length - 1) return state;
  const nextIndex = state.historyIndex + 1;
  return buildState(state, state.history[nextIndex], state.history, nextIndex);
}

export function serializeDraft(state) {
  return JSON.stringify({
    version: state.version,
    deckId: state.deckId,
    sourceHtml: state.sourceHtml,
    normalizedHtml: state.normalizedHtml,
    sourceFile: state.sourceFile,
    sourceHash: state.sourceHash,
    manifest: state.manifest,
    values: state.values,
    labels: state.labels,
    enabled: state.enabled,
    currentSlideId: state.currentSlideId,
    currentSlotId: state.currentSlotId,
    warnings: state.warnings,
    updatedAt: state.updatedAt,
    history: state.history,
    historyIndex: state.historyIndex
  });
}

export function restoreDraft(serialized) {
  return restoreDraftResult(serialized).state;
}

export function restoreDraftResult(serialized) {
  try {
    const parsed = validateSerializedState(JSON.parse(serialized));
    if (!parsed) {
      return {
        state: null,
        warning: {
          code: 'DRAFT_RESTORE_CORRUPT',
          message: 'Stored draft was corrupted and was ignored.'
        }
      };
    }
    const bounded = trimHistory(parsed.history, parsed.historyIndex);
    const snapshot = bounded.history[bounded.historyIndex];
    if (!snapshot) {
      return {
        state: null,
        warning: {
          code: 'DRAFT_RESTORE_CORRUPT',
          message: 'Stored draft was corrupted and was ignored.'
        }
      };
    }

    return {
      state: buildState(
        {
          deckId: parsed.deckId,
          sourceHtml: parsed.sourceHtml,
          normalizedHtml: parsed.normalizedHtml,
          sourceFile: parsed.sourceFile,
          sourceHash: parsed.sourceHash,
          updatedAt: parsed.updatedAt ?? null
        },
        snapshot,
        bounded.history,
        bounded.historyIndex
      ),
      warning: null
    };
  } catch (error) {
    return {
      state: null,
      warning: {
        code: 'DRAFT_RESTORE_CORRUPT',
        message: 'Stored draft was corrupted and was ignored.'
      }
    };
  }
}

export function draftStorageKey(deckId) {
  return `${DRAFT_KEY_PREFIX}${deckId}`;
}

export function saveDraft(state) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return { ok: false, warning: { code: 'DRAFT_STORAGE_UNAVAILABLE', message: 'localStorage is unavailable.' } };
    }

    const updatedAt = new Date().toISOString();
    const payload = {
      ...JSON.parse(serializeDraft(state)),
      updatedAt,
      manifestVersion: state.manifest.version ?? STATE_VERSION
    };
    storage.setItem(draftStorageKey(state.deckId), JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    return { ok: false, warning: { code: 'DRAFT_SAVE_FAILED', message: 'Draft save failed; continuing in memory.' } };
  }
}

export function loadDraft(deckId, expectedSourceHash = null) {
  return loadDraftResult(deckId, expectedSourceHash).state;
}

export function loadDraftResult(deckId, expectedSourceHash = null) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return { state: null, warning: null };
    const serialized = storage.getItem(draftStorageKey(deckId));
    if (!serialized) return { state: null, warning: null };
    const parsed = JSON.parse(serialized);
    if (parsed.deckId !== deckId || (expectedSourceHash !== null && parsed.sourceHash !== expectedSourceHash)) {
      return {
        state: null,
        warning: {
          code: 'DRAFT_RESTORE_MISMATCH',
          message: 'Stored draft did not match this imported HTML and was ignored.'
        }
      };
    }
    return restoreDraftResult(JSON.stringify(parsed));
  } catch (error) {
    return {
      state: null,
      warning: {
        code: 'DRAFT_RESTORE_CORRUPT',
        message: 'Stored draft was corrupted and was ignored.'
      }
    };
  }
}
