// library.js — 시트 내보내기, 저장/불러오기, 이펙트 목록, 시트 가져오기
// =================================================================
//                   스프라이트 시트 내보내기
// =================================================================
function cloneSys(s) {
  const c = makeSys(JSON.parse(JSON.stringify(s.params)));
  c._texture = s._texture;
  return c;
}

// 라이브 프리뷰를 건드리지 않고 복제본으로 시뮬레이션
function beginOffline() {
  const saved = { mainSys, extraSystems, recording };
  mainSys = cloneSys(mainSys);
  extraSystems = extraSystems.map(cloneSys);
  recording = true;
  return saved;
}
function endOffline(saved) {
  mainSys = saved.mainSys;
  extraSystems = saved.extraSystems;
  recording = saved.recording;
}
function offlineStep(dt) {
  updateSystem(mainSys, dt);
  for (const s of [...extraSystems]) updateSystem(s, dt);
}

// 합성 전체 재생 길이(초). 루프는 3초까지만 본다
function effectTotalTime() {
  const layers = [mainSys, ...extraSystems].map(s => s.params);
  return Math.max(0.3, Math.min(6, ...[Math.max(...layers.map(l => l.loop ? Math.min(3, layerEndTime(l)) : layerEndTime(l)))]));
}

function currentEffectObj() {
  const layers = [...extraSystems, mainSys].map(s => s.params);
  return { name: currentEffect || '', style: layers.some(l => l.pixelMode) ? 'pixel' : 'smooth',
           pixelScale: Math.max(...layers.map(l => l.pixelScale || 3)), bloom: fxBloom, camera: { ...fxCamera }, layers };
}

function applyEffect(effect) {
  pushUndo();
  const layers = effect.layers;
  mainSys.params = layers[layers.length - 1];
  mainSys._texture = null;
  extraSystems = layers.slice(0, -1).map(makeSys);
  fxBloom = effect.bloom;
  fxCamera = { ...effect.camera };
  savedCamera = { pitch: fxCamera.pitch, yaw: fxCamera.yaw };
  syncBloomUI();
  syncViewUI('saved');
  currentEffect = effect.name;
  refreshPanel();
  restart();
  if (!playing) togglePlay();
}

function syncBloomUI() {
  const el = document.getElementById('bloom-range');
  if (el) el.value = fxBloom;
}

// 이펙트 경계 측정 — 셀에 잘리지 않게 내보내기 배율을 정한다
function measureEffectExtent(T) {
  const saved = beginOffline();
  let ext = 8;
  try {
    for (let t = 0; t < T; t += 1 / 30) {
      offlineStep(1 / 30);
      for (const s of [mainSys, ...extraSystems]) {
        for (const p of s.particles) {
          const k = 1 + (s.params.stretch || 0) * 0.5;
          const reach = Math.max(Math.abs(p.x), Math.abs(p.y)) + Math.max(p.startSize, p.endSize) * k / 2;
          if (reach > ext) ext = reach;
        }
      }
    }
  } finally { endOffline(saved); }
  return ext;
}

async function exportSpriteSheet() {
  const cols = Math.max(1, parseInt(document.getElementById('sheet-cols').value) || 6);
  const rows = Math.max(1, parseInt(document.getElementById('sheet-rows').value) || 5);
  const cellSize = Math.max(32, parseInt(document.getElementById('sheet-cell').value) || 256);
  const reqFps = Math.max(1, parseInt(document.getElementById('sheet-fps').value) || 30);
  const total = cols * rows;
  const status = document.getElementById('sheet-status');

  // 비루프는 프레임 수에 전체 재생 길이를 맞춘다 — 끝이 잘리지 않게
  const T = effectTotalTime();
  const allLoop = [mainSys, ...extraSystems].every(s => s.params.loop);
  const fps = allLoop ? reqFps : Math.max(1, Math.round(total / T * 100) / 100);
  const view = Math.min(1, (cellSize / 2 - 2) / measureEffectExtent(T));

  const recCanvas = document.createElement('canvas');
  recCanvas.width = recCanvas.height = cellSize;
  const rctx = recCanvas.getContext('2d');
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = cols * cellSize;
  sheetCanvas.height = rows * cellSize;
  const sctx = sheetCanvas.getContext('2d');

  const dt = 1 / fps;
  const SUBSTEPS = 4;
  const saved = beginOffline();
  status.textContent = '녹화 준비...';

  try {
    for (let i = 0; i < total; i++) {
      for (let k = 0; k < SUBSTEPS; k++) offlineStep(dt / SUBSTEPS);
      rctx.clearRect(0, 0, cellSize, cellSize);
      composeFrame(rctx, cellSize, cellSize, cellSize / 2, cellSize / 2, view);
      sctx.drawImage(recCanvas, (i % cols) * cellSize, Math.floor(i / cols) * cellSize);
      status.textContent = `녹화 중 ${i + 1}/${total}`;
      if (i % 4 === 0) await new Promise(r => setTimeout(r, 0));
    }
  } catch (e) {
    status.textContent = '오류: ' + e.message;
    console.error(e);
    endOffline(saved);
    return;
  }
  const fxObj = serializeEffect(currentEffectObj());
  endOffline(saved);

  status.textContent = '저장 중...';
  const base = (currentEffect || 'sparklet_fx').replace(/[^\w가-힣-]+/g, '_');

  // Aseprite 호환 JSON (Phaser atlas / Godot·Unity Aseprite 임포터가 읽음)
  const frames = [];
  for (let i = 0; i < total; i++) {
    frames.push({
      filename: `${base}_${i}`,
      frame: { x: (i % cols) * cellSize, y: Math.floor(i / cols) * cellSize, w: cellSize, h: cellSize },
      rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cellSize, h: cellSize },
      sourceSize: { w: cellSize, h: cellSize },
      duration: Math.round(1000 / fps),
    });
  }
  const meta = {
    frames,
    meta: {
      app: 'sparklet', image: `${base}.png`, format: 'RGBA8888',
      size: { w: sheetCanvas.width, h: sheetCanvas.height }, scale: '1',
      frameTags: [{ name: base, from: 0, to: total - 1, direction: 'forward' }],
      sparklet: { fps, loop: allLoop, cols, rows, cellSize, pivot: { x: 0.5, y: 0.5 }, worldScale: view, effect: fxObj },
    },
  };

  try {
    const r = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: base, png: sheetCanvas.toDataURL('image/png'), meta }),
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || 'export ' + r.status);
    status.textContent = `✓ ${total}프레임 ${fps}fps, 배율 ${view.toFixed(2)} → ${data.path}`;
  } catch (e) {
    status.textContent = '저장 실패: ' + e.message;
    console.error(e);
  }
}

// =================================================================
//                       저장 / 불러오기
// =================================================================
// ---- 이펙트 라이브러리 (standalone/effects/*.json) ----
let _fxLibraryLoaded = false;

async function loadEffectLibrary(force) {
  if (_fxLibraryLoaded && !force) return;
  const status = document.getElementById('fx-lib-status');
  const wrap = document.getElementById('fx-library');
  if (location.protocol === 'file:') { status.textContent = 'run.bat 으로 열면 저장한 이펙트가 보입니다'; return; }
  await sheetLibraryReady;
  const list = await fetch('/effects').then(r => r.json());
  wrap.innerHTML = '';
  for (const item of list) {
    const effect = normalizeEffect(item.effect);
    effect.name = effect.name || item.name;
    const card = document.createElement('div');
    card.className = 'variant';
    card.style.cssText = 'cursor:pointer;border:1px solid var(--border);margin-top:6px;padding:4px;background:#111;';
    const img = document.createElement('img');
    img.src = renderContactSheet(effect, 4, 1, 80, 60);
    img.style.cssText = 'width:100%;display:block;';
    const cap = document.createElement('div');
    cap.className = 'hint';
    cap.textContent = effect.name;
    card.append(img, cap);
    card.onclick = () => {
      applyEffect(normalizeEffect(item.effect));
      document.getElementById('llm-tune').style.display = '';
      _lastLLMPrompt = _lastLLMPrompt || effect.name;
    };
    wrap.appendChild(card);
  }
  status.textContent = list.length ? '' : '저장한 이펙트가 없습니다';
  _fxLibraryLoaded = true;
}

async function saveCurrentEffect() {
  const status = document.getElementById('fx-lib-status');
  const name = currentEffect || ('이펙트 ' + new Date().toLocaleTimeString());
  const r = await fetch('/effects', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, effect: serializeEffect(currentEffectObj()) }) });
  status.textContent = r.ok ? '✓ 저장: ' + name : '저장 실패';
  if (r.ok) loadEffectLibrary(true);
}

// ---- 시트 가져오기 UI ----
const sliceState = { img: null, skip: new Set() };

function drawSlicePreview() {
  const { img, skip } = sliceState;
  if (!img) return;
  const cols = Math.max(1, parseInt(document.getElementById('slice-cols').value, 10) || 1);
  const rows = Math.max(1, parseInt(document.getElementById('slice-rows').value, 10) || 1);
  const { c, w, h } = imageToCanvas(img);
  const frames = sliceFrames(canvasLuminance(c, w, h), w, h, cols, rows);
  const pv = document.getElementById('slice-preview');
  const k = 320 / w;
  pv.width = 320; pv.height = Math.round(h * k);
  const p = pv.getContext('2d');
  p.drawImage(img, 0, 0, pv.width, pv.height);
  frames.forEach((f, i) => {
    p.strokeStyle = '#444';
    p.strokeRect(f.cx0 * k + 0.5, f.cy0 * k + 0.5, (f.cx1 - f.cx0) * k, (f.cy1 - f.cy0) * k);
    if (skip.has(i) || f.empty) {
      p.fillStyle = 'rgba(200,40,40,0.55)';
      p.fillRect(f.cx0 * k, f.cy0 * k, (f.cx1 - f.cx0) * k, (f.cy1 - f.cy0) * k);
    } else {
      p.strokeStyle = '#4f8';
      p.strokeRect(f.x0 * k + 0.5, f.y0 * k + 0.5, (f.x1 - f.x0) * k, (f.y1 - f.y0) * k);
    }
  });
  const used = frames.filter((f, i) => !f.empty && !skip.has(i)).length;
  document.getElementById('slice-info').textContent = `${cols}×${rows} · 사용 ${used}프레임 · 칸을 누르면 제외`;
}

document.getElementById('slice-input').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    sliceState.img = img;
    sliceState.skip = new Set();
    const { c, w, h } = imageToCanvas(img);
    const g = detectSheetGrid(canvasLuminance(c, w, h), w, h);
    document.getElementById('slice-cols').value = g.cols > 1 ? g.cols : 4;
    document.getElementById('slice-rows').value = g.rows > 1 ? g.rows : 4;
    document.getElementById('slice-panel').style.display = '';
    drawSlicePreview();
  };
  img.src = URL.createObjectURL(f);
};
for (const id of ['slice-cols', 'slice-rows']) {
  document.getElementById(id).oninput = () => { sliceState.skip = new Set(); drawSlicePreview(); };
}
document.getElementById('slice-preview').onclick = e => {
  const pv = e.target, rect = pv.getBoundingClientRect();
  const cols = parseInt(document.getElementById('slice-cols').value, 10) || 1;
  const rows = parseInt(document.getElementById('slice-rows').value, 10) || 1;
  const i = Math.floor((e.clientY - rect.top) / rect.height * rows) * cols
          + Math.floor((e.clientX - rect.left) / rect.width * cols);
  if (sliceState.skip.has(i)) sliceState.skip.delete(i); else sliceState.skip.add(i);
  drawSlicePreview();
};

function applySlicedSheet() {
  const cols = parseInt(document.getElementById('slice-cols').value, 10) || 1;
  const rows = parseInt(document.getElementById('slice-rows').value, 10) || 1;
  const align = document.getElementById('slice-align').value;
  const sliced = sliceSheetImage(sliceState.img, cols, rows, align, sliceState.skip);
  const p = defaultParams();
  Object.assign(p, {
    sheet: true, sheetCols: sliced.cols, sheetRows: sliced.rows, sheetFrames: sliced.frames,
    sheetTint: true, sheetGrad: true, sheetGlow: true, blendMode: 'Additive',
    shape: 'Point', rate: 0, burstCount: 1, burstSpread: 0, speedMin: 0, speedMax: 0,
    lifetimeMin: sliced.frames / 15, lifetimeMax: sliced.frames / 15, duration: sliced.frames / 15, loop: true,
    sizeStart: 360, sizeEnd: 360, sizeRandom: 0, sizeCurve: 'linear', fadeIn: 0, fadeOut: 0.1, outlineWidth: 0,
    colorKeys: [{ r:1,g:0.45,b:0.1,a:1,t:0 }, { r:1,g:0.45,b:0.1,a:1,t:0.8 }, { r:1,g:0.45,b:0.1,a:0,t:1 }],
  });
  pushUndo();
  extraSystems = [];
  mainSys.params = p;
  mainSys._texture = makeMaskTexture(sliced.canvas);
  currentEffect = '가져온 시트';
  refreshPanel();
  restart();
  if (!playing) togglePlay();
}

function saveJson() {
  const data = JSON.stringify(serializeEffect(currentEffectObj()), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'particle.json';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('load-input').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyEffect(normalizeEffect(JSON.parse(reader.result)));
    } catch (err) {
      alert('JSON 파싱 실패: ' + err);
    }
  };
  reader.readAsText(f);
};
