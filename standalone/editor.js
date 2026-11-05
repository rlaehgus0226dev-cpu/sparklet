// editor.js — 시뮬레이션, 2D 합성 렌더, 재생 루프, 세부 조정 패널

function makeSys(p) {
  return { params: p, particles: [], systemTime: 0, emitAccum: 0, burstDone: false, burstEmitted: 0,
           projX: 0, projY: 0, projT: 0, projDone: false };
}

// 합성: extraSystems 가 뒤쪽 레이어, mainSys 가 맨 위 레이어(세부 조정 대상)
let mainSys = makeSys(defaultParams());
let extraSystems = [];
let currentEffect = '';

// 세부 조정 대상 레이어 (null 이면 맨 위 레이어). sys.hidden 은 미리보기에서만 숨김 — 저장·내보내기에는 포함
let editSys = null;
function allSystems() { return [...extraSystems, mainSys]; }   // 뒤 → 앞(맨 위) 순서
function editTarget() { return editSys && allSystems().includes(editSys) ? editSys : mainSys; }

let playing = false;
let recording = false;      // 오프라인 렌더 중
let stepping = false;
let bgMode = 'dark';
let gridOn = false;
let previewStepFps = 0;     // 0=부드럽게, >0이면 해당 fps로 끊어 재생
let stepAccum = 0;
const PREVIEW_FPS_CYCLE = [0, 12, 8, 6];
const collapsedGroups = new Set();
let currentPaletteName = 'none';
const frameHistory = [];
let lastTime = 0;
let dragStart = null;

let fitView = false;        // 비교 화면용: 800x600 기준 영역을 캔버스에 맞춤
let fxCamera = { view: '2d', pitch: 30, yaw: 0, fov: 35 };
let fxBloom = 0.5;          // light 버퍼 블룸 강도 (0~1.5)
let fxShakeT = 0, fxShakeMax = 0, fxShakeDurTotal = 0;
let fxFlashT = 0, fxFlashMax = 0, fxFlashDurTotal = 0;
let fxHitStop = 0;

// ═══════════════════════ Undo / Redo ═══════════════════════
const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 50;

function effectSnapshot() {
  return JSON.stringify(currentEffectObj());
}

function restoreSnapshot(json) {
  const fx = JSON.parse(json);
  // 레이어 수가 같으면 편집 대상·숨김 상태를 위치 기준으로 유지
  const prev = allSystems();
  const editIdx = prev.indexOf(editTarget());
  const hiddenIdx = prev.map(s => !!s.hidden);
  mainSys.params = fx.layers[fx.layers.length - 1];
  extraSystems = fx.layers.slice(0, -1).map(makeSys);
  const now = allSystems();
  if (now.length === prev.length) {
    now.forEach((s, i) => { s.hidden = hiddenIdx[i]; });
    editSys = now[editIdx] || null;
  } else {
    now.forEach(s => { s.hidden = false; });
    editSys = null;
  }
  fxBloom = fx.bloom;
  fxCamera = fx.camera;
  currentEffect = fx.name;
  syncBloomUI();
  syncViewUI();
  refreshPanel();
  restart();
}

function pushUndo() {
  undoStack.push(effectSnapshot());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0; // redo 초기화
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(effectSnapshot());
  restoreSnapshot(undoStack.pop());
  showFlash('↩ Undo');
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(effectSnapshot());
  restoreSnapshot(redoStack.pop());
  showFlash('↪ Redo');
}

// Ctrl+Z / Ctrl+Y 키보드 바인딩
document.addEventListener('keydown', e => {
  // 입력 필드에서는 무시
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
  if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
});

function triggerLayerFX(p) {
  if (p.shakeAmount > 0) {
    fxShakeMax = p.shakeAmount;
    fxShakeDurTotal = Math.max(0.01, p.shakeDuration || 0.3);
    fxShakeT = fxShakeDurTotal;
  }
  if (p.flashAmount > 0) {
    fxFlashMax = p.flashAmount;
    fxFlashDurTotal = Math.max(0.01, p.flashDuration || 0.12);
    fxFlashT = fxFlashDurTotal;
  }
  if (p.hitStop > 0) fxHitStop = p.hitStop;
}

function triggerFX() {
  fxShakeT = 0; fxFlashT = 0; fxHitStop = 0;
  for (const s of [mainSys, ...extraSystems]) {
    if (!(s.params.startDelay > 0)) triggerLayerFX(s.params);
  }
}

// 세부 조정 패널이 쓰는 레이어 파라미터 (레이어 목록에서 고른 레이어, 기본은 맨 위)
const params = new Proxy({}, {
  get(_, k) { return editTarget().params[k]; },
  set(_, k, v) { editTarget().params[k] = v; return true; },
  has(_, k) { return k in editTarget().params; },
  ownKeys()  { return Object.keys(editTarget().params); },
  getOwnPropertyDescriptor(_, k) {
    return { enumerable: true, configurable: true, value: editTarget().params[k] };
  },
});

// =================================================================
//                        Canvas / 렌더
// =================================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  canvas.width = Math.max(200, Math.floor(rect.width - 20));
  canvas.height = Math.max(200, Math.floor(rect.height - 20));
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 30);

// =================================================================
//                  마우스 드래그 → 투사체 방향/거리
// =================================================================
let orbitLast = null;
canvas.addEventListener('mousedown', e => {
  if (fxCamera.view === '3d') { orbitLast = { x: e.clientX, y: e.clientY }; return; }
  if (!editTarget().params.projectile) return;
  const rect = canvas.getBoundingClientRect();
  dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});
canvas.addEventListener('wheel', e => {
  if (fxCamera.view !== '3d') return;
  e.preventDefault();
  fxCamera.fov = Math.max(0, Math.min(90, fxCamera.fov + Math.sign(e.deltaY) * 5));
}, { passive: false });
canvas.addEventListener('mousemove', e => {
  if (orbitLast) {
    fxCamera.yaw = Math.max(-180, Math.min(180, fxCamera.yaw + (e.clientX - orbitLast.x) * 0.4));
    fxCamera.pitch = Math.max(-89, Math.min(89, fxCamera.pitch + (e.clientY - orbitLast.y) * 0.4));
    orbitLast = { x: e.clientX, y: e.clientY };
    syncViewUI();
    return;
  }
  if (!dragStart) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const dx = mx - cx, dy = my - cy;
  const dist = Math.min(800, Math.sqrt(dx * dx + dy * dy));
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  editTarget().params.projDistance = Math.max(50, dist);
  editTarget().params.projAngle = Math.round(angle);
  restart();
});
canvas.addEventListener('mouseup', () => { dragStart = null; orbitLast = null; });
canvas.addEventListener('mouseleave', () => { dragStart = null; orbitLast = null; });

// =================================================================
//                         파티클 엔진
// =================================================================

function spawnParticle(sys) {
  const pr = sys.params;
  const p = {};
  p.life = 0;
  p.maxLife = rand(pr.lifetimeMin, pr.lifetimeMax);

  // 위치 + 기본 방향 계산
  let px = 0, py = 0, dx = 0, dy = 0;
  switch (pr.shape) {
    case 'Point': {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a); dy = Math.sin(a);
      break;
    }
    case 'Circle': {
      const a = Math.random() * Math.PI * 2;
      px = Math.cos(a) * pr.shapeRadius;
      py = Math.sin(a) * pr.shapeRadius;
      dx = Math.cos(a); dy = Math.sin(a);
      break;
    }
    case 'Disc': {
      // 원 내부 균등 분포 (√random 으로 면적 균등)
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * pr.shapeRadius;
      px = Math.cos(a) * r;
      py = Math.sin(a) * r;
      dx = Math.cos(a); dy = Math.sin(a);
      break;
    }
    case 'Box': {
      px = (Math.random() - 0.5) * pr.shapeBoxW;
      py = (Math.random() - 0.5) * pr.shapeBoxH;
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a); dy = Math.sin(a);
      break;
    }
    case 'Cone': {
      // Cone은 emitAngle 방향으로 coneAngle 내에서 분출
      const half = pr.coneAngle * Math.PI / 180;
      const a = (Math.random() - 0.5) * 2 * half + pr.emitAngle * Math.PI / 180;
      dx = Math.cos(a); dy = Math.sin(a);
      break;
    }
  }
  px += pr.offsetX;
  py += pr.offsetY;
  // 투사체 모드: 이미터 위치 오프셋 적용
  if (pr.projectile) {
    px += sys.projX;
    py += sys.projY;
  }
  p.x = px;
  p.y = py;
  p.z = pr.offsetZ;
  p.vz = pr.directionZ;

  const speed = rand(pr.speedMin, pr.speedMax);
  p.vx = dx * speed + pr.directionX;
  p.vy = dy * speed - pr.directionY; // 사용자 관점 +Y=위 → canvas -y

  const szFactor = rand(1 - pr.sizeRandom, 1 + pr.sizeRandom);
  p.startSize = pr.sizeStart * szFactor;
  p.endSize = pr.sizeEnd;

  p.rotation = (pr.startRotation + (Math.random() * 2 - 1) * pr.rotationRandom) * Math.PI / 180;
  p.rotSpeed = pr.rotationSpeed * Math.PI / 180;

  sys.particles.push(p);
}

function updateSystem(sys, dt) {
  const pr = sys.params;
  if (pr.startDelay > 0 && !sys._started) {
    sys._delayT = (sys._delayT || 0) + dt;
    if (sys._delayT < pr.startDelay) return;
    sys._started = true;
    if (!recording) triggerLayerFX(pr);
  }
  sys.systemTime += dt;

  // 투사체 위치 업데이트
  if (pr.projectile && !sys.projDone) {
    const travelTime = pr.projDistance / pr.projSpeed;
    sys.projT = Math.min(1, sys.systemTime / travelTime);
    const pos = projectilePos(pr, sys.projT);
    sys.projX = pos.x;
    sys.projY = pos.y;
    if (sys.projT >= 1) {
      sys.projDone = true;
    }
  }

  // 방출 — 투사체 모드에서는 이동 완료까지 자동 연장
  const projBlocked = pr.projectile && sys.projDone;
  const effectiveDuration = pr.projectile
    ? Math.max(pr.duration, pr.projDistance / pr.projSpeed)
    : pr.duration;
  const emitActive = !projBlocked && (pr.loop || sys.systemTime < effectiveDuration);
  if (emitActive) {
    if (pr.burstCount > 0) {
      if (pr.burstSpread > 0) {
        // 분산 버스트 — burstSpread 초 동안 점진적 스폰
        const progress = Math.min(1, sys.systemTime / pr.burstSpread);
        const wanted = Math.floor(progress * pr.burstCount);
        while (sys.burstEmitted < wanted) {
          spawnParticle(sys);
          sys.burstEmitted++;
        }
      } else if (!sys.burstDone) {
        for (let i = 0; i < pr.burstCount; i++) spawnParticle(sys);
        sys.burstDone = true;
      }
    }
    if (pr.rate > 0) {
      sys.emitAccum += dt * pr.rate;
      while (sys.emitAccum >= 1) { spawnParticle(sys); sys.emitAccum -= 1; }
    }
  }

  // 루프 처리
  if (pr.loop && sys.systemTime >= effectiveDuration) {
    sys.systemTime -= effectiveDuration;
    sys.burstDone = false;
    sys.burstEmitted = 0;
    sys.projT = 0; sys.projDone = false; sys.projX = 0; sys.projY = 0;
  }

  // 비루프 자동 리스타트(편의) — 단일 시스템만. 합성은 advanceSim 이 한꺼번에 처리
  if (sys === mainSys && extraSystems.length === 0 && !recording && !pr.loop && sys.systemTime >= effectiveDuration + 0.5 && sys.particles.length === 0) {
    sys.systemTime = 0;
    sys.burstDone = false;
    sys.burstEmitted = 0;
    sys.projT = 0; sys.projDone = false; sys.projX = 0; sys.projY = 0;
  }

  physicsStep(sys, dt);
}

// 2D 스프라이트 모양 렌더
function drawShape(c, shape, r, fillStyle, outlineW) {
  if (r <= 0) return;
  c.fillStyle = fillStyle;
  c.beginPath();
  let useEvenOdd = false;
  switch (shape) {
    case 'square':
      c.rect(-r, -r, r * 2, r * 2);
      break;
    case 'diamond':
      c.moveTo(0, -r); c.lineTo(r, 0);
      c.lineTo(0, r);  c.lineTo(-r, 0);
      c.closePath();
      break;
    case 'triangle':
      c.moveTo(0, -r);
      c.lineTo(r * 0.87, r * 0.5);
      c.lineTo(-r * 0.87, r * 0.5);
      c.closePath();
      break;
    case 'star': {
      const pts = 5, outer = r, inner = r * 0.45;
      for (let i = 0; i < pts * 2; i++) {
        const rad = (i & 1) ? inner : outer;
        const ang = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      break;
    }
    case 'teardrop':
      c.moveTo(0, -r);
      c.bezierCurveTo(r, -r * 0.6, r, r * 0.4, 0, r);
      c.bezierCurveTo(-r, r * 0.4, -r, -r * 0.6, 0, -r);
      break;
    case 'ring':
      c.arc(0, 0, r, 0, Math.PI * 2, false);
      c.moveTo(r * 0.55, 0);
      c.arc(0, 0, r * 0.55, 0, Math.PI * 2, true);
      useEvenOdd = true;
      break;
    case 'cross': {
      const bar = r * 0.35;
      c.rect(-bar, -r, bar * 2, r * 2);
      c.rect(-r, -bar, r * 2, bar * 2);
      break;
    }
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      break;
    case 'spark': {
      // 4각 섬광 — 긴 꼭짓점 + 좁은 내부
      const pts = 4, outer = r, inner = r * 0.22;
      for (let i = 0; i < pts * 2; i++) {
        const rad = (i & 1) ? inner : outer;
        const ang = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      break;
    }
    case 'crescent':
      c.arc(0, 0, r, 0, Math.PI * 2, false);
      c.moveTo(r * 0.35 + r * 0.85, 0);
      c.arc(r * 0.35, 0, r * 0.85, 0, Math.PI * 2, true);
      useEvenOdd = true;
      break;
    case 'flame':
      // 비대칭 불꽃 — 상단 얇고 하단 풍성
      c.moveTo(0, -r * 1.1);
      c.bezierCurveTo(r * 0.45, -r * 0.5, r * 0.95, r * 0.3, 0, r);
      c.bezierCurveTo(-r * 0.95, r * 0.3, -r * 0.45, -r * 0.5, 0, -r * 1.1);
      break;
    case 'pentagon': {
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      break;
    }
    case 'octagon': {
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      break;
    }
    case 'bar':
      c.rect(-r, -r * 0.25, r * 2, r * 0.5);
      break;
    case 'pill': {
      const w = r, h = r * 0.4;
      c.moveTo(-w + h, -h);
      c.lineTo(w - h, -h);
      c.arc(w - h, 0, h, -Math.PI / 2, Math.PI / 2);
      c.lineTo(-w + h, h);
      c.arc(-w + h, 0, h, Math.PI / 2, -Math.PI / 2);
      c.closePath();
      break;
    }
    case 'ellipse':
      c.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2);
      break;
    case 'bubble':
      c.arc(0, 0, r, 0, Math.PI * 2, false);
      c.moveTo(r * 0.85, 0);
      c.arc(0, 0, r * 0.85, 0, Math.PI * 2, true);
      useEvenOdd = true;
      break;
    case 'heart': {
      const R_ = r;
      c.moveTo(0, -R_ * 0.3);
      c.bezierCurveTo(-R_, -R_, -R_, R_ * 0.3, 0, R_);
      c.bezierCurveTo(R_, R_ * 0.3, R_, -R_, 0, -R_ * 0.3);
      break;
    }
    case 'snowflake': {
      const thick = r * 0.15;
      for (let i = 0; i < 3; i++) {
        c.save();
        c.rotate((i / 6) * Math.PI * 2);
        c.rect(-thick, -r, thick * 2, r * 2);
        c.restore();
      }
      c.moveTo(r * 0.3, 0);
      c.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      break;
    }
    case 'bolt': {
      c.moveTo(0, -r);
      c.lineTo(-r * 0.4, -r * 0.2);
      c.lineTo(0, -r * 0.2);
      c.lineTo(-r * 0.4, r);
      c.lineTo(r * 0.4, -r * 0.1);
      c.lineTo(0, -r * 0.1);
      c.closePath();
      break;
    }
    case 'shuriken': {
      const pts = 4, outer = r, inner = r * 0.5;
      const offset = Math.PI / 4;
      for (let i = 0; i < pts * 2; i++) {
        const rad = (i & 1) ? inner : outer;
        const ang = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2 + offset;
        const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      break;
    }
    case 'arrow': {
      const headH = r * 0.7, tailW = r * 0.25;
      c.moveTo(0, -r);
      c.lineTo(r, -r + headH);
      c.lineTo(tailW, -r + headH);
      c.lineTo(tailW, r);
      c.lineTo(-tailW, r);
      c.lineTo(-tailW, -r + headH);
      c.lineTo(-r, -r + headH);
      c.closePath();
      break;
    }
    case 'leaf':
      c.moveTo(-r, 0);
      c.quadraticCurveTo(0, -r * 0.6, r, 0);
      c.quadraticCurveTo(0, r * 0.6, -r, 0);
      break;
    case 'chevron': {
      c.moveTo(-r, -r);
      c.lineTo(0, -r * 0.3);
      c.lineTo(r, 0);
      c.lineTo(0, r * 0.3);
      c.lineTo(-r, r);
      c.lineTo(-r * 0.3, 0);
      c.closePath();
      break;
    }
    case 'shield':
      c.moveTo(-r, -r);
      c.lineTo(r, -r);
      c.lineTo(r, r * 0.2);
      c.bezierCurveTo(r, r * 0.7, r * 0.5, r, 0, r);
      c.bezierCurveTo(-r * 0.5, r, -r, r * 0.7, -r, r * 0.2);
      c.closePath();
      break;
    case 'sparkle': {
      const pts = 4, outer = r, inner = r * 0.1;
      for (let i = 0; i < pts * 2; i++) {
        const rad = (i & 1) ? inner : outer;
        const ang = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      break;
    }
    case 'slash': {
      // 검 휘두름 호 — 양 끝 뾰족, 가운데 두꺼운 초승달 밴드 (가로로 휘는 베기)
      c.moveTo(-r, 0);
      c.quadraticCurveTo(0, -r * 0.9, r, 0);    // 바깥(위) 곡선
      c.quadraticCurveTo(0, -r * 0.35, -r, 0);  // 안쪽(아래) 곡선 — 밴드 두께
      c.closePath();
      break;
    }
    case 'circle':
    default:
      c.arc(0, 0, r, 0, Math.PI * 2);
      break;
  }
  if (useEvenOdd) c.fill('evenodd'); else c.fill();
  if (outlineW > 0 && r > 2) {
    // 작은 파티클은 외곽선이 뭉개지므로 자동 축소
    const effW = r < 6 ? Math.min(outlineW, 1) : outlineW;
    c.lineWidth = effW;
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.stroke();
  }
}

let _paletteCache = null; // 현재 선택된 팔레트 (배열 형태)

function quantizeColor(r, g, b) {
  if (!_paletteCache) return null;
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < _paletteCache.length; i++) {
    const p = _paletteCache[i];
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = dr*dr + dg*dg + db*db;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return _paletteCache[bestIdx];
}

// 외부 시트 PNG(흑백 마스크)를 → 흰 실루엣 + 알파=휘도 캔버스로 변환.
// 검정 배경이 투명해져 Alpha/Additive 양쪽에서 자연스럽게 그려지고, 틴팅도 가능.
let sheetLibraryReady = null;
const sheetLibrary = {};  // SHEET_ASSETS 이름 → 슬라이스된 마스크 텍스처

function canvasLuminance(c, w, h) {
  const d = c.getImageData(0, 0, w, h).data;
  const lum = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
    lum[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) * (d[i + 3] / 255);
  }
  return lum;
}

function imageToCanvas(img) {
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth || img.width;
  cv.height = img.naturalHeight || img.height;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0);
  return { cv, c, w: cv.width, h: cv.height };
}

// 시트를 잘라 기준점을 맞춘 균일 격자 시트로 재구성. skip=제외할 프레임 인덱스 Set
function sliceSheetImage(img, cols, rows, align, skip) {
  const { cv, c, w, h } = imageToCanvas(img);
  const lum = canvasLuminance(c, w, h);
  const frames = sliceFrames(lum, w, h, cols, rows).filter((f, i) => !(skip && skip.has(i)));
  const layout = layoutSlices(frames, align);
  if (layout.frames.length === 0) throw new Error('시트에서 프레임을 찾지 못함');
  const outCols = Math.ceil(Math.sqrt(layout.frames.length));
  const outRows = Math.ceil(layout.frames.length / outCols);
  const out = document.createElement('canvas');
  out.width = outCols * layout.size;
  out.height = outRows * layout.size;
  const oc = out.getContext('2d');
  oc.fillStyle = '#000';
  oc.fillRect(0, 0, out.width, out.height);
  layout.frames.forEach((f, i) => {
    const cellX = (i % outCols) * layout.size, cellY = Math.floor(i / outCols) * layout.size;
    oc.save();
    oc.beginPath();
    oc.rect(cellX, cellY, layout.size, layout.size);
    oc.clip();
    oc.drawImage(cv, f.sx, f.sy, f.sw, f.sh, cellX + f.dx, cellY + f.dy, f.sw, f.sh);
    oc.restore();
  });
  return { canvas: out, cols: outCols, rows: outRows, frames: layout.frames.length, cell: layout.size };
}

// 내장 시트 로드 (브리지로 열었을 때만 — file:// 은 픽셀 읽기가 막힘)
function loadSheetAsset(name) {
  return new Promise(resolve => {
    const a = SHEET_ASSETS[name];
    const img = new Image();
    img.onload = () => {
      const sliced = sliceSheetImage(img, a.cols, a.rows, a.align);
      sheetLibrary[name] = makeMaskTexture(sliced.canvas);
      resolve();
    };
    img.onerror = () => { console.warn('[sheet] 로드 실패', name); resolve(); };
    img.src = 'assets/ai/' + name + '.png?v=' + Date.now();
  });
}

async function loadSheetLibrary() {
  if (location.protocol === 'file:') return;
  const extra = await fetch('assets/ai/manifest.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  Object.assign(SHEET_ASSETS, extra);
  await Promise.all(Object.keys(SHEET_ASSETS).map(loadSheetAsset));
}

function makeMaskTexture(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  try {
    const id = cx.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      // 어두운 잔여물(격자선, 압축 노이즈)은 버리고 나머지를 0~255 로 다시 편다
      const a = Math.max(0, lum - 30) * (255 / 225) * (d[i + 3] / 255);
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = a;
    }
    cx.putImageData(id, 0, 0);
  } catch (e) { /* 보안상 readback 실패 시 원본 그대로 사용 */ }
  return cv;
}

// 플립북 한 프레임 틴팅용 재사용 오프스크린 (프레임이 커도 cap 으로 축소)
let _sheetTintCv = null, _sheetTintCx = null;
function getSheetTintCanvas(fw, fh, cap) {
  cap = cap || 512;
  let w = Math.max(1, Math.round(fw)), h = Math.max(1, Math.round(fh));
  if (w > cap || h > cap) { const s = cap / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
  if (!_sheetTintCv) { _sheetTintCv = document.createElement('canvas'); _sheetTintCx = _sheetTintCv.getContext('2d'); }
  if (_sheetTintCv.width !== w || _sheetTintCv.height !== h) { _sheetTintCv.width = w; _sheetTintCv.height = h; }
  return { canvas: _sheetTintCv, ctx: _sheetTintCx, w, h };
}

// 그라디언트맵 컬러라이즈 — 마스크 휘도(=알파)를 가장자리색→흰 코어 램프로 매핑.
// Unity GradientMap 셰이더의 납작하지 않은 색감을 근사. 칠한 프레임 캔버스를 반환.
// 색이 입혀진 프레임 캐시 — 픽셀 순회는 프레임·색 조합당 한 번만
const colorizedFrames = new WeakMap();
const COLORIZED_MAX = 1024;
function colorizeSheetFrame(tex, sxp, syp, fw, fh, r8, g8, b8, cutout) {
  let perTex = colorizedFrames.get(tex);
  if (!perTex) { perTex = new Map(); colorizedFrames.set(tex, perTex); }
  const key = `${sxp}|${syp}|${r8 >> 3}|${g8 >> 3}|${b8 >> 3}|${cutout ? 1 : 0}`;
  let hit = perTex.get(key);
  if (hit) return hit;
  const src = paintSheetFrame(tex, sxp, syp, fw, fh, r8, g8, b8, cutout);
  const cv = document.createElement('canvas');
  cv.width = src.w; cv.height = src.h;
  cv.getContext('2d').drawImage(src.canvas, 0, 0);
  hit = { canvas: cv, w: src.w, h: src.h };
  if (perTex.size >= COLORIZED_MAX) perTex.clear();
  perTex.set(key, hit);
  return hit;
}

function paintSheetFrame(tex, sxp, syp, fw, fh, r8, g8, b8, cutout) {
  const tmp = getSheetTintCanvas(fw, fh, 512); // 픽셀 순회용 — 결과를 캐시하므로 해상도 우선
  const tcx = tmp.ctx;
  tcx.globalCompositeOperation = 'copy';
  tcx.drawImage(tex, sxp, syp, fw, fh, 0, 0, tmp.w, tmp.h);
  const id = tcx.getImageData(0, 0, tmp.w, tmp.h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    const t = a / 255;                       // 마스크 휘도 (makeMaskTexture가 알파=휘도로 세팅)
    if (cutout) {
      // 면을 불투명하게 — 어두운 곳은 그림자색, 밝은 곳은 본색. 가장자리만 살짝 부드럽게
      const shade = 0.45 + 0.55 * Math.min(1, t * 1.6);
      d[i] = r8 * shade; d[i + 1] = g8 * shade; d[i + 2] = b8 * shade;
      d[i + 3] = Math.min(255, Math.max(0, (t - 0.08) / 0.1) * 255);
      continue;
    }
    // 마스크 내부는 대부분 균일 흰색 → 코어 화이트닝은 가장 밝은 끝부분만 약하게(색 보존)
    const core = t <= 0.7 ? 0 : (t - 0.7) / 0.3;
    let r = r8 * t, g = g8 * t, b = b8 * t;  // 가장자리(어두운 곳)는 칙칙→밝은 곳은 본색
    d[i]     = r + (255 - r) * core * 0.25;
    d[i + 1] = g + (255 - g) * core * 0.25;
    d[i + 2] = b + (255 - b) * core * 0.25;  // 알파는 그대로(실루엣 유지)
  }
  tcx.putImageData(id, 0, 0);
  return tmp;
}

const softSprites = new Map();
function getSoftSprite(r8, g8, b8) {
  const key = ((r8 >> 3) << 10) | ((g8 >> 3) << 5) | (b8 >> 3);
  let cv = softSprites.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  const rgb = `${r8},${g8},${b8}`;
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.35, `rgba(${rgb},0.62)`);
  g.addColorStop(0.7, `rgba(${rgb},0.16)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  if (softSprites.size > 600) softSprites.clear();
  softSprites.set(key, cv);
  return cv;
}

function drawSystem(sys, cx, cy, c) {
  c = c || ctx;
  const pr = sys.params;
  c.globalCompositeOperation =
    pr.blendMode === 'Additive' ? 'lighter' : 'source-over';

  const shape = pr.particleShape || 'circle';
  const cw = c.canvas.width, ch = c.canvas.height;
  const rs = c._rs || 1;        // 월드 픽셀 → 이 버퍼 픽셀 배율


  for (const p of sys.particles) {
    const t = p.life / p.maxLife;

    // 크기 이지 곡선 적용
    const sT = sampleCurve(pr.sizeCurve || 'linear', t);
    let size = Math.max(0, lerp(p.startSize, p.endSize, sT));
    if (size <= 0.1) continue;

    const col = sampleColor(pr.colorKeys, t);

    // 수명 시작/끝 소프트 페이드
    let lifeAlpha = 1;
    if (pr.fadeIn > 0 && t < pr.fadeIn) {
      lifeAlpha *= t / pr.fadeIn;
    }
    if (pr.fadeOut > 0 && t > 1 - pr.fadeOut) {
      lifeAlpha *= (1 - t) / pr.fadeOut;
    }
    const alpha = col.a * pr.startColor.a * lifeAlpha;
    if (alpha <= 0.001) continue;

    // 팔레트 양자화
    let r8 = (col.r * 255) | 0;
    let g8 = (col.g * 255) | 0;
    let b8 = (col.b * 255) | 0;
    if (_paletteCache) {
      const snap = quantizeColor(r8, g8, b8);
      r8 = snap[0]; g8 = snap[1]; b8 = snap[2];
    }

    // Stretched billboard
    let rot, sx = 1;
    if (pr.stretch > 0) {
      const vmag = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      rot = Math.atan2(p.vy, p.vx);
      sx = 1 + pr.stretch * Math.min(1, vmag / 800);
    } else if (pr.alignVelocity) {
      rot = velocityRotation(pr, p.vx, p.vy);
    } else {
      rot = p.rotation;
    }

    // 위치 (픽셀 모드는 정수 스냅)
    let px = cx + p.x * rs, py = cy + (p.y - (pr.anchorBottom ? size * pr.scaleY / 2 : 0)) * rs;
    if (pr.pixelMode) {
      px = Math.round(px);
      py = Math.round(py);
    }

    // ★ 오프스크린 컬링 — 화면 밖 파티클 건너뜀
    const bound = (size * Math.max(1, sx) + 4) * rs;
    if (px + bound < 0 || px - bound > cw || py + bound < 0 || py - bound > ch) continue;

    // ★ save/restore 대신 setTransform (2~3배 빠름)
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    sx *= pr.scaleX;
    const sy = pr.scaleY;  // 월드 세로 눌림 — 회전 뒤에 적용해야 바닥에 누운 모습이 된다
    c.setTransform(rs * sx * cosR, rs * sx * sinR * sy, -rs * sinR, rs * cosR * sy, px, py);
    c.globalAlpha = alpha;

    // 와이프 리빌 — 좌→우로 점점 그려냄 (휘두름 느낌). 단일 큰 슬래시에 사용
    let clipped = false;
    if (pr.revealWipe) {
      const reveal = Math.min(1, t / Math.max(0.05, pr.revealFrac || 0.5));
      if (reveal < 1) {
        const hx = size / 2 + 4;
        c.save();
        c.beginPath();
        c.rect(-hx, -size, (size + 8) * reveal, size * 2); // 폭이 시간에 따라 확장
        c.clip();
        clipped = true;
      }
    }

    const sheetTex = pr.sheet ? (sys._texture || sheetLibrary[pr.sheetAsset]) : null;
    if (sheetTex) {
      // 스프라이트시트 플립북 — 해당 프레임 셀만 잘라 그림 (필요시 컬러 틴팅)
      const tex = sheetTex;
      const tw = tex.naturalWidth || tex.width || 1;
      const th = tex.naturalHeight || tex.height || 1;
      const fr = sheetFrameIndex(pr, p.life, t);
      const fw = tw / fr.cols, fh = th / fr.rows;
      const sxp = fr.fx * fw, syp = fr.fy * fh;
      const aspect = fw / fh;
      let dw = size, dh = size;
      if (aspect >= 1) dh = size / aspect; else dw = size * aspect;
      // 그릴 프레임 캔버스 준비 (그라디언트맵 / 단색틴트 / 원본)
      let frameCv = null, fcw = 0, fch = 0;
      if (pr.sheetGrad) {
        const tmp = colorizeSheetFrame(tex, sxp, syp, fw, fh, r8, g8, b8, pr.sheetCutout);
        frameCv = tmp.canvas; fcw = tmp.w; fch = tmp.h;
      } else if (pr.sheetTint) {
        const tmp = getSheetTintCanvas(fw, fh);
        const tcx = tmp.ctx;
        tcx.globalCompositeOperation = 'copy';
        tcx.drawImage(tex, sxp, syp, fw, fh, 0, 0, tmp.w, tmp.h);
        tcx.globalCompositeOperation = 'source-in'; // 알파 유지하며 색만 교체
        tcx.fillStyle = `rgb(${r8},${g8},${b8})`;
        tcx.fillRect(0, 0, tmp.w, tmp.h);
        tcx.globalCompositeOperation = 'source-over';
        frameCv = tmp.canvas; fcw = tmp.w; fch = tmp.h;
      }
      if (frameCv) {
        // 가산 글로우 — 살짝 큰 발광 레이어를 먼저 깔아 빛나는 칼날 느낌
        if (pr.sheetGlow) {
          const prevOp = c.globalCompositeOperation, prevA = c.globalAlpha;
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = prevA * 0.45;
          const gw = dw * 1.18, gh = dh * 1.18;
          c.drawImage(frameCv, 0, 0, fcw, fch, -gw / 2, -gh / 2, gw, gh);
          c.globalCompositeOperation = prevOp;
          c.globalAlpha = prevA;
        }
        c.drawImage(frameCv, 0, 0, fcw, fch, -dw / 2, -dh / 2, dw, dh);
      } else {
        c.drawImage(tex, sxp, syp, fw, fh, -dw / 2, -dh / 2, dw, dh);
      }
      if (clipped) c.restore();
    } else if (shape === 'soft') {
      // 방사형 소프트 파티클 — 글로우·연기·화염 본체
      c.drawImage(getSoftSprite(r8, g8, b8), -size / 2, -size / 2, size, size);
      if (clipped) c.restore();
    } else {
      // 솔리드 벡터 모양
      drawShape(c, shape, size / 2, `rgba(${r8},${g8},${b8},1)`, pr.outlineWidth || 0);
      if (clipped) c.restore();
    }
  }

  // 변환 리셋
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
}

function drawBackground() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (bgMode === 'checker') {
    // 픽셀 아트 도구 스타일 체커보드
    const tile = 16;
    for (let y = 0; y < canvas.height; y += tile) {
      for (let x = 0; x < canvas.width; x += tile) {
        const c1 = ((x / tile + y / tile) | 0) & 1;
        ctx.fillStyle = c1 ? '#222' : '#1a1a1a';
        ctx.fillRect(x, y, tile, tile);
      }
    }
  } else if (bgMode === 'gray') {
    ctx.fillStyle = '#464646';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// 투사체 본체 — 순수 글로우 기반 (단색 도형 없음)
function drawProjectileBody(sys, c, cx, cy, rs) {
  const pr = sys.params;
  if (!pr.projectile || !(pr.projBodySize > 0) || sys.projDone) return;
  if (pr.startDelay > 0 && !sys._started) return;
  const bx = cx + (sys.projX + pr.offsetX) * rs, by = cy + (sys.projY + pr.offsetY) * rs;
  const bodyR = pr.projBodySize / 2;
  const cMid = pr.colorKeys[Math.min(1, pr.colorKeys.length-1)] || pr.colorKeys[0];
  const cOuter = pr.colorKeys[Math.min(2, pr.colorKeys.length-1)] || cMid;
  const toRgb = k => `${(k.r*255)|0},${(k.g*255)|0},${(k.b*255)|0}`;

  c.save();
  c.setTransform(rs, 0, 0, rs, bx, by);
  c.rotate((pr.projAngle || 0) * Math.PI / 180);
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 1;

  // 레이어 1: 꼬리 글로우 (이동 반대 방향으로 늘어남)
  c.save();
  c.scale(2.2, 0.8);
  const g1 = c.createRadialGradient(-bodyR * 0.6, 0, 0, -bodyR * 0.4, 0, bodyR * 2);
  g1.addColorStop(0, `rgba(${toRgb(cOuter)},0.45)`);
  g1.addColorStop(0.5, `rgba(${toRgb(cOuter)},0.1)`);
  g1.addColorStop(1, `rgba(${toRgb(cOuter)},0)`);
  c.fillStyle = g1;
  c.beginPath();
  c.arc(-bodyR * 0.4, 0, bodyR * 2, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // 레이어 2: 메인 글로우 (속성색 — colorKeys 중간값 사용)
  const g2 = c.createRadialGradient(0, 0, 0, 0, 0, bodyR);
  g2.addColorStop(0, `rgba(${toRgb(cMid)},0.85)`);
  g2.addColorStop(0.5, `rgba(${toRgb(cOuter)},0.3)`);
  g2.addColorStop(1, `rgba(${toRgb(cOuter)},0)`);
  c.fillStyle = g2;
  c.beginPath();
  c.arc(0, 0, bodyR, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// 합성 버퍼 — color(알파 레이어) + light(가산 레이어) 분리, 블룸은 light 에만
const fxBuffers = {};
function getFxBuffer(name, w, h) {
  let b = fxBuffers[name];
  if (!b) {
    const cv = document.createElement('canvas');
    b = fxBuffers[name] = { cv, c: cv.getContext('2d', { willReadFrequently: true }) };
  }
  if (b.cv.width !== w || b.cv.height !== h) { b.cv.width = w; b.cv.height = h; }
  b.c.setTransform(1, 0, 0, 1, 0, 0);
  b.c.globalCompositeOperation = 'source-over';
  b.c.globalAlpha = 1;
  b.c.filter = 'none';
  b.c.clearRect(0, 0, w, h);
  return b;
}

const BAYER4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5].map(v => (v + 0.5) / 16);

// 저해상도 버퍼를 진짜 도트로 — 알파는 Bayer 디더 0/1, 색은 16단계 포스터라이즈
function pixelizeBuffer(b, w, h) {
  const img = b.c.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const a = d[i + 3];
      if (a === 0) continue;
      if (a / 255 <= BAYER4[((y & 3) << 2) | (x & 3)]) { d[i + 3] = 0; continue; }
      d[i + 3] = 255;
      if (_paletteCache) {
        const snap = quantizeColor(d[i], d[i + 1], d[i + 2]);
        d[i] = snap[0]; d[i + 1] = snap[1]; d[i + 2] = snap[2];
      } else {
        d[i] = (d[i] >> 4) * 17; d[i + 1] = (d[i + 1] >> 4) * 17; d[i + 2] = (d[i + 2] >> 4) * 17;
      }
    }
  }
  b.c.putImageData(img, 0, 0);
}

// 전체 시스템을 c 에 합성. ox/oy=이펙트 중심, view=월드→출력 배율
function composeFrame(c, w, h, ox, oy, view) {
  const systems = [...extraSystems, mainSys].filter(s => !s.hidden);  // 오프라인 복제본은 hidden 이 없어 전부 포함
  const pixelLayers = systems.filter(s => s.params.pixelMode);
  const grid = pixelLayers.length
    ? Math.max(2, ...pixelLayers.map(s => s.params.pixelScale || 3)) : 1;
  const onGrid = grid > 1;
  const bw = Math.ceil(w / grid), bh = Math.ceil(h / grid);
  const bx = onGrid ? Math.round(ox / grid) : ox, by = onGrid ? Math.round(oy / grid) : oy;
  const rs = view / grid;
  const color = getFxBuffer('color', bw, bh);
  const light = getFxBuffer('light', bw, bh);
  color.c._rs = light.c._rs = rs;
  color.c.imageSmoothingEnabled = light.c.imageSmoothingEnabled = !onGrid;

  let hasLight = false;
  if (fxCamera.view === '3d' && webgl3d()) {
    render3D(systems, color, light, bw, bh, bx, by, rs);
    hasLight = true;
  } else for (const s of systems) {
    const additive = s.params.blendMode === 'Additive';
    drawSystem(s, bx, by, (additive ? light : color).c);
    if (additive) hasLight = true;
    if (s.params.projectile && s.params.projBodySize > 0) {
      drawProjectileBody(s, light.c, bx, by, rs);
      hasLight = true;
    }
  }
  if (onGrid) {
    pixelizeBuffer(color, bw, bh);
    if (hasLight) pixelizeBuffer(light, bw, bh);
  }

  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = !onGrid;
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.drawImage(color.cv, 0, 0, bw * grid, bh * grid);
  if (hasLight) {
    c.globalCompositeOperation = 'lighter';
    c.drawImage(light.cv, 0, 0, bw * grid, bh * grid);
    if (fxBloom > 0) {
      const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
      const bloom = getFxBuffer('bloom', qw, qh);
      bloom.c.filter = 'blur(5px)';
      bloom.c.imageSmoothingEnabled = true;
      bloom.c.drawImage(light.cv, 0, 0, qw, qh);
      bloom.c.filter = 'none';
      c.imageSmoothingEnabled = true;
      c.globalAlpha = Math.min(1, fxBloom);
      c.drawImage(bloom.cv, 0, 0, w, h);
      if (fxBloom > 1) { c.globalAlpha = fxBloom - 1; c.drawImage(bloom.cv, 0, 0, w, h); }
    }
  }
  c.restore();
}

function renderAll() {
  drawBackground();

  // 카메라 셰이크 오프셋
  let shakeX = 0, shakeY = 0;
  if (fxShakeT > 0 && fxShakeDurTotal > 0) {
    const falloff = fxShakeT / fxShakeDurTotal;
    shakeX = (Math.random() - 0.5) * 2 * fxShakeMax * falloff;
    shakeY = (Math.random() - 0.5) * 2 * fxShakeMax * falloff;
  }
  const cx = canvas.width / 2 + shakeX;
  const cy = canvas.height / 2 + shakeY;

  composeFrame(ctx, canvas.width, canvas.height, cx, cy, fitView ? Math.min(canvas.width / 800, canvas.height / 600) : 1);

  // 스크린 플래시
  if (fxFlashT > 0 && fxFlashDurTotal > 0) {
    const a = fxFlashMax * (fxFlashT / fxFlashDurTotal);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 그리드 오버레이 (맨 위)
  drawGridOverlay();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  const total = mainSys.particles.length +
    extraSystems.reduce((a, s) => a + s.particles.length, 0);
  const name = currentEffect ? `${currentEffect}  |  ` : '';
  let fps = 60;
  if (frameHistory.length > 10) {
    const span = frameHistory[frameHistory.length - 1] - frameHistory[0];
    fps = Math.round((frameHistory.length - 1) * 1000 / span);
  }
  // 캔버스 FPS 오버레이 (항상 보이게)
  const fpsNum = document.getElementById('fps-num');
  const fpsP = document.getElementById('fps-particles');
  if (fpsNum) {
    fpsNum.textContent = fps;
    fpsNum.className = fps >= 55 ? 'good' : fps >= 30 ? 'mid' : 'bad';
  }
  if (fpsP) fpsP.textContent = total;
  updateLayerCounts();

  document.getElementById('info').textContent =
    `${name}${fps}fps | particles: ${total} | layers: ${1 + extraSystems.length} | t: ${mainSys.systemTime.toFixed(2)}s`;
}


// =================================================================
//                       애니메이션 루프
// =================================================================
function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // FPS 추적 (최근 60프레임 평균)
  frameHistory.push(now);
  if (frameHistory.length > 60) frameHistory.shift();

  if (!recording) {
    // FX 타이머는 실시간으로 감소
    if (fxShakeT > 0) fxShakeT = Math.max(0, fxShakeT - dt);
    if (fxFlashT > 0) fxFlashT = Math.max(0, fxFlashT - dt);

    // 시뮬레이션 전진 — hitStop / 단일 스텝 / 스텝 재생 / 부드럽게
    const shouldSim = playing || stepping;
    if (shouldSim) {
      if (fxHitStop > 0) {
        fxHitStop -= dt;
        advanceSim(0.0005); // hitStop 동안은 거의 정지
        stepping = false;
      } else if (stepping) {
        advanceSim(1 / 60); // 60fps 기준 1프레임 전진
        stepping = false;
      } else if (previewStepFps > 0) {
        // 고정 간격으로 끊어 전진 — 손그림 프레임감 (스프라이트 FX 느낌)
        const frameDur = 1 / previewStepFps;
        stepAccum += dt;
        let guard = 0;
        while (stepAccum >= frameDur && guard < 4) {
          advanceSim(frameDur);
          stepAccum -= frameDur;
          guard++;
        }
      } else {
        advanceSim(dt);
      }
    }
    renderAll();
  }
  requestAnimationFrame(tick);
}

// 한 스텝 시뮬레이션 전진
function advanceSim(simDt) {
  updateSystem(mainSys, simDt);
  for (const s of extraSystems) updateSystem(s, simDt);
  // 합성은 모든 레이어가 끝나면 함께 다시 시작 (레이어별 리스타트는 타이밍을 흩뜨림)
  if (extraSystems.length > 0 && compositionFinished()) {
    compositionIdle += simDt;
    if (compositionIdle >= 0.1) { compositionIdle = 0; restart(); }
  } else {
    compositionIdle = 0;
  }
}

let compositionIdle = 0;
function compositionFinished() {
  const once = [mainSys, ...extraSystems].filter(s => !s.params.loop);
  return once.length > 0 && once.every(s => {
    const pr = s.params;
    const dur = pr.projectile ? Math.max(pr.duration, pr.projDistance / pr.projSpeed) : pr.duration;
    return s.particles.length === 0 && s.systemTime >= dur;
  });
}

// 스텝 재생 토글 (부드럽게 → 12 → 8 → 6 fps 순환)
function cyclePreviewFps() {
  const idx = PREVIEW_FPS_CYCLE.indexOf(previewStepFps);
  previewStepFps = PREVIEW_FPS_CYCLE[(idx + 1) % PREVIEW_FPS_CYCLE.length];
  stepAccum = 0;
  const btn = document.getElementById('stepfps-btn');
  if (btn) btn.textContent = previewStepFps === 0 ? '🎞 부드럽게' : `🎞 ${previewStepFps}fps`;
}

function stepFrame() { stepping = true; }
function cycleBg() {
  bgMode = bgMode === 'dark' ? 'checker' : bgMode === 'checker' ? 'black' : 'dark';
}
function toggleGrid() { gridOn = !gridOn; }

function drawGridOverlay() {
  if (!gridOn) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 32;
  for (let x = 0; x < canvas.width; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvas.height);
  }
  for (let y = 0; y < canvas.height; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
  }
  ctx.stroke();
  // 중앙 십자선
  ctx.strokeStyle = 'rgba(78,161,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 + 0.5, 0);
  ctx.lineTo(canvas.width / 2 + 0.5, canvas.height);
  ctx.moveTo(0, canvas.height / 2 + 0.5);
  ctx.lineTo(canvas.width, canvas.height / 2 + 0.5);
  ctx.stroke();
}

function copyParamsJson() {
  const data = JSON.stringify(serializeEffect(currentEffectObj()), null, 2);
  navigator.clipboard.writeText(data).then(() => {
    showFlash('✓ 파라미터를 클립보드에 복사했습니다');
  }).catch(() => {
    showFlash('복사 실패 — 브라우저 권한 확인');
  });
}

function showFlash(msg) {
  let el = document.getElementById('copy-flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'copy-flash';
    el.className = 'copy-flash';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1500);
}

function setPalette(name) {
  currentPaletteName = name;
  _paletteCache = PALETTES[name] || null;
}

function buildPaletteSelect() {
  const sel = document.getElementById('palette-select');
  const preview = document.getElementById('palette-preview');
  sel.innerHTML = '';
  for (const name in PALETTES) {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  }
  sel.value = currentPaletteName;
  const updatePreview = () => {
    const pal = PALETTES[currentPaletteName];
    if (!pal) { preview.innerHTML = '<span class="text-dim">(원본 색상)</span>'; return; }
    preview.innerHTML = '';
    for (const c of pal) {
      const sw = document.createElement('span');
      sw.className = 'palette-swatch';
      sw.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
      preview.appendChild(sw);
    }
  };
  sel.onchange = () => {
    setPalette(sel.value);
    updatePreview();
  };
  updatePreview();
}


requestAnimationFrame(t => { lastTime = t; requestAnimationFrame(tick); });

function togglePlay() {
  playing = !playing;
  document.getElementById('play-btn').textContent = playing ? '■ 정지' : '▶ 재생';
  if (playing && mainSys.particles.length === 0) restart();
}
function resetSys(s) {
  s.particles = [];
  s.systemTime = 0;
  s.emitAccum = 0;
  s.burstDone = false;
  s.burstEmitted = 0;
  s.projX = 0;
  s.projY = 0;
  s.projT = 0;
  s.projDone = false;
  s._started = false;
  s._delayT = 0;
  s._peak = 0;
}
function restart() {
  resetSys(mainSys);
  for (const s of extraSystems) resetSys(s);
  triggerFX();
}

// =================================================================
//                         파라미터 패널
// =================================================================
const paramDefs = [
  { group: 'Emission', items: [
    ['duration', 'num', 0.01, 10, 0.05],
    ['loop', 'bool'],
    ['rate', 'num', 0, 500, 1],
    ['burstCount', 'num', 0, 500, 1],
  ]},
  { group: 'Lifetime', items: [
    ['lifetimeMin', 'num', 0.05, 10, 0.05],
    ['lifetimeMax', 'num', 0.05, 10, 0.05],
  ]},
  { group: 'Shape', items: [
    ['shape', 'sel', ['Point', 'Circle', 'Disc', 'Box', 'Cone']],
    ['shapeRadius', 'num', 0, 500, 1],
    ['shapeBoxW', 'num', 0, 800, 5],
    ['shapeBoxH', 'num', 0, 800, 5],
    ['coneAngle', 'num', 0, 90, 1],
  ]},
  { group: 'Velocity', items: [
    ['speedMin', 'num', -2000, 2000, 5],
    ['speedMax', 'num', -2000, 2000, 5],
    ['directionX', 'num', -2000, 2000, 10],
    ['directionY', 'num', -2000, 2000, 10],
    ['gravity', 'num', -3000, 3000, 10],
    ['drag', 'num', 0, 20, 0.1],
  ]},
  { group: 'Size', items: [
    ['sizeStart', 'num', 0, 500, 1],
    ['sizeEnd', 'num', 0, 500, 1],
    ['sizeRandom', 'num', 0, 1, 0.05],
  ]},
  { group: 'Rotation', items: [
    ['rotationRandom', 'num', 0, 360, 5],
    ['rotationSpeed', 'num', -720, 720, 5],
  ]},
  { group: 'Render', items: [
    ['blendMode', 'sel', ['Alpha', 'Additive']],
    ['stretch', 'num', 0, 10, 0.1],
  ]},
  { group: '2D Sprite Style', items: [
    ['particleShape', 'sel', ['circle','square','diamond','triangle','star','teardrop','ring','cross','hexagon','spark','crescent','flame','pentagon','octagon','bar','pill','ellipse','bubble','heart','snowflake','bolt','shuriken','arrow','leaf','chevron','shield','sparkle','slash']],
    ['pixelMode', 'bool'],
    ['pixelScale', 'num', 1, 8, 1],
    ['outlineWidth', 'num', 0, 6, 0.5],
  ]},
  { group: 'Animation', items: [
    ['sizeCurve', 'sel', ['linear','easeOut','easeIn','easeInOut','easeOutBack']],
    ['fadeIn', 'num', 0, 0.5, 0.02],
    ['fadeOut', 'num', 0, 0.5, 0.02],
    ['burstSpread', 'num', 0, 0.3, 0.01],
    ['jitter', 'num', 0, 150, 1],
    ['turbulence', 'num', 0, 300, 1],
  ]},
  { group: 'Orbit (소용돌이/흡인)', items: [
    ['orbit', 'num', -2000, 2000, 10],
    ['attract', 'num', -2000, 2000, 10],
  ]},
  { group: 'Game Feel (FX)', items: [
    ['shakeAmount', 'num', 0, 60, 1],
    ['shakeDuration', 'num', 0, 1.5, 0.05],
    ['flashAmount', 'num', 0, 1, 0.05],
    ['flashDuration', 'num', 0, 0.5, 0.01],
    ['hitStop', 'num', 0, 0.4, 0.01],
  ]},
  { group: 'Projectile (투사체)', items: [
    ['projectile', 'bool'],
    ['projSpeed', 'num', 50, 2000, 10],
    ['projDistance', 'num', 50, 800, 10],
    ['projAngle', 'num', -180, 180, 5],
    ['projPath', 'sel', ['linear', 'arc', 'wave', 'spiral', 'boomerang', 'zigzag']],
    ['projArcHeight', 'num', 0, 400, 10],
    ['projWaveAmp', 'num', 0, 200, 5],
    ['projWaveFreq', 'num', 1, 10, 0.5],
    ['projBodySize', 'num', 0, 200, 5],
    ['projBodyShape', 'sel', ALL_SHAPES],
    ['projBodyGlow', 'bool'],
  ]},
  { group: '3D 배치', items: [
    ['plane', 'sel', ['screen', 'ground']],
    ['offsetZ', 'num', -800, 800, 10],
    ['directionZ', 'num', -2000, 2000, 10],
    ['alignVelocity', 'bool'],
    ['anchorBottom', 'bool'],
    ['planeRoll', 'num', -90, 90, 1],
    ['scaleX', 'num', 0.1, 8, 0.1],
  ]},
  { group: 'Reveal', items: [
    ['revealWipe', 'bool'],
    ['revealFrac', 'num', 0.05, 1, 0.05],
  ]},
  { group: 'Sprite Sheet (플립북 / 외부 FX)', items: [
    ['sheet', 'bool'],
    ['sheetCols', 'num', 1, 16, 1],
    ['sheetRows', 'num', 1, 16, 1],
    ['sheetMode', 'sel', ['life', 'loop']],
    ['sheetFps', 'num', 1, 60, 1],
    ['sheetFrames', 'num', 0, 256, 1],
    ['sheetTint', 'bool'],
    ['sheetGrad', 'bool'],
    ['sheetGlow', 'bool'],
  ]},
];

function updateProjVisibility() {
  const isProj = !!params.projectile;
  const path = params.projPath;
  const hasBody = params.projBodySize > 0;
  document.querySelectorAll('[data-proj-dep]').forEach(row => {
    const dep = row.dataset.projDep;
    let show = false;
    if (dep === 'proj') show = isProj;
    else if (dep === 'arc') show = isProj && path === 'arc';
    else if (dep === 'wave') show = isProj && path === 'wave';
    else if (dep === 'body') show = isProj && hasBody;
    row.style.display = show ? '' : 'none';
  });
}

function buildParamPanel() {
  const panel = document.getElementById('param-panel');
  panel.innerHTML = '';
  for (const g of paramDefs) {
    const h = document.createElement('h3');
    h.className = 'group-header';
    h.textContent = g.group;
    const content = document.createElement('div');
    content.className = 'group-content';
    if (collapsedGroups.has(g.group)) {
      h.classList.add('collapsed');
      content.style.display = 'none';
    }
    h.onclick = () => {
      const isC = h.classList.toggle('collapsed');
      content.style.display = isC ? 'none' : '';
      if (isC) collapsedGroups.add(g.group);
      else collapsedGroups.delete(g.group);
    };
    panel.appendChild(h);
    panel.appendChild(content);
    for (const it of g.items) {
      const [name, type] = it;
      const row = document.createElement('div'); row.className = 'row';
      const lbl = document.createElement('label'); lbl.textContent = name;
      row.appendChild(lbl);

      // 투사체 조건부 표시: 관련 파라미터에 의존성 표시
      const PROJ_DEPS = {
        projSpeed:'proj', projDistance:'proj', projAngle:'proj', projPath:'proj',
        projArcHeight:'arc', projWaveAmp:'wave', projWaveFreq:'wave',
        projBodySize:'proj', projBodyShape:'body', projBodyGlow:'body',
      };
      if (PROJ_DEPS[name]) row.dataset.projDep = PROJ_DEPS[name];

      if (type === 'num') {
        // 슬라이더 + 숫자 박스 (상호 동기화)
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = it[2]; slider.max = it[3]; slider.step = it[4];
        slider.value = params[name];

        const num = document.createElement('input');
        num.type = 'number';
        num.min = it[2]; num.max = it[3]; num.step = it[4];
        num.value = params[name];
        num.className = 'num-small';

        const sync = v => {
          params[name] = v;
          slider.value = v;
          num.value = v;
        };
        slider.onmousedown = () => pushUndo();
        slider.oninput = () => sync(parseFloat(slider.value) || 0);
        num.onfocus = () => pushUndo();
        num.oninput = () => sync(parseFloat(num.value) || 0);

        row.appendChild(slider);
        row.appendChild(num);
      } else if (type === 'bool') {
        const el = document.createElement('input');
        el.type = 'checkbox';
        el.checked = !!params[name];
        el.onchange = () => { pushUndo(); params[name] = el.checked; updateProjVisibility(); };
        row.appendChild(el);
      } else if (type === 'sel') {
        const el = document.createElement('select');
        for (const opt of it[2]) {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt;
          el.appendChild(o);
        }
        el.value = params[name];
        el.onchange = () => { pushUndo(); params[name] = el.value; updateProjVisibility(); };
        row.appendChild(el);
      }
      // 숫자 슬라이더 변경 시에도 조건부 표시 갱신 (projBodySize 등)
      if (name === 'projBodySize') {
        const origSync = row.querySelector('input[type=range]');
        if (origSync) {
          const origOninput = origSync.oninput;
          origSync.oninput = function() { origOninput.call(this); updateProjVisibility(); };
        }
        const origNum = row.querySelector('input[type=number]');
        if (origNum) {
          const origOninput2 = origNum.oninput;
          origNum.oninput = function() { origOninput2.call(this); updateProjVisibility(); };
        }
      }
      content.appendChild(row);
    }
  }

  updateProjVisibility();

  // 색 키 섹션 (접힘 가능)
  const h = document.createElement('h3');
  h.className = 'group-header';
  h.textContent = 'Color Over Lifetime';
  const colContent = document.createElement('div');
  colContent.className = 'group-content';
  if (collapsedGroups.has('Color Over Lifetime')) {
    h.classList.add('collapsed');
    colContent.style.display = 'none';
  }
  h.onclick = () => {
    const isC = h.classList.toggle('collapsed');
    colContent.style.display = isC ? 'none' : '';
    if (isC) collapsedGroups.add('Color Over Lifetime');
    else collapsedGroups.delete('Color Over Lifetime');
  };
  panel.appendChild(h);
  panel.appendChild(colContent);
  const keyWrap = document.createElement('div');
  keyWrap.id = 'color-keys';
  colContent.appendChild(keyWrap);
  rebuildColorKeys();
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ 색 키 추가';
  addBtn.onclick = () => {
    pushUndo();
    params.colorKeys.push({ r:1, g:1, b:1, a:1, t:1 });
    rebuildColorKeys();
  };
  colContent.appendChild(addBtn);
}

function rebuildColorKeys() {
  const wrap = document.getElementById('color-keys');
  wrap.innerHTML = '';
  params.colorKeys.forEach((k, idx) => {
    const row = document.createElement('div');
    row.className = 'color-key';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = rgbToHex(k.r, k.g, k.b);
    color.onfocus = () => pushUndo();
    color.oninput = () => {
      const c = hexToRgb(color.value);
      k.r = c.r; k.g = c.g; k.b = c.b;
    };

    const alpha = document.createElement('input');
    alpha.type = 'number';
    alpha.min = 0; alpha.max = 1; alpha.step = 0.05;
    alpha.value = k.a; alpha.title = 'alpha';
    alpha.onfocus = () => pushUndo();
    alpha.oninput = () => { k.a = parseFloat(alpha.value) || 0; };

    const tIn = document.createElement('input');
    tIn.type = 'number';
    tIn.min = 0; tIn.max = 1; tIn.step = 0.05;
    tIn.value = k.t; tIn.title = 'time (0~1)';
    tIn.onfocus = () => pushUndo();
    tIn.oninput = () => { k.t = parseFloat(tIn.value) || 0; };

    const aLbl = document.createElement('span'); aLbl.textContent = 'α';
    const tLbl = document.createElement('span'); tLbl.textContent = 't';

    const del = document.createElement('button');
    del.textContent = '✕';
    del.onclick = () => {
      pushUndo();
      params.colorKeys.splice(idx, 1);
      rebuildColorKeys();
    };

    row.append(color, aLbl, alpha, tLbl, tIn, del);
    wrap.appendChild(row);
  });
}

function refreshPanel() { buildLayerPanel(); buildParamPanel(); }

// =================================================================
//                레이어 목록 — 입자 수, 끄기/켜기, 편집 대상 선택
// =================================================================
function layerLabel(p) {
  const kind = p.sheet && p.sheetAsset ? '시트 ' + p.sheetAsset
             : p.sheet ? '가져온 시트' : (p.particleShape || 'circle') + ' 파티클';
  const tags = [p.blendMode === 'Additive' ? 'Add' : 'Alpha'];
  if (p.startDelay > 0) tags.push(p.startDelay.toFixed(2) + 's');
  if (p.loop) tags.push('loop');
  if (p.projectile) tags.push('투사체');
  return { kind, tags: tags.join(' · ') };
}

function buildLayerPanel() {
  const wrap = document.getElementById('layer-panel');
  if (!wrap) return;
  wrap.innerHTML = '';
  const all = allSystems();
  const target = editTarget();
  // 맨 위 레이어부터 표시 (그리는 순서의 역순)
  for (let i = all.length - 1; i >= 0; i--) {
    const s = all[i];
    const { kind, tags } = layerLabel(s.params);
    const row = document.createElement('div');
    row.className = 'layer-row' + (s === target ? ' active' : '') + (s.hidden ? ' off' : '');
    row.title = '누르면 아래 파라미터가 이 레이어로 바뀝니다';
    row.onclick = () => { editSys = s; refreshPanel(); };

    const vis = document.createElement('input');
    vis.type = 'checkbox';
    vis.checked = !s.hidden;
    vis.title = '미리보기에서 끄기/켜기';
    vis.onclick = e => e.stopPropagation();
    vis.onchange = () => { s.hidden = !vis.checked; buildLayerPanel(); };

    const name = document.createElement('div');
    name.className = 'layer-name';
    name.innerHTML = `<b>L${i + 1}</b> ${kind}<div class="hint">${tags}</div>`;

    const cnt = document.createElement('span');
    cnt.className = 'layer-cnt';
    cnt.title = '현재 입자 수 / 이번 재생 최대';
    s._cntEl = cnt;

    const solo = document.createElement('button');
    solo.textContent = 'S';
    solo.title = '이 레이어만 보기 (다시 누르면 전부 켜기)';
    solo.onclick = e => {
      e.stopPropagation();
      const isSolo = !s.hidden && all.every(x => x === s || x.hidden);
      all.forEach(x => { x.hidden = isSolo ? false : x !== s; });
      buildLayerPanel();
    };

    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = '레이어 삭제 (Ctrl+Z 로 되돌리기)';
    del.disabled = all.length <= 1;
    del.onclick = e => { e.stopPropagation(); deleteLayer(s); };

    row.append(vis, name, cnt, solo, del);
    wrap.appendChild(row);
  }
  const total = document.createElement('div');
  total.className = 'hint';
  total.id = 'layer-total';
  wrap.appendChild(total);
  const tgt = document.getElementById('param-target');
  if (tgt) tgt.textContent = `— L${all.indexOf(target) + 1} ${layerLabel(target.params).kind}`;
  updateLayerCounts();
}

function updateLayerCounts() {
  let total = 0, shown = 0, peak = 0;
  for (const s of allSystems()) {
    const n = s.particles.length;
    s._peak = Math.max(s._peak || 0, n);
    total += n; peak += s._peak;
    if (!s.hidden) shown += n;
    if (s._cntEl) s._cntEl.textContent = `${n} / ${s._peak}`;
  }
  const el = document.getElementById('layer-total');
  if (el) el.textContent = `레이어 ${allSystems().length}개 · 입자 현재 ${total} (보이는 것 ${shown}) · 레이어별 최대 합 ${peak}`;
}

function deleteLayer(s) {
  if (allSystems().length <= 1) return;
  pushUndo();
  if (s === mainSys) mainSys = extraSystems.pop();
  else extraSystems = extraSystems.filter(x => x !== s);
  if (editSys === s) editSys = null;
  refreshPanel();
  restart();
}

function rgbToHex(r, g, b) {
  const h = x => Math.max(0, Math.min(255, (x * 255) | 0)).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
