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

// ==================== Shape Inside Test (pixel rasterization) ====================

// 공통 ray-casting 점-다각형 내부 판정
function polyInsideFn(verts) {
  const n = verts.length / 2;
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = verts[i * 2], yi = verts[i * 2 + 1];
      const xj = verts[j * 2], yj = verts[j * 2 + 1];
      if (((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };
}

// 정다각형 또는 별형 정점 생성
function makePolyVerts(count, outerR, innerR, angleOffset) {
  const verts = [];
  const hasInner = innerR !== undefined && innerR !== outerR;
  const total = hasInner ? count * 2 : count;
  for (let i = 0; i < total; i++) {
    const rad = hasInner ? ((i & 1) ? innerR : outerR) : outerR;
    const ang = (i / total) * Math.PI * 2 - Math.PI / 2 + (angleOffset || 0);
    verts.push(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  return verts;
}

function makeInsideFn(shape, R) {
  const R2 = R * R + R * 0.5;
  switch (shape) {
    case 'square':
      return (x, y) => Math.abs(x) <= R && Math.abs(y) <= R;
    case 'diamond':
      return (x, y) => Math.abs(x) + Math.abs(y) <= R;
    case 'triangle':
      return (x, y) => {
        if (y < -R || y > R * 0.5) return false;
        const maxX = (y + R) * 0.58;
        return Math.abs(x) <= maxX;
      };
    case 'star':
      return polyInsideFn(makePolyVerts(5, R, R * 0.45));
    case 'teardrop':
      return (x, y) => {
        if (y <= 0) return x * x + y * y <= R2;
        if (y > R) return false;
        const maxX = R * (1 - y / R);
        return Math.abs(x) <= maxX;
      };
    case 'ring': {
      const innerR2 = (R * 0.55) * (R * 0.55);
      return (x, y) => {
        const d2 = x * x + y * y;
        return d2 <= R2 && d2 >= innerR2;
      };
    }
    case 'cross': {
      const bar = R * 0.35;
      return (x, y) => {
        const ax = Math.abs(x), ay = Math.abs(y);
        return (ax <= bar && ay <= R) || (ax <= R && ay <= bar);
      };
    }
    case 'hexagon':
      return polyInsideFn(makePolyVerts(6, R));
    case 'spark':
      return polyInsideFn(makePolyVerts(4, R, R * 0.22));
    case 'crescent': {
      const innerR2 = (R * 0.85) * (R * 0.85);
      const ox = R * 0.35;
      return (x, y) => {
        const d1 = x * x + y * y;
        if (d1 > R2) return false;
        const d2 = (x - ox) * (x - ox) + y * y;
        return d2 > innerR2;
      };
    }
    case 'flame':
      return (x, y) => {
        if (y <= 0) {
          const xs = x / (R * 0.5);
          const ys = y / (R * 1.1);
          return xs * xs + ys * ys <= 1;
        }
        if (y > R) return false;
        const t = y / R;
        const maxX = R * (1 - t * t * 0.6);
        return Math.abs(x) <= maxX;
      };
    case 'pentagon':
      return polyInsideFn(makePolyVerts(5, R));
    case 'octagon':
      return polyInsideFn(makePolyVerts(8, R));
    case 'bar':
      return (x, y) => Math.abs(x) <= R && Math.abs(y) <= R * 0.25;
    case 'pill': {
      const halfH = R * 0.4;
      const straightW = R - halfH;
      return (x, y) => {
        if (Math.abs(y) > halfH) return false;
        const ax = Math.abs(x);
        if (ax <= straightW) return true;
        const dx = ax - straightW;
        return dx * dx + y * y <= halfH * halfH;
      };
    }
    case 'ellipse': {
      const ry = R * 0.5;
      return (x, y) => {
        const a = x / R, b = y / ry;
        return a * a + b * b <= 1;
      };
    }
    case 'bubble': {
      const innerR2 = (R * 0.85) * (R * 0.85);
      return (x, y) => {
        const d2 = x * x + y * y;
        return d2 <= R2 && d2 >= innerR2;
      };
    }
    case 'heart': {
      const s = R * 0.85;
      return (x, y) => {
        const nx = x / s, ny = -y / s;
        const a = nx * nx + ny * ny - 1;
        return a * a * a - nx * nx * ny * ny * ny <= 0;
      };
    }
    case 'snowflake': {
      const thick = R * 0.15;
      return (x, y) => {
        for (let i = 0; i < 3; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const cs = Math.cos(ang), sn = Math.sin(ang);
          const lx = x * cs + y * sn;
          const ly = -x * sn + y * cs;
          if (Math.abs(lx) <= thick && Math.abs(ly) <= R) return true;
        }
        return x * x + y * y <= R * R * 0.1;
      };
    }
    case 'bolt':
      return polyInsideFn([
        0, -R, -R * 0.4, -R * 0.2, 0, -R * 0.2,
        -R * 0.4, R, R * 0.4, -R * 0.1, 0, -R * 0.1,
      ]);
    case 'shuriken':
      return polyInsideFn(makePolyVerts(4, R, R * 0.5, Math.PI / 4));
    case 'arrow':
      return polyInsideFn([
        0, -R, R, -R + R * 0.7, R * 0.25, -R + R * 0.7,
        R * 0.25, R, -R * 0.25, R, -R * 0.25, -R + R * 0.7,
        -R, -R + R * 0.7,
      ]);
    case 'leaf': {
      const h = R * 0.6;
      return (x, y) => {
        if (Math.abs(x) > R) return false;
        const t = x / R;
        const maxY = h * (1 - t * t);
        return Math.abs(y) <= maxY;
      };
    }
    case 'chevron':
      return polyInsideFn([
        -R, -R, 0, -R * 0.3, R, 0,
        0, R * 0.3, -R, R, -R * 0.3, 0,
      ]);
    case 'shield': {
      return (x, y) => {
        if (Math.abs(x) > R) return false;
        if (y < -R || y > R) return false;
        if (y <= R * 0.2) return true;
        const ry = R * 0.8;
        const ny = (y - R * 0.2) / ry;
        const nx = x / R;
        return nx * nx + ny * ny <= 1;
      };
    }
    case 'sparkle':
      return polyInsideFn(makePolyVerts(4, R, R * 0.1));
    case 'circle':
    default:
      return (x, y) => x * x + y * y <= R2;
  }
}

const ALL_SHAPES = ['circle','square','diamond','triangle','star','teardrop',
                    'ring','cross','hexagon','spark','crescent','flame',
                    'pentagon','octagon','bar','pill','ellipse','bubble',
                    'heart','snowflake','bolt','shuriken','arrow','leaf',
                    'chevron','shield','sparkle'];

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
function pickBestGeminiModel(available, forVision) {
  const visionPriorities = [
    /^gemini-1\.5-flash-latest$/,
    /^gemini-1\.5-flash$/,
    /^gemini-1\.5-flash-\d/,
    /^gemini-2\.0-flash$/,
    /^gemini-2\.0-flash-exp/,
    /^gemini-flash-latest$/,
    /^gemini-2\.5-flash$/,
    /^gemini-1\.5-pro-latest$/,
    /^gemini-1\.5-pro$/,
    /^gemini-2\.5-pro$/,
    /^gemini-2\.0-pro/,
  ];
  const textPriorities = [
    /^gemini-2\.5-flash$/,
    /^gemini-2\.0-flash$/,
    /^gemini-2\.0-flash-exp/,
    /^gemini-flash-latest$/,
    /^gemini-1\.5-flash-latest$/,
    /^gemini-1\.5-flash$/,
    /^gemini-2\.5-pro$/,
    /^gemini-2\.0-pro/,
    /^gemini-1\.5-pro-latest$/,
    /^gemini-1\.5-pro$/,
    /^gemini-pro$/,
  ];
  const priorities = forVision ? visionPriorities : textPriorities;
  for (const pat of priorities) {
    const found = available.find(m => pat.test(m));
    if (found) return found;
  }
  return available[0];
}

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
    projImpact: 'none',    // 착탄 프리셋 이름 ('none' = 없음)
    projBodySize: 0,       // 투사체 본체 크기 (0 = 본체 없음)
    projBodyShape: 'circle', // 본체 파티클 모양
    projBodyGlow: true,    // 본체 발광 효과
    // 연쇄 이펙트 (Chain)
    chainNext: 'none',     // 다음 이펙트 프리셋 이름
    chainDelay: 0,         // 다음 이펙트까지 지연(초)
  };
}

// ==================== Validation ====================
const VALID_SHAPES = ['Point', 'Circle', 'Disc', 'Box', 'Cone'];
const VALID_PARTICLE_SHAPES = ALL_SHAPES;
const VALID_BLEND_MODES = ['Alpha', 'Additive'];
const VALID_SIZE_CURVES = ['linear', 'easeOut', 'easeIn', 'easeInOut', 'easeOutBack'];
const VALID_PROJ_PATHS = ['linear', 'arc', 'wave', 'spiral', 'boomerang', 'zigzag'];

function validateParams(p) {
  const errs = [];
  if (typeof p.duration !== 'number' || p.duration <= 0) errs.push('duration > 0 필요');
  if (typeof p.lifetimeMin !== 'number' || p.lifetimeMin < 0) errs.push('lifetimeMin >= 0 필요');
  if (typeof p.lifetimeMax !== 'number' || p.lifetimeMax < p.lifetimeMin) errs.push('lifetimeMax >= lifetimeMin 필요');
  if (p.speedMax < p.speedMin) errs.push('speedMax >= speedMin 필요');
  if (p.sizeStart < 0 || p.sizeEnd < 0) errs.push('size >= 0 필요');
  if (!VALID_SHAPES.includes(p.shape)) errs.push(`shape invalid: ${p.shape}`);
  if (!VALID_PARTICLE_SHAPES.includes(p.particleShape)) errs.push(`particleShape invalid: ${p.particleShape}`);
  if (!VALID_BLEND_MODES.includes(p.blendMode)) errs.push(`blendMode invalid: ${p.blendMode}`);
  if (p.sizeCurve && !VALID_SIZE_CURVES.includes(p.sizeCurve)) errs.push(`sizeCurve invalid: ${p.sizeCurve}`);
  if (!Array.isArray(p.colorKeys) || p.colorKeys.length === 0) errs.push('colorKeys 배열 필요');
  else {
    for (const k of p.colorKeys) {
      if (typeof k.r !== 'number' || typeof k.g !== 'number' || typeof k.b !== 'number' || typeof k.a !== 'number' || typeof k.t !== 'number') {
        errs.push('colorKey 형식 오류'); break;
      }
      if (k.t < 0 || k.t > 1) { errs.push(`colorKey.t ${k.t} out of [0,1]`); break; }
    }
  }
  if (p.fadeIn < 0 || p.fadeIn > 1) errs.push(`fadeIn out of range: ${p.fadeIn}`);
  if (p.fadeOut < 0 || p.fadeOut > 1) errs.push(`fadeOut out of range: ${p.fadeOut}`);
  if (p.projectile) {
    if (p.projSpeed <= 0) errs.push('projSpeed > 0 필요');
    if (p.projDistance <= 0) errs.push('projDistance > 0 필요');
    if (!VALID_PROJ_PATHS.includes(p.projPath)) errs.push(`projPath invalid: ${p.projPath}`);
  }
  return errs;
}

// ==================== Projectile Position ====================
function projectilePos(pr, t) {
  // t: 0~1 (이동 진행률)
  const rad = (pr.projAngle || 0) * Math.PI / 180;
  const dist = pr.projDistance;
  const dx = Math.cos(rad) * dist;
  const dy = Math.sin(rad) * dist;
  let x = dx * t;
  let y = dy * t;
  switch (pr.projPath) {
    case 'arc': {
      const h = pr.projArcHeight || 100;
      y += -4 * h * t * (1 - t);  // 포물선 (위로 볼록)
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
  sys.systemTime = (sys.systemTime || 0) + dt;
  const dtScale = dt * 60;
  if (!sys.particles) sys.particles = [];
  for (let i = sys.particles.length - 1; i >= 0; i--) {
    const p = sys.particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) { sys.particles.splice(i, 1); continue; }
    p.vy += pr.gravity * dt;
    if (pr.jitter > 0) {
      p.vx += (Math.random() - 0.5) * 2 * pr.jitter * dtScale;
      p.vy += (Math.random() - 0.5) * 2 * pr.jitter * dtScale;
    }
    if (pr.turbulence > 0) {
      const tx = Math.sin(p.y * 0.02 + sys.systemTime * 1.3 + p.maxLife * 2);
      const ty = Math.cos(p.x * 0.02 + sys.systemTime * 1.1 + p.maxLife * 3);
      p.vx += tx * pr.turbulence * dt;
      p.vy += ty * pr.turbulence * dt;
    }
    if (pr.orbit !== 0 || pr.attract !== 0) {
      const r2 = p.x * p.x + p.y * p.y;
      if (r2 > 1) {
        const r = Math.sqrt(r2);
        const rx = p.x / r, ry = p.y / r;
        if (pr.orbit !== 0) {
          p.vx += -ry * pr.orbit * dt;
          p.vy += rx * pr.orbit * dt;
        }
        if (pr.attract !== 0) {
          p.vx -= rx * pr.attract * dt;
          p.vy -= ry * pr.attract * dt;
        }
      }
    }
    if (pr.drag > 0) {
      const f = Math.max(0, 1 - pr.drag * dt);
      p.vx *= f; p.vy *= f;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.rotSpeed * dt;
  }
}

// ==================== Export (Node) / Global (Browser) ====================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    lerp, rand,
    sampleCurve, sampleColor,
    PALETTES, quantizeToPalette, colorBucket,
    polyInsideFn, makePolyVerts, makeInsideFn, ALL_SHAPES,
    extractJson,
    pickBestGeminiModel, humanizeLLMError,
    defaultParams,
    VALID_SHAPES, VALID_PARTICLE_SHAPES, VALID_BLEND_MODES, VALID_SIZE_CURVES, VALID_PROJ_PATHS,
    validateParams,
    projectilePos,
    physicsStep,
  };
}
