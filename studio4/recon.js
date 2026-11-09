/* Matter Lab · 4-view reconstruction.
   World axes: x → product's right, y → up, z → toward the viewer of the front photo. Height is 2 units.
   Photo conventions (shown in the UI):
     front  : looking at the front, upright
     side   : right side (image right = back) or left side (image right = front)
     top    : looking down, product front at the bottom of the photo
     bottom : product tipped forward onto its top, front at the top of the photo
     back   : looking at the back, upright (optional)

   Shape = visual hull of all silhouettes ∩ a cross-section model:
   at every height the section is the top/bottom outline, either cropped by the front/side widths
   (straight-sided, asymmetric, handles) or scaled to them (round products that taper: necks, domes),
   chosen by whether cropping would create corners the outline itself doesn't have. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SIDE_VIEWS = ['front', 'back', 'side'];

/* ---------- per-view frames ---------- */
function rowsOf(seg, mask) { const { w, h } = seg, rows = []; for (let y = 0; y < h; y++) { let l = -1, r = -1; for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (l < 0) l = x; r = x; } rows.push(l < 0 ? null : [l, r + 1]); } return rows; }

function sideFrame(seg, notes, name) {
  const mask = seg.mask.slice(), { w, h } = seg, rows = rowsOf(seg, mask);
  let y0 = rows.findIndex(Boolean), y1 = rows.length - 1 - [...rows].reverse().findIndex(Boolean);
  const H = y1 - y0 + 1;
  // widths measured above the floor line: thin floor shadows / tails don't widen the product
  let xl = w, xr = 0;
  for (let y = Math.round(y0 + H * .02); y <= Math.round(y1 - H * .07); y++) if (rows[y]) { xl = Math.min(xl, rows[y][0]); xr = Math.max(xr, rows[y][1]); }
  if (xr <= xl) { xl = seg.bbox.x0; xr = seg.bbox.x1; }
  let clipped = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x < xl - 1 || x > xr) && mask[y * w + x]) { mask[y * w + x] = 0; clipped++; }
  // the very bottom can't suddenly flare out past the rows just above (floor reflections / caustics form a fake "foot")
  { const ref = rows[Math.round(y1 - H * .09)] || rows[Math.round(y1 - H * .12)];
    if (ref) { const rw = ref[1] - ref[0], lim0 = ref[0] - rw * .02, lim1 = ref[1] + rw * .02;
      for (let y = Math.round(y1 - H * .08); y <= y1; y++) for (let x = 0; x < w; x++) if ((x < lim0 || x > lim1) && mask[y * w + x]) { mask[y * w + x] = 0; clipped++; } } }
  if (clipped > H * 2) notes.push({ view: name, text: '바닥 그림자로 보이는 옆쪽 꼬리를 잘라냈어요.' });
  return { mask, x0: xl, x1: xr, y0, y1: y1 + 1 };
}

function topFrame(seg) { return { mask: seg.mask.slice(), x0: seg.bbox.x0, x1: seg.bbox.x1, y0: seg.bbox.y0, y1: seg.bbox.y1 }; }

/* trim a top/bottom silhouette whose box disagrees with the width:depth the other photos agree on */
function trimToAspect(seg, fr, A, notes, name) {
  const { w } = seg; let bw = fr.x1 - fr.x0, bh = fr.y1 - fr.y0;
  const colShadow = x => { let s = 0, n = 0; for (let y = fr.y0; y < fr.y1; y++) { const i = y * w + x; if (fr.mask[i]) { n++; if (seg.shadow[i]) s++; } } return n ? s / n : 1; };
  const rowShadow = y => { let s = 0, n = 0; for (let x = fr.x0; x < fr.x1; x++) { const i = y * w + x; if (fr.mask[i]) { n++; if (seg.shadow[i]) s++; } } return n ? s / n : 1; };
  let trimmed = 0;
  while (bw / bh > A * 1.04 && bw > 8) { if (colShadow(fr.x0) >= colShadow(fr.x1 - 1)) fr.x0++; else fr.x1--; bw--; trimmed++; }
  while (bw / bh < A / 1.04 && bh > 8) { if (rowShadow(fr.y0) >= rowShadow(fr.y1 - 1)) fr.y0++; else fr.y1--; bh--; trimmed++; }
  if (trimmed) {
    for (let y = 0; y < seg.h; y++) for (let x = 0; x < w; x++) if (x < fr.x0 || x >= fr.x1 || y < fr.y0 || y >= fr.y1) fr.mask[y * w + x] = 0;
    if (trimmed > (bw + bh) * .04) notes.push({ view: name, text: '그림자로 보이는 부분을 다른 사진의 비율에 맞춰 잘라냈어요.' });
  }
}

/* exact Euclidean distance transform (Felzenszwalb) → signed distance in pixels, + inside */
function edt1(f, n) { const d = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1); let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20; for (let q = 1; q < n; q++) { let s; do { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k]) k--; else break; } while (k >= 0); k++; v[k] = q; z[k] = s; z[k + 1] = 1e20; } k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; } return d; }
function edt(mask, w, h, target) { const INF = 1e12, g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = mask[i] === target ? 0 : INF; const col = new Float32Array(h); for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) col[y] = g[y * w + x]; const d = edt1(col, h); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; } const row = new Float32Array(w); for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) row[x] = g[y * w + x]; const d = edt1(row, w); for (let x = 0; x < w; x++) g[y * w + x] = d[x]; } return g; }
function blur2(a, w, h, passes = 2) { let s = a; for (let p = 0; p < passes; p++) { const t = new Float32Array(w * h), o = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; t[i] = (s[y * w + Math.max(0, x - 1)] + 2 * s[i] + s[y * w + Math.min(w - 1, x + 1)]) / 4; } for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; o[i] = (t[Math.max(0, y - 1) * w + x] + 2 * t[i] + t[Math.min(h - 1, y + 1) * w + x]) / 4; } s = o; } return s; }
function sdfOf(mask, w, h, smooth = 2) { const dIn = edt(mask, w, h, 0), dOut = edt(mask, w, h, 1), s = new Float32Array(w * h); for (let i = 0; i < w * h; i++) s[i] = mask[i] ? Math.sqrt(dIn[i]) - .5 : .5 - Math.sqrt(dOut[i]); return smooth ? blur2(s, w, h, smooth) : s; }

/* sampler returns signed distance in world units (positive inside) */
function sampler(seg, fr, worldU, worldV) {
  const { w, h } = seg, sd = sdfOf(fr.mask, w, h), fw = fr.x1 - fr.x0, fh = fr.y1 - fr.y0;
  const ppw = (fw / worldU + fh / worldV) / 2;
  return (u, v) => {
    const px = fr.x0 + u * fw - .5, py = fr.y0 + v * fh - .5;
    const cx = clamp(px, 0, w - 1.001), cy = clamp(py, 0, h - 1.001), out = Math.hypot(px - cx, py - cy);
    const x0 = Math.floor(cx), y0 = Math.floor(cy), tx = cx - x0, ty = cy - y0;
    const g = (x, y) => sd[y * w + x];
    const val = (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
    return (val - out) / ppw;
  };
}

/* dark, neutral shadow regions attached to the outline are not product */
function dropDarkShadow(seg, fr) {
  const { w, h } = seg, m = fr.mask, rm = new Uint8Array(w * h), q = [];
  for (let i = 0; i < w * h; i++) { if (!m[i] || seg.shadow[i] !== 2) continue; const x = i % w, y = (i / w) | 0; if ((x > 0 && !m[i - 1]) || (x < w - 1 && !m[i + 1]) || (y > 0 && !m[i - w]) || (y < h - 1 && !m[i + w])) { rm[i] = 1; q.push(i); } }
  for (let j = 0; j < q.length; j++) { const i = q[j], x = i % w, y = (i / w) | 0; for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (n >= 0 && m[n] && !rm[n] && seg.shadow[n] === 2) { rm[n] = 1; q.push(n); } }
  let removed = 0, total = 0; for (let i = 0; i < w * h; i++) { if (m[i]) total++; if (rm[i]) removed++; }
  if (removed > total * .85) return 0; // that much "shadow" is probably a dark product — leave it
  for (let i = 0; i < w * h; i++) if (rm[i]) m[i] = 0;
  // bbox
  let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 > x0) Object.assign(fr, { x0, y0, x1: x1 + 1, y1: y1 + 1 });
  return removed / Math.max(1, total);
}

/* world → photo (u,v) for each view */
export function projector(name, dims, sideDir = 'right') {
  const { W, H, D } = dims;
  switch (name) {
    case 'front': return (x, y, z) => [(x + W / 2) / W, (H / 2 - y) / H];
    case 'back': return (x, y, z) => [(W / 2 - x) / W, (H / 2 - y) / H];
    case 'side': return sideDir === 'right' ? (x, y, z) => [(D / 2 - z) / D, (H / 2 - y) / H] : (x, y, z) => [(z + D / 2) / D, (H / 2 - y) / H];
    case 'top': return (x, y, z) => [(x + W / 2) / W, (z + D / 2) / D];
    case 'bottom': return (x, y, z) => [(x + W / 2) / W, (D / 2 - z) / D];
  }
}
export function viewDir(name, sideDir = 'right') { return { front: [0, 0, 1], back: [0, 0, -1], side: sideDir === 'right' ? [1, 0, 0] : [-1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0] }[name]; }

const yieldUI = () => new Promise(r => setTimeout(r, 0));

/**
 * @param {{front,side,top,bottom,back?}} views each {seg, canvas}
 * @param {{sideDir?:'right'|'left', quality?:number, onStage?:Function}} opt
 */
export async function reconstruct(views, opt = {}) {
  const sideDir = opt.sideDir || 'right', notes = [], stage = opt.onStage || (() => { });
  const need = ['front', 'side', 'top', 'bottom'];
  for (const n of need) if (!views[n]) throw Object.assign(new Error(`${{ front: '정면', side: '측면', top: '윗면', bottom: '바닥면' }[n]} 사진이 없어요.`), { stage: 'input', view: n });
  stage('align', '방향별 크기와 중심을 맞추는 중');
  const frames = {};
  for (const n of Object.keys(views)) {
    const seg = views[n].seg, base = { mask: seg.mask.slice(), ...seg.bbox };
    const dropped = dropDarkShadow(seg, base);
    if (dropped > .04) notes.push({ view: n, text: '윤곽에 붙은 진한 그림자를 제외했어요.' });
    frames[n] = SIDE_VIEWS.includes(n) ? sideFrame({ ...seg, mask: base.mask }, notes, n) : base;
  }

  const fF = frames.front, fS = frames.side;
  let aspF = (fF.x1 - fF.x0) / (fF.y1 - fF.y0);
  if (frames.back) aspF = (aspF + (frames.back.x1 - frames.back.x0) / (frames.back.y1 - frames.back.y0)) / 2;
  const aspS = (fS.x1 - fS.x0) / (fS.y1 - fS.y0);
  const H = 2, W = H * aspF, D = H * aspS, dims = { W, H, D };
  const A = W / D;
  for (const n of ['top', 'bottom']) {
    const fr = frames[n], a = (fr.x1 - fr.x0) / (fr.y1 - fr.y0);
    const err = Math.abs(Math.log(a / A)), errT = Math.abs(Math.log((1 / a) / A));
    if (errT < err * .5 && err > .18) notes.push({ view: n, warn: true, text: `${n === 'top' ? '윗면' : '바닥면'} 사진이 90° 돌아가 있는 것 같아요. 윤곽 편집에서 ⟳ 회전해 주세요.` });
    else if (err > .35) notes.push({ view: n, warn: true, text: `${n === 'top' ? '윗면' : '바닥면'} 사진의 가로:세로 비율이 정면·측면과 많이 달라요. 정면에서 똑바로 내려다보며 찍었는지 확인해 주세요.` });
    trimToAspect(views[n].seg, fr, A, notes, n);
  }
  const S = {}, P = {};
  const extent = { front: [W, H], back: [W, H], side: [D, H], top: [W, D], bottom: [W, D] };
  for (const n of Object.keys(views)) { S[n] = sampler(views[n].seg, frames[n], ...extent[n]); P[n] = projector(n, dims, sideDir); }
  await yieldUI();

  /* ---------- grid ---------- */
  stage('volume', '높이별 단면을 읽는 중');
  const N = opt.quality || 132, maxDim = Math.max(W, H, D), cell = maxDim / N, pad = 3;
  const nx = Math.ceil(W / cell) + pad * 2, ny = Math.ceil(H / cell) + pad * 2, nz = Math.ceil(D / cell) + pad * 2;
  const X = i => (i - (nx - 1) / 2) * cell, Y = j => (j - (ny - 1) / 2) * cell, Z = k => (k - (nz - 1) / 2) * cell;

  // cross-section outline from above. Each of top / bottom is used as a SHAPE, fitted to the width × depth
  // that the front and side photos agree on (so shadows or a different camera distance can't change the size),
  // then the two are intersected (shadows fall on different sides in the two photos and cancel).
  const rawGrid = (smp, prj) => { const g = new Float32Array(nx * nz); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, area = 0; for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const v = smp(...prj(X(i), 0, Z(k))); g[k * nx + i] = v; if (v > 0) { area++; x0 = Math.min(x0, X(i)); x1 = Math.max(x1, X(i)); z0 = Math.min(z0, Z(k)); z1 = Math.max(z1, Z(k)); } } return { g, x0, x1: x1 + cell, z0, z1: z1 + cell, area }; };
  const fitted = n => {
    const r = rawGrid(S[n], P[n]); if (!r.area) return null;
    const bw = r.x1 - r.x0, bd = r.z1 - r.z0, cxr = (r.x0 + r.x1) / 2 - cell / 2, czr = (r.z0 + r.z1) / 2 - cell / 2;
    const aspErr = Math.abs(Math.log((bw / bd) / (W / D))), fill = r.area * cell * cell / (bw * bd);
    const g = new Float32Array(nx * nz), k2 = Math.min(W / bw, D / bd);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) g[k * nx + i] = S[n](...P[n](cxr + X(i) * bw / W, 0, czr + Z(k) * bd / D)) * k2;
    return { g, aspErr, fill, shadow: (() => { const sg = views[n].seg, m = frames[n].mask; let a = 0, s2 = 0; for (let i = 0; i < m.length; i++) if (m[i]) { a++; if (sg.shadow[i]) s2++; } return s2 / Math.max(1, a); })(), coverage: bw * bd / (W * D) };
  };
  const cand = { top: fitted('top'), bottom: fitted('bottom') };
  const okC = c => c && c.aspErr < .35 && c.fill > .3;
  const score = c => c.aspErr * 2 + c.shadow + (1 - c.fill) * .3;
  const iou = (a, b) => { let x = 0, y = 0; for (let i = 0; i < a.length; i++) { const p = a[i] > 0, q2 = b[i] > 0; if (p && q2) x++; if (p || q2) y++; } return y ? x / y : 0; };
  let TT = new Float32Array(nx * nz), clean = null, agreement = 0;
  const usable = ['top', 'bottom'].filter(n => okC(cand[n]));
  if (usable.length === 2) {
    agreement = iou(cand.top.g, cand.bottom.g);
    clean = score(cand.top) <= score(cand.bottom) ? 'top' : 'bottom';
    for (let i = 0; i < TT.length; i++) TT[i] = agreement > .82 ? Math.min(cand.top.g[i], cand.bottom.g[i]) : cand[clean].g[i];
    if (agreement <= .82) notes.push({ view: clean === 'top' ? 'bottom' : 'top', warn: true, text: `윗면과 바닥면 윤곽이 서로 달라서(일치도 ${Math.round(agreement * 100)}%) 더 깨끗한 ${clean === 'top' ? '윗면' : '바닥면'}만 단면에 썼어요.` });
  } else if (usable.length === 1) {
    clean = usable[0]; TT = cand[clean].g;
    const other = clean === 'top' ? 'bottom' : 'top';
    notes.push({ view: other, warn: true, text: `${other === 'top' ? '윗면' : '바닥면'} 윤곽을 제대로 찾지 못해서 ${clean === 'top' ? '윗면' : '바닥면'}만으로 단면을 만들었어요. 윤곽 편집에서 확인해 주세요.` });
  } else {
    // no usable outline from above: rounded-rectangle section (superellipse) as a neutral guess
    clean = 'none';
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const u = X(i) / (W / 2), v = Z(k) / (D / 2), r = Math.pow(Math.pow(Math.abs(u), 3) + Math.pow(Math.abs(v), 3), 1 / 3); TT[k * nx + i] = (1 - r) * Math.min(W, D) / 2; }
    notes.push({ view: 'top', warn: true, text: '윗면·바닥면 윤곽을 둘 다 찾지 못해 둥근 사각형 단면으로 추정했어요. 윗면 사진의 윤곽을 편집해 주세요.' });
  }
  const best = { v: agreement };
  if (clean !== 'none') {
    const bin = new Uint8Array(nx * nz); for (let i = 0; i < bin.length; i++) bin[i] = TT[i] > 0 ? 1 : 0;
    const r = 2, er = new Uint8Array(nx * nz), op = new Uint8Array(nx * nz);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { let v = 1; for (let dk = -r; dk <= r && v; dk++) for (let di = -r; di <= r; di++) { if (di * di + dk * dk > r * r) continue; const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz || !bin[kk * nx + ii]) { v = 0; break; } } er[k * nx + i] = v; }
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { let v = 0; for (let dk = -r; dk <= r && !v; dk++) for (let di = -r; di <= r; di++) { if (di * di + dk * dk > r * r) continue; const ii = i + di, kk = k + dk; if (ii >= 0 && kk >= 0 && ii < nx && kk < nz && er[kk * nx + ii]) { v = 1; break; } } op[k * nx + i] = v; }
    const sd = sdfOf(op, nx, nz); for (let i = 0; i < TT.length; i++) TT[i] = sd[i] * cell;
  }
  // regularise: if most of the outline is a clean ellipse / rounded rectangle (fitted to W × D), use that exact shape.
  // One-sided bulges (leftover shadow) are ignored by the percentile; real asymmetric parts (handles) fail the fit.
  let fittedShape = null, out_fit = null;
  if (clean !== 'none') {
    const bpts = [];
    for (let k = 1; k < nz - 1; k++) for (let i = 1; i < nx - 1; i++) { const v = TT[k * nx + i]; if (v > 0 && (TT[k * nx + i - 1] <= 0 || TT[k * nx + i + 1] <= 0 || TT[(k - 1) * nx + i] <= 0 || TT[(k + 1) * nx + i] <= 0)) bpts.push([X(i), Z(k)]); }
    const a = W / 2, b = D / 2;
    let bestN = null; const perN = {};
    for (const n of [2, 2.4, 3, 4, 6, 10, 16]) for (let ox = -3; ox <= 3; ox++) for (let oz = -3; oz <= 3; oz++) for (const sc of [.86, .92, .96, 1]) {
      const cx = ox * W * .04, cz = oz * D * .04, aa = a * sc, bb = b * sc;
      const res = bpts.map(([x, z]) => Math.abs(Math.pow(Math.pow(Math.abs((x - cx) / aa), n) + Math.pow(Math.abs((z - cz) / bb), n), 1 / n) - 1)).sort((p, q) => p - q);
      const p70 = (res[Math.floor(res.length * .7)] ?? 1) + Math.abs(1 - sc) * .1;
      if (!perN[n] || p70 < perN[n].p70) perN[n] = { n, p70, cx, cz, aa, bb };
    }
    // prefer the roundest exponent that fits nearly as well (leftover shadow makes circles look squarer)
    const minP = Math.min(...Object.values(perN).map(v => v.p70));
    bestN = Object.values(perN).sort((p, q) => p.n - q.n).find(v => v.p70 <= minP * 1.2 + .006);
    out_fit = bestN;
    if (bestN && bestN.p70 < .075) {
      fittedShape = bestN.n;
      // the shape is re-centred and fills W × D (front/side photos are the reference for size)
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const r = Math.pow(Math.pow(Math.abs(X(i) / a), bestN.n) + Math.pow(Math.abs(Z(k) / b), bestN.n), 1 / bestN.n); TT[k * nx + i] = (1 - r) * Math.min(a, b); }
    }
  }
  let tx0 = 1e9, tx1 = -1e9, tz0 = 1e9, tz1 = -1e9, tArea = 0;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) if (TT[k * nx + i] > 0) { tArea++; const x = X(i), z = Z(k); tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); tz0 = Math.min(tz0, z); tz1 = Math.max(tz1, z); }
  if (!tArea) throw Object.assign(new Error('윗면과 바닥면 윤곽이 겹치지 않아요. 두 사진의 방향(앞쪽 위치)을 확인해 주세요.'), { stage: 'volume', view: 'top' });
  const TTs = (x, z) => { const fi = x / cell + (nx - 1) / 2, fk = z / cell + (nz - 1) / 2, i = Math.floor(fi), k = Math.floor(fk), a = fi - i, b = fk - k; const g = (i, k) => i < 0 || k < 0 || i >= nx || k >= nz ? -cell * 4 : TT[k * nx + i]; return (g(i, k) * (1 - a) + g(i + 1, k) * a) * (1 - b) + (g(i, k + 1) * (1 - a) + g(i + 1, k + 1) * a) * b; };
  let Tmax = 0; for (let i = 0; i < TT.length; i++) Tmax = Math.max(Tmax, TT[i]); Tmax = Math.max(Tmax, cell);
  const tcx = (tx0 + tx1) / 2, tcz = (tz0 + tz1) / 2, tw = tx1 - tx0 + cell, td = tz1 - tz0 + cell;
  const inset = .13;
  const cornerFill = (x0, x1, z0, z1) => [[x0 + (x1 - x0) * inset, z0 + (z1 - z0) * inset], [x1 - (x1 - x0) * inset, z0 + (z1 - z0) * inset], [x0 + (x1 - x0) * inset, z1 - (z1 - z0) * inset], [x1 - (x1 - x0) * inset, z1 - (z1 - z0) * inset]].filter(([x, z]) => TTs(x, z) > 0).length;
  const templateCorners = cornerFill(tx0, tx1, tz0, tz1);
  const templateRound = fittedShape ? fittedShape <= 3 : templateCorners <= 1;

  // spans per height from the front (∩ back) and side outlines
  // outermost zero crossings, interpolated between grid cells (no stair-steps)
  const crossings = (n, f) => { let lo = null, hi = null, prev = f(0); for (let t = 1; t < n; t++) { const v = f(t); if (lo === null && prev <= 0 && v > 0) lo = t - 1 + (0 - prev) / (v - prev); if (prev > 0 && v <= 0) hi = t - 1 + prev / (prev - v); prev = v; } return lo === null || hi === null ? null : [lo, hi]; };
  let spans = [];
  for (let j = 0; j < ny; j++) {
    const y = Y(j);
    const cx_ = crossings(nx, i => { let v = S.front(...P.front(X(i), y, 0)); if (S.back) v = Math.min(v, S.back(...P.back(X(i), y, 0))); return v; });
    const cz_ = crossings(nz, k => S.side(...P.side(0, y, Z(k))));
    spans.push(cx_ && cz_ ? { xl: X(0) + cx_[0] * cell, xr: X(0) + cx_[1] * cell, zl: Z(0) + cz_[0] * cell, zr: Z(0) + cz_[1] * cell } : null);
  }
  spans = spans.map((s, j) => { if (!s) return s; const o = { xl: 0, xr: 0, zl: 0, zr: 0 }; let n = 0; for (let d = -2; d <= 2; d++) { const t = spans[j + d]; if (!t) continue; const g = Math.exp(-d * d / 2); for (const key in o) o[key] += t[key] * g; n += g; } for (const key in o) o[key] /= n; return o; });
  // round outlines are scaled to every height (necks, shoulders, domes stay round);
  // if only one axis narrows (a handle ends, a flat back) the outline is cropped instead
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let wScale = spans.map(s => {
    if (!s || !templateRound) return 0;
    const kx = (s.xr - s.xl) / tw, kz = (s.zr - s.zl) / td;
    return 1 - sstep(.12, .25, Math.abs(kx - kz));
  });
  { const sm = new Float32Array(ny); for (let j = 0; j < ny; j++) { let a = 0, n = 0; for (let d = -4; d <= 4; d++) { const jj = j + d; if (jj < 0 || jj >= ny) continue; const g = Math.exp(-d * d / 8); a += wScale[jj] * g; n += g; } sm[j] = a / n; } wScale = sm; }
  await yieldUI();

  /* ---------- field ---------- */
  stage('volume', '입체 볼륨을 만드는 중');
  const field = new Float32Array(nx * ny * nz);
  const fx = new Float32Array(nx * ny), sx = new Float32Array(nz * ny), bk = S.back ? new Float32Array(nx * ny) : null;
  for (let j = 0; j < ny; j++) { const y = Y(j); for (let i = 0; i < nx; i++) { fx[j * nx + i] = S.front(...P.front(X(i), y, 0)); if (bk) bk[j * nx + i] = S.back(...P.back(X(i), y, 0)); } for (let k = 0; k < nz; k++) sx[j * nz + k] = S.side(...P.side(0, y, Z(k))); }
  for (let j = 0; j < ny; j++) {
    const s = spans[j], ws = wScale[j], y = Y(j);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      let v = Math.min(fx[j * nx + i], sx[j * nz + k], TT[k * nx + i]);
      if (bk) v = Math.min(v, bk[j * nx + i]);
      if (v > -cell * 3 && ws > .01) {
        // round products: read the front / side profile along the radial direction (a loft / lathe), so domes,
        // shoulders and necks are true curved surfaces instead of the "hip roof" two extrusions make
        const x = X(i), z = Z(k), rn = Math.max(0, 1 - TT[k * nx + i] / Tmax);
        const ax = x / W, az = z / D, L2 = ax * ax + az * az || 1, cw = ax * ax / L2, sw = az * az / L2;
        const fr = S.front(...P.front((x >= 0 ? 1 : -1) * rn * W / 2, y, 0)), sd = S.side(...P.side(0, y, (z >= 0 ? 1 : -1) * rn * D / 2));
        const lathe = cw * fr + sw * sd;
        // for round products the loft replaces the two straight extrusions (which would leave a flat "roof")
        v = ws * Math.min(lathe, bk ? bk[j * nx + i] : 1e9) + (1 - ws) * v;
      }
      field[(k * ny + j) * nx + i] = v;
    }
    if (j % 24 === 0) await yieldUI();
  }

  /* ---------- surface ---------- */
  stage('mesh', '매끄러운 표면을 만드는 중');
  const angular = templateCorners >= 3;
  const mesh = surfaceNets(field, nx, ny, nz, cell, X(0), Y(0), Z(0), angular ? 2 : 7);
  if (!mesh.indices.length) throw Object.assign(new Error('네 방향 윤곽이 겹치지 않아 입체가 만들어지지 않았어요. 사진 방향과 순서를 확인해 주세요.'), { stage: 'mesh' });
  await yieldUI();

  /* ---------- per-view visibility depth ---------- */
  stage('texture', '사진이 보이는 면을 계산하는 중');
  const fieldAt = (x, y, z) => { const i = Math.round(x / cell + (nx - 1) / 2), j = Math.round(y / cell + (ny - 1) / 2), k = Math.round(z / cell + (nz - 1) / 2); return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : field[(k * ny + j) * nx + i]; };
  const depth = {};
  for (const n of Object.keys(views)) { depth[n] = depthMap(n, dims, sideDir, fieldAt, cell); await yieldUI(); }

  /* ---------- analysis ---------- */
  const analysis = analyse({ spans, wScale, TT, nx, nz, tArea, tx0, tx1, tz0, tz1, templateCorners, cell, X, Z, ny, Y, dims, views, notes, sideDir });
  return { dims, mesh, frames, depth, analysis, sideDir, angular, cell, debug: { TT, nx, nz, wScale, spans, clean, iou: best.v, templateCorners, fittedShape, fit: out_fit } };
}

/* ---------- surface nets with Taubin smoothing and field-gradient normals ---------- */
function surfaceNets(f, nx, ny, nz, cell, ox, oy, oz, iters) {
  const idx = (i, j, k) => (k * ny + j) * nx + i, iso = 0;
  const vid = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = corners.map(([a, b, c]) => f[idx(i + a, j + b, k + c)]);
    let inside = 0; for (const x of v) if (x > iso) inside++;
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) { const va = v[a], vb = v[b]; if ((va > iso) === (vb > iso)) continue; const t = (iso - va) / (vb - va), ca = corners[a], cb = corners[b]; sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++; }
    vid[idx(i, j, k)] = pos.length / 3; pos.push(ox + (i + sx / n) * cell, oy + (j + sy / n) * cell, oz + (k + sz / n) * cell);
  }
  const ind = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = f[idx(i, j, k)] > iso;
    // edge along +x
    if (a !== (f[idx(i + 1, j, k)] > iso)) { const q = [vid[idx(i, j - 1, k - 1)], vid[idx(i, j, k - 1)], vid[idx(i, j, k)], vid[idx(i, j - 1, k)]]; if (q.every(x => x >= 0)) a ? ind.push(q[0], q[1], q[2], q[0], q[2], q[3]) : ind.push(q[0], q[2], q[1], q[0], q[3], q[2]); }
    if (a !== (f[idx(i, j + 1, k)] > iso)) { const q = [vid[idx(i - 1, j, k - 1)], vid[idx(i - 1, j, k)], vid[idx(i, j, k)], vid[idx(i, j, k - 1)]]; if (q.every(x => x >= 0)) a ? ind.push(q[0], q[1], q[2], q[0], q[2], q[3]) : ind.push(q[0], q[2], q[1], q[0], q[3], q[2]); }
    if (a !== (f[idx(i, j, k + 1)] > iso)) { const q = [vid[idx(i - 1, j - 1, k)], vid[idx(i, j - 1, k)], vid[idx(i, j, k)], vid[idx(i - 1, j, k)]]; if (q.every(x => x >= 0)) a ? ind.push(q[0], q[1], q[2], q[0], q[2], q[3]) : ind.push(q[0], q[2], q[1], q[0], q[3], q[2]); }
  }
  const V = pos.length / 3, P = new Float32Array(pos);
  // neighbours
  const nb = Array.from({ length: V }, () => new Set());
  for (let t = 0; t < ind.length; t += 3) { const a = ind[t], b = ind[t + 1], c = ind[t + 2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const nbA = nb.map(s => Int32Array.from(s));
  const step = lam => { const old = P.slice(); for (let v = 0; v < V; v++) { const L = nbA[v]; if (!L.length) continue; let x = 0, y = 0, z = 0; for (const u of L) { x += old[u * 3]; y += old[u * 3 + 1]; z += old[u * 3 + 2]; } x = x / L.length - old[v * 3]; y = y / L.length - old[v * 3 + 1]; z = z / L.length - old[v * 3 + 2]; P[v * 3] += lam * x; P[v * 3 + 1] += lam * y; P[v * 3 + 2] += lam * z; } };
  for (let it = 0; it < iters; it++) { step(.5); step(-.53); }
  // normals from the field gradient (smooth, no faceting)
  const N = new Float32Array(V * 3);
  const fs = (x, y, z) => { const fi = (x - ox) / cell, fj = (y - oy) / cell, fk = (z - oz) / cell, i = Math.floor(fi), j = Math.floor(fj), k = Math.floor(fk), a = fi - i, b = fj - j, c = fk - k; const g = (i, j, k) => i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -cell * 4 : f[idx(i, j, k)]; return ((g(i, j, k) * (1 - a) + g(i + 1, j, k) * a) * (1 - b) + (g(i, j + 1, k) * (1 - a) + g(i + 1, j + 1, k) * a) * b) * (1 - c) + ((g(i, j, k + 1) * (1 - a) + g(i + 1, j, k + 1) * a) * (1 - b) + (g(i, j + 1, k + 1) * (1 - a) + g(i + 1, j + 1, k + 1) * a) * b) * c; };
  const e = cell * .9;
  // face normals as a fallback / to orient
  const FN = new Float32Array(V * 3);
  for (let t = 0; t < ind.length; t += 3) { const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]; const nx_ = uy * vz - uz * vy, ny_ = uz * vx - ux * vz, nz_ = ux * vy - uy * vx; for (const q of [a, b, c]) { FN[q] += nx_; FN[q + 1] += ny_; FN[q + 2] += nz_; } }
  for (let v = 0; v < V; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let gx = fs(x - e, y, z) - fs(x + e, y, z), gy = fs(x, y - e, z) - fs(x, y + e, z), gz = fs(x, y, z - e) - fs(x, y, z + e);
    let l = Math.hypot(gx, gy, gz);
    const fl = Math.hypot(FN[v * 3], FN[v * 3 + 1], FN[v * 3 + 2]) || 1;
    if (l < 1e-5) { gx = FN[v * 3]; gy = FN[v * 3 + 1]; gz = FN[v * 3 + 2]; l = fl; }
    // blend 70/30 with the mesh normal so sharp product edges stay crisp
    const mx = FN[v * 3] / fl, my = FN[v * 3 + 1] / fl, mz = FN[v * 3 + 2] / fl;
    let nx_ = gx / l * .7 + mx * .3, ny_ = gy / l * .7 + my * .3, nz_ = gz / l * .7 + mz * .3; const L = Math.hypot(nx_, ny_, nz_) || 1;
    N[v * 3] = nx_ / L; N[v * 3 + 1] = ny_ / L; N[v * 3 + 2] = nz_ / L;
  }
  return { positions: P, normals: N, indices: Uint32Array.from(ind) };
}

/* depth (distance from the camera plane to the first surface) on a grid over each photo */
function depthMap(name, dims, sideDir, fieldAt, cell) {
  const R = 160, { W, H, D } = dims, data = new Float32Array(R * R).fill(1e3);
  const d = viewDir(name, sideDir), step = cell * .8;
  // plane-coordinate helpers: (u,v) → world point at the near plane, plus the extent along the view axis
  for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) {
    const u = (a + .5) / R, v = (b + .5) / R; let x, y, z, len;
    switch (name) {
      case 'front': x = u * W - W / 2; y = H / 2 - v * H; z = D / 2 + cell; len = D + 2 * cell; break;
      case 'back': x = W / 2 - u * W; y = H / 2 - v * H; z = -D / 2 - cell; len = D + 2 * cell; break;
      case 'side': z = sideDir === 'right' ? D / 2 - u * D : u * D - D / 2; y = H / 2 - v * H; x = sideDir === 'right' ? W / 2 + cell : -W / 2 - cell; len = W + 2 * cell; break;
      case 'top': x = u * W - W / 2; z = v * D - D / 2; y = H / 2 + cell; len = H + 2 * cell; break;
      case 'bottom': x = u * W - W / 2; z = D / 2 - v * D; y = -H / 2 - cell; len = H + 2 * cell; break;
    }
    for (let t = 0; t < len; t += step) { if (fieldAt(x - d[0] * t, y - d[1] * t, z - d[2] * t) > 0) { data[b * R + a] = t - cell; break; } }
  }
  return { data, R };
}

/* ---------- readable analysis ---------- */
function analyse(c) {
  const { spans, wScale, TT, nx, nz, tArea, tx0, tx1, tz0, tz1, templateCorners, cell, ny, Y, dims, views, notes, sideDir } = c;
  const out = { lines: [], estimated: [], advice: [], notes };
  // cross-section
  const bboxArea = ((tx1 - tx0) / cell + 1) * ((tz1 - tz0) / cell + 1), rho = tArea / bboxArea;
  let sym = 0, symN = 0;
  const cxi = Math.round(((tx0 + tx1) / 2) / cell + (nx - 1) / 2), czi = Math.round(((tz0 + tz1) / 2) / cell + (nz - 1) / 2);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const a = TT[k * nx + i] > 0, mi = 2 * cxi - i; const b = mi >= 0 && mi < nx ? TT[k * nx + mi] > 0 : false; if (a || b) { symN++; if (a === b) sym++; } }
  const symX = symN ? sym / symN : 1;
  const ar = (tx1 - tx0 + cell) / (tz1 - tz0 + cell);
  let shape;
  if (symX < .86) shape = '비대칭 (좌우가 다른 형태)';
  else if (templateCorners >= 3 && rho > .93) shape = '각진 사각형';
  else if (templateCorners >= 3 || rho > .86) shape = '둥근 사각형';
  else if (Math.abs(Math.log(ar)) < .08) shape = '원형';
  else shape = '타원형';
  out.shape = shape; out.lines.push(['단면', shape]);
  // taper / scaled sections
  const tap = wScale.filter(v => v > .5).length / Math.max(1, spans.filter(Boolean).length);
  if (tap > .05) out.lines.push(['곡면 처리', `둥근 단면이 좁아지는 구간 ${Math.round(tap * 100)}% (목·어깨·돔)`]);
  // bend
  const valid = spans.map((s, j) => s && [((s.xl + s.xr) / 2), ((s.zl + s.zr) / 2), j]).filter(Boolean);
  if (valid.length > 4) {
    const mx = valid.reduce((a, v) => a + v[0], 0) / valid.length, mz = valid.reduce((a, v) => a + v[1], 0) / valid.length;
    let bx = 0, bz = 0; for (const v of valid) { if (Math.abs(v[0] - mx) > Math.abs(bx)) bx = v[0] - mx; if (Math.abs(v[1] - mz) > Math.abs(bz)) bz = v[1] - mz; }
    const rx = bx / dims.W, rz = bz / dims.D;
    const parts = []; if (Math.abs(rx) > .06) parts.push(`${rx > 0 ? '오른쪽' : '왼쪽'} ${Math.round(Math.abs(rx) * 100)}%`); if (Math.abs(rz) > .06) parts.push(`${rz > 0 ? '앞쪽' : '뒤쪽'} ${Math.round(Math.abs(rz) * 100)}%`);
    out.lines.push(['중심선', parts.length ? '휘어짐 — ' + parts.join(', ') : '곧음']);
  }
  // steps & grooves from the width profile
  const wp = spans.map(s => s ? (s.xr - s.xl) / dims.W : 0), feats = [];
  let first = wp.findIndex(v => v > 0), last = wp.length - 1 - [...wp].reverse().findIndex(v => v > 0);
  for (let j = first + 2; j < last - 2; j++) {
    const jump = wp[j + 1] - wp[j - 1];
    const notch = Math.min(wp[j - 2], wp[j + 2]) - wp[j];
    const at = Math.round((1 - (j - first) / (last - first)) * 100);
    if (notch > .022) { feats.push(['홈', at]); j += 3; }
    else if (Math.abs(jump) > .035) { feats.push(['단차', at]); j += 3; }
  }
  out.features = feats;
  out.lines.push(['특징', feats.length ? feats.slice(0, 5).map(([t, a]) => `위에서 ${100 - a}% ${t}`).join(' · ') : '뚜렷한 단차·홈 없음']);
  const holes = ['front', 'back', 'side'].reduce((a, n) => a + (views[n]?.seg.holes || 0), 0);
  if (holes) out.lines.push(['구멍', `${holes}곳 보존 (손잡이·관통부)`]);
  // estimated regions + advice
  if (!views.back) { out.estimated.push('뒷면 무늬'); out.advice.push('뒷면 사진 1장을 추가하면 뒷면 무늬를 추정 대신 실제 사진으로 입힐 수 있어요.'); }
  out.estimated.push(sideDir === 'right' ? '왼쪽 측면 무늬' : '오른쪽 측면 무늬');
  if (symX < .86 && !views.back) out.advice.push('좌우가 다른 제품이에요. 반대쪽 측면은 윤곽을 공유해서 만들었어요 — 반대 측면을 정확히 하려면 뒷면 사진이 도움이 돼요.');
  if (feats.some(f => f[0] === '홈')) out.advice.push('홈 안쪽처럼 실루엣에 드러나지 않는 오목한 면은 위 45° 사선 사진이 있어야 정확히 알 수 있어요(현재는 매끄럽게 메움).');
  out.estimated.push('윤곽에 드러나지 않는 오목한 내부');
  return out;
}
