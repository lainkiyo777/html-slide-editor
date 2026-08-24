const presenterMarkup = '<html><body>preview</body></html>';
document.documentElement.dataset.runtimeBodyLiteralLength = String(presenterMarkup.length);

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.slide').forEach((slide, index) => {
    slide.classList.toggle('is-active', index === 0);
  });
});
