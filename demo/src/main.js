import { bootstrapEditor } from './editor-ui.js?phase3b-batch=v1';
import { createPagesResizer } from './pages-resizer.js?pages-resizer=20260814';

export function htmlSlotEditorBoot(documentRef = document) {
  const editor = bootstrapEditor({
    document: documentRef,
    fileInput: documentRef.querySelector('#htmlFileInput'),
    folderInput: documentRef.querySelector('#projectFolderInput'),
    pagesPanel: documentRef.querySelector('#pagesPanel'),
    previewFrame: documentRef.querySelector('#previewFrame'),
    slotsPanel: documentRef.querySelector('#slotsPanel'),
    statusPanel: documentRef.querySelector('#statusPanel'),
    exportButton: documentRef.querySelector('#exportButton'),
    exportTemplateButton: documentRef.querySelector('#exportTemplateButton')
  });
  const pagesResizer = createPagesResizer({
    document: documentRef,
    shell: documentRef.querySelector('.app-shell'),
    handle: documentRef.querySelector('#pagesResizer')
  });

  return {
    ...editor,
    destroy() {
      pagesResizer.destroy();
      editor.destroy?.();
    }
  };
}

function hasEditorShell(documentRef) {
  return Boolean(
    documentRef.querySelector('#htmlFileInput')
    && documentRef.querySelector('#pagesPanel')
    && documentRef.querySelector('#previewFrame')
    && documentRef.querySelector('#slotsPanel')
    && documentRef.querySelector('#statusPanel')
  );
}

if (typeof window !== 'undefined') {
  window.htmlSlotEditorBoot = htmlSlotEditorBoot;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (hasEditorShell(document)) {
        window.__htmlSlotEditor = htmlSlotEditorBoot(document);
      }
    }, { once: true });
  } else if (hasEditorShell(document)) {
    window.__htmlSlotEditor = htmlSlotEditorBoot(document);
  }
}
