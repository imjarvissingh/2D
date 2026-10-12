/* Loomframe app: gallery, studio, drawing, timeline, playback, export. */
(function () {
  const { api, gif, Project, makeCanvas, touch } = window.LF;
  const $ = (id) => document.getElementById(id);

  const SWATCHES = ['#16141f', '#f7f2e8', '#ff6b4a', '#ffb627', '#2ec4b6',
    '#9b7bff', '#3a86ff', '#ef476f', '#06d6a0', '#8d6e63'];
  const ONION_PREV = '#ff6b4a', ONION_NEXT = '#2ec4b6';

  const state = {
    project: null,
    frame: 0,
    layer: 0,
    tool: 'brush',
    color: '#16141f',
    size: 8,
    opacity: 1,
    onion: true,
    playing: false,
    stroke: null,
  };

  const view = $('view');
  const vctx = view.getContext('2d');
  let strokeCanvas = null, previewCanvas = null, tintCanvas = null;

  /* ================= toast ================= */
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ================= gallery ================= */
  async function showGallery() {
    stopPlayback();
    if (state.project) await saveNow();
    state.project = null;
    $('studio').hidden = true;
    $('gallery').hidden = false;
    const list = await api.list();
    const shelf = $('shelf');
    shelf.innerHTML = '';
    $('emptyShelf').hidden = list.length > 0;
    for (const m of list) {
      const card = document.createElement('div');
      card.className = 'card';
      card.tabIndex = 0;
      card.innerHTML = `<div class="thumb"></div>
        <div class="meta"><b></b><span></span></div>
        <button class="del" title="Delete" aria-label="Delete">✕</button>`;
      if (m.thumb) card.querySelector('.thumb').style.backgroundImage = `url(${m.thumb})`;
      card.querySelector('b').textContent = m.name;
      card.querySelector('span').textContent =
        `${m.frames} frame${m.frames === 1 ? '' : 's'} · ${m.width}×${m.height} · ${new Date(m.updatedAt).toLocaleDateString()}`;
      card.addEventListener('click', () => openProject(m.id));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openProject(m.id); });
      card.querySelector('.del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete “${m.name}”? This cannot be undone.`)) return;
        await api.remove(m.id);
        showGallery();
      });
      shelf.appendChild(card);
    }
  }

  async function newProject() {
    const [w, h] = $('newSize').value.split('x').map(Number);
    const p = Project.create({ width: w, height: h, name: 'Loop ' + new Date().toLocaleDateString() });
    await api.save(p.serialize());
    enterStudio(p);
  }

  async function openProject(id) {
    const data = await api.get(id);
    if (!data) { toast('That loop could not be found.'); return showGallery(); }
    enterStudio(await Project.deserialize(data));
  }

  async function importProject(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data.layers || !data.frameCount) throw new Error('bad file');
      data.id = LF.uid();
      const p = await Project.deserialize(data);
      await api.save(p.serialize());
      toast('Loop imported.');
      enterStudio(p);
    } catch (e) {
      toast('That file is not a Loomframe project.');
    }
  }

  /* ================= studio setup ================= */
  function enterStudio(p) {
    state.project = p;
    state.frame = 0;
    state.layer = p.layers.length - 1;
    view.width = p.width; view.height = p.height;
    strokeCanvas = makeCanvas(p.width, p.height);
    previewCanvas = makeCanvas(p.width, p.height);
    tintCanvas = makeCanvas(p.width, p.height);
    $('projName').value = p.name;
    $('fpsInput').value = p.fps;
    $('bgInput').value = p.bg.toLowerCase();
    $('gallery').hidden = true;
    $('studio').hidden = false;
    setSaveState('Saved');
    buildTimeline();
    fitStage();
    render();
  }

  function fitStage() {
    const p = state.project;
    if (!p) return;
    const stage = $('stage');
    const sw = stage.clientWidth - 32, sh = stage.clientHeight - 32;
    const scale = Math.min(sw / p.width, sh / p.height);
    view.style.width = Math.max(50, Math.floor(p.width * scale)) + 'px';
    view.style.height = Math.max(50, Math.floor(p.height * scale)) + 'px';
  }

  /* ================= rendering ================= */
  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  function drawTinted(frame, color, alpha) {
    const p = state.project;
    const tctx = tintCanvas.getContext('2d');
    tctx.globalCompositeOperation = 'source-over';
    p.renderFrame(tctx, frame, false);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, p.width, p.height);
    tctx.globalCompositeOperation = 'source-over';
    vctx.globalAlpha = alpha;
    vctx.drawImage(tintCanvas, 0, 0);
    vctx.globalAlpha = 1;
  }

  function render() {
    const p = state.project;
    if (!p) return;
    const f = state.frame;
    vctx.fillStyle = p.bg;
    vctx.fillRect(0, 0, p.width, p.height);
    if (state.onion && !state.playing) {
      if (f > 0) drawTinted(f - 1, ONION_PREV, 0.3);
      if (f < p.frameCount - 1) drawTinted(f + 1, ONION_NEXT, 0.22);
    }
    p.layers.forEach((l, i) => {
      if (!l.visible) return;
      const c = l.cels[f];
      if (i === state.layer && state.stroke && state.stroke.live) {
        const pctx = previewCanvas.getContext('2d');
        pctx.clearRect(0, 0, p.width, p.height);
        if (c) pctx.drawImage(c, 0, 0);
        applyStroke(pctx);
        vctx.drawImage(previewCanvas, 0, 0);
      } else if (c) {
        vctx.drawImage(c, 0, 0);
      }
    });
    $('frameLabel').textContent = `${f + 1} / ${p.frameCount}`;
  }

  function applyStroke(ctx) {
    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.globalCompositeOperation = state.stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.restore();
  }

  /* ================= input ================= */
  function toCanvas(e) {
    const r = view.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * view.width,
      y: ((e.clientY - r.top) / r.height) * view.height,
      p: e.pointerType === 'pen' ? 0.15 + 0.85 * (e.pressure || 0.5) : 1,
    };
  }

  function activeLayer() { return state.project.layers[state.layer]; }

  function beginPixelEdit() {
    const p = state.project;
    const c = p.cel(state.layer, state.frame, true);
    const before = c.getContext('2d').getImageData(0, 0, p.width, p.height);
    return { c, before };
  }

  function commitPixelEdit(edit) {
    const p = state.project;
    const ctx = edit.c.getContext('2d');
    const after = ctx.getImageData(0, 0, p.width, p.height);
    const { c, before } = edit;
    const frame = state.frame, layerId = activeLayer().id;
    const apply = (img) => {
      c.getContext('2d').putImageData(img, 0, 0);
      touch(c);
      const li = p.layerIndex(layerId);
      if (li >= 0) updateCelThumb(li, p.layers[li].cels.indexOf(c));
      changed();
    };
    p.push({ undo: () => apply(before), redo: () => apply(after) });
    touch(c);
    updateCelThumb(state.layer, frame);
    changed();
  }

  function onPointerDown(e) {
    if (!state.project || state.playing) return;
    if (e.button !== undefined && e.button > 0) return;
    const layer = activeLayer();
    if (!layer.visible) { toast('This layer is hidden. Show it to draw.'); return; }
    const pt = toCanvas(e);
    if (state.tool === 'picker') { pickColor(pt); return; }
    if (state.tool === 'fill') { floodFill(pt); return; }
    view.setPointerCapture(e.pointerId);
    const sctx = strokeCanvas.getContext('2d');
    sctx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
    state.stroke = { tool: state.tool, pts: [pt], live: true, id: e.pointerId };
    dab(pt);
    requestRender();
  }

  function onPointerMove(e) {
    moveCursor(e);
    const s = state.stroke;
    if (!s || e.pointerId !== s.id) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (events.length ? events : [e])) segment(toCanvas(ev));
    requestRender();
  }

  function onPointerUp(e) {
    const s = state.stroke;
    if (!s || e.pointerId !== s.id) return;
    finishStroke();
    const edit = beginPixelEdit();
    applyStroke(edit.c.getContext('2d'));
    state.stroke = null;
    commitPixelEdit(edit);
    render();
  }

  function strokeStyle(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = state.stroke.tool === 'eraser' ? '#000' : state.color;
  }

  function dab(pt) {
    const ctx = strokeCanvas.getContext('2d');
    strokeStyle(ctx);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(0.5, (state.size * pt.p) / 2), 0, Math.PI * 2);
    ctx.fill();
  }

  function segment(pt) {
    const pts = state.stroke.pts;
    const prev = pts[pts.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) < 0.75) return;
    pts.push(pt);
    const ctx = strokeCanvas.getContext('2d');
    strokeStyle(ctx);
    ctx.lineWidth = Math.max(1, state.size * (prev.p + pt.p) / 2);
    ctx.beginPath();
    if (pts.length >= 3) {
      const a = pts[pts.length - 3];
      ctx.moveTo((a.x + prev.x) / 2, (a.y + prev.y) / 2);
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pt.x) / 2, (prev.y + pt.y) / 2);
    } else {
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo((prev.x + pt.x) / 2, (prev.y + pt.y) / 2);
    }
    ctx.stroke();
  }

  // The smoothed path stops at the last midpoint; close the gap to the final point.
  function finishStroke() {
    const pts = state.stroke.pts;
    if (pts.length < 2) return;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const ctx = strokeCanvas.getContext('2d');
    strokeStyle(ctx);
    ctx.lineWidth = Math.max(1, state.size * b.p);
    ctx.beginPath();
    ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function moveCursor(e) {
    const cur = $('cursor');
    if (!state.project || state.tool === 'fill' || state.tool === 'picker') { cur.hidden = true; view.style.cursor = 'crosshair'; return; }
    view.style.cursor = 'none';
    const r = view.getBoundingClientRect();
    const sr = $('stage').getBoundingClientRect();
    const d = Math.max(4, state.size * (r.width / view.width));
    cur.hidden = false;
    cur.style.width = cur.style.height = d + 'px';
    cur.style.left = e.clientX - sr.left + 'px';
    cur.style.top = e.clientY - sr.top + 'px';
  }

  function pickColor(pt) {
    const d = vctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
    const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    setColor(hex);
    setTool('brush');
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* Flood fill on the active cel, bounded by lines on all visible layers. */
  function floodFill(pt) {
    const p = state.project, w = p.width, h = p.height;
    const x0 = Math.floor(pt.x), y0 = Math.floor(pt.y);
    if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;
    const ref = makeCanvas(w, h);
    const rctx = ref.getContext('2d', { willReadFrequently: true });
    p.renderFrame(rctx, state.frame, false);
    const src = rctx.getImageData(0, 0, w, h).data;
    const edit = beginPixelEdit();
    const ctx = edit.c.getContext('2d');
    const out = ctx.getImageData(0, 0, w, h);
    const o = out.data;
    const i0 = (y0 * w + x0) * 4;
    const tr = src[i0], tg = src[i0 + 1], tb = src[i0 + 2], ta = src[i0 + 3];
    const tol = 48;
    const match = (i) => Math.abs(src[i] - tr) + Math.abs(src[i + 1] - tg) + Math.abs(src[i + 2] - tb) + Math.abs(src[i + 3] - ta) <= tol;
    const [r, g, b] = hexToRgb(state.color);
    const a = Math.round(state.opacity * 255);
    const seen = new Uint8Array(w * h);
    const stack = [x0, y0];
    let filled = 0;
    while (stack.length) {
      const y = stack.pop(); let x = stack.pop();
      while (x >= 0 && !seen[y * w + x] && match((y * w + x) * 4)) x--;
      x++;
      let up = false, down = false;
      while (x < w && !seen[y * w + x] && match((y * w + x) * 4)) {
        const pi = y * w + x, i = pi * 4;
        seen[pi] = 1; filled++;
        // blend fill under existing paint on this cel
        const da = o[i + 3] / 255, sa = a / 255, outA = sa + da * (1 - sa);
        if (outA > 0) {
          o[i] = (r * sa + o[i] * da * (1 - sa)) / outA;
          o[i + 1] = (g * sa + o[i + 1] * da * (1 - sa)) / outA;
          o[i + 2] = (b * sa + o[i + 2] * da * (1 - sa)) / outA;
        }
        o[i + 3] = outA * 255;
        if (y > 0) {
          const m = !seen[pi - w] && match((pi - w) * 4);
          if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false;
        }
        if (y < h - 1) {
          const m = !seen[pi + w] && match((pi + w) * 4);
          if (m && !down) { stack.push(x, y + 1); down = true; } else if (!m) down = false;
        }
        x++;
      }
    }
    if (!filled) return;
    ctx.putImageData(out, 0, 0);
    commitPixelEdit(edit);
    render();
  }

  /* ================= timeline ================= */
  const THUMB_W = 72;
  function thumbH() { return Math.round(THUMB_W * state.project.height / state.project.width); }

  function buildTimeline() {
    const p = state.project;
    const tracks = $('tracks');
    tracks.innerHTML = '';
    tracks.style.gridTemplateColumns = `132px repeat(${p.frameCount}, ${THUMB_W}px)`;
    // header row
    tracks.appendChild(document.createElement('div'));
    for (let f = 0; f < p.frameCount; f++) {
      const n = document.createElement('div');
      n.className = 'frame-num' + (f === state.frame ? ' current' : '');
      n.textContent = f + 1;
      n.dataset.frame = f;
      n.addEventListener('click', () => goTo(f));
      tracks.appendChild(n);
    }
    // layers, top layer first
    for (let li = p.layers.length - 1; li >= 0; li--) {
      const l = p.layers[li];
      const head = document.createElement('div');
      head.className = 'track-head' + (li === state.layer ? ' active' : '');
      head.innerHTML = `<button class="eye${l.visible ? '' : ' off'}" title="Show / hide">👁</button><span class="lname"></span>`;
      head.querySelector('.lname').textContent = l.name;
      head.title = 'Click to select, double-click to rename';
      head.addEventListener('click', (e) => {
        if (e.target.classList.contains('eye')) {
          l.visible = !l.visible; changed(); buildTimeline(); render(); return;
        }
        state.layer = li; buildTimeline();
      });
      head.addEventListener('dblclick', () => {
        const name = prompt('Layer name', l.name);
        if (name) { l.name = name.slice(0, 40); changed(); buildTimeline(); }
      });
      tracks.appendChild(head);
      for (let f = 0; f < p.frameCount; f++) {
        const cel = document.createElement('button');
        cel.className = 'cel' + (f === state.frame ? ' current-frame' : '') + (f === state.frame && li === state.layer ? ' selected' : '');
        cel.style.height = thumbH() + 'px';
        cel.dataset.layer = li; cel.dataset.frame = f;
        cel.setAttribute('aria-label', `${l.name}, frame ${f + 1}`);
        const tc = makeCanvas(THUMB_W * 2, thumbH() * 2);
        cel.appendChild(tc);
        cel.addEventListener('click', () => { state.layer = li; goTo(f); });
        tracks.appendChild(cel);
        drawThumb(tc, l.cels[f]);
      }
    }
    updateButtons();
    const cur = tracks.querySelector('.frame-num.current');
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function drawThumb(tc, cel) {
    const ctx = tc.getContext('2d');
    ctx.clearRect(0, 0, tc.width, tc.height);
    ctx.fillStyle = state.project.bg;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, 0, tc.width, tc.height);
    ctx.globalAlpha = 1;
    if (cel) ctx.drawImage(cel, 0, 0, tc.width, tc.height);
  }

  function updateCelThumb(li, f) {
    const btn = $('tracks').querySelector(`.cel[data-layer="${li}"][data-frame="${f}"]`);
    if (btn) drawThumb(btn.querySelector('canvas'), state.project.layers[li].cels[f]);
  }

  function goTo(f) {
    const p = state.project;
    state.frame = Math.max(0, Math.min(p.frameCount - 1, f));
    const tracks = $('tracks');
    tracks.querySelectorAll('.frame-num').forEach((n) => n.classList.toggle('current', +n.dataset.frame === state.frame));
    tracks.querySelectorAll('.cel').forEach((c) => {
      const fr = +c.dataset.frame;
      c.classList.toggle('current-frame', fr === state.frame);
      c.classList.toggle('selected', fr === state.frame && +c.dataset.layer === state.layer);
    });
    tracks.querySelectorAll('.track-head').forEach((h, i) => h.classList.toggle('active', p.layers.length - 1 - i === state.layer));
    const cur = tracks.querySelector('.frame-num.current');
    if (cur && !state.playing) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateButtons();
    render();
  }

  function structural(doFn, undoFn) {
    doFn();
    state.project.push({
      undo: () => { undoFn(); buildTimeline(); render(); changed(); },
      redo: () => { doFn(); buildTimeline(); render(); changed(); },
    });
    buildTimeline(); render(); changed();
  }

  function addFrame(copy) {
    const at = state.frame + 1, src = state.frame;
    structural(
      () => { state.project.insertFrame(at, copy ? src : undefined); state.frame = at; },
      () => { state.project.removeFrame(at); state.frame = src; });
  }

  function deleteFrame() {
    const p = state.project;
    if (p.frameCount <= 1) {
      // clear instead of delete the last frame
      const removed = p.layers.map((l) => l.cels[0]);
      structural(() => p.layers.forEach((l) => { l.cels[0] = null; }),
        () => p.layers.forEach((l, i) => { l.cels[0] = removed[i]; }));
      return;
    }
    const at = state.frame;
    let removed;
    structural(
      () => { removed = p.removeFrame(at); state.frame = Math.min(at, p.frameCount - 1); },
      () => { p.restoreFrame(at, removed); state.frame = at; });
  }

  function moveFrame(dir) {
    const p = state.project, a = state.frame, b = a + dir;
    if (b < 0 || b >= p.frameCount) return;
    structural(() => { p.swapFrames(a, b); state.frame = b; }, () => { p.swapFrames(a, b); state.frame = a; });
  }

  function addLayer() {
    const p = state.project;
    const at = state.layer + 1;
    let layer;
    structural(
      () => { layer = layer ? (p.layers.splice(at, 0, layer), layer) : p.addLayer(undefined, at); state.layer = at; },
      () => { p.layers.splice(at, 1); state.layer = at - 1; });
  }

  function deleteLayer() {
    const p = state.project;
    if (p.layers.length <= 1) { toast('A loop needs at least one layer.'); return; }
    const at = state.layer;
    const layer = p.layers[at];
    structural(
      () => { p.layers.splice(at, 1); state.layer = Math.max(0, at - 1); },
      () => { p.layers.splice(at, 0, layer); state.layer = at; });
  }

  function updateButtons() {
    const p = state.project;
    $('undoBtn').disabled = !p.undoStack.length;
    $('redoBtn').disabled = !p.redoStack.length;
    $('moveLeftBtn').disabled = state.frame === 0;
    $('moveRightBtn').disabled = state.frame === p.frameCount - 1;
  }

  /* ================= playback ================= */
  let playRaf = 0, lastTick = 0, acc = 0;
  function togglePlay() { state.playing ? stopPlayback() : startPlayback(); }
  function startPlayback() {
    if (!state.project || state.project.frameCount < 2) { toast('Add a second frame to play.'); return; }
    state.playing = true;
    $('playBtn').textContent = '❚❚'; $('playBtn').classList.add('playing');
    lastTick = performance.now(); acc = 0;
    const tick = (now) => {
      if (!state.playing) return;
      acc += now - lastTick; lastTick = now;
      const step = 1000 / state.project.fps;
      if (acc >= step) {
        acc %= step;
        state.frame = (state.frame + 1) % state.project.frameCount;
        goTo(state.frame);
      }
      playRaf = requestAnimationFrame(tick);
    };
    playRaf = requestAnimationFrame(tick);
  }
  function stopPlayback() {
    if (!state.playing) return;
    state.playing = false;
    cancelAnimationFrame(playRaf);
    $('playBtn').textContent = '▶'; $('playBtn').classList.remove('playing');
    render();
  }

  /* ================= saving ================= */
  let saveTimer = null;
  function setSaveState(s) { $('saveState').textContent = s; }
  function changed() {
    if (!state.project) return;
    setSaveState('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 900);
    updateButtons();
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const p = state.project;
    if (!p) return;
    try {
      await api.save(p.serialize());
      if (state.project === p) setSaveState('Saved to this device');
    } catch (e) {
      console.error(e);
      setSaveState('Not saved');
      toast('Could not save. Your browser storage may be full.');
    }
  }

  /* ================= export ================= */
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const safeName = () => (state.project.name || 'loop').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'loop';

  async function exportAs(kind) {
    const p = state.project;
    stopPlayback();
    if (kind === 'frame') {
      const c = makeCanvas(p.width, p.height);
      p.renderFrame(c.getContext('2d'), state.frame);
      c.toBlob((b) => { download(b, `${safeName()}-frame${state.frame + 1}.png`); toast('Frame saved.'); });
    } else if (kind === 'sheet') {
      const cols = Math.ceil(Math.sqrt(p.frameCount)), rows = Math.ceil(p.frameCount / cols);
      const c = makeCanvas(p.width * cols, p.height * rows);
      const ctx = c.getContext('2d');
      const tmp = makeCanvas(p.width, p.height);
      for (let f = 0; f < p.frameCount; f++) {
        p.renderFrame(tmp.getContext('2d'), f);
        ctx.drawImage(tmp, (f % cols) * p.width, Math.floor(f / cols) * p.height);
      }
      c.toBlob((b) => { download(b, `${safeName()}-sheet.png`); toast('Sprite sheet saved.'); });
    } else if (kind === 'json') {
      await saveNow();
      const data = p.serialize();
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeName()}.loomframe.json`);
      toast('Project file saved.');
    } else if (kind === 'gif') {
      toast('Weaving your GIF…');
      await new Promise((r) => setTimeout(r, 30));
      const scale = Math.min(1, 640 / Math.max(p.width, p.height));
      const w = Math.round(p.width * scale), h = Math.round(p.height * scale);
      const full = makeCanvas(p.width, p.height);
      const small = makeCanvas(w, h);
      const sctx = small.getContext('2d', { willReadFrequently: true });
      const frames = [];
      for (let f = 0; f < p.frameCount; f++) {
        p.renderFrame(full.getContext('2d'), f);
        sctx.drawImage(full, 0, 0, w, h);
        frames.push(sctx.getImageData(0, 0, w, h).data);
      }
      const bytes = gif.encode(frames, w, h, p.fps);
      download(new Blob([bytes], { type: 'image/gif' }), `${safeName()}.gif`);
      toast('Your loop is ready.');
    }
  }

  /* ================= tools & settings ================= */
  function setTool(t) {
    state.tool = t;
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    $('cursor').hidden = true;
  }
  function setColor(hex) {
    state.color = hex;
    $('colorInput').value = hex;
    document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s.dataset.color === hex));
  }
  function setSize(v) {
    state.size = Math.max(1, Math.min(120, v));
    $('sizeInput').value = state.size;
    $('sizeVal').textContent = state.size;
  }

  function undo() { if (state.project && state.project.undo()) { render(); updateButtons(); } }
  function redo() { if (state.project && state.project.redo()) { render(); updateButtons(); } }

  /* ================= wiring ================= */
  function wire() {
    $('newBtn').addEventListener('click', newProject);
    $('importInput').addEventListener('change', (e) => { if (e.target.files[0]) importProject(e.target.files[0]); e.target.value = ''; });
    $('backBtn').addEventListener('click', showGallery);
    $('projName').addEventListener('input', (e) => { state.project.name = e.target.value || 'Untitled loop'; changed(); });

    view.addEventListener('pointerdown', onPointerDown);
    view.addEventListener('pointermove', onPointerMove);
    view.addEventListener('pointerup', onPointerUp);
    view.addEventListener('pointercancel', onPointerUp);
    view.addEventListener('pointerleave', () => { $('cursor').hidden = true; });
    view.addEventListener('contextmenu', (e) => e.preventDefault());

    document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('colorInput').addEventListener('input', (e) => setColor(e.target.value));
    const sw = $('swatches');
    for (const c of SWATCHES) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = c; b.dataset.color = c; b.title = c;
      b.addEventListener('click', () => { setColor(c); if (state.tool !== 'fill') setTool('brush'); });
      sw.appendChild(b);
    }
    $('sizeInput').addEventListener('input', (e) => setSize(+e.target.value));
    $('opInput').addEventListener('input', (e) => { state.opacity = e.target.value / 100; $('opVal').textContent = e.target.value + '%'; });
    $('bgInput').addEventListener('input', (e) => { state.project.bg = e.target.value; render(); buildTimeline(); changed(); });

    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('prevBtn').addEventListener('click', () => { stopPlayback(); goTo(state.frame - 1); });
    $('nextBtn').addEventListener('click', () => { stopPlayback(); goTo(state.frame + 1); });
    $('playBtn').addEventListener('click', togglePlay);
    $('fpsInput').addEventListener('change', (e) => {
      const v = Math.max(1, Math.min(30, Math.round(+e.target.value) || 12));
      e.target.value = v; state.project.fps = v; changed();
    });
    $('onionBtn').addEventListener('click', toggleOnion);
    $('addFrameBtn').addEventListener('click', () => { stopPlayback(); addFrame(false); });
    $('dupFrameBtn').addEventListener('click', () => { stopPlayback(); addFrame(true); });
    $('delFrameBtn').addEventListener('click', () => { stopPlayback(); deleteFrame(); });
    $('moveLeftBtn').addEventListener('click', () => moveFrame(-1));
    $('moveRightBtn').addEventListener('click', () => moveFrame(1));
    $('addLayerBtn').addEventListener('click', addLayer);
    $('delLayerBtn').addEventListener('click', deleteLayer);

    $('exportBtn').addEventListener('click', (e) => { e.stopPropagation(); $('exportMenu').hidden = !$('exportMenu').hidden; });
    $('exportMenu').addEventListener('click', (e) => {
      const k = e.target.dataset.export;
      if (!k) return;
      $('exportMenu').hidden = true;
      exportAs(k);
    });
    document.addEventListener('click', () => { $('exportMenu').hidden = true; });

    window.addEventListener('resize', fitStage);
    if ('ResizeObserver' in window) new ResizeObserver(fitStage).observe($('stage'));
    window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
    document.addEventListener('keydown', onKey);
    setColor(state.color);
    setSize(state.size);
  }

  function toggleOnion() {
    state.onion = !state.onion;
    $('onionBtn').classList.toggle('on', state.onion);
    render();
  }

  function onKey(e) {
    if (!state.project || $('studio').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'color') return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('Saved to this device.'); return; }
    if (mod) return;
    switch (e.key) {
      case 'b': case 'B': setTool('brush'); break;
      case 'e': case 'E': setTool('eraser'); break;
      case 'g': case 'G': setTool('fill'); break;
      case 'i': case 'I': setTool('picker'); break;
      case 'o': case 'O': toggleOnion(); break;
      case 'n': case 'N': stopPlayback(); addFrame(false); break;
      case 'd': case 'D': stopPlayback(); addFrame(true); break;
      case '[': setSize(state.size - (state.size > 10 ? 4 : 1)); break;
      case ']': setSize(state.size + (state.size >= 10 ? 4 : 1)); break;
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': case ',': e.preventDefault(); stopPlayback(); goTo(state.frame - 1); break;
      case 'ArrowRight': case '.': e.preventDefault(); stopPlayback(); goTo(state.frame + 1); break;
      default: return;
    }
  }

  wire();
  showGallery();
  window.LF.state = state; // handy for debugging in the console
})();
