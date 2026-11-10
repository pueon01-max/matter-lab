/* Matter Lab · 360° object viewer (Three.js) */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeUniforms, patchMaterial, PRESETS } from './surface.js';
import { Look, LOOKS } from './look.js';

export class ObjectViewer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.bg = new THREE.Color('#14161b');
    this.camera = new THREE.PerspectiveCamera(30, 1, .05, 100); this.camera.position.set(0, .4, 6.2);
    this.look = new Look(r, this.scene, this.camera); this.lookReady = this.setLook('studio');
    this.look.onFallback = () => this.onFallback?.();
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.onFallback?.('lost'); });
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.dampingFactor = .08; this.controls.minDistance = 2.2; this.controls.maxDistance = 14; this.controls.enablePan = false;
    // a soft key + cool rim on top of the HDRI so edges always catch a line of light
    this.key = new THREE.DirectionalLight(0xffffff, .9); this.key.position.set(-3, 4, 5); this.scene.add(this.key);
    this.rimL = new THREE.DirectionalLight(0xcfe0ff, 1.2); this.rimL.position.set(4, 2, -4); this.scene.add(this.rimL);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.float = true; this.clock = new THREE.Clock(); this.objects = []; this.active = null;
    this.resize(); new ResizeObserver(() => this.resize()).observe(canvas);
    const loop = () => { requestAnimationFrame(loop); this.tick(); }; loop();
  }
  resize() { const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 400; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.look?.resize(w, h); }
  tick() {
    try { this._tick(); } catch (e) { console.error(e); if (!this.look.safe) this.look.fail(e); else throw e; }
  }
  _tick() {
    const t = this.clock.getElapsedTime();
    this.controls.update();
    for (const o of this.objects) {
      o.mesh.position.y = o.base.y + (this.float ? Math.sin(t * 1.1 + o.phase) * .04 : 0);
      const camObj = o.mesh.worldToLocal(this.camera.position.clone()); o.uniforms.uCamObj.value.copy(camObj);
    }
    // floor just under the lowest object
    let low = 1e9; for (const o of this.objects) { const bb = o.mesh.geometry.boundingBox; low = Math.min(low, o.base.y + bb.min.y * o.mesh.scale.y); }
    this.look.setFloor(low < 1e8 ? low - .015 : -1.2);
    this.look.render(this.clock.getDelta ? .016 : .016, t);
  }
  async setLook(key, overrides = {}) { this.lookKey = key; const p = { ...LOOKS[key], ...overrides }; this.lookParams = p; this.bg.set(p.bg[1]); await this.look.set(p); }
  async setLookParams(p) { Object.assign(this.lookParams, p); if (p.bg) this.bg.set(p.bg[1]); await this.look.set(p); }

  /** build a mesh for a reconstruction; doesn't touch the scene yet */
  build(model, tex) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(model.mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(model.mesh.normals, 3));
    g.setIndex(new THREE.BufferAttribute(model.mesh.indices, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const U = makeUniforms(THREE, model, tex);
    const extra = { uKeep: { value: .62 }, uRim: { value: .1 }, uRimColor: { value: new THREE.Color(0xdfe8ff) } };
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, side: THREE.FrontSide });
    patchMaterial(mat, U, extra);
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true;
    const s = 2.3 / Math.max(model.dims.W, model.dims.H, model.dims.D); mesh.scale.setScalar(s);
    return { mesh, uniforms: { ...U, ...extra }, model, tex, material: mat, base: new THREE.Vector3(), phase: Math.random() * 6, params: {} };
  }
  /** replace the working object (default) or add another one to the space */
  show(obj, { add = false } = {}) {
    if (!add && this.active) { this.group.remove(this.active.mesh); this.dispose(this.active); this.objects = this.objects.filter(o => o !== this.active); }
    if (add) { const n = this.objects.length; obj.base.set(((n % 3) - 1) * 2.6, 0, -Math.floor(n / 3) * 2.4); }
    obj.mesh.position.copy(obj.base); this.group.add(obj.mesh); this.objects.push(obj); this.active = obj;
  }
  dispose(o) { o.mesh.geometry.dispose(); o.material.dispose(); for (const k in o.uniforms) { const v = o.uniforms[k].value; if (v && v.isTexture) v.dispose(); } }
  clear() { for (const o of this.objects) { this.group.remove(o.mesh); this.dispose(o); } this.objects = []; this.active = null; }

  applyPreset(key, overrides = {}) {
    const o = this.active; if (!o) return; const p = { dispersion: 0, anisotropy: 0, specularIntensity: 1, attenuation: null, ...PRESETS[key].p, ...overrides }; o.params = { preset: key, ...p };
    this.setParams(p);
  }
  setParams(p) {
    const o = this.active; if (!o) return; Object.assign(o.params, p);
    const m = o.material, q = o.params;
    for (const k of ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'iridescence', 'envMapIntensity', 'sheen', 'dispersion', 'anisotropy', 'specularIntensity']) if (q[k] !== undefined) m[k] = q[k];
    m.sheenColor = new THREE.Color(0xffffff); m.iridescenceThicknessRange = [180, 520]; m.iridescenceIOR = 1.3;
    if (q.attenuation) { m.attenuationColor = new THREE.Color(q.attenuation); m.attenuationDistance = q.attenuationDistance ?? 1.5; }
    o.uniforms.uKeep.value = q.keep ?? .6; o.uniforms.uDepthAmt.value = q.depth ?? 0; o.uniforms.uRim.value = q.rim ?? .1; o.uniforms.uLogo.value = q.logo ?? 1;
    m.needsUpdate = true;
  }
  showEstimated(v) { for (const o of this.objects) o.uniforms.uEstShow.value = v ? 1 : 0; }
  setBackground(hex) { const p = this.lookParams || LOOKS.studio; this.setLookParams({ bg: [p.bg[0], hex] }); }
  setView(name) {
    const d = 6.2, dirs = { front: [0, .05, 1], '45': [.72, .32, .72], side: [1, .05, 0], back: [0, .05, -1], top: [0, 1, .0001], bottom: [0, -1, .0001] };
    const v = new THREE.Vector3(...dirs[name]).normalize().multiplyScalar(d);
    const target = this.active ? this.active.mesh.position.clone() : new THREE.Vector3();
    this.controls.target.copy(target); this.camera.position.copy(target).add(v); this.camera.up.set(0, 1, 0); this.controls.update();
  }
  snapshot() { this.look.render(.016, this.clock.getElapsedTime()); return this.canvas.toDataURL('image/png'); }
}
