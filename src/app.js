/* Loomframe app: routing, landing, projects, studio (drawing, motion, timeline, playback, export). */
(function () {
  const { api, gif, Project, makeCanvas, touch, sample } = window.LF;
  const $ = (id) => document.getElementById(id);

  const SWATCHES = ['#16141f', '#f7f2e8', '#ff6b4a', '#ffb627', '#2ec4b6',
    '#9b7bff', '#3a86ff', '#ef476f', '#06d6a0', '#8d6e63'];
  const ONION_PREV = '#ff6b4a', ONION_NEXT = '#2ec4b6';
  const TEMPLATES = [
    { label: 'Classic', note: '960 × 540 · recommended', w: 960, h: 540 },
    { label: 'Widescreen', note: '1280 × 720 · HD video', w: 1280, h: 720 },
    { label: 'Square', note: '800 × 800 · social posts', w: 800, h: 800 },
    { label: 'Vertical', note: '540 × 960 · stories', w: 540, h: 960 },
  ];

  const state = {
    project: null,
    frame: 0,
    layer: 0,
    tool: 'brush',
    color: '#16141f',
    size: 8,
    opacity: 1,
    onion: true,
    onionDepth: 1,
    loop: true,
    playing: false,
    stroke: null,
    drag: null,
    zoom: 1,
    motion: null,
  };

  const view = $('view');
  const vctx = view.getContext('2d');
  let strokeCanvas = null, previewCanvas = null, tintCanvas = null;

  /* ================= helpers ================= */
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* optional */ } },
  };
  function showView(id) {
    for (const v of ['home', 'gallery', 'studio']) $(v).hidden = v !== id;
    document.body.dataset.view = id;
  }

  /* ================= routing ================= */
  async function route() {
    const hash = location.hash || '#/';
    const studioMatch = hash.match(/^#\/studio\/([\w-]+)/);
    if (state.project && !(studioMatch && studioMatch[1] === state.project.id)) await leaveStudio();
    if (hash === '#/new') return newProject(TEMPLATES[0]);
    if (hash === '#/sample') return openSample();
    if (hash === '#/projects') return showGallery();
    if (studioMatch) {
      if (state.project && state.project.id === studioMatch[1]) return;
      return openProject(studioMatch[1]);
    }
    if (hash.startsWith('#/') || hash === '') return showHome();
    // in-page anchors on the landing page (#features, #how)
    if ($('home').hidden) showHome();
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  /* ================= landing ================= */
  let hero = null;
  function showHome() {
    showView('home');
    document.title = 'Loomframe · Hand-drawn animation in your browser';
    startHero();
  }
  function startHero() {
    if (!hero) {
      const p = sample.build();
      const strip = $('heroStrip');
      const thumbs = [];
      for (let f = 0; f < p.frameCount; f++) {
        const c = makeCanvas(96, 54);
        const full = makeCanvas(p.width, p.height);
        p.renderFrame(full.getContext('2d'), f);
        c.getContext('2d').drawImage(full, 0, 0, 96, 54);
        strip.appendChild(c);
        thumbs.push(c);
      }
      hero = { p, thumbs, frame: 0, last: 0, raf: 0 };
    }
    cancelAnimationFrame(hero.raf);
    const ctx = $('heroCanvas').getContext('2d');
    const tick = (now) => {
      if ($('home').hidden) return;
      if (now - hero.last >= 1000 / hero.p.fps) {
        hero.last = now;
        hero.p.renderFrame(ctx, hero.frame);
        hero.thumbs.forEach((t, i) => t.classList.toggle('on', i === hero.frame));
        hero.frame = (hero.frame + 1) % hero.p.frameCount;
      }
      hero.raf = requestAnimationFrame(tick);
    };
    hero.raf = requestAnimationFrame(tick);
  }

  /* ================= projects ================= */
  async function showGallery() {
    showView('gallery');
    document.title = 'Projects · Loomframe';
    const tpl = $('templates');
    if (!tpl.children.length) {
      for (const t of TEMPLATES) {
        const b = document.createElement('button');
        b.className = 'template';
        const ratio = t.w / t.h;
        b.innerHTML = `<span class="frame-box"><span class="shape" style="width:${ratio >= 1 ? 64 : 64 * ratio}px;height:${ratio >= 1 ? 64 / ratio : 64}px"></span></span><b></b><small></small>`;
        b.querySelector('b').textContent = t.label;
        b.querySelector('small').textContent = t.note;
        b.addEventListener('click', () => newProject(t));
        tpl.appendChild(b);
      }
      const s = document.createElement('button');
      s.className = 'template sample';
      s.innerHTML = '<span class="frame-box"><span class="shape demo"></span></span><b>Sample scene</b><small>See a finished animation</small>';
      s.addEventListener('click', () => go('#/sample'));
      tpl.appendChild(s);
    }
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
        <button class="del" title="Delete project" aria-label="Delete project"><svg><use href="#i-trash"/></svg></button>`;
      if (m.thumb) card.querySelector('.thumb').style.backgroundImage = `url(${m.thumb})`;
      card.querySelector('b').textContent = m.name;
      card.querySelector('span').textContent =
        `${m.frames} frame${m.frames === 1 ? '' : 's'} · ${m.width}×${m.height} · ${new Date(m.updatedAt).toLocaleDateString()}`;
      card.addEventListener('click', () => go('#/studio/' + m.id));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') go('#/studio/' + m.id); });
      card.querySelector('.del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete “${m.name}”? This cannot be undone.`)) return;
        await api.remove(m.id);
        showGallery();
      });
      shelf.appendChild(card);
    }
  }

  async function newProject(t) {
    const p = Project.create({ width: t.w, height: t.h, name: 'Untitled animation' });
    await api.save(p.serialize());
    history.replaceState(null, '', '#/studio/' + p.id);
    enterStudio(p);
  }

  async function openSample() {
    const p = sample.build();
    p.id = LF.uid();
    await api.save(p.serialize());
    history.replaceState(null, '', '#/studio/' + p.id);
    enterStudio(p);
    toast('This is the sample scene. Press Space to play it.');
  }

  async function openProject(id) {
    const data = await api.get(id);
    if (!data) { toast('That project could not be found.'); return go('#/projects'); }
    enterStudio(await Project.deserialize(data));
  }

  async function importProject(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data.layers || !data.frameCount) throw new Error('bad file');
      data.id = LF.uid();
      const p = await Project.deserialize(data);
      await api.save(p.serialize());
      toast('Project imported.');
      history.replaceState(null, '', '#/studio/' + p.id);
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
    state.zoom = 1;
    view.width = p.width; view.height = p.height;
    strokeCanvas = makeCanvas(p.width, p.height);
    previewCanvas = makeCanvas(p.width, p.height);
    tintCanvas = makeCanvas(p.width, p.height);
    closeMotion();
    $('projName').value = p.name;
    $('fpsInput').value = p.fps;
    $('bgInput').value = p.bg.toLowerCase();
    showView('studio');
    document.title = p.name + ' · Loomframe';
    setSaveState('Saved');
    buildTimeline();
    fitStage();
    render();
    if (!store.get('loomframe:coach')) $('coach').hidden = false;
  }

  async function leaveStudio() {
    stopPlayback();
    closeMotion();
    if (state.project) await saveNow();
    state.project = null;
  }

  /* ================= zoom & pan ================= */
  function fitScale() {
    const p = state.project, stage = $('stage');
    return Math.min((stage.clientWidth - 40) / p.width, (stage.clientHeight - 40) / p.height);
  }
  function fitStage(keepCenter) {
    const p = state.project;
    if (!p) return;
    const stage = $('stage');
    const cx = (stage.scrollLeft + stage.clientWidth / 2) / Math.max(1, stage.scrollWidth);
    const cy = (stage.scrollTop + stage.clientHeight / 2) / Math.max(1, stage.scrollHeight);
    const scale = Math.max(0.05, fitScale() * state.zoom);
    view.style.width = Math.max(40, Math.round(p.width * scale)) + 'px';
    view.style.height = Math.max(40, Math.round(p.height * scale)) + 'px';
    if (keepCenter) {
      stage.scrollLeft = cx * stage.scrollWidth - stage.clientWidth / 2;
      stage.scrollTop = cy * stage.scrollHeight - stage.clientHeight / 2;
    }
    $('zoomLabel').textContent = Math.round(scale * 100) + '%';
  }
  function setZoom(z) {
    state.zoom = Math.max(0.25, Math.min(8, z));
    fitStage(true);
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
      for (let d = state.onionDepth; d >= 1; d--) {
        const a = 0.32 / d;
        if (f - d >= 0) drawTinted(f - d, ONION_PREV, a);
        if (f + d < p.frameCount) drawTinted(f + d, ONION_NEXT, a * 0.75);
      }
    }
    p.layers.forEach((l, i) => {
      if (!l.visible) return;
      const c = l.cels[f];
      if (i === state.layer && state.stroke) {
        const pctx = previewCanvas.getContext('2d');
        pctx.clearRect(0, 0, p.width, p.height);
        if (c) pctx.drawImage(c, 0, 0);
        applyStroke(pctx);
        vctx.drawImage(previewCanvas, 0, 0);
      } else if (c) {
        vctx.drawImage(c, 0, 0);
      }
    });
    if (state.motion && !state.playing) drawMotionPreview();
    $('frameLabel').textContent = `${f + 1} / ${p.frameCount}`;
  }

  function applyStroke(ctx) {
    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.globalCompositeOperation = state.stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.restore();
  }

  /* ================= drawing input ================= */
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
    const after = edit.c.getContext('2d').getImageData(0, 0, p.width, p.height);
    const { c, before } = edit;
    const layerId = activeLayer().id;
    const apply = (img) => {
      c.getContext('2d').putImageData(img, 0, 0);
      touch(c);
      const li = p.layerIndex(layerId);
      if (li >= 0) updateCelThumb(li, p.layers[li].cels.indexOf(c));
      if (state.motion) state.motion.bounds = null;
      changed();
    };
    p.push({ undo: () => apply(before), redo: () => apply(after) });
    touch(c);
    if (state.motion) state.motion.bounds = null;
    updateCelThumb(state.layer, state.frame);
    changed();
  }

  // Two-finger pinch zoom on touch screens.
  const touches = new Map();
  let pinch = null;

  function onPointerDown(e) {
    if (!state.project || state.playing) return;
    $('coach').hidden = true;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        cancelStroke();
        const [a, b] = [...touches.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom };
        return;
      }
    }
    if (e.button === 1 || state.tool === 'hand') { startPan(e); return; }
    if (e.button !== undefined && e.button > 0) return;
    const pt = toCanvas(e);
    if (state.motion) { setMotionTarget(pt); view.setPointerCapture(e.pointerId); state.drag = { kind: 'motion', id: e.pointerId }; return; }
    const layer = activeLayer();
    if (!layer.visible) { toast('This layer is hidden. Show it to draw on it.'); return; }
    if (state.tool === 'picker') { pickColor(pt); return; }
    if (state.tool === 'fill') { floodFill(pt); return; }
    view.setPointerCapture(e.pointerId);
    if (state.tool === 'move') {
      const edit = beginPixelEdit();
      const src = makeCanvas(view.width, view.height);
      src.getContext('2d').drawImage(edit.c, 0, 0);
      state.drag = { kind: 'move', id: e.pointerId, edit, src, x0: pt.x, y0: pt.y };
      return;
    }
    strokeCanvas.getContext('2d').clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
    state.stroke = { tool: state.tool, pts: [pt], id: e.pointerId };
    dab(pt);
    requestRender();
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        setZoom(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d));
        return;
      }
    }
    moveCursor(e);
    const d = state.drag;
    if (d && e.pointerId === d.id) {
      if (d.kind === 'pan') {
        const stage = $('stage');
        stage.scrollLeft = d.sl - (e.clientX - d.x);
        stage.scrollTop = d.st - (e.clientY - d.y);
      } else if (d.kind === 'move') {
        const pt = toCanvas(e);
        const ctx = d.edit.c.getContext('2d');
        ctx.clearRect(0, 0, view.width, view.height);
        ctx.drawImage(d.src, Math.round(pt.x - d.x0), Math.round(pt.y - d.y0));
        requestRender();
      } else if (d.kind === 'motion') {
        setMotionTarget(toCanvas(e));
      }
      return;
    }
    const s = state.stroke;
    if (!s || e.pointerId !== s.id) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of (events.length ? events : [e])) segment(toCanvas(ev));
    requestRender();
  }

  function onPointerUp(e) {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    const d = state.drag;
    if (d && e.pointerId === d.id) {
      state.drag = null;
      if (d.kind === 'move') { commitPixelEdit(d.edit); render(); }
      return;
    }
    const s = state.stroke;
    if (!s || e.pointerId !== s.id) return;
    finishStroke();
    const edit = beginPixelEdit();
    applyStroke(edit.c.getContext('2d'));
    state.stroke = null;
    commitPixelEdit(edit);
    render();
  }

  function cancelStroke() {
    if (state.stroke) { state.stroke = null; requestRender(); }
    if (state.drag && state.drag.kind === 'move') {
      state.drag.edit.c.getContext('2d').putImageData(state.drag.edit.before, 0, 0);
      state.drag = null;
      requestRender();
    }
  }

  function startPan(e) {
    const stage = $('stage');
    view.setPointerCapture(e.pointerId);
    state.drag = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop };
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

  const TOOL_CURSORS = { fill: 'crosshair', picker: 'crosshair', move: 'move', hand: 'grab' };
  function moveCursor(e) {
    const cur = $('cursor');
    const showRing = !state.motion && (state.tool === 'brush' || state.tool === 'eraser') && e.pointerType !== 'touch';
    if (!state.project || !showRing) {
      cur.hidden = true;
      view.style.cursor = state.motion ? 'crosshair' : (TOOL_CURSORS[state.tool] || 'crosshair');
      return;
    }
    view.style.cursor = 'none';
    const r = view.getBoundingClientRect();
    const wr = $('stageWrap').getBoundingClientRect();
    const d = Math.max(4, state.size * (r.width / view.width));
    cur.hidden = false;
    cur.style.width = cur.style.height = d + 'px';
    cur.style.left = e.clientX - wr.left + 'px';
    cur.style.top = e.clientY - wr.top + 'px';
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

  /* ================= motion (auto in-betweens) ================= */
  const EASE = {
    linear: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    bounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  function contentBounds(c) {
    if (!c) return null;
    const { width: w, height: h } = c;
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function motionOpts() {
    const num = (id, def) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : def; };
    return {
      frames: Math.max(2, Math.min(60, Math.round(num('mFrames', 8)))),
      dx: num('mX', 0), dy: num('mY', 0),
      scale: Math.max(0.05, num('mScale', 100) / 100),
      rot: num('mRot', 0),
      fade: Math.max(0, Math.min(1, num('mFade', 100) / 100)),
      ease: EASE[$('mEase').value] || EASE.inout,
      hold: $('mHold').checked,
    };
  }

  function motionSource() {
    const m = state.motion;
    const c = state.project.layers[state.layer].cels[state.frame];
    const key = state.layer + ':' + state.frame;
    if (!m.bounds || m.key !== key) { m.key = key; m.bounds = contentBounds(c); }
    return m.bounds ? { c, b: m.bounds } : null;
  }

  function drawTransformed(ctx, src, b, o, t) {
    const e = o.ease(t);
    ctx.save();
    ctx.globalAlpha *= 1 + (o.fade - 1) * e;
    ctx.translate(b.cx + o.dx * e, b.cy + o.dy * e);
    ctx.rotate((o.rot * e * Math.PI) / 180);
    const s = 1 + (o.scale - 1) * e;
    ctx.scale(s, s);
    ctx.drawImage(src, -b.cx, -b.cy);
    ctx.restore();
  }

  function drawMotionPreview() {
    const s = motionSource();
    if (!s) return;
    const o = motionOpts();
    const steps = Math.min(o.frames, 6);
    for (let k = 1; k <= steps; k++) {
      vctx.globalAlpha = k === steps ? 0.55 : 0.14;
      drawTransformed(vctx, s.c, s.b, o, k / steps);
    }
    vctx.globalAlpha = 1;
    // path
    vctx.save();
    vctx.strokeStyle = '#9b7bff';
    vctx.lineWidth = Math.max(2, view.width / 400);
    vctx.setLineDash([10, 8]);
    vctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const e = o.ease(k / 24);
      const x = s.b.cx + o.dx * e, y = s.b.cy + o.dy * e;
      k ? vctx.lineTo(x, y) : vctx.moveTo(x, y);
    }
    vctx.stroke();
    vctx.setLineDash([]);
    vctx.fillStyle = '#9b7bff';
    vctx.beginPath(); vctx.arc(s.b.cx + o.dx, s.b.cy + o.dy, Math.max(6, view.width / 120), 0, Math.PI * 2); vctx.fill();
    vctx.restore();
  }

  function setMotionTarget(pt) {
    const s = motionSource();
    if (!s) return;
    $('mX').value = Math.round(pt.x - s.b.cx);
    $('mY').value = Math.round(pt.y - s.b.cy);
    requestRender();
  }

  function openMotion() {
    if (!state.project) return;
    stopPlayback();
    state.motion = { bounds: null, key: '' };
    if (!motionSource()) {
      state.motion = null;
      toast('Draw something on the selected layer first, then use Motion to animate it.');
      return;
    }
    $('motionPanel').hidden = false;
    $('motionBtn').classList.add('on');
    $('cursor').hidden = true;
    render();
  }
  function closeMotion() {
    state.motion = null;
    $('motionPanel').hidden = true;
    $('motionBtn').classList.remove('on');
    if (state.project) render();
  }

  function applyMotion() {
    const s = motionSource();
    if (!s) return;
    const o = motionOpts();
    const p = state.project, f = state.frame, li = state.layer;
    const src = makeCanvas(p.width, p.height);
    src.getContext('2d').drawImage(s.c, 0, 0);
    const b = s.b;
    structural(() => {
      for (let k = 1; k <= o.frames; k++) {
        p.insertFrame(f + k, o.hold ? f : undefined);
        const c = makeCanvas(p.width, p.height);
        drawTransformed(c.getContext('2d'), src, b, o, k / o.frames);
        p.layers[li].cels[f + k] = c;
      }
      state.frame = f;
    }, () => {
      for (let k = 0; k < o.frames; k++) p.removeFrame(f + 1);
      state.frame = f;
    });
    closeMotion();
    toast(`Added ${o.frames} frames of motion. Press Space to play.`);
  }

  /* ================= timeline ================= */
  const THUMB_W = 72;
  function thumbH() { return Math.round(THUMB_W * state.project.height / state.project.width); }

  function buildTimeline() {
    const p = state.project;
    const tracks = $('tracks');
    tracks.innerHTML = '';
    tracks.style.gridTemplateColumns = `150px repeat(${p.frameCount}, ${THUMB_W}px)`;
    const corner = document.createElement('div');
    corner.className = 'corner';
    corner.textContent = 'Layers';
    tracks.appendChild(corner);
    for (let f = 0; f < p.frameCount; f++) {
      const n = document.createElement('button');
      n.className = 'frame-num' + (f === state.frame ? ' current' : '');
      n.textContent = f + 1;
      n.dataset.frame = f;
      n.addEventListener('click', () => { stopPlayback(); goTo(f); });
      tracks.appendChild(n);
    }
    // layers, top layer first
    for (let li = p.layers.length - 1; li >= 0; li--) {
      const l = p.layers[li];
      const head = document.createElement('div');
      head.className = 'track-head' + (li === state.layer ? ' active' : '');
      head.innerHTML = `<button class="eye${l.visible ? '' : ' off'}" title="${l.visible ? 'Hide' : 'Show'} layer" aria-label="${l.visible ? 'Hide' : 'Show'} layer"><svg><use href="#i-${l.visible ? 'eye' : 'eye-off'}"/></svg></button><span class="lname"></span>`;
      head.querySelector('.lname').textContent = l.name;
      head.title = 'Click to select, double-click to rename';
      head.addEventListener('click', (e) => {
        if (e.target.closest('.eye')) {
          l.visible = !l.visible; changed(); buildTimeline(); render(); return;
        }
        state.layer = li; buildTimeline(); render();
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
        cel.addEventListener('click', () => { stopPlayback(); state.layer = li; goTo(f); });
        tracks.appendChild(cel);
        drawThumb(tc, l.cels[f]);
      }
    }
    updateButtons();
    scrollToCurrent();
  }

  function scrollToCurrent() {
    const cur = $('tracks').querySelector('.frame-num.current');
    if (!cur) return;
    const wrap = document.querySelector('.tracks-wrap');
    const left = cur.offsetLeft - 150, right = cur.offsetLeft + cur.offsetWidth;
    if (left < wrap.scrollLeft) wrap.scrollLeft = left;
    else if (right > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = right - wrap.clientWidth;
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
    scrollToCurrent();
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
    if (p.layers.length <= 1) { toast('An animation needs at least one layer.'); return; }
    const at = state.layer;
    const layer = p.layers[at];
    structural(
      () => { p.layers.splice(at, 1); state.layer = Math.max(0, at - 1); },
      () => { p.layers.splice(at, 0, layer); state.layer = at; });
  }

  function moveLayer(dir) {
    const p = state.project, a = state.layer, b = a + dir;
    if (b < 0 || b >= p.layers.length) return;
    const swap = () => { const t = p.layers[a]; p.layers[a] = p.layers[b]; p.layers[b] = t; };
    structural(() => { swap(); state.layer = b; }, () => { swap(); state.layer = a; });
  }

  function updateButtons() {
    const p = state.project;
    if (!p) return;
    $('undoBtn').disabled = !p.undoStack.length;
    $('redoBtn').disabled = !p.redoStack.length;
    $('moveLeftBtn').disabled = state.frame === 0;
    $('moveRightBtn').disabled = state.frame === p.frameCount - 1;
    $('layerUpBtn').disabled = state.layer === p.layers.length - 1;
    $('layerDownBtn').disabled = state.layer === 0;
  }

  /* ================= playback ================= */
  let playRaf = 0, lastTick = 0, acc = 0;
  function togglePlay() { state.playing ? stopPlayback() : startPlayback(); }
  function startPlayback() {
    if (!state.project || state.project.frameCount < 2) { toast('Add a second frame to play your animation.'); return; }
    closeMotion();
    cancelStroke();
    if (!state.loop && state.frame === state.project.frameCount - 1) state.frame = 0;
    state.playing = true;
    $('playIcon').setAttribute('href', '#i-pause'); $('playBtn').classList.add('playing');
    lastTick = performance.now(); acc = 0;
    const tick = (now) => {
      if (!state.playing) return;
      acc += now - lastTick; lastTick = now;
      const step = 1000 / state.project.fps;
      if (acc >= step) {
        acc %= step;
        if (!state.loop && state.frame === state.project.frameCount - 1) { stopPlayback(); return; }
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
    $('playIcon').setAttribute('href', '#i-play'); $('playBtn').classList.remove('playing');
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
      if (state.project === p) setSaveState('All changes saved');
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
  const safeName = () => (state.project.name || 'animation').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'animation';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function exportVideo(p) {
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = window.MediaRecorder && types.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) { toast('Video export is not supported in this browser. Try GIF instead.'); return; }
    const scale = Math.min(1, 1280 / Math.max(p.width, p.height));
    const w = Math.round(p.width * scale / 2) * 2, h = Math.round(p.height * scale / 2) * 2;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const full = makeCanvas(p.width, p.height);
    const draw = (f) => { p.renderFrame(full.getContext('2d'), f); ctx.drawImage(full, 0, 0, w, h); };
    draw(0);
    const stream = c.captureStream(p.fps);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5e6 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((r) => { rec.onstop = r; });
    const loops = Math.max(1, Math.ceil(3 / (p.frameCount / p.fps))); // at least ~3 seconds
    toast('Recording your video…');
    rec.start();
    const step = 1000 / p.fps, t0 = performance.now();
    for (let i = 0; i < loops * p.frameCount; i++) {
      draw(i % p.frameCount);
      await wait(Math.max(0, t0 + (i + 1) * step - performance.now()));
    }
    rec.stop();
    await done;
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: mime.split(';')[0] }), `${safeName()}.${ext}`);
    toast(`Video saved as .${ext}.`);
  }

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
      download(new Blob([JSON.stringify(p.serialize())], { type: 'application/json' }), `${safeName()}.loomframe.json`);
      toast('Project file saved.');
    } else if (kind === 'video') {
      await exportVideo(p);
    } else if (kind === 'gif') {
      toast('Creating your GIF…');
      await wait(30);
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
      toast('Your GIF is ready.');
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
  function toggleOnion() {
    state.onion = !state.onion;
    $('onionBtn').classList.toggle('on', state.onion);
    render();
  }
  function toggleLoop() {
    state.loop = !state.loop;
    $('loopBtn').classList.toggle('on', state.loop);
  }
  function openHelp() { $('helpModal').hidden = false; $('helpModal').querySelector('[data-close]').focus(); }
  function closeHelp() { $('helpModal').hidden = true; }

  function undo() { if (state.project && state.project.undo()) { render(); updateButtons(); } }
  function redo() { if (state.project && state.project.redo()) { render(); updateButtons(); } }

  /* ================= wiring ================= */
  function wire() {
    window.addEventListener('hashchange', route);
    $('importInput').addEventListener('change', (e) => { if (e.target.files[0]) importProject(e.target.files[0]); e.target.value = ''; });
    $('projName').addEventListener('input', (e) => {
      state.project.name = e.target.value || 'Untitled animation';
      document.title = state.project.name + ' · Loomframe';
      changed();
    });

    view.addEventListener('pointerdown', onPointerDown);
    view.addEventListener('pointermove', onPointerMove);
    view.addEventListener('pointerup', onPointerUp);
    view.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = null; onPointerUp(e); });
    view.addEventListener('pointerleave', () => { $('cursor').hidden = true; });
    view.addEventListener('contextmenu', (e) => e.preventDefault());
    $('stage').addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(state.zoom * Math.exp(-e.deltaY * 0.01));
    }, { passive: false });

    document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('colorInput').addEventListener('input', (e) => setColor(e.target.value));
    const sw = $('swatches');
    for (const c of SWATCHES) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = c; b.dataset.color = c; b.title = c;
      b.setAttribute('aria-label', 'Colour ' + c);
      b.addEventListener('click', () => { setColor(c); if (state.tool !== 'fill') setTool('brush'); });
      sw.appendChild(b);
    }
    $('sizeInput').addEventListener('input', (e) => setSize(+e.target.value));
    $('opInput').addEventListener('input', (e) => { state.opacity = e.target.value / 100; $('opVal').textContent = e.target.value + '%'; });
    $('bgInput').addEventListener('input', (e) => { state.project.bg = e.target.value; render(); buildTimeline(); changed(); });
    $('onionRange').addEventListener('input', (e) => { state.onionDepth = +e.target.value; render(); });

    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('helpBtn').addEventListener('click', openHelp);
    $('helpBtn2').addEventListener('click', openHelp);
    $('helpModal').addEventListener('click', (e) => { if (e.target === $('helpModal') || e.target.closest('[data-close]')) closeHelp(); });
    $('coachClose').addEventListener('click', () => { $('coach').hidden = true; store.set('loomframe:coach', '1'); });

    $('prevBtn').addEventListener('click', () => { stopPlayback(); goTo(state.frame - 1); });
    $('nextBtn').addEventListener('click', () => { stopPlayback(); goTo(state.frame + 1); });
    $('playBtn').addEventListener('click', togglePlay);
    $('fpsInput').addEventListener('change', (e) => {
      const v = Math.max(1, Math.min(30, Math.round(+e.target.value) || 12));
      e.target.value = v; state.project.fps = v; changed();
    });
    $('onionBtn').addEventListener('click', toggleOnion);
    $('loopBtn').addEventListener('click', toggleLoop);
    $('addFrameBtn').addEventListener('click', () => { stopPlayback(); addFrame(false); });
    $('dupFrameBtn').addEventListener('click', () => { stopPlayback(); addFrame(true); });
    $('delFrameBtn').addEventListener('click', () => { stopPlayback(); deleteFrame(); });
    $('moveLeftBtn').addEventListener('click', () => moveFrame(-1));
    $('moveRightBtn').addEventListener('click', () => moveFrame(1));
    $('addLayerBtn').addEventListener('click', addLayer);
    $('delLayerBtn').addEventListener('click', deleteLayer);
    $('layerUpBtn').addEventListener('click', () => moveLayer(1));
    $('layerDownBtn').addEventListener('click', () => moveLayer(-1));

    $('motionBtn').addEventListener('click', () => (state.motion ? closeMotion() : openMotion()));
    $('motionClose').addEventListener('click', closeMotion);
    $('motionApply').addEventListener('click', applyMotion);
    $('motionPanel').addEventListener('input', () => requestRender());

    $('zoomIn').addEventListener('click', () => setZoom(state.zoom * 1.25));
    $('zoomOut').addEventListener('click', () => setZoom(state.zoom / 1.25));
    $('zoomLabel').addEventListener('click', () => { state.zoom = 1; fitStage(); });

    $('exportBtn').addEventListener('click', (e) => { e.stopPropagation(); $('exportMenu').hidden = !$('exportMenu').hidden; });
    $('exportMenu').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-export]');
      if (!btn) return;
      $('exportMenu').hidden = true;
      exportAs(btn.dataset.export);
    });
    document.addEventListener('click', () => { $('exportMenu').hidden = true; });

    window.addEventListener('resize', () => fitStage());
    if ('ResizeObserver' in window) new ResizeObserver(() => fitStage()).observe($('stage'));
    window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    window.addEventListener('error', (e) => { console.error(e.error || e.message); toast('Something went wrong. Your last save is safe.'); });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    document.addEventListener('keydown', onKey);
    setColor(state.color);
    setSize(state.size);
  }

  function onKey(e) {
    if (!$('helpModal').hidden) { if (e.key === 'Escape') closeHelp(); return; }
    if (!state.project || $('studio').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if ((tag === 'input' && !['range', 'color', 'checkbox'].includes(e.target.type)) || tag === 'select' || tag === 'textarea') return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('All changes saved.'); return; }
    if (mod) return;
    switch (e.key) {
      case 'b': case 'B': setTool('brush'); break;
      case 'e': case 'E': setTool('eraser'); break;
      case 'g': case 'G': setTool('fill'); break;
      case 'i': case 'I': setTool('picker'); break;
      case 'v': case 'V': setTool('move'); break;
      case 'h': case 'H': setTool('hand'); break;
      case 'o': case 'O': toggleOnion(); break;
      case 'l': case 'L': toggleLoop(); break;
      case 'm': case 'M': state.motion ? closeMotion() : openMotion(); break;
      case 'n': case 'N': stopPlayback(); addFrame(false); break;
      case 'd': case 'D': stopPlayback(); addFrame(true); break;
      case 'Delete': case 'Backspace': stopPlayback(); deleteFrame(); break;
      case '[': setSize(state.size - (state.size > 10 ? 4 : 1)); break;
      case ']': setSize(state.size + (state.size >= 10 ? 4 : 1)); break;
      case '+': case '=': setZoom(state.zoom * 1.25); break;
      case '-': case '_': setZoom(state.zoom / 1.25); break;
      case '0': state.zoom = 1; fitStage(); break;
      case '?': openHelp(); break;
      case 'Escape': if (state.motion) closeMotion(); break;
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': case ',': e.preventDefault(); stopPlayback(); goTo(state.frame - 1); break;
      case 'ArrowRight': case '.': e.preventDefault(); stopPlayback(); goTo(state.frame + 1); break;
      default: return;
    }
  }

  wire();
  route();
  window.LF.state = state; // handy for debugging in the console
})();
