/* Matter Lab · export: GLB (baked photo texture + PBR material), standalone HTML (same live shader), R3F code */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SURFACE_GLSL } from './surface.js';

/* ---- box-chart UVs: every triangle goes to the photo-axis it faces most ---- */
function chartGeometry(model) {
  const { positions: P, normals: N, indices: I } = model.mesh, { W, H, D } = model.dims;
  const cells = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], pad = .012;
  // chart order: +z, -z, +x, -x, +y, -y
  const proj = [
    (x, y, z) => [(x + W / 2) / W, (H / 2 - y) / H], (x, y, z) => [(W / 2 - x) / W, (H / 2 - y) / H],
    (x, y, z) => [(D / 2 - z) / D, (H / 2 - y) / H], (x, y, z) => [(z + D / 2) / D, (H / 2 - y) / H],
    (x, y, z) => [(x + W / 2) / W, (z + D / 2) / D], (x, y, z) => [(x + W / 2) / W, (D / 2 - z) / D]];
  const pos = [], nor = [], uv = [], ind = [], map = new Map();
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const ch = az >= ax && az >= ay ? (nz > 0 ? 0 : 1) : ax >= ay ? (nx > 0 ? 2 : 3) : (ny > 0 ? 4 : 5);
    for (const v of [a, b, c]) {
      const key = v * 6 + ch; let id = map.get(key);
      if (id === undefined) {
        id = pos.length / 3; map.set(key, id);
        pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        const [u, w] = proj[ch](P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        uv.push((cells[ch][0] + pad + Math.min(1, Math.max(0, u)) * (1 - 2 * pad)) / 3, (cells[ch][1] + pad + Math.min(1, Math.max(0, w)) * (1 - 2 * pad)) / 2);
      }
      ind.push(id);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
  return g;
}

/* ---- render the projected photo surface into the UV atlas ---- */
export function bakeTexture(renderer, obj, size = 2048) {
  const g = chartGeometry(obj.model);
  const U = {}; for (const k in obj.uniforms) U[k] = { value: obj.uniforms[k].value };
  U.uDepthAmt = { value: 0 }; U.uEstShow = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide, glslVersion: THREE.GLSL3,
    vertexShader: `out vec3 vOP; out vec3 vON; void main(){ vOP=position; vON=normal; gl_Position=vec4(uv.x*2.-1., uv.y*2.-1., 0., 1.); }`,
    fragmentShader: SURFACE_GLSL.replace('varying vec3 vOP; varying vec3 vON;', 'in vec3 vOP; in vec3 vON;') + `
      out vec4 outColor;
      vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-.055, step(.0031308, c)); }
      void main(){ vec4 s=mlSurface(vOP, normalize(vON)); outColor=vec4(toSRGB(s.rgb), 1.); }`,
  });
  const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType });
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(g, mat));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prevTone = renderer.toneMapping, prevCS = renderer.outputColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null);
  renderer.toneMapping = prevTone; renderer.outputColorSpace = prevCS;
  const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  rt.dispose(); mat.dispose();
  // pad islands so mip-mapping never pulls in empty texels
  const filled = new Uint8Array(size * size); for (let i = 0; i < size * size; i++) filled[i] = px[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < 6; pass++) { const add = []; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x; if (filled[i]) continue; for (const j of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y > 0 ? i - size : -1, y < size - 1 ? i + size : -1]) if (j >= 0 && filled[j]) { add.push(i, j); break; } } for (let a = 0; a < add.length; a += 2) { const i = add[a], j = add[a + 1]; filled[i] = 1; for (let c = 0; c < 4; c++) px[i * 4 + c] = px[j * 4 + c]; px[i * 4 + 3] = 255; } }
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const cx = cv.getContext('2d'); const id = cx.createImageData(size, size);
  // render targets are bottom-up; texture rows top-down with flipY=false keeps uv as computed
  for (let y = 0; y < size; y++) id.data.set(px.subarray(y * size * 4, (y + 1) * size * 4), y * size * 4);
  cx.putImageData(id, 0, 0);
  return { geometry: g, canvas: cv };
}

function exportMaterial(obj, map) {
  const q = obj.params || {}, m = new THREE.MeshPhysicalMaterial({ map, roughness: q.roughness ?? .4, metalness: q.metalness ?? 0, clearcoat: q.clearcoat ?? 0, clearcoatRoughness: q.clearcoatRoughness ?? .2, transmission: q.transmission ?? 0, thickness: q.thickness ?? 0, ior: q.ior ?? 1.5, iridescence: q.iridescence ?? 0, sheen: q.sheen ?? 0, envMapIntensity: q.envMapIntensity ?? 1 });
  // keep the photo's own light & dark: a share of the texture is emitted (unaffected by scene lighting), like the preview
  if ((q.keep ?? 0) > 0) { m.emissiveMap = map; m.emissive = new THREE.Color(q.keep, q.keep, q.keep); }
  m.name = 'MatterLab_' + (q.preset || 'original');
  return m;
}

export async function exportGLB(renderer, obj) {
  const { geometry, canvas } = bakeTexture(renderer, obj);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.flipY = false;
  const mesh = new THREE.Mesh(geometry, exportMaterial(obj, map)); mesh.name = obj.name || 'MatterLabObject';
  mesh.scale.copy(obj.mesh.scale);
  const scene = new THREE.Scene(); scene.add(mesh);
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 2048 });
  return new Blob([buf], { type: 'model/gltf-binary' });
}

/* ---- standalone HTML with the same live surface shader + chosen effects ---- */
const b64 = arr => { const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

export async function exportHTML(viewer, obj, fx) {
  const surfaceSrc = await (await fetch(new URL('./surface.js', import.meta.url))).text();
  const views = {};
  for (const n of Object.keys(obj.tex)) views[n] = { tex: obj.tex[n].tex.toDataURL('image/jpeg', .9), detail: obj.tex[n].detail.toDataURL('image/jpeg', .85), depth: b64(obj.model.depth[n].data), R: obj.model.depth[n].R, stats: obj.tex[n].stats };
  const m = obj.model.mesh, big = m.positions.length / 3 > 65535;
  const data = { dims: obj.model.dims, sideDir: obj.model.sideDir, cell: obj.model.cell, pos: b64(m.positions), nor: b64(m.normals), idx: b64(big ? m.indices : Uint16Array.from(m.indices)), big, views, params: obj.params, scale: obj.mesh.scale.x, bg: '#' + viewer.bg.getHexString(), fx };
  const runtime = `
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const S = await import(URL.createObjectURL(new Blob([document.getElementById('surface').textContent], { type: 'text/javascript' })));
const D = JSON.parse(document.getElementById('data').textContent);
const dec = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
const img = src => new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); r(c); }; i.src = src; });
const tex = {}, depth = {};
for (const n in D.views) { const v = D.views[n]; tex[n] = { tex: await img(v.tex), detail: await img(v.detail), stats: v.stats }; depth[n] = { data: dec(v.depth, Float32Array), R: v.R }; }
const model = { dims: D.dims, sideDir: D.sideDir, cell: D.cell, depth };
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.toneMapping = THREE.ACESFilmicToneMapping; document.body.append(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(D.bg); scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .03).texture;
const k1 = new THREE.DirectionalLight(0xffffff, 1.4); k1.position.set(-3, 4, 5); scene.add(k1); const k2 = new THREE.DirectionalLight(0xbfd4ff, 1.1); k2.position.set(4, 2, -4); scene.add(k2); scene.add(new THREE.HemisphereLight(0xffffff, 0x223, .35));
const cam = new THREE.PerspectiveCamera(30, 1, .05, 100); cam.position.set(0, .4, 6.2);
const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.enablePan = false; ctl.enableZoom = !!D.fx.zoom;
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(dec(D.pos, Float32Array), 3)); g.setAttribute('normal', new THREE.BufferAttribute(dec(D.nor, Float32Array), 3)); g.setIndex(new THREE.BufferAttribute(dec(D.idx, D.big ? Uint32Array : Uint16Array), 1));
const U = S.makeUniforms(THREE, model, tex), q = D.params || {};
const extra = { uKeep: { value: q.keep ?? .6 }, uRim: { value: q.rim ?? .1 }, uRimColor: { value: new THREE.Color(0xdfe8ff) } };
U.uDepthAmt.value = q.depth ?? 0; U.uLogo.value = q.logo ?? 1;
const mat = new THREE.MeshPhysicalMaterial({ roughness: q.roughness, metalness: q.metalness, clearcoat: q.clearcoat, clearcoatRoughness: q.clearcoatRoughness, transmission: q.transmission, thickness: q.thickness, ior: q.ior, iridescence: q.iridescence, iridescenceThicknessRange: [180, 520], sheen: q.sheen, envMapIntensity: q.envMapIntensity });
S.patchMaterial(mat, U, extra);
const mesh = new THREE.Mesh(g, mat); mesh.scale.setScalar(D.scale); const holder = new THREE.Group(); holder.add(mesh); scene.add(holder);
let mx = 0, my = 0; addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
const size = () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }; addEventListener('resize', size); size();
const clock = new THREE.Clock();
r.setAnimationLoop(() => { const t = clock.getElapsedTime(); if (D.fx.float) mesh.position.y = Math.sin(t * 1.1) * .04; if (D.fx.parallax) { holder.rotation.y += (mx * .5 - holder.rotation.y) * .06; holder.rotation.x += (my * .3 - holder.rotation.x) * .06; } if (D.fx.spin) mesh.rotation.y = t * .35;
  U.uCamObj.value.copy(mesh.worldToLocal(cam.position.clone())); ctl.update(); r.render(scene, cam); });
`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${(obj.name || 'Matter Lab object').replace(/</g, '')}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:${data.bg}}canvas{display:block;touch-action:none}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}<\/script></head><body>
<script id="surface" type="text/plain">${surfaceSrc.replace(/<\/script/gi, '<\\/script')}<\/script>
<script id="data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}<\/script>
<script type="module">${runtime}<\/script></body></html>`;
  return new Blob([html], { type: 'text/html' });
}

export function exportR3F(obj, fx) {
  const q = obj.params || {}, f = n => +(+n || 0).toFixed(3);
  return `// Matter Lab → React Three Fiber
// npm i three @react-three/fiber @react-three/drei
// Put the downloaded "model.glb" in /public. The photo texture and material are inside the GLB.
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Float, useGLTF } from '@react-three/drei'
import { useRef } from 'react'
import * as THREE from 'three'

function Product(props) {
  const { scene } = useGLTF('/model.glb')
  const group = useRef()
  useFrame(({ pointer }, dt) => {
    ${fx.parallax ? 'if (group.current) { group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, pointer.x * 0.5, 4, dt); group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -pointer.y * 0.3, 4, dt) }' : ''}
    ${fx.spin ? 'if (group.current) group.current.children[0].rotation.y += dt * 0.35' : ''}
  })
  scene.traverse(o => {
    if (o.isMesh) {
      // tune here — same values as the Matter Lab preview
      Object.assign(o.material, { roughness: ${f(q.roughness)}, metalness: ${f(q.metalness)}, clearcoat: ${f(q.clearcoat)}, clearcoatRoughness: ${f(q.clearcoatRoughness)}, transmission: ${f(q.transmission)}, thickness: ${f(q.thickness)}, ior: ${f(q.ior)}, iridescence: ${f(q.iridescence)}, envMapIntensity: ${f(q.envMapIntensity)} })
    }
  })
  return <group ref={group} {...props}><primitive object={scene} /></group>
}

export default function MatterScene() {
  return (
    <Canvas camera={{ position: [0, 0.4, 6.2], fov: 30 }} gl={{ toneMapping: THREE.ACESFilmicToneMapping }} style={{ background: '#${obj.viewerBg || '14161b'}' }}>
      <directionalLight position={[-3, 4, 5]} intensity={1.4} />
      <directionalLight position={[4, 2, -4]} intensity={1.1} color="#bfd4ff" />
      <hemisphereLight args={['#ffffff', '#222233', 0.35]} />
      <Environment preset="studio" />
      ${fx.float ? '<Float speed={1.1} rotationIntensity={0} floatIntensity={0.4}>' : ''}<Product />${fx.float ? '</Float>' : ''}
      <OrbitControls enablePan={false} enableZoom={${!!fx.zoom}} enableDamping />
    </Canvas>
  )
}
useGLTF.preload('/model.glb')
`;
}
