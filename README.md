# Loomframe

Draw it. Flip it. Loop it. A free, offline, frame-by-frame animation studio that runs in any modern browser. No install, no account, no dependencies.

## Run it

- **Easiest:** double-click `index.html` (Chrome, Edge, Firefox or Safari).
- **Or** with Node installed: `npm start`, then open http://localhost:5173

## What it does

- **Landing page** with a live animated sample scene, plus a projects page with canvas templates
- **Drawing:** brush that responds to pen pressure, eraser, paint bucket, colour picker and move tool, with curated swatches, any colour, and size and opacity controls
- **Motion:** pick a drawing, drag to where it should end up, and choose easing (in-out, bounce, overshoot and more). Loomframe draws the in-between frames for you, including move, scale, rotate and fade.
- **Timeline:** frames × layers grid. Add, duplicate, reorder and delete frames. Add, hide, rename, reorder and remove layers.
- **Onion skin** showing 1–3 frames either side, plus loop or play-once playback at 1–30 FPS
- **Canvas:** zoom (buttons, Ctrl/⌘ + scroll, two-finger pinch) and pan (hand tool or middle mouse)
- **Undo / redo** for every edit, including Motion and timeline changes
- **Saving:** projects autosave on this device (IndexedDB, with localStorage as a fallback). Saves also happen when the tab is hidden, and the app asks the browser for persistent storage.
- **Installable and offline:** the app can be installed (PWA), and a service worker caches it after the first visit
- **Animation coach** (press C): works with or without a key.
  - *Plan:* describe an idea ("a frog jumps onto a lily pad") and get frames, FPS and key-pose notes, which you can add to the timeline. Notes show on the canvas for each key frame.
  - *Feedback:* reviews the current frame against the previous one (spacing, holds, loop pops, empty frames, framing, timing).
  - *Without a key* it uses a built-in coach based on animation principles and image analysis, fully offline.
  - *With your own Gemini API key* (Coach → Gemini key), plans and feedback come from Gemini, which looks at your actual drawing. The key is stored only in your browser and sent only to Google. If Gemini fails, the app falls back to the built-in coach automatically.
- **Export:** animated GIF (adaptive palette), MP4/WebM video, PNG sprite sheet, current frame PNG, and a portable project file (.json, re-importable)

## Keys

Press `?` in the studio to see every shortcut.

| Key | Action |
|---|---|
| B / E / G / I / V / H | Brush / Eraser / Paint bucket / Pick colour / Move drawing / Pan |
| Space | Play / pause |
| ← → | Previous / next frame |
| N / D / Delete | New blank frame / duplicate frame / delete frame |
| M | Motion |
| C | Coach |
| O / L | Onion skin / loop on or off |
| [ ] | Brush size |
| + − 0 | Zoom in / out / fit |
| Ctrl/⌘ Z, Shift Ctrl/⌘ Z | Undo, redo |

## Code map

| File | Role |
|---|---|
| `index.html` | Markup for the shelf and the studio |
| `src/styles.css` | Brand tokens and layout |
| `src/api.js` | Mock backend: Promise API (`list/get/save/remove`) over IndexedDB/localStorage |
| `src/model.js` | Project model (layers × frames of canvases), serialisation, undo history |
| `src/gif.js` | Self-contained GIF89a encoder |
| `src/sample.js` | Procedurally drawn sample scene used on the landing page |
| `src/coach.js` | Animation coach: built-in planner and critic, and an optional Gemini client (bring your own key) |
| `src/app.js` | Routing, landing, projects, drawing input, Motion, timeline, playback, export |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and install as an app |
| `docs/` | Recon, product plan and brand notes |

All names, artwork, palette and copy are original to this project.
