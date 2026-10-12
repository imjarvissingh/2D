/* Loomframe project model: layers x frames of offscreen canvases, plus undo history. */
(function () {
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  class Project {
    constructor(opts) {
      this.id = opts.id || uid();
      this.name = opts.name || 'Untitled loop';
      this.width = opts.width || 960;
      this.height = opts.height || 540;
      this.fps = opts.fps || 12;
      this.bg = opts.bg || '#F7F2E8';
      this.frameCount = 0;
      this.layers = []; // {id, name, visible, cels: [canvas|null]}
      this.undoStack = [];
      this.redoStack = [];
    }

    static create(opts) {
      const p = new Project(opts);
      p.frameCount = 1;
      p.addLayer('Sketch');
      p.addLayer('Ink');
      return p;
    }

    addLayer(name, index) {
      const layer = { id: uid(), name: name || 'Layer ' + (this.layers.length + 1), visible: true,
        cels: new Array(this.frameCount).fill(null) };
      if (index === undefined) this.layers.push(layer); else this.layers.splice(index, 0, layer);
      return layer;
    }

    layerIndex(id) { return this.layers.findIndex((l) => l.id === id); }

    cel(layerIdx, frame, create) {
      const layer = this.layers[layerIdx];
      if (!layer) return null;
      let c = layer.cels[frame];
      if (!c && create) { c = layer.cels[frame] = makeCanvas(this.width, this.height); }
      return c || null;
    }

    insertFrame(at, copyFrom) {
      for (const layer of this.layers) {
        let c = null;
        if (copyFrom !== undefined && layer.cels[copyFrom]) {
          c = makeCanvas(this.width, this.height);
          c.getContext('2d').drawImage(layer.cels[copyFrom], 0, 0);
        }
        layer.cels.splice(at, 0, c);
      }
      this.frameCount++;
    }

    removeFrame(at) {
      const removed = this.layers.map((l) => l.cels.splice(at, 1)[0]);
      this.frameCount--;
      return removed;
    }

    restoreFrame(at, removed) {
      this.layers.forEach((l, i) => l.cels.splice(at, 0, removed[i]));
      this.frameCount++;
    }

    swapFrames(a, b) {
      for (const l of this.layers) { const t = l.cels[a]; l.cels[a] = l.cels[b]; l.cels[b] = t; }
    }

    /* Undo: each entry is {undo(), redo()} */
    push(entry) {
      this.undoStack.push(entry);
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    undo() { const e = this.undoStack.pop(); if (e) { e.undo(); this.redoStack.push(e); } return !!e; }
    redo() { const e = this.redoStack.pop(); if (e) { e.redo(); this.undoStack.push(e); } return !!e; }

    /* Composite one frame (all visible layers) onto ctx */
    renderFrame(ctx, frame, withBg = true) {
      if (withBg) { ctx.fillStyle = this.bg; ctx.fillRect(0, 0, this.width, this.height); }
      else ctx.clearRect(0, 0, this.width, this.height);
      for (const l of this.layers) {
        if (!l.visible) continue;
        const c = l.cels[frame];
        if (c) ctx.drawImage(c, 0, 0);
      }
    }

    thumbnail(frame, w) {
      const h = Math.round((w * this.height) / this.width);
      const full = makeCanvas(this.width, this.height);
      this.renderFrame(full.getContext('2d'), frame);
      const t = makeCanvas(w, h);
      t.getContext('2d').drawImage(full, 0, 0, w, h);
      return t.toDataURL('image/jpeg', 0.7);
    }

    serialize() {
      return {
        id: this.id, name: this.name, width: this.width, height: this.height, fps: this.fps, bg: this.bg,
        frameCount: this.frameCount, version: 1,
        layers: this.layers.map((l) => ({
          id: l.id, name: l.name, visible: l.visible,
          cels: l.cels.map(celUrl),
        })),
        thumb: this.thumbnail(0, 240),
      };
    }

    static async deserialize(data) {
      const p = new Project(data);
      p.frameCount = data.frameCount;
      for (const ld of data.layers) {
        const layer = { id: ld.id || uid(), name: ld.name, visible: ld.visible !== false, cels: [] };
        for (let i = 0; i < data.frameCount; i++) {
          const src = ld.cels[i];
          if (!src) { layer.cels.push(null); continue; }
          const img = await loadImage(src);
          const c = makeCanvas(p.width, p.height);
          c.getContext('2d').drawImage(img, 0, 0);
          layer.cels.push(c);
        }
        p.layers.push(layer);
      }
      return p;
    }
  }

  // Encoded PNGs are cached per canvas; touch(c) invalidates after an edit.
  const urlCache = new WeakMap();
  function touch(c) { if (c) urlCache.delete(c); }
  function celUrl(c) {
    if (!c) return null;
    if (!urlCache.has(c)) urlCache.set(c, isBlank(c) ? null : c.toDataURL('image/png'));
    return urlCache.get(c);
  }

  function isBlank(c) {
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
    return true;
  }

  window.LF = window.LF || {};
  Object.assign(window.LF, { Project, makeCanvas, uid, touch });
})();
