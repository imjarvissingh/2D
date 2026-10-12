/* Loomframe Coach: plans animations and reviews frames.
 * Works offline with a built-in rule-based coach (animation principles + image analysis).
 * If the user adds their own Gemini API key (stored only in this browser), it uses Gemini instead,
 * falling back to the built-in coach on any error. */
(function () {
  const { makeCanvas } = window.LF;
  const KEY = 'loomframe:gemini-key', MODEL = 'loomframe:gemini-model';
  const DEFAULT_MODEL = 'gemini-2.5-flash';
  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

  const ls = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  const settings = {
    key: () => ls.get(KEY).trim(),
    model: () => ls.get(MODEL).trim() || DEFAULT_MODEL,
    save(key, model) { ls.set(KEY, (key || '').trim()); ls.set(MODEL, (model || '').trim() === DEFAULT_MODEL ? '' : (model || '').trim()); },
    clear() { ls.set(KEY, ''); },
  };
  const clampInt = (v, lo, hi, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };

  /* ================= built-in planner ================= */
  const LIBRARY = [
    { match: /bounc|ball|jump|hop|leap/, title: 'Bounce', fps: 12, frames: 12, keys: [
      [1, 'Contact: squashed flat on the ground', 'Widen and flatten the shape, keep the volume the same.'],
      [3, 'Take-off: stretched upward', 'Stretch along the direction of travel; spacing is wide here because it is moving fast.'],
      [6, 'Apex: round, slowest point', 'Draw frames 5–8 close together (slow in, slow out) so it hangs in the air.'],
      [10, 'Falling: stretched downward', 'Spacing widens again as it accelerates toward the ground.'],
      [12, 'Back to contact', 'Match frame 1 so the loop is seamless.'],
    ] },
    { match: /walk|stroll|step/, title: 'Walk cycle', fps: 12, frames: 8, keys: [
      [1, 'Contact: front heel touches, legs widest', 'Arms swing opposite to legs.'],
      [2, 'Down: weight lands, body lowest', 'Bend the front knee; the head dips slightly.'],
      [3, 'Passing: free leg passes the standing leg', 'Body rises back to neutral height.'],
      [4, 'Up: pushing off the toe, body highest', 'Give the head a small lift for bounce.'],
      [5, 'Contact, other leg', 'Mirror frame 1 with the opposite leg forward.'],
      [8, 'Up, other leg', 'Lead back into frame 1 to loop.'],
    ] },
    { match: /run|sprint|dash|race/, title: 'Run cycle', fps: 12, frames: 6, keys: [
      [1, 'Contact: foot strikes under the body', 'Lean the whole body forward.'],
      [2, 'Down: deepest knee bend, absorbs impact', 'Squash the torso a little.'],
      [3, 'Push-off and flight: both feet off the ground', 'Stretch the body; arms pump hard.'],
      [4, 'Contact, other leg', 'Mirror frame 1.'],
      [6, 'Flight, other leg', 'Leads back into frame 1.'],
    ] },
    { match: /wave|hello|hi\b|greet|bye/, title: 'Wave', fps: 12, frames: 10, keys: [
      [1, 'Rest: arm down, relaxed', 'Start still so the motion reads.'],
      [2, 'Anticipation: shoulder dips slightly', 'A small opposite move before the action makes it feel alive.'],
      [4, 'Arm up, hand tilted left', 'Lead with the elbow; the hand drags behind (overlapping action).'],
      [6, 'Hand tilted right', 'Arc the hand, do not slide it in a straight line.'],
      [8, 'Hand tilted left again', 'Repeat the swing; slightly smaller is more natural.'],
      [10, 'Settle back to rest', 'Ease out: frames get closer as the arm stops.'],
    ] },
    { match: /blink|eye|wink/, title: 'Blink', fps: 12, frames: 6, keys: [
      [1, 'Eyes open', 'Hold this frame for a beat in the timeline (duplicate it) so blinks feel natural.'],
      [2, 'Lids half closed', 'Upper lid moves more than the lower.'],
      [3, 'Closed: a single curved line', 'Squash the brows down slightly.'],
      [4, 'Half open', 'Opening is a little slower than closing.'],
      [6, 'Open', 'Match frame 1.'],
    ] },
    { match: /fall|drop|trip|tumble/, title: 'Fall', fps: 12, frames: 12, keys: [
      [1, 'Balanced, unaware', 'Give the audience a clear starting pose.'],
      [3, 'Loss of balance: body tilts, arms fly up', 'Exaggerate the reaction; it reads better.'],
      [6, 'Falling: stretched, accelerating', 'Increase spacing each frame (ease in).'],
      [9, 'Impact: squash on the ground', 'One squashed frame sells the weight.'],
      [12, 'Settle: small rebound then rest', 'Follow-through on loose parts like hair or arms.'],
    ] },
    { match: /spin|turn|rotate|twirl/, title: 'Turn', fps: 12, frames: 8, keys: [
      [1, 'Front view', 'Draw a centre line to keep features aligned.'],
      [3, 'Three-quarter view', 'Features slide toward the side on a curve.'],
      [5, 'Profile', 'Halfway: only one eye is visible.'],
      [7, 'Three-quarter back', 'Hair and clothes lag behind the turn.'],
      [8, 'Back to front, or hold', 'Tip: try Motion → Rotate for simple objects.'],
    ] },
    { match: /grow|pop|appear|spawn|logo|reveal/, title: 'Pop in', fps: 12, frames: 8, keys: [
      [1, 'Tiny dot or nothing', 'Start small for contrast.'],
      [3, 'Overshoot: bigger than final size', 'Tip: Motion with Scale and Overshoot easing does this automatically.'],
      [5, 'Squash back slightly smaller', 'A wobble makes it feel elastic.'],
      [8, 'Final size, settled', 'Hold here before anything else moves.'],
    ] },
    { match: /fly|bird|wing|flap|butterfl/, title: 'Wing flap', fps: 12, frames: 6, keys: [
      [1, 'Wings fully up', 'Body sits slightly lower on the upstroke.'],
      [2, 'Downstroke: wings bending, tips lag', 'The tips trail behind (drag).'],
      [4, 'Wings fully down', 'Body lifts on the downstroke.'],
      [5, 'Upstroke: wings fold in', 'Faster than the downstroke.'],
      [6, 'Leads into frame 1', 'Keep the loop smooth.'],
    ] },
  ];
  const GENERIC = { title: 'Action', fps: 12, frames: 12, keys: [
    [1, 'Starting pose', 'Make the silhouette clear and readable.'],
    [3, 'Anticipation: a small move the opposite way', 'Prepares the audience for the action.'],
    [6, 'Main action', 'Use wide spacing for speed and stretch for energy.'],
    [9, 'Follow-through', 'Loose parts keep moving after the main body stops.'],
    [12, 'Settle into the final pose', 'Ease out: frames get closer together as motion stops.'],
  ] };

  function offlinePlan(prompt) {
    const text = (prompt || '').toLowerCase();
    const t = LIBRARY.find((x) => x.match.test(text)) || GENERIC;
    const title = prompt ? `${t.title}: ${prompt.trim().slice(0, 60)}` : t.title;
    return { title, fps: t.fps, frames: t.frames, keyframes: t.keys.map(([frame, pose, tip]) => ({ frame, pose, tip })), source: 'built-in' };
  }

  /* ================= built-in critic ================= */
  function snapshot(project, frame, w) {
    const h = Math.max(1, Math.round((w * project.height) / project.width));
    const full = makeCanvas(project.width, project.height);
    project.renderFrame(full.getContext('2d'), frame, false);
    const s = makeCanvas(w, h);
    const ctx = s.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(full, 0, 0, w, h);
    return { w, h, d: ctx.getImageData(0, 0, w, h).data };
  }
  function stats(snap) {
    const { w, h, d } = snap;
    let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 20) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { ink: n, area: n / (w * h), box: x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
  }
  function diff(a, b) {
    let changed = 0, inked = 0;
    for (let i = 3; i < a.d.length; i += 4) {
      const ia = a.d[i] > 20, ib = b.d[i] > 20;
      if (ia || ib) inked++;
      if (ia !== ib) changed++;
    }
    return inked ? changed / inked : 0;
  }

  function offlineCritique(project, frame) {
    const tips = [];
    const cur = snapshot(project, frame, 160), st = stats(cur);
    const n = project.frameCount, secs = n / project.fps;
    if (!st.box) {
      tips.push('This frame is empty. Draw a pose, or press D on the previous frame to duplicate it and adjust.');
    } else {
      if (st.area < 0.004) tips.push('Your drawing is very small on the canvas. Draw bigger, or zoom in (+) for more control.');
      const m = 2;
      if (st.box.x0 <= m || st.box.y0 <= m || st.box.x1 >= cur.w - 1 - m || st.box.y1 >= cur.h - 1 - m) {
        tips.push('Part of the drawing touches the edge of the canvas and may look cropped. Leave some breathing room.');
      }
      if (frame > 0) {
        const dv = diff(cur, snapshot(project, frame - 1, 160));
        if (dv === 0) tips.push(`Frame ${frame + 1} is identical to frame ${frame}. That creates a hold, which is great for a pause. For movement, change the pose a little.`);
        else if (dv > 0.85) tips.push(`Big jump from frame ${frame} to ${frame + 1}. Add an in-between (a breakdown drawing), or use Motion to fill the gap.`);
        else if (dv < 0.04) tips.push('Very small change from the previous frame. That reads as slow, which is good for easing. Use wider spacing for fast moves.');
      }
      if (frame < n - 1 && !stats(snapshot(project, frame + 1, 160)).box) {
        tips.push(`Frame ${frame + 2} is still empty. Press D here to duplicate this frame and adjust the pose, or use Motion to animate it.`);
      }
      if (n > 2 && frame === n - 1) {
        const loopJump = diff(cur, snapshot(project, 0, 160));
        if (loopJump > 0.85) tips.push('The last frame is very different from the first, so the loop will "pop". Make the last frame lead into frame 1.');
      }
      const used = project.layers.filter((l) => l.cels[frame]).length;
      if (used === 1 && project.layers.length > 1 && st.area > 0.2) tips.push('Everything is on one layer. Put backgrounds on their own layer so you only redraw what moves.');
    }
    if (n < 4) tips.push(`You have ${n} frame${n === 1 ? '' : 's'}. Most simple motions need 6–12 frames. Try "Make a plan" for a guide.`);
    else if (secs < 0.4) tips.push(`The whole loop lasts ${secs.toFixed(2)}s, which is very quick. Add frames or lower the FPS.`);
    if (project.fps > 15) tips.push(`${project.fps} FPS means drawing a lot of frames. Hand-drawn animation usually looks great at 12 FPS ("on twos").`);
    if (!tips.length) tips.push('Looks solid! Check your arcs: play with onion skin on and make sure moving parts travel along smooth curves.');
    return { tips: tips.slice(0, 5), source: 'built-in' };
  }

  /* ================= Gemini ================= */
  async function gemini(body) {
    const key = settings.key();
    const res = await fetch(ENDPOINT + encodeURIComponent(settings.model()) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON error */ }
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      const err = new Error(res.status === 400 || res.status === 403 ? 'Gemini rejected the key or request: ' + msg : 'Gemini error: ' + msg);
      err.status = res.status;
      throw err;
    }
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts.map((p) => p.text || '').join('');
    if (!text) throw new Error('Gemini returned an empty answer.');
    return text;
  }

  const PLAN_SCHEMA = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      fps: { type: 'INTEGER' },
      frames: { type: 'INTEGER' },
      keyframes: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        frame: { type: 'INTEGER' }, pose: { type: 'STRING' }, tip: { type: 'STRING' } }, required: ['frame', 'pose', 'tip'] } },
    },
    required: ['title', 'fps', 'frames', 'keyframes'],
  };

  async function geminiPlan(prompt) {
    const text = await gemini({
      systemInstruction: { parts: [{ text: 'You are a friendly 2D hand-drawn animation director helping a beginner in a frame-by-frame app. ' +
        'Plan a short looping animation. Use 4 to 48 frames and 6 to 24 fps (prefer 12). Give 4 to 8 key poses with 1-based frame numbers ' +
        'within the frame count, a short pose description (max 12 words) and a practical drawing tip (max 25 words) that applies animation principles.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Animation idea: ' + prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: PLAN_SCHEMA, temperature: 0.6 },
    });
    const p = JSON.parse(text);
    const frames = clampInt(p.frames, 2, 60, 12);
    return {
      title: String(p.title || prompt).slice(0, 80),
      fps: clampInt(p.fps, 1, 30, 12),
      frames,
      keyframes: (Array.isArray(p.keyframes) ? p.keyframes : []).slice(0, 12).map((k) => ({
        frame: clampInt(k.frame, 1, frames, 1), pose: String(k.pose || '').slice(0, 120), tip: String(k.tip || '').slice(0, 200),
      })).sort((a, b) => a.frame - b.frame),
      source: 'gemini',
    };
  }

  function pngBase64(project, frame) {
    const w = Math.min(640, project.width), h = Math.round((w * project.height) / project.width);
    const full = makeCanvas(project.width, project.height);
    project.renderFrame(full.getContext('2d'), frame);
    const c = makeCanvas(w, h);
    c.getContext('2d').drawImage(full, 0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }

  async function geminiCritique(project, frame) {
    const parts = [{ text: `This is frame ${frame + 1} of ${project.frameCount} in a hand-drawn animation at ${project.fps} fps.` +
      (frame > 0 ? ' The second image is the previous frame.' : '') +
      ' Give 3 to 5 short, kind, specific tips (max 30 words each) to improve the drawing and the motion, using animation principles.' },
      { inlineData: { mimeType: 'image/png', data: pngBase64(project, frame) } }];
    if (frame > 0) parts.push({ inlineData: { mimeType: 'image/png', data: pngBase64(project, frame - 1) } });
    const text = await gemini({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { tips: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['tips'] },
        temperature: 0.4 },
    });
    const tips = (JSON.parse(text).tips || []).map((t) => String(t).slice(0, 240)).filter(Boolean).slice(0, 5);
    if (!tips.length) throw new Error('Gemini returned no tips.');
    return { tips, source: 'gemini' };
  }

  /* ================= public API ================= */
  // Each call uses Gemini when a key is set, and falls back to the built-in coach on failure.
  async function plan(prompt) {
    if (!settings.key()) return offlinePlan(prompt);
    try { return await geminiPlan(prompt); } catch (e) { return Object.assign(offlinePlan(prompt), { fallback: e.message }); }
  }
  async function critique(project, frame) {
    if (!settings.key()) return offlineCritique(project, frame);
    try { return await geminiCritique(project, frame); } catch (e) { return Object.assign(offlineCritique(project, frame), { fallback: e.message }); }
  }
  async function testKey() {
    const text = await gemini({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] });
    return text.trim();
  }

  window.LF.coach = { plan, critique, testKey, settings, DEFAULT_MODEL, _offlinePlan: offlinePlan, _offlineCritique: offlineCritique };
})();
