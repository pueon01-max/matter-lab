/* Matter Lab · graphic look: real studio HDRI lighting, backdrop + floor, and a post-processing stack
   (bloom, chromatic aberration, grain, vignette, AgX tone mapping) — the ingredients that make glass,
   chrome and resin read as "high-end" rather than flat. Used by the live viewer and the HTML export. */
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const ENV_BASE = new URL('./env/', import.meta.url).href;
export const ENVS = { lightformers: '라이트포머 (선명한 하이라이트)', photo_studio_01: '포토 스튜디오', studio_small_09: '소프트박스 스튜디오', brown_photostudio_02: '웜 스튜디오', room: '기본 룸' };

export const LOOKS = {
  studio: { label: '글로시 스튜디오', env: 'lightformers', envIntensity: 1, envRot: 0, bg: ['#f1f3f8', '#c9d3e6'], bloom: .25, bloomThreshold: .92, ca: .18, grain: .03, vignette: .2, exposure: 1, tone: 'neutral', floor: 'shadow', showEnv: false },
  prism: { label: '프리즘 글라스 (noomo풍)', env: 'lightformers', envIntensity: 1.25, envRot: .5, bg: ['#eef2ff', '#9fb6ee'], bloom: .35, bloomThreshold: .95, ca: .6, grain: .04, vignette: .2, exposure: 1, tone: 'aces', floor: 'shadow', showEnv: false },
  dark: { label: '다크 쇼케이스', env: 'lightformers', envIntensity: 1.4, envRot: 1.1, bg: ['#1c1f27', '#030304'], bloom: .45, bloomThreshold: .95, ca: .4, grain: .06, vignette: .55, exposure: 1.05, tone: 'aces', floor: 'reflect', showEnv: false },
  photo: { label: '포토 스튜디오 (HDRI)', env: 'photo_studio_01', envIntensity: 1.2, envRot: 0, bg: ['#eef1f8', '#bccbea'], bloom: .2, bloomThreshold: .9, ca: .15, grain: .03, vignette: .2, exposure: 1, tone: 'agx', floor: 'shadow', showEnv: false },
  warm: { label: '웜 포토스튜디오', env: 'brown_photostudio_02', envIntensity: 1, envRot: 0, bg: ['#f4ede5', '#d8c5b1'], bloom: .2, bloomThreshold: .9, ca: .15, grain: .04, vignette: .25, exposure: 1, tone: 'neutral', floor: 'shadow', showEnv: false },
  clean: { label: '클린 (후처리 없음)', env: 'room', envIntensity: 1, envRot: 0, bg: ['#14161b', '#14161b'], bloom: 0, bloomThreshold: 1, ca: 0, grain: 0, vignette: 0, exposure: 1, tone: 'aces', floor: 'none', showEnv: false },
};

const LookShader = {
  uniforms: { tDiffuse: { value: null }, uCA: { value: .2 }, uGrain: { value: .04 }, uVig: { value: .2 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uCA, uGrain, uVig, uTime; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*7.13) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5; float r = length(c);
      // radial chromatic aberration: stronger toward the frame, like a real lens
      vec2 off = c * r * uCA * .03;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1., smoothstep(.95, .25, r), uVig);
      col += (hash(vUv * uRes) - .5) * uGrain * (.4 + .6 * dot(col, vec3(.33)));
      gl_FragColor = vec4(max(col, 0.), 1.);
    }`,
};

function gradientTexture(top, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, top); g.addColorStop(1, bottom); x.fillStyle = g; x.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function fadeTexture(color) { // radial alpha so the floor melts into the backdrop
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.35, 'rgba(0,0,0,0)'); g.addColorStop(1, color);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* a dark studio with a few very bright strip lights: crisp, high-contrast highlight lines on glass and chrome */
function lightformerScene() {
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x050506);
  const add = (w, h, color, k, pos, look = [0, 0, 0], shape = 'rect') => { const g = shape === 'ring' ? new THREE.RingGeometry(w * .42, w * .5, 64) : new THREE.PlaneGeometry(w, h); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(...look); sc.add(m); };
  add(10, 3, 0xffffff, 3.2, [0, 6, 0]);                 // big overhead softbox
  add(1.2, 9, 0xffffff, 6, [-5, 1, 2]);                 // tall strip left
  add(1.2, 9, 0xffffff, 5, [5, 1, -1]);                 // tall strip right
  add(6, .5, 0xffffff, 4, [0, -1.5, 6]);                // thin front kicker
  add(4, 4, 0xffffff, 2.5, [0, 2, -6], [0, 0, 0], 'ring'); // ring light behind → round highlight on curved glass
  add(2, 6, 0x9ec2ff, 2.2, [-4, 0, -4]);                // cool accent
  add(2, 6, 0xffb6d9, 1.8, [4, -1, 4]);                 // warm accent (gives dispersion something to split)
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x1a1b1f })); fl.rotation.x = -Math.PI / 2; fl.position.y = -3; sc.add(fl);
  return sc;
}

export class Look {
  constructor(renderer, scene, camera) {
    Object.assign(this, { renderer, scene, camera });
    renderer.toneMapping = THREE.AgXToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(renderer); this.envCache = {};
    this.room = this.pmrem.fromScene(new RoomEnvironment(), .03).texture; scene.environment = this.room;
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), .3, .55, .85); this.composer.addPass(this.bloom);
    this.post = new ShaderPass(LookShader); this.composer.addPass(this.post);
    this.composer.addPass(new OutputPass());
    // shadow light + floor
    this.sun = new THREE.DirectionalLight(0xffffff, 0); this.sun.position.set(-2, 6, 3); this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.radius = 9; this.sun.shadow.blurSamples = 16;
    Object.assign(this.sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .5, far: 20 }); scene.add(this.sun);
    this.shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .22 })); this.shadowFloor.rotation.x = -Math.PI / 2; this.shadowFloor.receiveShadow = true; scene.add(this.shadowFloor);
    this.mirror = new Reflector(new THREE.CircleGeometry(3.2, 64), { textureWidth: 1024, textureHeight: 1024, color: 0x6c707a, clipBias: .003 }); this.mirror.rotation.x = -Math.PI / 2; scene.add(this.mirror);
    this.fade = new THREE.Mesh(new THREE.CircleGeometry(3.22, 64), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })); this.fade.rotation.x = -Math.PI / 2; scene.add(this.fade);
    this.p = {}; this.floorY = -1.2;
  }
  async loadEnv(name) {
    if (name === 'room') return this.room;
    if (name === 'lightformers') { if (!this.envCache.lf) this.envCache.lf = { pm: this.pmrem.fromScene(lightformerScene(), .015).texture, raw: null }; return this.envCache.lf; }
    if (this.envCache[name]) return this.envCache[name];
    const hdr = await new RGBELoader().loadAsync(ENV_BASE + name + '.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const t = this.pmrem.fromEquirectangular(hdr).texture; this.envCache[name] = { pm: t, raw: hdr }; return this.envCache[name];
  }
  async set(p) {
    this.p = { ...this.p, ...p }; const q = this.p, r = this.renderer, s = this.scene;
    r.toneMappingExposure = q.exposure ?? 1; r.toneMapping = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping }[q.tone || 'aces'];
    this.bloom.strength = q.bloom ?? 0; this.bloom.threshold = q.bloomThreshold ?? .85; this.bloom.enabled = (q.bloom ?? 0) > .001;
    this.post.uniforms.uCA.value = q.ca ?? 0; this.post.uniforms.uGrain.value = q.grain ?? 0; this.post.uniforms.uVig.value = q.vignette ?? 0;
    if (q.bg) { if (this.bgTex) this.bgTex.dispose(); this.bgTex = gradientTexture(q.bg[0], q.bg[1]); }
    s.environmentIntensity = q.envIntensity ?? 1; s.environmentRotation = new THREE.Euler(0, q.envRot ?? 0, 0); s.backgroundRotation = new THREE.Euler(0, q.envRot ?? 0, 0);
    this.shadowFloor.visible = q.floor === 'shadow'; this.sun.intensity = q.floor === 'shadow' ? .0001 : 0; this.sun.castShadow = q.floor === 'shadow';
    this.mirror.visible = this.fade.visible = q.floor === 'reflect';
    if (q.bg) { this.fade.material.map?.dispose(); this.fade.material.map = fadeTexture(q.bg[1]); this.fade.material.needsUpdate = true; }
    if (q.env) {
      try { const e = await this.loadEnv(q.env); s.environment = e.pm || e; this.envRaw = e.raw || null; }
      catch (err) { console.warn('HDRI load failed, using room light', err); s.environment = this.room; this.envRaw = null; }
    }
    s.background = q.showEnv && this.envRaw ? this.envRaw : this.bgTex; s.backgroundBlurriness = q.showEnv ? .35 : 0;
  }
  setFloor(y) { this.floorY = y; this.shadowFloor.position.y = y; this.mirror.position.y = y; this.fade.position.y = y + .002; }
  resize(w, h) { this.composer.setSize(w, h); this.bloom.setSize(w, h); this.post.uniforms.uRes.value.set(w, h); }
  render(dt, t) { this.post.uniforms.uTime.value = t; this.composer.render(dt); }
}
