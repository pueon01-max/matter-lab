/* Matter Lab · "4컷 → 3D 오브제" studio */
import { orient, segment, outline } from './segment.js';
import { reconstruct } from './recon.js';
import { photoTextures, suggestMaterial, PRESETS } from './surface.js';
import { LOOKS, ENVS } from './look.js';
import { ObjectViewer } from './viewer.js';

const $ = id => document.getElementById(id);
const SLOTS = [
  { key: 'front', label: '정면', hint: '정면을 똑바로', req: true },
  { key: 'side', label: '측면', hint: '오른쪽 옆면', req: true },
  { key: 'top', label: '윗면', hint: '위에서 내려다보기 · 제품 앞쪽이 사진 아래', req: true },
  { key: 'bottom', label: '바닥면', hint: '앞으로 넘겨서 · 제품 앞쪽이 사진 위', req: true },
  { key: 'back', label: '뒷면', hint: '뒷면 무늬를 추정 대신 실제 사진으로', req: false },
];
const SAMPLES = { compact: '둥근 콤팩트 (단차·반사)', bottle: '곡선 병 (목·어깨)', mug: '머그 (손잡이 구멍·비대칭)', box: '둥근 박스 (각진 형태)' };
const STAGES = [['photos', '사진 분석'], ['align', '크기·중심 맞춤'], ['volume', '단면·볼륨'], ['mesh', '표면'], ['texture', '텍스처·재질']];

const state = { slots: {}, sideDir: 'right', busy: false, model: null, obj: null, viewer: null, name: '', generation: 0 };
for (const s of SLOTS) state.slots[s.key] = { img: null, file: null, rot: 0, flip: false, opts: {}, seg: null, canvas: null, status: 'empty', msg: '' };

/* ---------------- DOM ---------------- */
function buildDOM() {
  const tab = document.createElement('button'); tab.id = 'objTab'; tab.textContent = '4컷 → 3D 오브제';
  const modes = document.querySelector('.modes'); modes.prepend(tab);
  $('scanTab').textContent = '사진 한 장 → 입체';
  const sec = document.createElement('section'); sec.id = 'objStudio'; sec.className = 'layout'; sec.hidden = true;
  sec.innerHTML = `
  <div class="left">
    <div id="objView" class="viewport productview objview"><canvas id="objCanvas" aria-label="360도 회전 가능한 3D 오브제"></canvas>
      <div class="vtop"><span class="live"><i></i> OBJECT · 360°</span><span class="obj-badge" id="objBadge" hidden></span><button id="objFull" title="전체 화면">⛶</button></div>
      <div class="obj-busy" id="objBusy" hidden><div class="spinner"></div><b id="objBusyText">생성 중</b><small>이전 모델은 흐리게 표시돼요 — 새 모델이 완성되면 교체됩니다</small></div>
      <div class="vbottom"><div class="sceneid">OBJECT<strong id="objName">—</strong></div>
        <div class="tools obj-views">${[['front', '정면'], ['45', '45°'], ['side', '측면'], ['back', '뒤'], ['top', '위'], ['bottom', '아래']].map(([k, l]) => `<button data-view="${k}" title="${l}에서 보기">${l}</button>`).join('')}</div></div>
    </div>
    <div class="obj-strip" id="objStrip"></div>
    <div class="productFoot"><span>드래그로 360° 회전 · 휠로 확대 · 사진을 누르면 윤곽을 고칠 수 있어요</span>
      <label class="obj-check"><input type="checkbox" id="objEst"> 추정 영역 표시</label></div>
  </div>
  <aside>
    <section><div class="sectionheading"><h3>제품 사진</h3><small>4 VIEWS</small></div>
      <div id="objInputs"></div>
      <label class="field">측면 방향<select id="objSide"><option value="right">오른쪽 측면</option><option value="left">왼쪽 측면</option></select></label>
      <div class="obj-actions"><button class="add primary" id="objBuild" disabled>네 컷으로 생성 · 현재 모델 교체</button><button class="add" id="objAddSpace" disabled>공간에 추가</button></div>
      <ol class="obj-stages" id="objStages">${STAGES.map(([k, l]) => `<li data-stage="${k}">${l}</li>`).join('')}</ol>
      <p class="builderNote" id="objStatus" role="status">예시를 불러오는 중…</p>
      <label class="field">예시 제품<select id="objSample"><option value="">— 선택 —</option>${Object.entries(SAMPLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    </section>
    <section><div class="sectionheading"><h3>형태 분석</h3><small>SHAPE</small></div><dl class="obj-analysis" id="objAnalysis"><dt>—</dt><dd>사진 4장을 넣고 생성하세요</dd></dl><ul class="obj-advice" id="objAdvice"></ul></section>
    <section><div class="sectionheading"><h3>재질</h3><small>MATERIAL</small></div>
      <p class="obj-suggest" id="objSuggest"></p>
      <label class="field">재질<select id="objMat">${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <div id="objRanges"></div>
    </section>
    <section><div class="sectionheading"><h3>그래픽 룩</h3><small>LIGHT · POST</small></div>
      <label class="field">룩 프리셋<select id="lookSel">${Object.entries(LOOKS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <label class="field">조명 (HDRI)<select id="lookEnv">${Object.entries(ENVS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="field">바닥<select id="lookFloor"><option value="none">없음</option><option value="shadow">부드러운 그림자</option><option value="reflect">반사 바닥</option></select></label>
      <label class="field">배경 위<input type="color" id="lookBg0"></label>
      <label class="field">배경 아래<input type="color" id="lookBg1"></label>
      <label class="field">HDRI를 배경으로<input type="checkbox" id="lookShowEnv"></label>
      <div id="lookRanges"></div>
    </section>
    <section><div class="sectionheading"><h3>웹 인터랙션 · 내보내기</h3><small>EXPORT</small></div>
      <label class="field">둥둥 떠 있기<input type="checkbox" id="fxFloat" checked></label>
      <label class="field">마우스 패럴랙스<input type="checkbox" id="fxParallax" checked></label>
      <label class="field">천천히 회전<input type="checkbox" id="fxSpin"></label>
      <label class="field">휠 확대<input type="checkbox" id="fxZoom"></label>
      <div class="obj-actions"><button class="add" id="expGLB" disabled>GLB ↓</button><button class="add" id="expHTML" disabled>HTML ↓</button><button class="add" id="expR3F" disabled>R3F ↓</button></div>
      <p class="builderNote" id="expStatus"></p>
    </section>
  </aside>`;
  document.querySelector('main').insertBefore(sec, $('scanStudio'));
  // editor dialog
  const dlg = document.createElement('dialog'); dlg.id = 'segDialog'; dlg.className = 'segdialog';
  dlg.innerHTML = `<div class="sectionheading"><h2 id="segTitle">윤곽 편집</h2><button id="segClose">✕</button></div>
  <p>초록 선이 인식된 제품 윤곽, 붉은 영역이 배경으로 처리된 부분이에요. 잘못된 곳을 브러시로 칠하거나, 자르기·허용 범위를 조정한 뒤 적용하세요.</p>
  <div class="seg-body"><div class="seg-canvas-wrap"><canvas id="segCanvas"></canvas></div>
  <div class="seg-tools">
    <div class="seg-row"><button id="segRot" class="add">⟳ 90° 회전</button><button id="segFlip" class="add">⇋ 좌우 반전</button></div>
    <div class="seg-row"><button id="segAdd" class="add on">＋ 제품으로 칠하기</button><button id="segErase" class="add">− 배경으로 지우기</button></div>
    <div class="range"><label for="segBrush">브러시 크기<output id="segBrushO"></output></label><input type="range" id="segBrush" min=".005" max=".08" step=".001" value=".025"></div>
    <div class="range"><label for="segTol">배경 허용 범위<output id="segTolO"></output></label><input type="range" id="segTol" min=".3" max="2.2" step=".05" value="1"></div>
    ${['t', 'b', 'l', 'r'].map(k => `<div class="range"><label for="segCrop${k}">${{ t: '위 자르기', b: '아래 자르기', l: '왼쪽 자르기', r: '오른쪽 자르기' }[k]}<output id="segCrop${k}O"></output></label><input type="range" id="segCrop${k}" min="0" max=".45" step=".005" value="0"></div>`).join('')}
    <label class="field">조명 헤일로 제거<select id="segHalo"><option value="auto">자동</option><option value="on">켜기</option><option value="off">끄기</option></select></label>
    <div class="range"><label for="segHaloS">헤일로 민감도<output id="segHaloSO"></output></label><input type="range" id="segHaloS" min=".5" max="2.5" step=".05" value="1"></div>
    <label class="field">그림자 제거<input type="checkbox" id="segShadow" checked></label>
    <label class="field">바닥 반사 제거<input type="checkbox" id="segRefl" checked></label>
    <div class="seg-row"><button id="segReset" class="add">초기화</button><button id="segApply" class="add primary">적용 후 다시 생성</button></div>
    <p class="builderNote" id="segInfo"></p>
  </div></div>`;
  document.body.append(dlg);
}

/* ---------------- slots ---------------- */
function buildSlots() {
  const wrap = $('objInputs'), strip = $('objStrip');
  for (const s of SLOTS) {
    const lab = document.createElement('label'); lab.className = 'field obj-file'; lab.innerHTML = `<span>${s.label}${s.req ? '' : ' <em>선택</em>'}<small>${s.hint}</small></span>`;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'objIn-' + s.key; lab.append(inp); wrap.append(lab);
    inp.onchange = () => { const f = inp.files[0]; if (f) loadSlot(s.key, f, f.name); inp.value = ''; };
    const card = document.createElement('button'); card.className = 'obj-slot'; card.id = 'objSlot-' + s.key; card.type = 'button';
    card.innerHTML = `<canvas width="160" height="120"></canvas><b>${s.label}</b><span class="st">${s.req ? '사진 필요' : '선택 사항'}</span>`;
    card.onclick = () => state.slots[s.key].img ? openEditor(s.key) : inp.click();
    strip.append(card);
  }
}
function slotLabel(k) { return SLOTS.find(s => s.key === k).label; }
function setSlotStatus(k, status, msg = '') {
  const sl = state.slots[k]; sl.status = status; sl.msg = msg;
  const card = $('objSlot-' + k); card.dataset.status = status;
  card.querySelector('.st').textContent = { empty: SLOTS.find(s => s.key === k).req ? '사진 필요' : '선택 사항', loading: '업로드 중…', analyzing: '분석 중…', ok: msg || '윤곽 확인됨 ✓', warn: msg, error: msg }[status] || msg;
  updateButtons();
}
async function loadSlot(k, src, name) {
  const sl = state.slots[k];
  setSlotStatus(k, 'loading');
  try {
    const img = new Image(); img.decoding = 'async';
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src); await img.decode();
    Object.assign(sl, { img, rot: 0, flip: false, userRot: false, opts: {}, name });
    if (k === 'front' && name) state.name = name.replace(/\.[^.]+$/, '').replace(/_front$/, '');
    await analyseSlot(k);
  } catch (e) { setSlotStatus(k, 'error', '사진을 읽지 못했어요 (PNG·JPG·WebP)'); }
}
async function analyseSlot(k) {
  const sl = state.slots[k]; setSlotStatus(k, 'analyzing'); await new Promise(r => setTimeout(r, 0));
  try {
    sl.canvas = orient(sl.img, sl.rot, sl.flip);
    sl.seg = segment(sl.canvas, { ...sl.opts, kind: k === 'top' || k === 'bottom' ? 'top' : 'side' });
    const warn = [];
    if (sl.seg.touches) warn.push('제품이 사진 가장자리에 닿아요');
    if (sl.seg.reflectionCut) warn.push('바닥 반사 제거됨');
    if (sl.seg.grow) warn.push('조명 헤일로 제거됨');
    if (sl.seg.holes) warn.push(`구멍 ${sl.seg.holes}곳`);
    setSlotStatus(k, sl.seg.touches ? 'warn' : 'ok', warn.length ? warn.join(' · ') : '윤곽 확인됨 ✓');
  } catch (e) { sl.seg = null; setSlotStatus(k, 'error', e.message); }
  drawThumb(k);
}
function drawThumb(k) {
  const sl = state.slots[k], c = $('objSlot-' + k).querySelector('canvas'), x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height); if (!sl.canvas) return;
  const s = Math.min(c.width / sl.canvas.width, c.height / sl.canvas.height), w = sl.canvas.width * s, h = sl.canvas.height * s, ox = (c.width - w) / 2, oy = (c.height - h) / 2;
  x.drawImage(sl.canvas, ox, oy, w, h);
  if (sl.seg) { x.strokeStyle = '#7dff5c'; x.lineWidth = 1.4; x.beginPath(); for (const [a, b, cc, d] of outline(sl.seg)) { x.moveTo(ox + a * w, oy + b * h); x.lineTo(ox + cc * w, oy + d * h); } x.stroke(); }
}
function updateButtons() {
  const ready = SLOTS.filter(s => s.req).every(s => state.slots[s.key].seg);
  $('objBuild').disabled = state.busy || !ready; $('objAddSpace').disabled = state.busy || !ready;
  for (const id of ['expGLB', 'expHTML', 'expR3F']) $(id).disabled = state.busy || !state.obj;
}

/* ---------------- generation ---------------- */
function stage(key, text) {
  const order = STAGES.map(s => s[0]), idx = order.indexOf(key);
  document.querySelectorAll('#objStages li').forEach((li, i) => { li.className = i < idx ? 'done' : i === idx ? 'now' : ''; });
  $('objBusyText').textContent = text; $('objStatus').textContent = text;
}
async function generate({ add = false } = {}) {
  if (state.busy) return; state.busy = true; updateButtons();
  const gen = ++state.generation;
  $('objBusy').hidden = false; $('objView').classList.add('busy'); $('objBadge').hidden = true;
  document.querySelectorAll('#objStages li').forEach(li => li.className = '');
  try {
    stage('photos', '사진 4장의 윤곽을 확인하는 중');
    const views = {};
    for (const s of SLOTS) { const sl = state.slots[s.key]; if (!sl.img) { if (s.req) throw Object.assign(new Error(`${s.label} 사진이 없어요.`), { stage: 'photos', view: s.key }); continue; } if (!sl.seg) throw Object.assign(new Error(`${s.label} 사진에서 제품을 찾지 못했어요. 사진을 눌러 윤곽을 고쳐 주세요.`), { stage: 'photos', view: s.key }); views[s.key] = { seg: sl.seg, canvas: sl.canvas }; }
    await new Promise(r => setTimeout(r, 30));
    const autoNotes = await autoRotateTops(views);
    const model = await reconstruct(views, { sideDir: state.sideDir, onStage: (k, t) => stage(k, t) });
    stage('texture', '사진을 표면에 입히는 중');
    await new Promise(r => setTimeout(r, 0));
    model.analysis.notes.unshift(...autoNotes);
    const tex = photoTextures(views, model.frames);
    if (gen !== state.generation) return;
    const obj = state.viewer.build(model, tex); obj.name = state.name || '새 오브제';
    const sug = suggestMaterial(tex);
    state.viewer.show(obj, { add });
    state.viewer.applyPreset(sug.key, { depth: sug.depth });
    state.model = model; state.obj = obj; state.suggest = sug;
    state.viewer.setView('45');
    showAnalysis(model, sug); syncMaterialUI();
    document.querySelectorAll('#objStages li').forEach(li => li.className = 'done');
    $('objName').textContent = obj.name;
    const warns = model.analysis.notes.filter(n => n.warn);
    $('objStatus').textContent = `생성 완료 · ${add ? '공간에 추가했어요' : '현재 모델을 새 결과로 교체했어요'}${warns.length ? ` · 확인할 점 ${warns.length}개` : ''}`;
  } catch (e) {
    const where = e.view ? `${slotLabel(e.view)} 사진` : '', st = STAGES.find(s => s[0] === e.stage)?.[1] || '생성';
    $('objStatus').textContent = `실패 · ${st} 단계${where ? ' · ' + where : ''} — ${e.message}${state.obj ? ' (이전 모델을 그대로 보여주고 있어요)' : ''}`;
    document.querySelectorAll('#objStages li.now').forEach(li => li.className = 'fail');
    if (e.view) setSlotStatus(e.view, 'error', e.message);
    if (state.obj) { $('objBadge').hidden = false; $('objBadge').textContent = '이전 모델 표시 중 · 새 생성 실패'; }
    console.error(e);
  } finally {
    state.busy = false; $('objBusy').hidden = true; $('objView').classList.remove('busy'); updateButtons();
  }
}
/* top/bottom shots taken with the product turned 90° are the most common cause of a flat, slab-like
   result, so if a top/bottom outline fits the front×side footprint far better when turned, turn it. */
async function autoRotateTops(views) {
  const asp = b => (b.x1 - b.x0) / Math.max(1, b.y1 - b.y0), notes = [];
  const A = asp(views.front.seg.bbox) / asp(views.side.seg.bbox);
  for (const k of ['top', 'bottom']) {
    const sl = state.slots[k]; if (!views[k] || sl.userRot) continue;
    const a = asp(views[k].seg.bbox), err = Math.abs(Math.log(a / A)), errT = Math.abs(Math.log(1 / a / A));
    if (err > .25 && errT < err * .4) {
      sl.rot = (sl.rot + 1) % 4; await analyseSlot(k);
      if (sl.seg) { views[k] = { seg: sl.seg, canvas: sl.canvas }; notes.push({ view: k, text: `${slotLabel(k)} 사진이 90° 돌아가 있어서 자동으로 회전했어요. 앞뒤가 바뀌었으면 윤곽 편집에서 ⟳ 두 번 눌러 주세요.` }); }
    }
  }
  return notes;
}
function showAnalysis(model, sug) {
  const a = model.analysis;
  $('objAnalysis').innerHTML = a.lines.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + `<dt>추정 영역</dt><dd>${a.estimated.join(', ')}</dd>`;
  const items = [...a.notes.map(n => `<li class="${n.warn ? 'warn' : ''}">${n.view ? `<b>${slotLabel(n.view)}</b> ` : ''}${n.text}</li>`), ...a.advice.map(t => `<li class="tip">📷 ${t}</li>`)];
  $('objAdvice').innerHTML = items.join('');
  $('objSuggest').innerHTML = `<b>제안: ${PRESETS[sug.key].label}</b> — ${sug.why}`;
}

/* ---------------- material controls ---------------- */
const RANGES = [['thickness', '유리 두께', 0, 2, .01], ['depth', '내부 깊이', 0, .12, .001], ['ior', '굴절', 1, 2.2, .01], ['roughness', '거칠기', 0, 1, .01], ['envMapIntensity', '반사 강도', 0, 3, .01], ['transmission', '투명도', 0, 1, .01], ['rim', '테두리 빛', 0, 1.2, .01], ['logo', '로고 선명도', 0, 1.5, .01], ['keep', '원본 명암 유지', 0, 1, .01], ['clearcoat', '코팅 광택', 0, 1, .01]];
function syncMaterialUI() {
  const o = state.viewer.active; if (!o) return; $('objMat').value = o.params.preset;
  const box = $('objRanges'); box.replaceChildren();
  for (const [k, l, mn, mx, st] of RANGES) {
    const row = document.createElement('div'); row.className = 'range'; const id = 'objR-' + k;
    row.innerHTML = `<label for="${id}">${l}<output>${(+o.params[k] || 0).toFixed(2)}</output></label><input type="range" id="${id}" min="${mn}" max="${mx}" step="${st}" value="${o.params[k] ?? 0}">`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.oninput = () => { state.viewer.setParams({ [k]: +inp.value }); out.textContent = (+inp.value).toFixed(2); };
    box.append(row);
  }
}

/* ---------------- outline editor ---------------- */
let ed = null;
function openEditor(k) {
  const sl = state.slots[k]; if (!sl.img) return;
  ed = { k, add: true, opts: JSON.parse(JSON.stringify(sl.opts || {})), rot: sl.rot, flip: sl.flip };
  ed.opts.strokes ||= []; ed.opts.crop ||= { l: 0, t: 0, r: 1, b: 1 };
  $('segTitle').textContent = `${slotLabel(k)} 윤곽 편집`;
  $('segTol').value = ed.opts.tol ?? 1; $('segHalo').value = ed.opts.grow === undefined ? 'auto' : ed.opts.grow ? 'on' : 'off'; $('segHaloS').value = ed.opts.haloSens ?? 1; $('segShadow').checked = ed.opts.shadow !== false; $('segRefl').checked = ed.opts.reflection !== false;
  $('segCropt').value = ed.opts.crop.t; $('segCropb').value = 1 - ed.opts.crop.b; $('segCropl').value = ed.opts.crop.l; $('segCropr').value = 1 - ed.opts.crop.r;
  $('segDialog').showModal(); edRun();
}
let edTimer = 0;
function edRun() {
  clearTimeout(edTimer);
  edTimer = setTimeout(() => {
    const sl = state.slots[ed.k]; ed.canvas = orient(sl.img, ed.rot, ed.flip);
    const hv = $('segHalo').value; const o = { ...ed.opts, grow: hv === 'auto' ? undefined : hv === 'on', haloSens: +$('segHaloS').value, tol: +$('segTol').value, shadow: $('segShadow').checked, reflection: $('segRefl').checked, crop: { t: +$('segCropt').value, b: 1 - $('segCropb').value, l: +$('segCropl').value, r: 1 - $('segCropr').value }, kind: ed.k === 'top' || ed.k === 'bottom' ? 'top' : 'side' };
    if (+$('segTol').value === 1 && !ed.opts.tol) delete o.tol;
    try { ed.seg = segment(ed.canvas, o); $('segInfo').textContent = `윤곽 크기 ${ed.seg.bbox.x1 - ed.seg.bbox.x0}×${ed.seg.bbox.y1 - ed.seg.bbox.y0}px · 구멍 ${ed.seg.holes}곳${ed.seg.reflectionCut ? ' · 바닥 반사 제거' : ''}${ed.seg.grow ? ' · 조명 헤일로 제거됨' : ''}`; }
    catch (e) { ed.seg = null; $('segInfo').textContent = e.message; }
    ed.lastOpts = o; edDraw();
    for (const k of ['Brush', 'Tol', 'Cropt', 'Cropb', 'Cropl', 'Cropr', 'HaloS']) $('seg' + k + 'O').textContent = (+$('seg' + k).value).toFixed(2);
  }, 40);
}
function edDraw() {
  const c = $('segCanvas'), wrap = c.parentElement, W = wrap.clientWidth || 640, H = Math.min(560, innerHeight * .62);
  const s = Math.min(W / ed.canvas.width, H / ed.canvas.height); c.width = Math.round(ed.canvas.width * s); c.height = Math.round(ed.canvas.height * s); ed.scale = s;
  const x = c.getContext('2d'); x.drawImage(ed.canvas, 0, 0, c.width, c.height);
  if (!ed.seg) return;
  const m = document.createElement('canvas'); m.width = ed.seg.w; m.height = ed.seg.h; const md = m.getContext('2d').createImageData(ed.seg.w, ed.seg.h);
  for (let i = 0; i < ed.seg.w * ed.seg.h; i++) if (!ed.seg.mask[i]) { md.data[i * 4] = 255; md.data[i * 4 + 1] = 40; md.data[i * 4 + 2] = 40; md.data[i * 4 + 3] = 95; }
  m.getContext('2d').putImageData(md, 0, 0); x.drawImage(m, 0, 0, c.width, c.height);
  x.strokeStyle = '#7dff5c'; x.lineWidth = 2; x.beginPath(); for (const [a, b, cc, d] of outline(ed.seg)) { x.moveTo(a * c.width, b * c.height); x.lineTo(cc * c.width, d * c.height); } x.stroke();
}
function edPaint(e) {
  const c = $('segCanvas'), r = c.getBoundingClientRect();
  ed.opts.strokes.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r: +$('segBrush').value, add: ed.add }); edRun();
}
function wireEditor() {
  const c = $('segCanvas'); let down = false;
  c.onpointerdown = e => { down = true; c.setPointerCapture(e.pointerId); edPaint(e); };
  c.onpointermove = e => { if (down) edPaint(e); };
  c.onpointerup = c.onpointercancel = () => down = false;
  for (const id of ['segHalo', 'segHaloS', 'segTol', 'segCropt', 'segCropb', 'segCropl', 'segCropr', 'segShadow', 'segRefl', 'segBrush']) $(id).oninput = $(id).onchange = edRun;
  $('segAdd').onclick = () => { ed.add = true; $('segAdd').classList.add('on'); $('segErase').classList.remove('on'); };
  $('segErase').onclick = () => { ed.add = false; $('segErase').classList.add('on'); $('segAdd').classList.remove('on'); };
  $('segRot').onclick = () => { ed.rot = (ed.rot + 1) % 4; ed.opts.strokes = []; edRun(); };
  $('segFlip').onclick = () => { ed.flip = !ed.flip; ed.opts.strokes = []; edRun(); };
  $('segReset').onclick = () => { ed.opts = { strokes: [], crop: { l: 0, t: 0, r: 1, b: 1 } }; ed.rot = 0; ed.flip = false; for (const k of ['t', 'b', 'l', 'r']) $('segCrop' + k).value = 0; $('segTol').value = 1; $('segHalo').value = 'auto'; $('segHaloS').value = 1; $('segShadow').checked = $('segRefl').checked = true; edRun(); };
  $('segClose').onclick = () => $('segDialog').close();
  $('segApply').onclick = async () => {
    const sl = state.slots[ed.k]; if (sl.rot !== ed.rot) sl.userRot = true; sl.rot = ed.rot; sl.flip = ed.flip;
    sl.opts = { strokes: ed.opts.strokes, crop: ed.lastOpts.crop, shadow: ed.lastOpts.shadow, reflection: ed.lastOpts.reflection, haloSens: ed.lastOpts.haloSens }; if (ed.lastOpts.grow !== undefined) sl.opts.grow = ed.lastOpts.grow; if (ed.lastOpts.tol !== undefined) sl.opts.tol = ed.lastOpts.tol;
    $('segDialog').close(); await analyseSlot(ed.k);
    if (SLOTS.filter(s => s.req).every(s => state.slots[s.key].seg)) generate();
  };
}

/* ---------------- exports ---------------- */
function download(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
const fx = () => ({ float: $('fxFloat').checked, parallax: $('fxParallax').checked, spin: $('fxSpin').checked, zoom: $('fxZoom').checked });
const safeName = () => (state.obj?.name || 'object').replace(/[^\w가-힣-]+/g, '_');
function wireExports() {
  const run = async (label, fn) => { $('expStatus').textContent = `${label} 만드는 중…`; try { await fn(); $('expStatus').textContent = `${label} 다운로드 완료 ✓`; } catch (e) { console.error(e); $('expStatus').textContent = `${label} 실패 — ${e.message}`; } };
  $('expGLB').onclick = () => run('GLB', async () => { const { exportGLB } = await import('./export4.js'); download(await exportGLB(state.viewer.renderer, state.viewer.active), safeName() + '.glb'); });
  $('expHTML').onclick = () => run('HTML', async () => { const { exportHTML } = await import('./export4.js'); download(await exportHTML(state.viewer, state.viewer.active, fx()), safeName() + '.html'); });
  $('expR3F').onclick = () => run('R3F 코드 + GLB', async () => { const { exportR3F, exportGLB } = await import('./export4.js'); const o = state.viewer.active; o.viewerBg = state.viewer.bg.getHexString(); o.look = state.viewer.lookParams; download(new Blob([exportR3F(o, fx())], { type: 'text/plain' }), 'MatterScene.jsx'); download(await exportGLB(state.viewer.renderer, o), 'model.glb'); });
  for (const id of ['fxFloat', 'fxParallax', 'fxSpin']) $(id).onchange = () => { state.viewer.float = $('fxFloat').checked; };
}

/* ---------------- tabs ---------------- */
function wireTabs() {
  const others = ['scanTab', 'builderTab', 'aiTab', 'productTab', 'freeTab'];
  const sections = ['scanStudio', 'builderStudio', 'aiStudio', 'productStudio', 'freeStudio'];
  const show = () => {
    for (const s of sections) if ($(s)) $(s).hidden = true;
    document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.id === 'objTab'));
    $('objStudio').hidden = false; state.active = true; state.viewer?.resize();
  };
  $('objTab').onclick = show;
  for (const id of others) $(id).addEventListener('click', () => { state.active = false; $('objStudio').hidden = true; $('objTab').classList.remove('on'); }, true);
  const prevExport = $('export').onclick;
  $('export').onclick = e => { if (state.active && state.obj) { $('expHTML').click(); return; } prevExport?.(e); };
  show();
}

async function loadSample(name) {
  $('objStatus').textContent = `예시 '${SAMPLES[name]}' 사진을 불러오는 중…`;
  state.name = SAMPLES[name].split(' (')[0];
  const files = { front: 'front', side: 'right', top: 'top', bottom: 'bottom' };
  state.slots.back = { ...state.slots.back, img: null, seg: null, canvas: null }; setSlotStatus('back', 'empty'); drawThumb('back');
  $('objSide').value = 'right'; state.sideDir = 'right';
  await Promise.all(Object.entries(files).map(([k, f]) => loadSlot(k, `samples/${name}_${f}.webp`)));
  state.name = SAMPLES[name].split(' (')[0];
  await generate();
}

/* ---------------- graphic look ---------------- */
const LOOK_RANGES = [['envIntensity', '조명 세기', 0, 3, .01], ['envRot', '조명 회전', 0, 6.28, .01], ['exposure', '노출', .4, 2, .01], ['bloom', '블룸 (빛 번짐)', 0, 1.5, .01], ['bloomThreshold', '블룸 기준 밝기', 0, 1.2, .01], ['ca', '색수차', 0, 1.5, .01], ['grain', '그레인', 0, .2, .001], ['vignette', '비네팅', 0, 1, .01]];
function syncLookUI() {
  const p = state.viewer.lookParams; $('lookSel').value = state.viewer.lookKey; $('lookEnv').value = p.env; $('lookFloor').value = p.floor; $('lookBg0').value = p.bg[0]; $('lookBg1').value = p.bg[1]; $('lookShowEnv').checked = !!p.showEnv;
  const box = $('lookRanges'); box.replaceChildren();
  for (const [k, l, mn, mx, st] of LOOK_RANGES) {
    const row = document.createElement('div'); row.className = 'range'; const id = 'lookR-' + k;
    row.innerHTML = `<label for="${id}">${l}<output>${(+p[k] || 0).toFixed(2)}</output></label><input type="range" id="${id}" min="${mn}" max="${mx}" step="${st}" value="${p[k] ?? 0}">`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.oninput = () => { state.viewer.setLookParams({ [k]: +inp.value }); out.textContent = (+inp.value).toFixed(2); };
    box.append(row);
  }
}
function wireLook() {
  $('lookSel').onchange = async e => { await state.viewer.setLook(e.target.value); syncLookUI(); };
  $('lookEnv').onchange = e => state.viewer.setLookParams({ env: e.target.value });
  $('lookFloor').onchange = e => state.viewer.setLookParams({ floor: e.target.value });
  $('lookBg0').oninput = $('lookBg1').oninput = () => state.viewer.setLookParams({ bg: [$('lookBg0').value, $('lookBg1').value] });
  $('lookShowEnv').onchange = e => state.viewer.setLookParams({ showEnv: e.target.checked });
  state.viewer.lookReady.then(syncLookUI);
}

/* ---------------- init ---------------- */
export function init() {
  buildDOM(); buildSlots(); wireEditor(); wireExports();
  state.viewer = new ObjectViewer($('objCanvas'));
  state.viewer.onFallback = (why) => { $('objBadge').hidden = false; $('objBadge').textContent = why === 'lost' ? '그래픽 장치가 재시작됐어요 · 새로고침해 주세요' : '이 기기에서 후처리가 지원되지 않아 기본 렌더링으로 전환했어요'; };
  document.querySelectorAll('.obj-views button').forEach(b => b.onclick = () => state.viewer.setView(b.dataset.view));
  $('objBuild').onclick = () => generate();
  $('objAddSpace').onclick = () => generate({ add: true });
  $('objSide').onchange = e => { state.sideDir = e.target.value; SLOTS[1].hint = e.target.value === 'right' ? '오른쪽 옆면' : '왼쪽 옆면'; document.querySelector('#objInputs .obj-file:nth-child(2) small').textContent = SLOTS[1].hint; };
  $('objMat').onchange = e => { state.viewer.applyPreset(e.target.value); syncMaterialUI(); };
  $('objEst').onchange = e => state.viewer.showEstimated(e.target.checked);
  wireLook();
  $('objFull').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('objView').requestFullscreen();
  $('objSample').onchange = e => { if (e.target.value) loadSample(e.target.value); };
  wireTabs();
  loadSample('compact');
  window.MatterLab4 = { state, generate, loadSlot, loadSample };
}
