// =================================================================
// engine.js — 2D Particle Editor 순수 로직 모듈
// 브라우저(particle_editor.html) 와 Node(test.js) 양쪽에서 사용
// =================================================================

// ==================== Math / Utility ====================
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }

// ==================== Easing Curves ====================
function sampleCurve(name, t) {
  switch (name) {
    case 'easeOut': return 1 - (1 - t) * (1 - t);
    case 'easeIn':  return t * t;
    case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'easeOutBack': {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case 'linear':
    default: return t;
  }
}

// ==================== Color Interpolation ====================
function sampleColor(keys, t) {
  if (!keys || keys.length === 0) return { r:1, g:1, b:1, a:1 };
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const k1 = keys[i], k2 = keys[i + 1];
    if (t >= k1.t && t <= k2.t) {
      const span = k2.t - k1.t;
      const u = span > 0 ? (t - k1.t) / span : 0;
      return {
        r: lerp(k1.r, k2.r, u),
        g: lerp(k1.g, k2.g, u),
        b: lerp(k1.b, k2.b, u),
        a: lerp(k1.a, k2.a, u),
      };
    }
  }
  return keys[0];
}

// ==================== Color Palettes ====================
const PALETTES = {
  'none': null,
  'PICO-8': [
    [0,0,0],[29,43,83],[126,37,83],[0,135,81],[171,82,54],[95,87,79],
    [194,195,199],[255,241,232],[255,0,77],[255,163,0],[255,236,39],
    [0,228,54],[41,173,255],[131,118,156],[255,119,168],[255,204,170],
  ],
  'Game Boy': [
    [15,56,15],[48,98,48],[139,172,15],[155,188,15],
  ],
  'NES-ish': [
    [0,0,0],[0,0,188],[0,120,248],[60,188,252],[252,252,252],
    [248,0,0],[252,160,68],[252,224,168],[0,168,0],[184,248,184],
    [168,0,188],[248,216,248],[188,188,188],[120,120,120],
    [252,252,168],[252,60,140],
  ],
  'Endesga 16': [
    [228,59,68],[158,40,53],[190,105,41],[237,174,45],[253,231,104],
    [158,230,91],[56,181,84],[34,99,83],[14,41,63],[59,87,119],
    [95,141,165],[171,221,232],[255,255,255],[194,193,194],[103,106,107],
    [31,23,31],
  ],
};

function quantizeToPalette(r, g, b, palette) {
  if (!palette) return null;
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = dr*dr + dg*dg + db*db;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return palette[bestIdx];
}

function colorBucket(r, g, b) {
  return ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
}

const ALL_SHAPES = ['circle','square','diamond','triangle','star','teardrop',
                    'ring','cross','hexagon','spark','crescent','flame',
                    'pentagon','octagon','bar','pill','ellipse','bubble',
                    'heart','snowflake','bolt','shuriken','arrow','leaf',
                    'chevron','shield','sparkle','slash','soft'];

// ==================== JSON Extraction (for LLM responses) ====================
function extractJson(text) {
  if (!text) return null;
  // 마크다운 코드블록 제거
  let cleaned = text.replace(/```(?:json)?\s*\n?/gi, '').replace(/```/g, '').trim();
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try { JSON.parse(cleaned); return cleaned; } catch(_) {}
  }
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return cleaned.substring(start, i + 1);
    }
  }
  return null;
}

// ==================== LLM Helpers ====================

function humanizeLLMError(err, providerLabel) {
  const msg = String(err && err.message || err || '').toLowerCase();
  const full = String(err && err.message || err || '');

  if (/\b429\b/.test(msg) || msg.includes('quota') || msg.includes('rate limit') || msg.includes('rate_limit')) {
    return `⚠️ ${providerLabel} 할당량 초과 — 무료 토큰 소진/분당 제한. 1분 대기 후 재시도하거나 다른 프로바이더 사용`;
  }
  if (/\b402\b/.test(msg) || msg.includes('insufficient') || msg.includes('payment') || msg.includes('billing') || msg.includes('credit balance')) {
    return `💳 ${providerLabel} 크레딧 부족 — 계정 결제 정보 확인 또는 다른 프로바이더 사용`;
  }
  if (/\b401\b/.test(msg) || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('invalid_api_key')) {
    return `🔑 ${providerLabel} API 키 오류 — 키 값을 확인하거나 재발급`;
  }
  if (/\b403\b/.test(msg) || msg.includes('forbidden') || msg.includes('permission')) {
    return `🚫 ${providerLabel} 접근 권한 없음 — API 키에 해당 모델 권한이 없습니다`;
  }
  if (/\b503\b/.test(msg) || msg.includes('overloaded') || msg.includes('unavailable')) {
    return `🔧 ${providerLabel} 서버 과부하 — 잠시 후 재시도`;
  }
  if (/\b400\b/.test(msg) || msg.includes('invalid_argument') || msg.includes('bad request')) {
    return `❌ ${providerLabel} 요청 형식 오류 — F12 콘솔에서 상세 확인`;
  }
  if (/\b500\b/.test(msg) || msg.includes('internal')) {
    return `🔥 ${providerLabel} 서버 내부 오류 — 재시도 필요`;
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return `📡 네트워크 오류 — 인터넷 연결 확인`;
  }
  if (msg.includes('context length') || msg.includes('max tokens') || msg.includes('token limit')) {
    return `📏 ${providerLabel} 토큰 한도 초과 — 프롬프트가 너무 김`;
  }
  if (msg.includes('json')) {
    return `📝 ${providerLabel} JSON 응답 파싱 실패 — 재시도 권장`;
  }
  return `오류(${providerLabel}): ` + full.slice(0, 200) + ' — F12 콘솔에서 상세 확인';
}

// ==================== Default Params ====================
function defaultParams() {
  return {
    duration: 1, loop: false,
    rate: 30, burstCount: 0,
    lifetimeMin: 0.5, lifetimeMax: 1.0,
    shape: 'Point',
    shapeRadius: 20, shapeBoxW: 100, shapeBoxH: 100, coneAngle: 25,
    speedMin: 100, speedMax: 300,
    directionX: 0, directionY: 0,
    gravity: 0, drag: 0,
    sizeStart: 40, sizeEnd: 0, sizeRandom: 0,
    rotationRandom: 0, rotationSpeed: 0,
    stretch: 0,
    blendMode: 'Alpha',
    particleShape: 'circle',
    pixelMode: false,
    pixelScale: 3,
    outlineWidth: 1.5,
    sizeCurve: 'easeOut',
    fadeIn: 0.05,
    fadeOut: 0.25,
    burstSpread: 0.03,
    jitter: 0,
    turbulence: 0,
    orbit: 0,
    attract: 0,
    shakeAmount: 0,
    shakeDuration: 0.3,
    flashAmount: 0,
    flashDuration: 0.12,
    hitStop: 0,
    startColor: { r:1, g:1, b:1, a:1 },
    colorKeys: [
      { r:1, g:1, b:1, a:1, t:0 },
      { r:1, g:1, b:1, a:0, t:1 },
    ],
    // 투사체 (Projectile)
    projectile: false,
    projSpeed: 400,
    projDistance: 300,
    projPath: 'linear',    // 'linear' | 'arc' | 'wave'
    projArcHeight: 100,
    projWaveAmp: 30,
    projWaveFreq: 3,
    projAngle: 0,          // 발사 각도 (도, 0=오른쪽)
    projBodySize: 0,       // 투사체 본체 크기 (0 = 본체 없음)
    projBodyShape: 'circle', // 본체 파티클 모양
    projBodyGlow: true,    // 본체 발광 효과
    // 와이프 리빌 — 한쪽 끝에서 반대쪽까지 점점 그려냄 (휘두름/베기 느낌)
    revealWipe: false,     // true면 수명에 따라 좌→우로 쓸리듯 나타남
    revealFrac: 0.5,       // 수명의 이 비율까지 완전히 그려짐 (작을수록 빠르게 완성)
    // 레이어 합성
    startDelay: 0,         // 이 레이어가 시작되기까지 지연(초)
    offsetX: 0,            // 이미터 위치 오프셋 (픽셀, 중심 기준, +X=오른쪽)
    offsetY: 0,            // 이미터 위치 오프셋 (픽셀, 중심 기준, +Y=아래)
    emitAngle: -90,        // Cone 방출 중심 각도 (도, 0=오른쪽, -90=위)
    startRotation: 0,      // 파티클 고정 시작 회전 (도)
    plane: 'screen',       // 3D 배치: 'screen'=카메라를 향함, 'ground'=바닥과 평행하게 눕힘
    offsetZ: 0,            // 이미터 깊이 (+Z=카메라 쪽). 2D 에서는 무시
    directionZ: 0,         // 깊이 방향 속도 (px/s)
    alignVelocity: false,  // 이미지의 머리(시트 heading, 기본 아래쪽)를 진행 방향에 맞춤
    anchorBottom: false,   // offsetY 가 이미지 중심이 아니라 바닥 지점 (바닥형 시트용)
    planeRoll: 0,          // 바닥 평면 레이어의 화면상 기울기 (도)
    scaleX: 1,             // 가로 굵기 (길이는 유지한 채 침을 두껍게)
    scaleY: 1,             // 세로 눌림 (0.2 전후면 바닥에 누운 원근 표현)
    sheetCutout: false,    // 시트 면을 불투명하게 자름 (회색 먼지·파편용). 끄면 휘도가 곧 투명도
    // 스프라이트시트 플립북 (외부 시트를 격자 프레임으로 재생)
    sheet: false,          // true면 _texture 를 cols×rows 격자로 해석해 프레임 애니 재생
    sheetCols: 3,          // 가로 프레임 수
    sheetRows: 3,          // 세로 프레임 수
    sheetFrames: 0,        // 사용할 프레임 수 (0 = cols*rows 전체)
    sheetFirst: 0,         // 재생을 시작할 프레임 (날아가는 동안 완성된 프레임만 쓸 때)
    sheetMode: 'life',     // 'life'=수명에 맞춰 1회 재생 | 'loop'=sheetFps 고정 루프
    sheetFps: 30,          // loop 모드일 때 재생 fps
    sheetTint: true,       // 흰색(그레이스케일) 마스크를 파티클 컬러로 틴팅
    sheetGrad: false,      // 그라디언트맵 컬러라이즈 (휘도→가장자리색→흰 코어). 납작함 제거
    sheetGlow: false,      // 가산 글로우 패스(살짝 큰 발광 레이어)를 한 겹 더 그림
    sheetAsset: '',        // 내장 시트 이름 (SHEET_ASSETS). 있으면 _texture 없이 라이브러리에서 그림
  };
}

// ==================== Sprite Sheet Flipbook ====================
// 플립북 프레임 인덱스 계산. life=파티클 누적 수명(초), t=수명 정규화[0,1]
function sheetFrameIndex(pr, life, t) {
  const cols = Math.max(1, pr.sheetCols | 0);
  const rows = Math.max(1, pr.sheetRows | 0);
  const grid = cols * rows;
  const first = Math.max(0, Math.min(grid - 1, (pr.sheetFirst | 0)));
  const total = (pr.sheetFrames && pr.sheetFrames > 0)
    ? Math.min(pr.sheetFrames | 0, grid - first) : grid - first;
  let idx;
  if (pr.sheetMode === 'loop') {
    idx = Math.floor((life || 0) * (pr.sheetFps || 30)) % total;
  } else {
    idx = Math.floor((t || 0) * total);
  }
  if (idx < 0) idx = 0;
  if (idx >= total) idx = total - 1;
  idx += first;
  return { idx, cols, rows, total, fx: idx % cols, fy: Math.floor(idx / cols) };
}

// ==================== Sheet Slicing ====================
// AI 시트는 격자가 정확하지 않아 프레임이 흔들린다. 칸을 찾아 잘라내고 기준점을 맞춰 균일 시트로 재구성한다.
// lum = 픽셀별 휘도(0~255) 배열, 길이 w*h
const SLICE_THRESHOLD = 24;

function countProjectionRuns(has, minLen) {
  let runs = 0, len = 0;
  for (let i = 0; i <= has.length; i++) {
    if (i < has.length && has[i]) { len++; continue; }
    if (len >= minLen) runs++;
    len = 0;
  }
  return runs;
}

// 검은 여백으로 열/행 수를 추정. 이웃 프레임이 붙으면 1이 나올 수 있어 호출측이 수동값을 쓴다
function detectSheetGrid(lum, w, h, thresh) {
  const t = thresh === undefined ? SLICE_THRESHOLD : thresh;
  const colHas = new Uint8Array(w), rowHas = new Uint8Array(h);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      if (lum[i] >= t) { colHas[x] = 1; rowHas[y] = 1; }
    }
  }
  const minLen = Math.max(2, Math.floor(Math.min(w, h) / 64));
  return { cols: countProjectionRuns(colHas, minLen), rows: countProjectionRuns(rowHas, minLen) };
}

// 칸별 내용 경계와 밝기 중심
function sliceFrames(lum, w, h, cols, rows, thresh) {
  const t = thresh === undefined ? SLICE_THRESHOLD : thresh;
  const frames = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx0 = Math.floor(c * w / cols), cx1 = Math.floor((c + 1) * w / cols);
      const cy0 = Math.floor(r * h / rows), cy1 = Math.floor((r + 1) * h / rows);
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, sum = 0, mx = 0, my = 0;
      // AI 시트의 희미한 칸 경계선을 내용으로 잡지 않도록 칸 가장자리는 건너뜀
      const inset = Math.ceil(Math.min(cx1 - cx0, cy1 - cy0) * 0.012);
      for (let y = cy0 + inset; y < cy1 - inset; y++) {
        for (let x = cx0 + inset; x < cx1 - inset; x++) {
          const v = lum[y * w + x];
          if (v < t) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          sum += v; mx += v * x; my += v * y;
        }
      }
      const empty = x1 < 0;
      frames.push(empty
        ? { empty, cx0, cy0, cx1, cy1, x0: cx0, y0: cy0, x1: cx0, y1: cy0, mx: cx0, my: cy0 }
        : { empty, cx0, cy0, cx1, cy1, x0, y0, x1, y1, mx: mx / sum, my: my / sum });
    }
  }
  return frames;
}

// 균일 셀 크기와 프레임별 기준점 계산.
// align: 'center'=경계 중심, 'bottom'=바닥선+밝기중심 x(불꽃·지면 폭발), 'right'=오른쪽 끝+밝기중심 y(날아가는 물체)
function layoutSlices(frames, align) {
  const pad = 6;
  const live = frames.filter(f => !f.empty);
  if (live.length === 0) return { size: 0, frames: [] };
  const anchor = f => {
    if (align === 'bottom') return { ax: f.mx, ay: f.y1 };
    if (align === 'right') return { ax: f.x1, ay: f.my };
    return { ax: (f.x0 + f.x1) / 2, ay: (f.y0 + f.y1) / 2 };
  };
  let half = 1;
  for (const f of live) {
    const { ax, ay } = anchor(f);
    half = Math.max(half, align === 'right' ? (f.x1 - f.x0) / 2 : Math.max(ax - f.x0, f.x1 - ax));
    half = Math.max(half, align === 'bottom' ? (f.y1 - f.y0) / 2 : Math.max(ay - f.y0, f.y1 - ay));
  }
  const size = Math.ceil(half * 2) + pad * 2;
  return {
    size,
    frames: live.map(f => {
      const { ax, ay } = anchor(f);
      const destAx = align === 'right' ? size - pad : size / 2;
      const destAy = align === 'bottom' ? size - pad : size / 2;
      return { sx: f.x0, sy: f.y0, sw: f.x1 - f.x0 + 1, sh: f.y1 - f.y0 + 1,
               dx: Math.round(destAx - (ax - f.x0)), dy: Math.round(destAy - (ay - f.y0)) };
    }),
  };
}

// 내장 시트 (ChatGPT 이미지 생성 → assets/ai). AI 가 sheetAsset 으로 고른다
const SHEET_ASSETS = {
  flame01:     { cols: 4, rows: 4, align: 'bottom', loop: true,  desc: '손그림풍 불꽃 루프. 바닥 기준 위로 일렁임' },
  explosion01: { cols: 4, rows: 4, align: 'center', loop: false, desc: '폭발 1회: 작은 불티→거대 화구→조각나며 소멸' },
  meteor01:    { cols: 4, rows: 4, align: 'right',  loop: true,  heading: 'right', desc: '불타는 운석 루프. 오른쪽 끝이 바위 머리, 왼쪽으로 꼬리. alignVelocity 로 진행 방향을 따름' },
  impact01:    { cols: 4, rows: 4, align: 'bottom', loop: false, desc: '지면 충돌 1회: 섬광→충격파 고리와 기둥→암석과 먼지→소멸. 바닥이 셀 하단' },
  smoke01:     { cols: 4, rows: 4, align: 'center', loop: false, desc: '연기 1회: 작은 덩어리→부풀어 오름→구멍 나며 소멸' },
};

// ==================== 3D Camera ====================
// 월드는 화면 좌표계 그대로(+X 오른쪽, +Y 아래), +Z 가 카메라 쪽. pitch>0 이면 위에서 내려다봄
function cameraBasis(cam) {
  const y = cam.yaw * Math.PI / 180, x = cam.pitch * Math.PI / 180;
  return { cy: Math.cos(y), sy: Math.sin(y), cx: Math.cos(x), sx: Math.sin(x) };
}

// 월드 벡터를 카메라 공간으로 회전. 반환 y 는 화면 아래가 +
function cameraRotate(b, x, y, z) {
  const x1 = x * b.cy + z * b.sy;
  const z1 = -x * b.sy + z * b.cy;
  return { x: x1, y: y * b.cx + z1 * b.sx, z: -y * b.sx + z1 * b.cx };
}

// 바닥선 Y (2D/3D 공통). 바닥형 레이어는 여기에 놓는다
const GROUND_Y = 170;
const HEADINGS = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// 진행 방향 정렬 시 이미지 회전값. 시트에 적힌 머리 방향을 기준으로 한다
function velocityRotation(pr, vx, vy) {
  const asset = pr.sheet && SHEET_ASSETS[pr.sheetAsset];
  const heading = HEADINGS[asset && asset.heading] ?? HEADINGS.down;
  return Math.atan2(vy, vx) - heading;
}

// AI 가 낸 레이어에 엔진 규칙을 채운다 — 바닥형 시트는 바닥 기준 위치
function prepareAiLayers(raw) {
  const fx = raw && raw.effect ? raw.effect : raw;
  for (const l of (fx && fx.layers) || []) {
    const asset = SHEET_ASSETS[l.sheetAsset];
    if (asset && asset.align === 'bottom' && l.anchorBottom === undefined && l.plane !== 'ground') l.anchorBottom = true;
  }
  return raw;
}

// ==================== Validation ====================
const VALID_SHAPES = ['Point', 'Circle', 'Disc', 'Box', 'Cone'];
const VALID_PARTICLE_SHAPES = ALL_SHAPES;
const VALID_BLEND_MODES = ['Alpha', 'Additive'];
const VALID_SIZE_CURVES = ['linear', 'easeOut', 'easeIn', 'easeInOut', 'easeOutBack'];
const VALID_PROJ_PATHS = ['linear', 'arc', 'wave', 'spiral', 'boomerang', 'zigzag'];

function sanitizeParams(obj) {
  const def = defaultParams();
  const clamp = (v, lo, hi, fallback) => {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, v));
  };
  const ranges = {
    duration:[0.01,60], rate:[0,5000], burstCount:[0,5000], burstSpread:[0,5],
    lifetimeMin:[0,30], gravity:[-5000,5000], drag:[0,100], speedMin:[-5000,5000],
    sizeStart:[0,1000], sizeEnd:[0,1000], sizeRandom:[0,1], pixelScale:[1,8],
    fadeIn:[0,1], fadeOut:[0,1], revealFrac:[0.05,1], stretch:[0,40],
    rotationRandom:[0,360], rotationSpeed:[-3600,3600], startRotation:[-360,360],
    directionX:[-5000,5000], directionY:[-5000,5000],
    shapeRadius:[0,1000], shapeBoxW:[0,2000], shapeBoxH:[0,2000], coneAngle:[0,180], emitAngle:[-360,360],
    jitter:[0,500], turbulence:[0,2000], orbit:[-5000,5000], attract:[-5000,5000],
    outlineWidth:[0,8], shakeAmount:[0,100], shakeDuration:[0,3], flashAmount:[0,1], flashDuration:[0,2], hitStop:[0,1],
    scaleY:[0.05,2], scaleX:[0.05,8], planeRoll:[-90,90], offsetZ:[-2000,2000], directionZ:[-5000,5000], startDelay:[0,10], offsetX:[-1000,1000], offsetY:[-1000,1000],
    sheetFps:[1,60], projSpeed:[50,2000], projDistance:[50,800], projAngle:[-180,180],
    projArcHeight:[0,400], projWaveAmp:[0,200], projWaveFreq:[1,10], projBodySize:[0,400],
  };
  for (const k in ranges) obj[k] = clamp(obj[k], ranges[k][0], ranges[k][1], def[k]);
  obj.lifetimeMax = clamp(obj.lifetimeMax, obj.lifetimeMin, 30, Math.max(obj.lifetimeMin, def.lifetimeMax));
  obj.speedMax    = clamp(obj.speedMax, obj.speedMin, 5000, Math.max(obj.speedMin, def.speedMax));

  // 스프라이트시트 플립북 검증
  obj.sheetCols   = Math.round(clamp(obj.sheetCols, 1, 32, def.sheetCols));
  obj.sheetRows   = Math.round(clamp(obj.sheetRows, 1, 32, def.sheetRows));
  obj.sheetFrames = Math.round(clamp(obj.sheetFrames, 0, 1024, def.sheetFrames));
  obj.sheetFirst  = Math.round(clamp(obj.sheetFirst, 0, 1024, def.sheetFirst));
  if (obj.sheetMode !== 'life' && obj.sheetMode !== 'loop') obj.sheetMode = def.sheetMode;

  // 열거형 검증
  if (!VALID_SHAPES.includes(obj.shape)) obj.shape = def.shape;
  if (!VALID_PARTICLE_SHAPES.includes(obj.particleShape)) obj.particleShape = def.particleShape;
  if (!VALID_PARTICLE_SHAPES.includes(obj.projBodyShape)) obj.projBodyShape = def.projBodyShape;
  if (!VALID_BLEND_MODES.includes(obj.blendMode)) obj.blendMode = def.blendMode;
  if (obj.sizeCurve && !VALID_SIZE_CURVES.includes(obj.sizeCurve)) obj.sizeCurve = def.sizeCurve;
  if (obj.projPath && !VALID_PROJ_PATHS.includes(obj.projPath)) obj.projPath = def.projPath;
  if (obj.plane !== 'ground') obj.plane = 'screen';

  // 내장 시트
  if (SHEET_ASSETS[obj.sheetAsset]) {
    const a = SHEET_ASSETS[obj.sheetAsset];
    obj.sheet = true;
    obj.sheetCols = a.cols; obj.sheetRows = a.rows;
    obj.sheetTint = true;
    if (obj.sheetGrad === undefined || obj.sheetGrad === false) obj.sheetGrad = true;
  } else {
    obj.sheetAsset = '';
  }

  // colorKeys 검증
  if (!Array.isArray(obj.colorKeys) || obj.colorKeys.length === 0) {
    obj.colorKeys = def.colorKeys;
  } else {
    obj.colorKeys = obj.colorKeys.filter(k => k &&
      typeof k.r === 'number' && typeof k.g === 'number' &&
      typeof k.b === 'number' && typeof k.a === 'number' &&
      typeof k.t === 'number' && k.t >= 0 && k.t <= 1
    ).sort((a, b) => a.t - b.t);
    if (obj.colorKeys.length === 0) obj.colorKeys = def.colorKeys;
  }
  return obj;
}

// ==================== Effect (다층 합성) ====================
const MAX_EFFECT_LAYERS = 64;
const MAX_LIVE_PARTICLES = 1500;

// 이 레이어의 마지막 파티클이 사라지는 시각(초)
function layerEndTime(pr) {
  const emit = pr.projectile ? Math.max(pr.duration, pr.projDistance / pr.projSpeed) : pr.duration;
  return (pr.startDelay || 0) + emit + pr.lifetimeMax;
}

function estimateLiveParticles(pr) {
  return pr.burstCount + pr.rate * pr.lifetimeMax;
}

// LLM 응답(또는 단일 파라미터 객체)을 재생 가능한 합성으로 정규화
function normalizeEffect(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('이펙트 JSON 이 객체가 아님');
  if (raw.effect && typeof raw.effect === 'object') raw = raw.effect;
  const list = Array.isArray(raw.layers) ? raw.layers : [raw];
  if (list.length === 0) throw new Error('layers 가 비어있음');
  const style = raw.style === 'pixel' ? 'pixel' : 'smooth';
  const pixelScale = Math.round(Math.max(2, Math.min(8, Number(raw.pixelScale) || 3)));
  const layers = list.slice(0, MAX_EFFECT_LAYERS).map(l => {
    const p = sanitizeParams(Object.assign(defaultParams(), l));
    p.pixelMode = style === 'pixel';
    p.pixelScale = pixelScale;
    return p;
  });
  // 총량 예산 초과 시 비율대로 축소 (브라우저 프리즈 방지)
  const live = layers.reduce((a, p) => a + estimateLiveParticles(p), 0);
  if (live > MAX_LIVE_PARTICLES) {
    const k = MAX_LIVE_PARTICLES / live;
    for (const p of layers) { p.burstCount = Math.ceil(p.burstCount * k); p.rate *= k; }
  }
  const bloom = Math.max(0, Math.min(1.5, typeof raw.bloom === 'number' ? raw.bloom : 0.6));
  const cam = raw.camera || {};
  const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const camera = {
    view: cam.view === '3d' ? '3d' : '2d',
    pitch: num(cam.pitch, -89, 89, 30),
    yaw: num(cam.yaw, -180, 180, 0),
    fov: num(cam.fov, 0, 90, 35),   // 0 = 직교
  };
  return { name: String(raw.name || '').slice(0, 40), style, pixelScale, bloom, camera, layers };
}

// 합성을 기본값과의 차이만 남긴 JSON 으로 되돌림 (LLM 수정 요청에 현재 상태를 넘길 때)
function serializeEffect(effect) {
  const def = defaultParams();
  return {
    name: effect.name, style: effect.style, pixelScale: effect.pixelScale, bloom: effect.bloom, camera: effect.camera,
    layers: effect.layers.map(p => {
      const o = {};
      for (const k in p) {
        if (k === 'pixelMode' || k === 'pixelScale' || k === 'startColor') continue;
        if (JSON.stringify(p[k]) !== JSON.stringify(def[k])) o[k] = p[k];
      }
      return o;
    }),
  };
}

// 렌더 전에 잡을 수 있는 실패 패턴 — 생성 결과를 LLM 에 되돌려 보낼 때 사용
function lintEffect(effect) {
  const out = [];
  effect.layers.forEach((p, i) => {
    const tag = `layer ${i}`;
    if (p.burstCount === 0 && p.rate === 0) out.push(`${tag}: burstCount 와 rate 가 모두 0 — 아무것도 안 나옴`);
    const peak = p.colorKeys.reduce((a, k) => Math.max(a, Math.max(k.r, k.g, k.b) * k.a), 0);
    if (peak < 0.25) out.push(`${tag}: 색이 너무 어두워 배경에서 안 보임`);
    if (Math.max(p.sizeStart, p.sizeEnd) < 2) out.push(`${tag}: 파티클 크기가 2px 미만`);
    if (p.anchorBottom && Math.abs(p.offsetY - GROUND_Y) > 40) {
      out.push(`${tag}: 바닥형인데 offsetY ${Math.round(p.offsetY)} — 바닥선 ${GROUND_Y} 에서 떠 있음`);
    }
    if (!p.sheet && ['soft', 'circle', 'ring'].includes(p.particleShape) && Math.max(p.sizeStart, p.sizeEnd) > 70) {
      out.push(`${tag}: 큰 원형 도형(${p.particleShape}) — 원이 그대로 보임. kit 시트로 교체할 것`);
    }
  });
  if (effect.layers.length < 2) out.push('레이어가 1개뿐 — 코어/본체/2차 입자를 나눠야 함');
  return out;
}


// ==================== Projectile Position ====================
function projectilePos(pr, t) {
  const rad = (pr.projAngle || 0) * Math.PI / 180;
  const dist = pr.projDistance;
  const dx = Math.cos(rad) * dist;
  const dy = Math.sin(rad) * dist;
  let x = dx * t;
  let y = dy * t;
  switch (pr.projPath) {
    case 'arc': {
      const h = pr.projArcHeight || 100;
      y += -4 * h * t * (1 - t);
      break;
    }
    case 'wave': {
      const amp = pr.projWaveAmp || 30;
      const freq = pr.projWaveFreq || 3;
      const perpX = -Math.sin(rad);
      const perpY = Math.cos(rad);
      const wave = Math.sin(t * Math.PI * 2 * freq) * amp;
      x += perpX * wave;
      y += perpY * wave;
      break;
    }
    case 'spiral': {
      const spiralR = dist * 0.3 * (1 - t);
      const spiralAngle = t * Math.PI * 6;
      x = dx * t + Math.cos(spiralAngle) * spiralR;
      y = dy * t + Math.sin(spiralAngle) * spiralR;
      break;
    }
    case 'boomerang': {
      const ease = t < 0.5 ? 2 * t : 2 * (1 - t);
      x = dx * ease;
      y = dy * ease + -4 * (pr.projArcHeight || 80) * t * (1 - t);
      break;
    }
    case 'zigzag': {
      const seg = 6;
      const phase = (t * seg) % 2;
      const perpX = -Math.sin(rad);
      const perpY = Math.cos(rad);
      const amp = pr.projWaveAmp || 40;
      const offset = (phase < 1 ? phase : 2 - phase) * 2 - 1;
      x = dx * t + perpX * offset * amp;
      y = dy * t + perpY * offset * amp;
      break;
    }
  }
  return { x, y };
}

// ==================== Physics Update (pure, for testing) ====================
// 시뮬레이션 1스텝 (pure function — sys 를 직접 수정)
function physicsStep(sys, dt) {
  const pr = sys.params;
  const dtScale = dt * 60; // 60fps 기준 보정 (jitter 의 속도)
  const time = sys.systemTime || 0;
  const list = sys.particles;
  let kept = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.life += dt;
    if (p.life >= p.maxLife) continue;
    // 중력: 양수 = 아래 (canvas +y)
    p.vy += pr.gravity * dt;
    // Jitter — 속도에 랜덤 요동 (살아있는 느낌)
    if (pr.jitter > 0) {
      p.vx += (Math.random() - 0.5) * 2 * pr.jitter * dtScale;
      p.vy += (Math.random() - 0.5) * 2 * pr.jitter * dtScale;
    }
    // Turbulence — 사인파 기반 부드러운 바람 (연기/꽃잎)
    if (pr.turbulence > 0) {
      const tx = Math.sin(p.y * 0.02 + time * 1.3 + p.maxLife * 2);
      const ty = Math.cos(p.x * 0.02 + time * 1.1 + p.maxLife * 3);
      p.vx += tx * pr.turbulence * dt;
      p.vy += ty * pr.turbulence * dt;
    }
    // Orbit / Attract — 이미터 중심 기준 회전·흡인 (소용돌이)
    if (pr.orbit !== 0 || pr.attract !== 0) {
      const ox = p.x - (pr.offsetX || 0), oy = p.y - (pr.offsetY || 0);
      const r2 = ox * ox + oy * oy;
      if (r2 > 1) {
        const r = Math.sqrt(r2);
        const rx = ox / r, ry = oy / r; // 방사 방향 단위 벡터
        p.vx += (-ry * pr.orbit - rx * pr.attract) * dt;
        p.vy += (rx * pr.orbit - ry * pr.attract) * dt;
      }
    }
    if (pr.drag > 0) {
      const f = Math.max(0, 1 - pr.drag * dt);
      p.vx *= f; p.vy *= f;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.vz) p.z += p.vz * dt;
    p.rotation += p.rotSpeed * dt;
    list[kept++] = p;  // splice 없이 제자리 압축
  }
  list.length = kept;
}

// ==================== Export (Node) / Global (Browser) ====================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    lerp, rand,
    sampleCurve, sampleColor,
    PALETTES, quantizeToPalette, colorBucket,
    ALL_SHAPES,
    extractJson,
    humanizeLLMError,
    defaultParams, sheetFrameIndex, sanitizeParams,
    normalizeEffect, serializeEffect, lintEffect, layerEndTime, estimateLiveParticles,
    MAX_EFFECT_LAYERS, MAX_LIVE_PARTICLES,
    cameraBasis, cameraRotate, velocityRotation, prepareAiLayers, GROUND_Y, detectSheetGrid, sliceFrames, layoutSlices, SHEET_ASSETS,
    VALID_SHAPES, VALID_PARTICLE_SHAPES, VALID_BLEND_MODES, VALID_SIZE_CURVES, VALID_PROJ_PATHS,
    projectilePos,
    physicsStep,
  };
}
