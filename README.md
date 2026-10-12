# Loomframe

Draw it. Flip it. Loop it. A free, offline, frame-by-frame animation studio that runs in any modern browser. No install, no account, no dependencies.

## Run it

- **Easiest:** double-click `index.html` (Chrome, Edge, Firefox or Safari).
- **Or** with Node installed: `npm start`, then open http://localhost:5173

## What it does

- Pressure-aware brush (Apple Pencil / stylus), eraser, fill bucket, colour picker
- Curated swatches, any colour, size and opacity
- Frame timeline with layers: add, duplicate, delete, reorder frames; add, hide, rename (double-click), remove layers
- Onion skin (previous frame in coral, next in teal)
- Loop playback at 1–30 FPS
- Undo / redo
- Project shelf with autosave (stored on this device in IndexedDB, falling back to localStorage)
- Export: animated GIF, PNG sprite sheet, current frame PNG, portable project file (.json, re-importable)

## Keys

| Key | Action |
|---|---|
| B / E / G / I | Brush / Eraser / Fill / Pick colour |
| Space | Play / pause |
| ← → or , . | Previous / next frame |
| N / D | New blank frame / duplicate frame |
| O | Onion skin on/off |
| [ ] | Brush size |
| Ctrl/⌘ Z, Shift Ctrl/⌘ Z | Undo, redo |
| Ctrl/⌘ S | Save now |

## Code map

| File | Role |
|---|---|
| `index.html` | Markup for the shelf and the studio |
| `src/styles.css` | Brand tokens and layout |
| `src/api.js` | Mock backend: Promise API (`list/get/save/remove`) over IndexedDB/localStorage |
| `src/model.js` | Project model (layers × frames of canvases), serialisation, undo history |
| `src/gif.js` | Self-contained GIF89a encoder |
| `src/app.js` | UI, drawing input, timeline, playback, export |
| `docs/` | Recon, product plan and brand notes |

All names, artwork, palette and copy are original to this project.
