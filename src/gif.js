/* Minimal GIF89a encoder: adaptive palette built from the animation's own colours (popularity
 * over a 15-bit colour histogram), LZW, looping. */
(function () {
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

  // Adaptive palette: flat cartoon colours map exactly; busy images use the 256 most common colours.
  function adaptive(frames) {
    const count = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
    for (const d of frames) {
      for (let i = 0; i < d.length; i += 4) {
        const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        count[k]++; sr[k] += d[i]; sg[k] += d[i + 1]; sb[k] += d[i + 2];
      }
    }
    const used = [];
    for (let k = 0; k < 32768; k++) if (count[k]) used.push(k);
    used.sort((a, b) => count[b] - count[a]);
    const top = used.slice(0, 256);
    const palette = new Uint8Array(256 * 3);
    top.forEach((k, i) => {
      palette[i * 3] = Math.round(sr[k] / count[k]);
      palette[i * 3 + 1] = Math.round(sg[k] / count[k]);
      palette[i * 3 + 2] = Math.round(sb[k] / count[k]);
    });
    const map = new Int16Array(32768).fill(-1);
    top.forEach((k, i) => { map[k] = i; });
    function nearest(k) {
      const r = sr[k] / count[k], g = sg[k] / count[k], b = sb[k] / count[k];
      let best = 0, bd = Infinity;
      for (let i = 0; i < top.length; i++) {
        const dr = palette[i * 3] - r, dg = palette[i * 3 + 1] - g, db = palette[i * 3 + 2] - b;
        const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (dist < bd) { bd = dist; best = i; }
      }
      return best;
    }
    for (const k of used) if (map[k] < 0) map[k] = nearest(k);
    const index = (d, w, h) => {
      const out = new Uint8Array(w * h);
      for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = map[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)];
      return out;
    };
    return { palette, index };
  }

  function encode(frames, w, h, fps) {
    // frames: array of Uint8ClampedArray RGBA (opaque)
    const out = [];
    const str = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
    const u16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
    const ad = adaptive(frames);
    const palette = ad.palette;
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
      const data = lzw(ad.index(rgba, w, h), 8);
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
