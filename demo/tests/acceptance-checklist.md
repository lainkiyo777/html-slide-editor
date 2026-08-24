# HTML PPT Import Demo Acceptance Checklist

This checklist separates structural checks, browser checks, and unavailable checks so handoff can be honest about what was or was not verified.

## Structural checks

Run from `C:\Users\林启煜\Documents\ChatGPT\html_workspace\.worktrees\html-ppt-import-demo`:

```powershell
git -C base/frontend-slides-editable diff --check
git -C base/frontend-slides-editable status --short
```

Current Task 7 expectation:

- `git diff --check` reports no whitespace/conflict issues
- `git status --short` shows only the intended documentation changes before commit

## Browser checks

Open `http://127.0.0.1:4173/base/frontend-slides-editable/demo/tests/test-runner.html` over HTTP and require all named checks below to show `PASS`:

| Check | Purpose |
|---|---|
| `simple slide count` | `.slide` fixture imports as two slides |
| `reveal slide count` | Reveal-style sections import as two slides |
| `slot uniqueness` | detected slot ids stay unique |
| `decorative exclusion` | `.decorative` content is not marked editable |
| `no-slide warning` | ordinary pages report the explicit unsupported warning |
| `text export` | text edits survive export/re-import correctly |
| `image export` | image slot values survive export/re-import correctly |
| `Manifest round trip` | template manifest and rebuilt import metadata stay coherent |
| `bridge isolation` | sandbox fixture script cannot mutate the parent editor shell |
| `local draft round trip` | draft save/load restores matching deck state |

## Manual 1280x720 workflow

Use a 1280x720 browser window at `http://127.0.0.1:4173/base/frontend-slides-editable/demo/index.html`.

1. Upload `simple-deck.html`.
2. Confirm two pages and detected title, body, and image fields.
3. Rename one field and replace one image.
4. Edit text and use undo/redo.
5. Refresh and confirm the draft restores.
6. Export final HTML and template HTML.
7. Open both outputs and re-import them.
8. Confirm no editor chrome or highlight is present in outputs.
9. Confirm the fixture's in-slide script does not mutate the parent page.

## Unavailable checks

Record unavailable verification here instead of implying automated coverage:

- Browser automation for the demo runner was unavailable in the Task 7 handoff run.
- Visual rendering review of the 1280x720 flow was not executed automatically in Task 7.
- Any future manual run should update this section with exact date and outcome rather than replacing it with a generic "passed" claim.
