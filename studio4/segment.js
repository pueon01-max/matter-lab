/* Matter Lab · product / background separation for one photo.
   - background colour is modelled as a gentle gradient fitted to the photo border
   - shadows (same hue as the backdrop, just darker, soft edges) are flooded away with the background
   - floor reflections under the product are detected by a mirror test and cut off
   - background seen through real holes (mug handles) is kept as a hole
   The user's corrections (tolerance, crop lines, brush strokes, rotate / mirror) are applied here too. */

export const ANALYSIS = 560;

/** Draw an image with the user's 90° rotation / mirror applied. */
export function orient(img, rot = 0, flip = false, max = 1600) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(1, max / Math.max(iw, ih));
  const w = Math.round(iw * k), h = Math.round(ih * k), swap = rot % 2 === 1;
  const c = document.createElement('canvas'); c.width = swap ? h : w; c.height = swap ? w : h;
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 2); if (flip) x.scale(-1, 1);
  x.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

function fitPlane(samples) { // least squares v = a + b*x + c*y for each channel
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0; const sv = [0, 0, 0], svx = [0, 0, 0], svy = [0, 0, 0];
  for (const s of samples) { n++; sx += s.x; sy += s.y; sxx += s.x * s.x; syy += s.y * s.y; sxy += s.x * s.y; for (let k = 0; k < 3; k++) { sv[k] += s.c[k]; svx[k] += s.c[k] * s.x; svy[k] += s.c[k] * s.y; } }
  const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  return [0, 1, 2].map(k => {
    const b = [sv[k], svx[k], svy[k]];
    if (Math.abs(D) < 1e-6) return [sv[k] / n, 0, 0];
    return [0, 1, 2].map(col => { const M = A.map((row, i) => row.map((v, j) => j === col ? b[i] : v)); return det(M) / D; });
  });
}

/**
 * @param {HTMLCanvasElement} src oriented photo
 * @param {object} o { tol=1, shadow=true, reflection=true, crop:{l,t,r,b} (0..1), strokes:[{x,y,r,add}], kind:'side'|'top' }
 */
export function segment(src, o = {}) {
  // pale product on a pale backdrop: also try finer edge barriers, and switch only if that reveals a much larger product
  if (o.tol) return { ...segmentOnce(src, o), tolUsed: o.tol };
  const ladder = [{ tol: 1, edge: 9 }, { tol: .7, edge: 5.5 }, { tol: .5, edge: 3.6 }];
  const area = r => (r.bbox.x1 - r.bbox.x0) * (r.bbox.y1 - r.bbox.y0) / (r.w * r.h);
  const sane = r => r && !(r instanceof Error) && !r.touches && area(r) < .78;
  let pick = null;
  for (const step of ladder) {
    let r; try { r = segmentOnce(src, { ...o, ...step }); } catch (e) { r = e; }
    if (!pick) { pick = r; if (r instanceof Error || area(r) < .025) { pick = r; continue; } else continue; }
    if (sane(r) && (pick instanceof Error || area(pick) < .025 || area(r) > area(pick) * 1.6)) pick = r;
  }
  if (pick instanceof Error) throw pick;
  return pick;
}

function segmentOnce(src, o) {
  const tolK = o.tol ?? 1, kind = o.kind || 'side';
  const k = ANALYSIS / Math.max(src.width, src.height);
  const w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(src, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data, N = w * h;

  // transparent PNG: alpha is the answer
  let transparent = 0; for (let x = 0; x < w; x++) { if (d[x * 4 + 3] < 30) transparent++; if (d[((h - 1) * w + x) * 4 + 3] < 30) transparent++; }
  const useAlpha = transparent > w * .5;

  const lum = new Float32Array(N); for (let i = 0; i < N; i++) lum[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  // gradient magnitude on a lightly blurred luminance
  const bl = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; s += lum[yy * w + xx]; n++; } bl[y * w + x] = s / n; }
  const grad = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const gx = bl[i + 1] - bl[i - 1], gy = bl[i + w] - bl[i - w]; grad[i] = Math.hypot(gx, gy) / 2; }

  // background model from the border band (outliers trimmed twice)
  let samples = []; const band = 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (x >= band && y >= band && x < w - band && y < h - band) continue; if ((x + y) % 2) continue; const i = y * w + x; samples.push({ x: x / w, y: y / h, c: [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]] }); }
  let plane = fitPlane(samples), sigma = 0;
  const bgAt = (x, y) => plane.map(p => p[0] + p[1] * x + p[2] * y);
  for (let it = 0; it < 2; it++) {
    const res = samples.map(s => { const b = bgAt(s.x, s.y); return Math.hypot(s.c[0] - b[0], s.c[1] - b[1], s.c[2] - b[2]); });
    const sorted = res.slice().sort((a, b) => a - b); sigma = sorted[Math.floor(sorted.length * .6)] || 1;
    const keep = samples.filter((s, j) => res[j] < sigma * 3 + 6); if (keep.length > 30) { samples = keep; plane = fitPlane(samples); }
  }
  const T = Math.min(70, Math.max(16, sigma * 3.2 + 14)) * tolK;

  const diff = new Float32Array(N), shadowLike = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, b = bgAt(x / w, y / h), r = d[i * 4], g = d[i * 4 + 1], bb = d[i * 4 + 2];
    diff[i] = Math.hypot(r - b[0], g - b[1], bb - b[2]);
    if (o.shadow !== false) {
      const s = r + g + bb + 1, sb = b[0] + b[1] + b[2] + 1;
      const chroma = Math.hypot(r / s - b[0] / sb, g / s - b[1] / sb);
      const ratio = s / sb;
      // 2 = dark shadow, 3 = pale shadow with exactly the backdrop's colour, 1 = pale & near-neutral (could be a pale product)
      shadowLike[i] = ratio > .24 && ratio < .97 ? (ratio < .78 && chroma < .014 ? 2 : chroma < .0065 ? 3 : chroma < .014 ? 1 : 0) : 0;
    }
  }
  const crop = o.crop || { l: 0, t: 0, r: 1, b: 1 };
  const outsideCrop = (x, y) => x < crop.l * w || x > crop.r * w || y < crop.t * h || y > crop.b * h;
  const G = o.edge ?? 9 * tolK;
  const passable = i => { const x = i % w, y = (i / w) | 0; if (outsideCrop(x, y)) return true; if (useAlpha) return d[i * 4 + 3] < 110; return (diff[i] < T && grad[i] < G) || (shadowLike[i] === 2 && grad[i] < G * 2.5) || (shadowLike[i] === 3 && grad[i] < G * 1.2); };

  // flood the background in from the border
  const bg = new Uint8Array(N), q = new Int32Array(N); let qn = 0;
  const push = i => { if (!bg[i] && passable(i)) { bg[i] = 1; q[qn++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  for (let j = 0; j < qn; j++) { const i = q[j], x = i % w, y = (i / w) | 0; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w); }
  // soft penumbra: pale shadow pixels only within a short distance of the flooded background
  { let front = q.slice(0, qn), depth = 0;
    while (front.length && depth < 6) { const next = []; for (const i of front) { const x = i % w, y = (i / w) | 0; for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (n >= 0 && !bg[n] && shadowLike[n] && grad[n] < G * .8) { bg[n] = 1; next.push(n); } } front = next; depth++; } }

  let mask = new Uint8Array(N); for (let i = 0; i < N; i++) mask[i] = bg[i] ? 0 : 1;
  if (o.debug) { o.debug.flood = mask.slice(); o.debug.diff = diff; o.debug.shadow = shadowLike; o.debug.grad = grad; o.debug.T = T; o.debug.G = G; }

  // real holes: enclosed regions that look exactly like the backdrop (not shadow, not a pale product surface)
  let objArea = 0; for (let i = 0; i < N; i++) objArea += mask[i];
  const holeT = Math.min(T * .5, 14);
  const isHolePx = i => mask[i] && (useAlpha ? d[i * 4 + 3] < 110 : diff[i] < holeT && grad[i] < G);
  const seen = new Uint8Array(N); let holes = 0;
  for (let s = 0; s < N; s++) {
    if (seen[s] || !isHolePx(s)) continue;
    const comp = [s]; seen[s] = 1;
    for (let j = 0; j < comp.length; j++) { const i = comp[j], x = i % w, y = (i / w) | 0; for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (n >= 0 && !seen[n] && isHolePx(n)) { seen[n] = 1; comp.push(n); } }
    if (comp.length < objArea * .006 || comp.length > objArea * .15) continue;
    let hx0 = w, hx1 = 0, hy0 = h, hy1 = 0; for (const i of comp) { const x = i % w, y = (i / w) | 0; hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y); }
    const bw = hx1 - hx0 + 1, bh = hy1 - hy0 + 1, fill = comp.length / (bw * bh);
    if (Math.max(bw / bh, bh / bw) > 3 || fill < .35) continue; // thin gaps between printed stripes are surface, not holes
    holes++; for (const i of comp) mask[i] = 0;
  }

  if (o.debug) o.debug.afterHoles = mask.slice();
  // user brush strokes (coordinates 0..1)
  for (const st of o.strokes || []) {
    const sx = st.x * w, sy = st.y * h, r = Math.max(1, st.r * w);
    for (let y = Math.max(0, Math.floor(sy - r)); y <= Math.min(h - 1, Math.ceil(sy + r)); y++) for (let x = Math.max(0, Math.floor(sx - r)); x <= Math.min(w - 1, Math.ceil(sx + r)); x++) if ((x - sx) ** 2 + (y - sy) ** 2 <= r * r) mask[y * w + x] = st.add ? 1 : 0;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (outsideCrop(x, y)) mask[y * w + x] = 0;

  // close then open (removes speckle, seals hairline gaps)
  const morph = (m, dilate) => { const o2 = new Uint8Array(N); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = dilate ? 0 : 1; for (let dy = -1; dy <= 1 && (dilate ? !v : v); dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; const val = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : m[yy * w + xx]; if (dilate && val) { v = 1; break; } if (!dilate && !val) { v = 0; break; } } o2[y * w + x] = v; } return o2; };
  mask = morph(morph(mask, true), false); mask = morph(morph(mask, false), true);

  // keep the main piece (+ pieces at least 6% of it, e.g. a separated cap)
  const lab = new Int32Array(N).fill(-1), parts = [];
  for (let s = 0; s < N; s++) { if (!mask[s] || lab[s] >= 0) continue; const comp = [s]; lab[s] = parts.length; for (let j = 0; j < comp.length; j++) { const i = comp[j], x = i % w, y = (i / w) | 0; for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (n >= 0 && mask[n] && lab[n] < 0) { lab[n] = parts.length; comp.push(n); } } parts.push(comp); }
  if (!parts.length) throw Object.assign(new Error('제품을 찾지 못했어요. 배경이 단순한 곳에서 다시 찍거나, 윤곽 편집에서 허용 범위를 낮춰 주세요.'), { stage: 'segment' });
  const big = Math.max(...parts.map(p => p.length));
  for (const p of parts) if (p.length < big * .06) for (const i of p) mask[i] = 0;

  // floor reflection: rows below a "base line" that mirror the rows above, fainter
  let reflectionCut = null;
  if (o.reflection !== false && kind === 'side') reflectionCut = cutReflection(mask, d, w, h, bgAt);

  // bounding box
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 - x0 < 4 || y1 - y0 < 4) throw Object.assign(new Error('제품 윤곽이 너무 작게 잡혔어요. 제품이 화면을 크게 채우도록 찍어 주세요.'), { stage: 'segment' });

  // soft mask for smooth geometry
  const soft = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) { n++; continue; } s += mask[yy * w + xx]; n++; } soft[y * w + x] = s / n; }

  const touches = x0 <= 1 || y0 <= 1 || x1 >= w - 2 || y1 >= h - 2;
  return { w, h, mask, soft, shadow: shadowLike, bbox: { x0, y0, x1: x1 + 1, y1: y1 + 1 }, holes, reflectionCut, touches, scale: k, bgColor: bgAt(.5, .5), threshold: T };
}

function cutReflection(mask, d, w, h, bgAt) {
  const rows = []; let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) { let l = -1, r = -1; for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (l < 0) l = x; r = x; } rows.push(l < 0 ? null : [l, r]); if (l >= 0) { if (top < 0) top = y; bottom = y; } }
  if (top < 0) return null;
  const H = bottom - top + 1; let best = null;
  for (let yb = Math.round(top + H * .45); yb < bottom - H * .04; yb++) {
    const K = bottom - yb; if (K < 3 || yb - K < top) continue;
    let good = 0, tot = 0, fade = 0;
    for (let k = 1; k <= K; k++) {
      const a = rows[yb - k], b = rows[yb + k]; if (!a || !b) continue; tot++;
      const wa = a[1] - a[0];
      if (Math.abs(a[0] - b[0]) < wa * .06 + 2 && Math.abs(a[1] - b[1]) < wa * .06 + 2) {
        // colour test: below ≈ mix(above, backdrop)
        let err = 0, cnt = 0, al = 0;
        for (let x = a[0]; x <= a[1]; x += 3) {
          const ia = ((yb - k) * w + x) * 4, ib = ((yb + k) * w + x) * 4, bg = bgAt(x / w, (yb + k) / h);
          let num = 0, den = 0; for (let c = 0; c < 3; c++) { const pa = d[ia + c] - bg[c], pb = d[ib + c] - bg[c]; num += pa * pb; den += pa * pa; }
          const alpha = den > 50 ? Math.max(0, Math.min(1.2, num / den)) : 1;
          let e = 0; for (let c = 0; c < 3; c++) e += Math.abs(d[ib + c] - (bg[c] + alpha * (d[ia + c] - bg[c]))); err += e / 3; al += alpha; cnt++;
        }
        if (cnt && err / cnt < 26) { good++; fade += al / cnt; }
      }
    }
    if (tot && good / tot > .75 && fade / good < .72) { best = yb; break; }
  }
  if (best === null) return null;
  for (let y = best + 1; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = 0;
  return best / h;
}

/** Marching-squares outline (array of segments in 0..1 coords) for the overlay. */
export function outline(seg) {
  const { w, h, soft } = seg, out = [];
  const v = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : soft[y * w + x];
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), dd = v(x, y + 1);
    const idx = (a > .5) | ((b > .5) << 1) | ((c > .5) << 2) | ((dd > .5) << 3); if (idx === 0 || idx === 15) continue;
    const lerp = (p, q) => (0.5 - p) / ((q - p) || 1e-6);
    const pts = { t: [x + lerp(a, b), y], r: [x + 1, y + lerp(b, c)], b: [x + lerp(dd, c), y + 1], l: [x, y + lerp(a, dd)] };
    const table = { 1: ['l', 't'], 2: ['t', 'r'], 3: ['l', 'r'], 4: ['r', 'b'], 5: ['l', 't', 'r', 'b'], 6: ['t', 'b'], 7: ['l', 'b'], 8: ['b', 'l'], 9: ['b', 't'], 10: ['t', 'r', 'b', 'l'], 11: ['b', 'r'], 12: ['r', 'l'], 13: ['r', 't'], 14: ['t', 'l'] }[idx];
    for (let i = 0; i < table.length; i += 2) { const p = pts[table[i]], q = pts[table[i + 1]]; out.push([(p[0] + .5) / w, (p[1] + .5) / h, (q[0] + .5) / w, (q[1] + .5) / h]); }
  }
  return out;
}
