/* Minimal GIF89a encoder: fixed 6x7x6 colour cube, 4x4 ordered dither, LZW, looping. */
(function () {
  const R_LEVELS = 6, G_LEVELS = 7, B_LEVELS = 6;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function buildPalette() {
    const pal = new Uint8Array(256 * 3);
    let i = 0;
    for (let r = 0; r < R_LEVELS; r++)
      for (let g = 0; g < G_LEVELS; g++)
        for (let b = 0; b < B_LEVELS; b++) {
          pal[i++] = Math.round((r * 255) / (R_LEVELS - 1));
          pal[i++] = Math.round((g * 255) / (G_LEVELS - 1));
          pal[i++] = Math.round((b * 255) / (B_LEVELS - 1));
        }
    return pal; // 252 entries used, rest black
  }

  function quantize(rgba, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x, o = p * 4;
        const d = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
        const r = Math.min(R_LEVELS - 1, Math.max(0, Math.round((rgba[o] / 255) * (R_LEVELS - 1) + d)));
        const g = Math.min(G_LEVELS - 1, Math.max(0, Math.round((rgba[o + 1] / 255) * (G_LEVELS - 1) + d)));
        const b = Math.min(B_LEVELS - 1, Math.max(0, Math.round((rgba[o + 2] / 255) * (B_LEVELS - 1) + d)));
        out[p] = (r * G_LEVELS + g) * B_LEVELS + b;
      }
    }
    return out;
  }

  function lzw(indices, minCodeSize) {
    const bytes = [];
    let cur = 0, curBits = 0;
    const clearCode = 1 << minCodeSize, eoi = clearCode + 1;
    let codeSize = minCodeSize + 1, next = eoi + 1;
    let table = new Map();
    function emit(code) {
      cur |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) { bytes.push(cur & 0xff); cur >>>= 8; curBits -= 8; }
    }
    emit(clearCode);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const hit = table.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) {
        emit(clearCode);
        table = new Map();
        codeSize = minCodeSize + 1;
        next = eoi + 1;
      } else {
        if (next >= (1 << codeSize)) codeSize++;
        table.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (curBits > 0) bytes.push(cur & 0xff);
    return bytes;
  }

  function encode(frames, w, h, fps) {
    // frames: array of Uint8ClampedArray RGBA
    const out = [];
    const str = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
    const u16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
    const palette = buildPalette();
    const delay = Math.max(2, Math.round(100 / fps));

    str('GIF89a'); u16(w); u16(h);
    out.push(0xf7, 0, 0); // global colour table, 8 bits, 256 entries
    for (let i = 0; i < palette.length; i++) out.push(palette[i]);
    // NETSCAPE loop forever
    out.push(0x21, 0xff, 0x0b); str('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0);

    for (const rgba of frames) {
      out.push(0x21, 0xf9, 4, 0x04, delay & 0xff, (delay >> 8) & 0xff, 0, 0); // GCE, dispose: leave
      out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0);
      out.push(8);
      const data = lzw(quantize(rgba, w, h), 8);
      for (let i = 0; i < data.length; i += 255) {
        const n = Math.min(255, data.length - i);
        out.push(n);
        for (let j = 0; j < n; j++) out.push(data[i + j]);
      }
      out.push(0);
    }
    out.push(0x3b);
    return new Uint8Array(out);
  }

  window.LF = window.LF || {};
  window.LF.gif = { encode };
})();
