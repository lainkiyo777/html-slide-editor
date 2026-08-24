import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPages } from '../src/editor-ui.js';

const queueModule = await import('../src/thumbnail-queue.js').catch(() => ({}));

const slides = [
  { id: 'slide-1', index: 0, label: 'Slide 1', slotIds: [] },
  { id: 'slide-2', index: 1, label: 'Slide 2', slotIds: [] },
  { id: 'slide-3', index: 2, label: 'Slide 3', slotIds: [] }
];

function batchRunner() {
  assert.equal(
    typeof queueModule.runThumbnailQueue,
    'function',
    'runThumbnailQueue must implement the Phase 3B batch contract'
  );
  return queueModule.runThumbnailQueue;
}

function thumbnailResult(slideId, durationMs = 10) {
  return {
    dataUrl: `data:image/png;base64,${slideId}`,
    durationMs,
    width: 160,
    height: 90,
    diagnostics: {}
  };
}

test('three slides produce three sequential thumbnail results', async () => {
  const attempted = [];
  const runThumbnailQueue = batchRunner();

  const result = await runThumbnailQueue({
    slides,
    cache: new Map(),
    capture: async (slide) => {
      attempted.push(slide.id);
      return thumbnailResult(slide.id);
    }
  });

  assert.deepEqual(attempted, ['slide-1', 'slide-2', 'slide-3']);
  assert.equal(result.total, 3);
  assert.equal(result.success, 3);
  assert.equal(result.failed, 0);
});

test('each thumbnail is stored under its own canonical slide id', async () => {
  const cache = new Map();
  const runThumbnailQueue = batchRunner();

  await runThumbnailQueue({
    slides,
    cache,
    capture: async (slide) => thumbnailResult(slide.id)
  });

  assert.deepEqual(Array.from(cache.keys()), ['slide-1', 'slide-2', 'slide-3']);
  assert.equal(cache.get('slide-1'), 'data:image/png;base64,slide-1');
  assert.equal(cache.get('slide-2'), 'data:image/png;base64,slide-2');
  assert.equal(cache.get('slide-3'), 'data:image/png;base64,slide-3');
});

test('one capture failure is isolated and later slides continue', async () => {
  const cache = new Map();
  const attempted = [];
  const runThumbnailQueue = batchRunner();

  const result = await runThumbnailQueue({
    slides,
    cache,
    capture: async (slide) => {
      attempted.push(slide.id);
      if (slide.id === 'slide-2') throw new Error('synthetic capture failure');
      return thumbnailResult(slide.id);
    }
  });

  assert.deepEqual(attempted, ['slide-1', 'slide-2', 'slide-3']);
  assert.deepEqual(Array.from(cache.keys()), ['slide-1', 'slide-3']);
  assert.equal(result.success, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.errors.map(({ slideId, stage }) => ({ slideId, stage })), [
    { slideId: 'slide-2', stage: 'capture' }
  ]);
});

test('a stale generation stops without writing captured data', async () => {
  const cache = new Map();
  const attempted = [];
  let currentGeneration = 7;
  const runThumbnailQueue = batchRunner();

  const result = await runThumbnailQueue({
    slides,
    cache,
    generation: 7,
    getGeneration: () => currentGeneration,
    capture: async (slide) => {
      attempted.push(slide.id);
      currentGeneration = 8;
      return thumbnailResult(slide.id);
    }
  });

  assert.deepEqual(attempted, ['slide-1']);
  assert.equal(cache.size, 0);
  assert.equal(result.cancelled, true);
});

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  append(...children) {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }

  addEventListener() {}
}

function findElements(root, tagName) {
  const matches = [];
  const expected = tagName.toUpperCase();
  const visit = (node) => {
    if (node.tagName === expected) matches.push(node);
    node.children?.forEach(visit);
  };
  visit(root);
  return matches;
}

test('renderPages consumes the completed cache without starting new captures', async () => {
  const cache = new Map();
  let captureCount = 0;
  const runThumbnailQueue = batchRunner();

  await runThumbnailQueue({
    slides,
    cache,
    capture: async (slide) => {
      captureCount += 1;
      return thumbnailResult(slide.id);
    }
  });

  const originalDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
  const container = new FakeElement('aside');
  try {
    renderPages({
      container,
      manifest: { slides },
      currentSlideId: 'slide-2',
      thumbnailBySlideId: cache,
      onSelectSlide() {}
    });
  } finally {
    globalThis.document = originalDocument;
  }

  const images = findElements(container, 'img');
  assert.equal(captureCount, 3, 'renderPages must not invoke the capture function again');
  assert.equal(images.length, 3);
  assert.deepEqual(images.map((image) => image.src), [
    'data:image/png;base64,slide-1',
    'data:image/png;base64,slide-2',
    'data:image/png;base64,slide-3'
  ]);
});

test('renderPages exposes lightweight batch progress from the session diagnostics', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
  const container = new FakeElement('aside');
  container.dataset.thumbnailStatus = 'partial';
  container.dataset.thumbnailTotal = '3';
  container.dataset.thumbnailGenerated = '2';
  container.dataset.thumbnailFailed = '1';
  container.dataset.thumbnailDurationMs = '1234';
  try {
    renderPages({
      container,
      manifest: { slides },
      currentSlideId: 'slide-1',
      thumbnailBySlideId: new Map(),
      onSelectSlide() {}
    });
  } finally {
    globalThis.document = originalDocument;
  }

  const progress = findElements(container, 'p').find((element) => element.className === 'thumbnail-progress');
  assert.equal(progress?.textContent, 'Thumbnails: 2 / 3 · 1 failed · 1234 ms');
});
