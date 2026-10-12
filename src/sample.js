/* Procedurally drawn sample scene ("Bounce"), used for the landing hero and "Open the sample scene".
 * Everything is drawn with plain canvas calls so it looks hand-inked and ships with no image assets. */
(function () {
  const { Project, makeCanvas } = window.LF;
  const INK = '#16141f', EMBER = '#ff6b4a', MARIGOLD = '#ffb627', LAGOON = '#2ec4b6', PAPER = '#f7f2e8', PLUM = '#9b7bff';
  const W = 960, H = 540, FRAMES = 16, GROUND = 430;

  // Deterministic wobble so lines feel hand-drawn but identical every time.
  function noise(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function wobblyPath(ctx, pts, seed, amp) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = (noise(seed + i * 2) - 0.5) * amp, jy = (noise(seed + i * 2 + 1) - 0.5) * amp;
      if (i === 0) ctx.moveTo(x + jx, y + jy); else ctx.lineTo(x + jx, y + jy);
    });
  }
  function ink(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }

  function drawBackground(ctx) {
    // sun
    ctx.fillStyle = MARIGOLD;
    ctx.beginPath(); ctx.arc(790, 120, 54, 0, Math.PI * 2); ctx.fill();
    ink(ctx, 4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r1 = 70, r2 = 92;
      wobblyPath(ctx, [[790 + Math.cos(a) * r1, 120 + Math.sin(a) * r1], [790 + Math.cos(a) * r2, 120 + Math.sin(a) * r2]], 10 + i, 2);
      ctx.stroke();
    }
    // hills
    const hill = (cx, cy, rx, color, seed) => {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const t = Math.PI + (i / 40) * Math.PI; pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * rx * 0.45]); }
      ctx.fillStyle = color;
      wobblyPath(ctx, pts, seed, 2); ctx.closePath(); ctx.fill();
      ink(ctx, 4); wobblyPath(ctx, pts, seed, 2); ctx.stroke();
    };
    hill(220, GROUND, 300, '#bfe9e3', 50);
    hill(640, GROUND, 360, '#a6e1d9', 90);
    // ground
    ctx.fillStyle = '#efe6d4';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ink(ctx, 6);
    wobblyPath(ctx, [[30, GROUND], [330, GROUND + 1], [630, GROUND - 1], [930, GROUND]], 140, 2); ctx.stroke();
    ink(ctx, 3);
    for (let i = 0; i < 7; i++) { const x = 70 + i * 130; wobblyPath(ctx, [[x, GROUND + 40], [x + 40, GROUND + 40]], 160 + i, 2); ctx.stroke(); }
  }

  // One bounce per loop: t in [0,1)
  function pose(t) {
    const h = Math.sin(Math.PI * t);                // 0 on ground, 1 at apex
    const impact = Math.max(0, 1 - Math.min(t, 1 - t) * 10); // near 1 right at contact
    const sx = 1 + 0.32 * impact - 0.1 * h, sy = 1 - 0.32 * impact + 0.14 * h;
    const r = 58;
    return { x: 480, y: GROUND - r * sy - h * 250, rx: r * sx, ry: r * sy, h, impact };
  }

  function drawCharacter(ctx, t) {
    const p = pose(t);
    // shadow
    ctx.fillStyle = 'rgba(22,20,31,0.18)';
    ctx.beginPath(); ctx.ellipse(p.x, GROUND + 8, 70 - 34 * p.h, 10 - 4 * p.h, 0, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = EMBER;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x - p.rx * 0.35, p.y - p.ry * 0.4, p.rx * 0.22, p.ry * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
    ink(ctx, 6);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.stroke();
    // face: eyes squint on impact
    const ey = p.y - p.ry * 0.12, ex = p.rx * 0.32;
    ctx.fillStyle = INK;
    if (p.impact > 0.5) {
      ink(ctx, 5);
      [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(p.x + s * ex - 9, ey); ctx.lineTo(p.x + s * ex + 9, ey); ctx.stroke(); });
    } else {
      [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(p.x + s * ex, ey, 7, 10 + 3 * p.h, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = PAPER;
      [-1, 1].forEach((s) => { ctx.beginPath(); ctx.arc(p.x + s * ex + 2, ey - 4, 2.5, 0, Math.PI * 2); ctx.fill(); });
    }
    // mouth
    ink(ctx, 4);
    ctx.beginPath();
    if (p.h > 0.6) ctx.ellipse(p.x, p.y + p.ry * 0.3, 9, 11, 0, 0, Math.PI * 2);
    else ctx.arc(p.x, p.y + p.ry * 0.18, 14, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  function drawEffects(ctx, t, f) {
    const p = pose(t);
    // dust puffs right after impact
    if (f <= 2) {
      const k = (f + 1) / 3;
      ctx.fillStyle = PAPER; ink(ctx, 3.5);
      [-1, 1].forEach((s) => {
        for (let i = 0; i < 3; i++) {
          const x = p.x + s * (70 + i * 34 + k * 40), y = GROUND - 10 - i * 8 - k * 14, r = 14 - i * 3 - k * 4;
          if (r <= 2) continue;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      });
    }
    // speed lines while rising/falling fast
    if (p.h > 0.15 && p.h < 0.85) {
      ink(ctx, 4); ctx.strokeStyle = PLUM;
      const dir = t < 0.5 ? 1 : -1;
      [-26, 0, 26].forEach((dx, i) => {
        const y0 = p.y + dir * (p.ry + 18), y1 = y0 + dir * (34 + i * 6);
        wobblyPath(ctx, [[p.x + dx, y0], [p.x + dx, y1]], 300 + f * 3 + i, 2); ctx.stroke();
      });
    }
    // sparkle at the apex
    if (f === FRAMES / 2) {
      ctx.strokeStyle = LAGOON; ctx.lineWidth = 4;
      [[-90, -40], [92, -30]].forEach(([dx, dy]) => {
        const x = p.x + dx, y = p.y + dy;
        ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
      });
    }
  }

  function build() {
    const p = new Project({ name: 'Bounce (sample)', width: W, height: H, fps: 12, bg: PAPER });
    p.frameCount = FRAMES;
    const bgL = p.addLayer('Background'), chL = p.addLayer('Character'), fxL = p.addLayer('Effects');
    const bg = makeCanvas(W, H); drawBackground(bg.getContext('2d'));
    for (let f = 0; f < FRAMES; f++) {
      const t = f / FRAMES;
      const b = makeCanvas(W, H); b.getContext('2d').drawImage(bg, 0, 0); bgL.cels[f] = b;
      const c = makeCanvas(W, H); drawCharacter(c.getContext('2d'), t); chL.cels[f] = c;
      const fx = makeCanvas(W, H); drawEffects(fx.getContext('2d'), t, f); fxL.cels[f] = fx;
    }
    return p;
  }

  window.LF.sample = { build };
})();
