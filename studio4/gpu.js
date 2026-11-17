/* Matter Lab · graphics budget
   Reads what this GPU can actually do and picks the highest settings that stay within its limits,
   so a strong card gets everything and a weak one still draws the object. Override with ?gfx=max|high|safe. */

export const TIERS = {
  max: { label: '최고', pixelRatio: [1.5, 2], msaa: 8, shadow: 4096, mirror: 2048, photo: 2048, tile: 1024, quality: 156, micro: true },
  high: { label: '높음', pixelRatio: [1, 2], msaa: 4, shadow: 2048, mirror: 1024, photo: 1536, tile: 768, quality: 148, micro: true },
  safe: { label: '안전', pixelRatio: [1, 1], msaa: 0, shadow: 1024, mirror: 512, photo: 1024, tile: 512, quality: 132, micro: false },
};

// samplers the physical material can add on top of ours: env, transmission, shadow, plus headroom
const MATERIAL_SAMPLERS = 5, OUR_SAMPLERS = 8;

export function detectGPU(renderer) {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const caps = {
    gpu: String(gpu || ''),
    units: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxSamples: gl.getParameter(gl.MAX_SAMPLES) || 0,
    aniso: renderer.capabilities.getMaxAnisotropy(),
    halfFloat: renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'),
    cores: navigator.hardwareConcurrency || 4,
    mem: navigator.deviceMemory || 8,
  };
  const software = /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(caps.gpu);
  const discrete = /nvidia|geforce|rtx|radeon rx|radeon pro|apple m\d (pro|max|ultra)|arc a\d/i.test(caps.gpu);
  const fits = caps.units >= OUR_SAMPLERS + MATERIAL_SAMPLERS;
  let tier = 'safe';
  if (fits && caps.halfFloat && !software) tier = discrete && caps.maxTex >= 16384 && caps.cores >= 8 ? 'max' : 'high';
  const q = (typeof location !== 'undefined' && location.search.match(/[?&]gfx=(max|high|safe)/)) || null;
  if (q) tier = q[1];
  if (/[?&]safe=1/.test(typeof location !== 'undefined' ? location.search : '')) tier = 'safe';
  const t = { ...TIERS[tier] };
  t.tier = tier; t.caps = caps;
  t.msaa = Math.min(t.msaa, caps.maxSamples, caps.halfFloat ? 16 : 0);
  t.shadow = Math.min(t.shadow, caps.maxTex); t.mirror = Math.min(t.mirror, caps.maxTex);
  t.photo = Math.min(t.photo, caps.maxTex); t.tile = Math.min(t.tile, Math.floor(caps.maxTex / 5));
  t.aniso = Math.min(16, caps.aniso || 1);
  t.micro = t.micro && fits;
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  t.dpr = Math.min(t.pixelRatio[1], Math.max(t.pixelRatio[0], dpr));
  t.summary = `${t.label} · 텍스처 ${caps.units}칸 · MSAA ${t.msaa}× · 그림자 ${t.shadow}px · 사진 ${t.photo}px`;
  return t;
}
