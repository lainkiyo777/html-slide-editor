import test from 'node:test';
import assert from 'node:assert/strict';

import * as resizerModule from '../src/pages-resizer.js';

function createStyleDeclaration() {
  const values = new Map();
  return {
    setProperty(name, value) {
      values.set(name, String(value));
    },
    getPropertyValue(name) {
      return values.get(name) ?? '';
    }
  };
}

function createHandle() {
  const handle = new EventTarget();
  const attributes = new Map();
  const classes = new Set();

  handle.setAttribute = (name, value) => attributes.set(name, String(value));
  handle.getAttribute = (name) => attributes.get(name) ?? null;
  handle.setPointerCapture = () => {};
  handle.releasePointerCapture = () => {};
  handle.classList = {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    contains: (name) => classes.has(name)
  };

  return handle;
}

function createEvent(type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.entries(properties).forEach(([name, value]) => {
    Object.defineProperty(event, name, { value });
  });
  return event;
}

test('Slots resizer tracks its left edge, clamps width, and persists changes', () => {
  assert.equal(
    typeof resizerModule.createSlotsResizer,
    'function',
    'createSlotsResizer must provide the right-panel resize behavior'
  );

  const documentRef = new EventTarget();
  const handle = createHandle();
  const shell = {
    style: createStyleDeclaration(),
    getBoundingClientRect: () => ({ right: 1000 })
  };
  const storedValues = new Map();
  const storage = {
    getItem: (key) => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, String(value))
  };

  const resizer = resizerModule.createSlotsResizer({
    document: documentRef,
    shell,
    handle,
    storage
  });

  assert.equal(resizer.getWidth(), 340);
  assert.equal(shell.style.getPropertyValue('--slots-width'), '340px');

  handle.dispatchEvent(createEvent('pointerdown', { button: 0, pointerId: 7 }));
  documentRef.dispatchEvent(createEvent('pointermove', { clientX: 580, pointerId: 7 }));

  assert.equal(resizer.getWidth(), 420, 'dragging the left edge leftward widens the Slots panel');
  assert.equal(shell.style.getPropertyValue('--slots-width'), '420px');
  assert.equal(storedValues.get('html-slot-editor:slots-width:v1'), '420');

  handle.dispatchEvent(createEvent('keydown', { key: 'ArrowLeft' }));
  assert.equal(resizer.getWidth(), 436, 'ArrowLeft widens the right-hand panel');

  handle.dispatchEvent(createEvent('keydown', { key: 'ArrowRight' }));
  assert.equal(resizer.getWidth(), 420, 'ArrowRight narrows the right-hand panel');

  assert.equal(resizer.setWidth(999), 520, 'the panel width is capped at its maximum');
  assert.equal(resizer.setWidth(1), 260, 'the panel width is capped at its minimum');

  resizer.destroy();
});
