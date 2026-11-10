/* Matter Lab · photo surface for a reconstructed object.
   Every photo is projected straight onto the faces it actually saw (a depth test per photo stops the front
   photo from also landing on the back or behind a handle). Photos blend by how squarely each face looks at
   each camera, so a round body turns from front to side without a seam. Faces no photo saw are filled with
   a soft, unreadable estimate (never a mirrored copy of a logo) and can be highlighted.

   The same GLSL is used live (with the inner-depth / logo layers) and for baking the GLB texture. */

export const VIEW_ORDER = ['front', 'side', 'top', 'bottom', 'back'];

/* ---------- textures from the photos ---------- */
export function photoTextures(views, frames) {
  const out = {};
  for (const n of Object.keys(views)) {
    const { canvas, seg } = views[n], fr = frames[n];
    const k = canvas.width / seg.w;
    const sx = fr.x0 * k, sy = fr.y0 * k, sw = (fr.x1 - fr.x0) * k, sh = (fr.y1 - fr.y0) * k;
    const s = Math.min(1, 1024 / Math.max(sw, sh)), tw = Math.max(4, Math.round(sw * s)), th = Math.max(4, Math.round(sh * s));
    // low-res colours bled outward from the product so edges never pick up backdrop
    const mw = fr.x1 - fr.x0, mh = fr.y1 - fr.y0, low = document.createElement('canvas'); low.width = mw; low.height = mh;
    const lx = low.getContext('2d', { willReadFrequently: true }); lx.drawImage(canvas, sx, sy, sw, sh, 0, 0, mw, mh);
    const ld = lx.getImageData(0, 0, mw, mh), known = new Uint8Array(mw * mh), col = new Float32Array(mw * mh * 3);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const i = y * mw + x; if (fr.mask[(y + fr.y0) * seg.w + x + fr.x0]) { known[i] = 1; for (let c = 0; c < 3; c++) col[i * 3 + c] = ld.data[i * 4 + c]; } }
    for (let pass = 0; pass < 40; pass++) { const add = []; for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const i = y * mw + x; if (known[i]) continue; let r = 0, g = 0, b = 0, n2 = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= mw || yy >= mh) continue; const j = yy * mw + xx; if (known[j]) { r += col[j * 3]; g += col[j * 3 + 1]; b += col[j * 3 + 2]; n2++; } } if (n2) add.push(i, r / n2, g / n2, b / n2); } if (!add.length) break; for (let a = 0; a < add.length; a += 4) { const i = add[a]; known[i] = 1; col[i * 3] = add[a + 1]; col[i * 3 + 1] = add[a + 2]; col[i * 3 + 2] = add[a + 3]; } }
    for (let i = 0; i < mw * mh; i++) { for (let c = 0; c < 3; c++) ld.data[i * 4 + c] = col[i * 3 + c]; ld.data[i * 4 + 3] = 255; }
    lx.putImageData(ld, 0, 0);
    const m = document.createElement('canvas'); m.width = mw; m.height = mh; const md = m.getContext('2d').createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) md.data[(y * mw + x) * 4 + 3] = fr.mask[(y + fr.y0) * seg.w + x + fr.x0] ? 255 : 0;
    m.getContext('2d').putImageData(md, 0, 0);
    const cut = document.createElement('canvas'); cut.width = tw; cut.height = th; const cx = cut.getContext('2d');
    cx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tw, th); cx.globalCompositeOperation = 'destination-in'; cx.filter = 'blur(1px)'; cx.drawImage(m, 0, 0, tw, th); cx.filter = 'none';
    const tex = document.createElement('canvas'); tex.width = tw; tex.height = th; const tx = tex.getContext('2d', { willReadFrequently: true });
    tx.imageSmoothingQuality = 'high'; tx.drawImage(low, 0, 0, tw, th); tx.drawImage(cut, 0, 0);
    // "print" map: fine, high-contrast detail (logos, type, edges) that should stay crisp on the outer surface
    const det = document.createElement('canvas'); det.width = tw; det.height = th; const dx = det.getContext('2d', { willReadFrequently: true });
    const bl = document.createElement('canvas'); bl.width = tw; bl.height = th; const bx = bl.getContext('2d', { willReadFrequently: true }); bx.filter = `blur(${Math.max(2, Math.round(tw / 90))}px)`; bx.drawImage(tex, 0, 0);
    const a = tx.getImageData(0, 0, tw, th).data, b = bx.getImageData(0, 0, tw, th).data, dd = dx.createImageData(tw, th);
    let sum = [0, 0, 0], cnt = 0, lumSum = 0, lum2 = 0, satSum = 0, hi = 0;
    for (let i = 0; i < tw * th; i++) {
      const la = .3 * a[i * 4] + .59 * a[i * 4 + 1] + .11 * a[i * 4 + 2], lb = .3 * b[i * 4] + .59 * b[i * 4 + 1] + .11 * b[i * 4 + 2];
      const v = Math.min(255, Math.max(0, (Math.abs(la - lb) - 6) * 6));
      dd.data[i * 4] = dd.data[i * 4 + 1] = dd.data[i * 4 + 2] = v; dd.data[i * 4 + 3] = 255;
      if (i % 7 === 0) { const mx = Math.max(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]), mn = Math.min(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]); for (let c = 0; c < 3; c++) sum[c] += a[i * 4 + c]; cnt++; lumSum += la; lum2 += la * la; satSum += mx ? (mx - mn) / mx : 0; if (la > 235 && mx - mn < 18) hi++; }
    }
    dx.putImageData(dd, 0, 0);
    const blurDet = document.createElement('canvas'); blurDet.width = tw; blurDet.height = th; const bdx = blurDet.getContext('2d'); bdx.filter = 'blur(1.5px)'; bdx.drawImage(det, 0, 0);
    const mean = lumSum / cnt;
    out[n] = { tex, detail: blurDet, stats: { color: sum.map(v => v / cnt / 255), lum: mean / 255, contrast: Math.sqrt(Math.max(0, lum2 / cnt - mean * mean)) / 255, sat: satSum / cnt, highlight: hi / cnt } };
  }
  return out;
}

/* ---------- material suggestion from the photos ---------- */
export const PRESETS = {
  original: { label: '원본', why: '', p: { roughness: .42, metalness: 0, clearcoat: .25, clearcoatRoughness: .3, transmission: 0, thickness: .3, ior: 1.45, iridescence: 0, envMapIntensity: .8, sheen: 0, keep: .62, depth: 0, rim: .08, logo: 1 } },
  resin: { label: '투명 레진', why: '', p: { dispersion: 2, roughness: .14, metalness: 0, clearcoat: 1, clearcoatRoughness: .03, transmission: .18, thickness: .4, ior: 1.5, iridescence: 0, envMapIntensity: 1.3, sheen: 0, keep: .84, depth: .045, rim: .45, logo: 1 } },
  glass: { label: '글라스', why: '', p: { roughness: .02, metalness: 0, clearcoat: 1, clearcoatRoughness: .02, transmission: .95, thickness: 1, ior: 1.5, dispersion: 4, iridescence: .12, envMapIntensity: 1.4, sheen: 0, keep: .3, depth: .03, rim: .35, logo: .9 } },
  prism: { label: '프리즘 글라스', why: '', p: { roughness: 0, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, transmission: 1, thickness: 1.5, ior: 1.62, dispersion: 10, iridescence: .55, envMapIntensity: 2.2, sheen: 0, keep: .22, depth: .06, rim: .45, logo: 1, specularIntensity: 1 } },
  jelly: { label: '젤리', why: '', p: { roughness: .26, metalness: 0, clearcoat: .8, clearcoatRoughness: .15, transmission: .55, thickness: 1.1, ior: 1.33, iridescence: 0, envMapIntensity: 1, sheen: .4, keep: .42, depth: .06, rim: .3, logo: .7 } },
  iridescent: { label: '이리데슨트', why: '', p: { roughness: .16, metalness: .1, clearcoat: 1, clearcoatRoughness: .05, transmission: 0, thickness: .3, ior: 1.5, iridescence: 1, envMapIntensity: 1.3, sheen: 0, keep: .45, depth: .02, rim: .3, logo: 1 } },
  chrome: { label: '리퀴드 크롬', why: '', p: { roughness: .05, metalness: 1, clearcoat: .6, clearcoatRoughness: .05, transmission: 0, thickness: .3, ior: 1.5, iridescence: 0, envMapIntensity: 1.6, sheen: 0, keep: .1, depth: 0, rim: .15, logo: .6 } },
  clay: { label: '소프트 클레이', why: '', p: { roughness: .92, metalness: 0, clearcoat: 0, clearcoatRoughness: .5, transmission: 0, thickness: .3, ior: 1.4, iridescence: 0, envMapIntensity: .55, sheen: .6, keep: .35, depth: 0, rim: .05, logo: .8 } },
};

export function suggestMaterial(tex) {
  const s = ['top', 'front'].map(n => tex[n]?.stats).filter(Boolean);
  const avg = k => s.reduce((a, v) => a + v[k], 0) / s.length;
  const lum = avg('lum'), con = avg('contrast'), sat = avg('sat'), hi = avg('highlight');
  // dark ground with bright detail and specular glints → a resin / glass layer over printed content
  if (lum < .32 && con > .12) return { key: 'resin', why: '어두운 바탕 위의 밝은 무늬와 광택 하이라이트가 보여요 → 투명 레진 층 아래 내용물이 잠긴 표현', depth: Math.min(.07, .02 + con * .15) };
  // clear glass / resin: many neutral glints plus strong contrast (light bending through a transparent body)
  if (hi > .015 && con > .14 && sat < .35) return { key: 'resin', why: '밝은 하이라이트와 굴절 대비가 많아요 → 투명한 유리·레진 층(내부가 비쳐 보이는 표현). 더 강한 그래픽은 재질 \'프리즘 글라스\' + 룩 \'다크 쇼케이스\'를 추천해요', depth: Math.min(.06, .02 + con * .12) };
  if (sat < .12 && con > .2 && hi > .02) return { key: 'chrome', why: '채도가 낮고 반사 대비가 강해요 → 금속성 표면', depth: 0 };
  if (sat > .35 && lum > .45 && hi > .01) return { key: 'jelly', why: '밝고 채도 높은 색에 하이라이트가 있어요 → 반투명 젤리', depth: .05 };
  if (hi < .004 && con < .12) return { key: 'clay', why: '하이라이트가 거의 없고 대비가 부드러워요 → 무광 표면', depth: 0 };
  return { key: 'original', why: '사진의 색과 명암을 그대로 살리는 기본 재질', depth: 0 };
}

/* ---------- GLSL ---------- */
export const SURFACE_GLSL = /* glsl */`
uniform vec3 uDims; uniform float uSideDir; uniform float uCell;
uniform sampler2D tF, tS, tT, tB, tK; uniform sampler2D hF, hS, hT, hB, hK; uniform sampler2D dF, dS, dT, dB, dK;
uniform float onF, onS, onT, onB, onK; uniform float uSharp; uniform vec3 uCamObj;
uniform float uDepthAmt, uLogo, uEstShow, uInnerBlur; uniform vec3 uEstColor;
varying vec3 vOP; varying vec3 vON;
float mlVis(sampler2D d, vec2 uv, float depth){ if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) return 0.; float s=texture(d, uv).r; return 1.-smoothstep(uCell*2.5, uCell*5., depth-s); }
vec3 mlSample(sampler2D t, sampler2D h, vec2 uv, vec2 off){
  vec3 surf=texture(t, uv).rgb;
  if(uDepthAmt<=0.0001) return surf;
  vec3 inner=texture(t, uv+off, uInnerBlur).rgb;
  float print=clamp(texture(h, uv).r*uLogo,0.,1.);
  return mix(inner, surf, print);
}
vec4 mlSurface(vec3 p, vec3 n){
  vec3 V=normalize(uCamObj-p); vec3 acc=vec3(0.); float wsum=0.;
  float W=uDims.x, H=uDims.y, D=uDims.z;
  // front
  if(onF>.5){ vec2 uv=vec2((p.x+W*.5)/W,(H*.5-p.y)/H); float w=pow(max(n.z,0.),uSharp)*mlVis(dF,uv,D*.5-p.z); vec2 off=-vec2(V.x/W,-V.y/H)/max(V.z,.3)*uDepthAmt; acc+=w*mlSample(tF,hF,uv,off); wsum+=w; }
  // side
  if(onS>.5){ float sx=uSideDir; vec2 uv= sx>0. ? vec2((D*.5-p.z)/D,(H*.5-p.y)/H) : vec2((p.z+D*.5)/D,(H*.5-p.y)/H);
    float dep= sx>0. ? W*.5-p.x : p.x+W*.5; float w=pow(max(n.x*sx,0.),uSharp)*mlVis(dS,uv,dep);
    vec2 off=-vec2((sx>0.? -V.z: V.z)/D,-V.y/H)/max(V.x*sx,.3)*uDepthAmt; acc+=w*mlSample(tS,hS,uv,off); wsum+=w; }
  // top
  if(onT>.5){ vec2 uv=vec2((p.x+W*.5)/W,(p.z+D*.5)/D); float w=pow(max(n.y,0.),uSharp)*mlVis(dT,uv,H*.5-p.y); vec2 off=-vec2(V.x/W,V.z/D)/max(V.y,.3)*uDepthAmt; acc+=w*mlSample(tT,hT,uv,off); wsum+=w; }
  // bottom
  if(onB>.5){ vec2 uv=vec2((p.x+W*.5)/W,(D*.5-p.z)/D); float w=pow(max(-n.y,0.),uSharp)*mlVis(dB,uv,p.y+H*.5); vec2 off=-vec2(V.x/W,-V.z/D)/max(-V.y,.3)*uDepthAmt; acc+=w*mlSample(tB,hB,uv,off); wsum+=w; }
  // back (optional photo)
  if(onK>.5){ vec2 uv=vec2((W*.5-p.x)/W,(H*.5-p.y)/H); float w=pow(max(-n.z,0.),uSharp)*mlVis(dK,uv,p.z+D*.5); vec2 off=-vec2(-V.x/W,-V.y/H)/max(-V.z,.3)*uDepthAmt; acc+=w*mlSample(tK,hK,uv,off); wsum+=w; }
  // estimate for faces no photo saw: a heavily blurred, low-detail version of the nearest photo's colours
  vec3 est=mix(uEstColor, texture(tF, vec2(.5+.35*sign(p.x)*min(abs(p.x)/W*2.,1.), (H*.5-p.y)/H), 7.).rgb, .3);
  float seen=clamp(wsum*3.,0.,1.);
  vec3 col= wsum>0.0001 ? acc/wsum : est;
  col=mix(est,col,seen);
  float estimated=1.-seen;
  if(uEstShow>.5){ float stripe=step(.5,fract((p.x+p.y*1.3+p.z)*7./max(W,max(H,D))*4.)); col=mix(col, mix(vec3(.55,.95,.45),vec3(.15,.35,.12),stripe), estimated*.55); }
  return vec4(col, estimated);
}
`;

export function makeUniforms(THREE, model, tex) {
  const blank = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); blank.needsUpdate = true;
  const blankD = new THREE.DataTexture(new Float32Array([1e3]), 1, 1, THREE.RedFormat, THREE.FloatType); blankD.needsUpdate = true;
  const U = {
    uDims: { value: new THREE.Vector3(model.dims.W, model.dims.H, model.dims.D) }, uSideDir: { value: model.sideDir === 'left' ? -1 : 1 }, uCell: { value: model.cell },
    uEstColor: { value: (() => { const c = [0, 0, 0]; let n = 0; for (const v of ['side', 'front', 'back']) if (tex[v]) { const w = v === 'side' ? 2 : 1; tex[v].stats.color.forEach((x, i) => c[i] += x * w); n += w; } return new THREE.Color().setRGB(c[0] / n, c[1] / n, c[2] / n, THREE.SRGBColorSpace); })() },
    uSharp: { value: 4 }, uCamObj: { value: new THREE.Vector3(0, 0, 5) }, uDepthAmt: { value: 0 }, uLogo: { value: 1 }, uEstShow: { value: 0 }, uInnerBlur: { value: 1.2 },
  };
  const key = { front: 'F', side: 'S', top: 'T', bottom: 'B', back: 'K' };
  for (const n of VIEW_ORDER) {
    const k = key[n], has = !!tex[n];
    let t = blank, h = blank, d = blankD;
    if (has) {
      t = new THREE.CanvasTexture(tex[n].tex); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      h = new THREE.CanvasTexture(tex[n].detail); h.flipY = false;
      const dm = model.depth[n]; d = new THREE.DataTexture(dm.data, dm.R, dm.R, THREE.RedFormat, THREE.FloatType); d.flipY = false; d.needsUpdate = true; d.magFilter = d.minFilter = THREE.NearestFilter;
    }
    U['t' + k] = { value: t }; U['h' + k] = { value: h }; U['d' + k] = { value: d }; U['on' + k] = { value: has ? 1 : 0 };
  }
  return U;
}

/** Turn a MeshPhysicalMaterial into the photo-surface material. */
export function patchMaterial(mat, U, extra) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, extra);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SURFACE_GLSL + '\nuniform float uKeep; uniform float uRim; uniform vec3 uRimColor;')
      .replace('#include <map_fragment>', 'vec4 mlS = mlSurface(vOP, normalize(vON)); vec3 mlBase = mlS.rgb; /* textures are sRGB-decoded by the GPU */\n diffuseColor.rgb *= mlBase * (1. - uKeep);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += mlBase * uKeep; totalEmissiveRadiance += uRimColor * pow(1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.), 4.) * uRim;');
  };
  mat.customProgramCacheKey = () => 'ml-surface-v1';
  mat.needsUpdate = true;
}
