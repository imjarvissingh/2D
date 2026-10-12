# Stage 2 · Lean product architecture

## Positioning
A free, instant, runs-anywhere flipbook studio. Open a web page, draw, loop, export a GIF. No install, no account, no subscription.

## Undercut strategy
- **Price**: free, offline, zero backend cost (all data lives in the browser).
- **Reach**: any device with a modern browser (mouse, touch, stylus with pressure).
- **Simplicity**: frames, not keyframes. Every feature must serve "draw → flip → loop → share".

## Feature set (shipped in v1)

| Must-have | Included |
|---|---|
| Pressure-aware brush, eraser, fill bucket | ✓ |
| Colour picker + curated swatches, size, opacity | ✓ |
| Frame timeline: add, duplicate, delete, move left/right | ✓ |
| Layers (tracks) with visibility toggle, add, delete | ✓ |
| Onion skin (prev/next, tinted) | ✓ |
| Loop playback with adjustable FPS (1–30) | ✓ |
| Undo / redo | ✓ |
| Project gallery, autosave, rename, delete | ✓ |
| Export: animated GIF, PNG sprite sheet, current frame PNG | ✓ |
| Project file export/import (.json) for portability | ✓ |
| Keyboard shortcuts | ✓ |

Deliberately cut: audio, keyframe curves, 3D transforms, cloud sync, accounts, brush engine marketplace.

## Architecture
- Plain HTML/CSS/ES modules, zero dependencies, zero build step.
- `api.js` is a mock backend: a Promise-based "REST-like" API (`list / get / save / remove`) backed by IndexedDB, falling back to localStorage.
- `model.js` holds the project (layers × frames of offscreen canvases) and undo history.
- `gif.js` is a self-contained GIF89a encoder (fixed palette + ordered dither + LZW).
- `app.js` wires UI, input, rendering and autosave.
