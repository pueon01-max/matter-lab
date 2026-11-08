/* Matter Lab · 360° object viewer (Three.js) */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeUniforms, patchMaterial, PRESETS } from './surface.js';

export class ObjectViewer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    this.scene = new THREE.Scene(); this.bg = new THREE.Color('#14161b'); this.scene.background = this.bg;
    const pm = new THREE.PMREMGenerator(r); this.scene.environment = pm.fromScene(new RoomEnvironment(), .03).texture;
    this.camera = new THREE.PerspectiveCamera(30, 1, .05, 100); this.camera.position.set(0, .4, 6.2);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.dampingFactor = .08; this.controls.minDistance = 2.2; this.controls.maxDistance = 14; this.controls.enablePan = false;
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-3, 4, 5); this.scene.add(key);
    const rimL = new THREE.DirectionalLight(0xbfd4ff, 1.1); rimL.position.set(4, 2, -4); this.scene.add(rimL);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223, .35));
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.float = true; this.clock = new THREE.Clock(); this.objects = []; this.active = null;
    this.resize(); new ResizeObserver(() => this.resize()).observe(canvas);
    const loop = () => { requestAnimationFrame(loop); this.tick(); }; loop();
  }
  resize() { const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 400; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  tick() {
    const t = this.clock.getElapsedTime();
    this.controls.update();
    for (const o of this.objects) {
      o.mesh.position.y = o.base.y + (this.float ? Math.sin(t * 1.1 + o.phase) * .04 : 0);
      const camObj = o.mesh.worldToLocal(this.camera.position.clone()); o.uniforms.uCamObj.value.copy(camObj);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** build a mesh for a reconstruction; doesn't touch the scene yet */
  build(model, tex) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(model.mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(model.mesh.normals, 3));
    g.setIndex(new THREE.BufferAttribute(model.mesh.indices, 1));
    g.computeBoundingSphere();
    const U = makeUniforms(THREE, model, tex);
    const extra = { uKeep: { value: .62 }, uRim: { value: .1 }, uRimColor: { value: new THREE.Color(0xdfe8ff) } };
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, side: THREE.FrontSide });
    patchMaterial(mat, U, extra);
    const mesh = new THREE.Mesh(g, mat);
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
    const o = this.active; if (!o) return; const p = { ...PRESETS[key].p, ...overrides }; o.params = { preset: key, ...p };
    this.setParams(p);
  }
  setParams(p) {
    const o = this.active; if (!o) return; Object.assign(o.params, p);
    const m = o.material, q = o.params;
    for (const k of ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'iridescence', 'envMapIntensity', 'sheen']) if (q[k] !== undefined) m[k] = q[k];
    m.sheenColor = new THREE.Color(0xffffff); m.iridescenceThicknessRange = [180, 520];
    o.uniforms.uKeep.value = q.keep ?? .6; o.uniforms.uDepthAmt.value = q.depth ?? 0; o.uniforms.uRim.value = q.rim ?? .1; o.uniforms.uLogo.value = q.logo ?? 1;
    m.needsUpdate = true;
  }
  showEstimated(v) { for (const o of this.objects) o.uniforms.uEstShow.value = v ? 1 : 0; }
  setBackground(hex) { this.bg.set(hex); }
  setView(name) {
    const d = 6.2, dirs = { front: [0, .05, 1], '45': [.72, .32, .72], side: [1, .05, 0], back: [0, .05, -1], top: [0, 1, .0001], bottom: [0, -1, .0001] };
    const v = new THREE.Vector3(...dirs[name]).normalize().multiplyScalar(d);
    const target = this.active ? this.active.mesh.position.clone() : new THREE.Vector3();
    this.controls.target.copy(target); this.camera.position.copy(target).add(v); this.camera.up.set(0, 1, 0); this.controls.update();
  }
  snapshot() { this.renderer.render(this.scene, this.camera); return this.canvas.toDataURL('image/png'); }
}
