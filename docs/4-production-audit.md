# Production readiness audit (v2)

Checked on 2026-10-12 by driving the deployed build in headless Chromium: desktop at 1440×900 and phone at 390×844.

## Verified working

| Area | Check | Result |
|---|---|---|
| Landing | Hero sample animates, CTAs route correctly, responsive layout | Pass |
| Projects | Templates create projects, cards open/delete, import .json | Pass |
| Drawing | Brush, eraser, fill, picker, move tool edit the selected layer | Pass |
| Motion | Drag-to-target, easing, scale/rotate/fade, creates N frames | Pass |
| Undo/redo | Strokes, fills, moves, Motion, frame and layer changes | Pass |
| Timeline | Add/duplicate/delete/reorder frames, layer show/hide/rename/reorder | Pass |
| Playback | Loop and play-once, FPS 1–30, multi-frame onion skin | Pass |
| Zoom/pan | Buttons, keys, Ctrl+scroll, pinch, hand tool | Pass |
| Saving | Autosave, reload restores project, save on tab hide | Pass |
| Offline | Service worker caches app; offline reload restores project | Pass |
| Export | GIF (adaptive palette, decodes, loops), MP4/WebM video, sprite sheet, PNG, project file | Pass |
| Errors | No console errors across the whole run | Pass |

## Fixed during the audit

- The app crashed when the studio opened before its canvases existed (sample scene would not open).
- Template cards were misaligned, and the phone layout pushed timeline buttons off-screen.
- GIF colours were dithered and noisy. Export now builds a palette from the animation's own colours.
- Layers could not be reordered. Added up/down controls.
- Data safety: the app now saves when the tab is hidden, asks for persistent storage, and shows a friendly error toast. Undo history is capped to limit memory use.
- "Works offline" was only partly true. Added a service worker and manifest, so the app works offline and installs like an app.

## Known limits (honest list for investor conversations)

- Projects live in one browser on one device. There is no cloud sync or collaboration yet; moving a project uses the project file.
- Raster drawing only. There is no vector art, bones/rigging or audio track.
- Video export runs in real time and uses the browser's encoder (MP4 in Chrome and Safari, WebM in Firefox).
- Very long, high-resolution animations use a lot of memory, because each frame of each layer is a full-size canvas.
