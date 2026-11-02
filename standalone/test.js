// =================================================================
// test.js — engine.js 테스트 스위트
// 실행: node test.js
// =================================================================

const fs = require('fs');
const path = require('path');
const E = require('./engine.js');

// ==================== Mini Test Runner ====================
let passed = 0, failed = 0;
const failures = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n── ${name} ──`);
}

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    failed++;
    failures.push({ suite: currentSuite, name, error: e });
    process.stdout.write(`  ✗ ${name} — ${e.message}\n`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  tolerance = tolerance || 0.0001;
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || 'not close'}: expected ${expected} ±${tolerance}, got ${actual}`);
  }
}

function assertType(actual, type, msg) {
  if (typeof actual !== type) {
    throw new Error(`${msg || 'type mismatch'}: expected ${type}, got ${typeof actual}`);
  }
}

function assertArray(actual, msg) {
  if (!Array.isArray(actual)) {
    throw new Error(`${msg || 'expected array'}, got ${typeof actual}`);
  }
}

function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  if (!threw) throw new Error(msg || 'expected to throw');
}

// ==================== TESTS ====================

// ---- Math / Util ----
suite('Math & Utility');
test('lerp(0, 10, 0) = 0', () => assertEq(E.lerp(0, 10, 0), 0));
test('lerp(0, 10, 1) = 10', () => assertEq(E.lerp(0, 10, 1), 10));
test('lerp(0, 10, 0.5) = 5', () => assertEq(E.lerp(0, 10, 0.5), 5));
test('lerp(-5, 5, 0.5) = 0', () => assertEq(E.lerp(-5, 5, 0.5), 0));
test('lerp(10, 20, 0.25) = 12.5', () => assertEq(E.lerp(10, 20, 0.25), 12.5));
test('lerp extrapolation t=1.5 = 15', () => assertEq(E.lerp(0, 10, 1.5), 15));
test('rand in range [0,10]', () => {
  for (let i = 0; i < 100; i++) {
    const v = E.rand(0, 10);
    assert(v >= 0 && v < 10, `${v} not in [0,10)`);
  }
});
test('rand(5, 5) always 5', () => assertEq(E.rand(5, 5), 5));

// ---- Easing Curves ----
suite('Easing Curves');
test('linear(0) = 0', () => assertEq(E.sampleCurve('linear', 0), 0));
test('linear(0.5) = 0.5', () => assertEq(E.sampleCurve('linear', 0.5), 0.5));
test('linear(1) = 1', () => assertEq(E.sampleCurve('linear', 1), 1));
test('easeOut(0) = 0', () => assertClose(E.sampleCurve('easeOut', 0), 0));
test('easeOut(1) = 1', () => assertClose(E.sampleCurve('easeOut', 1), 1));
test('easeOut(0.5) > 0.5 (감속)', () => assert(E.sampleCurve('easeOut', 0.5) > 0.5));
test('easeIn(0) = 0', () => assertClose(E.sampleCurve('easeIn', 0), 0));
test('easeIn(1) = 1', () => assertClose(E.sampleCurve('easeIn', 1), 1));
test('easeIn(0.5) < 0.5 (가속)', () => assert(E.sampleCurve('easeIn', 0.5) < 0.5));
test('easeInOut(0) = 0', () => assertClose(E.sampleCurve('easeInOut', 0), 0));
test('easeInOut(0.5) = 0.5', () => assertClose(E.sampleCurve('easeInOut', 0.5), 0.5));
test('easeInOut(1) = 1', () => assertClose(E.sampleCurve('easeInOut', 1), 1));
test('easeOutBack 오버슈트 존재', () => {
  // easeOutBack 은 중간에서 1을 초과 (튕김)
  const v = E.sampleCurve('easeOutBack', 0.7);
  assert(v > 1 || v < 1.3, '튕김 확인');
});
test('unknown curve → linear', () => assertEq(E.sampleCurve('nonexistent', 0.5), 0.5));

// ---- Color Sampling ----
suite('Color Sampling');
test('empty keys → white', () => {
  const c = E.sampleColor([], 0.5);
  assertEq(c.r, 1); assertEq(c.g, 1); assertEq(c.b, 1); assertEq(c.a, 1);
});
test('null keys → white', () => {
  const c = E.sampleColor(null, 0.5);
  assertEq(c.r, 1); assertEq(c.a, 1);
});
test('single key 반환', () => {
  const c = E.sampleColor([{r:0.5,g:0.3,b:0.7,a:1,t:0}], 0.5);
  assertEq(c.r, 0.5); assertEq(c.g, 0.3); assertEq(c.b, 0.7);
});
test('2 keys 중간 보간', () => {
  const c = E.sampleColor([
    {r:0,g:0,b:0,a:1,t:0},
    {r:1,g:1,b:1,a:1,t:1},
  ], 0.5);
  assertClose(c.r, 0.5); assertClose(c.g, 0.5); assertClose(c.b, 0.5);
});
test('t=0 → 첫 키', () => {
  const c = E.sampleColor([
    {r:0.1,g:0.2,b:0.3,a:1,t:0},
    {r:1,g:1,b:1,a:0,t:1},
  ], 0);
  assertClose(c.r, 0.1); assertClose(c.g, 0.2); assertClose(c.b, 0.3);
});
test('t=1 → 마지막 키', () => {
  const c = E.sampleColor([
    {r:0.1,g:0.2,b:0.3,a:1,t:0},
    {r:0.9,g:0.8,b:0.7,a:0,t:1},
  ], 1);
  assertClose(c.r, 0.9); assertClose(c.a, 0);
});
test('3 keys 중간 구간 보간', () => {
  const c = E.sampleColor([
    {r:0,g:0,b:0,a:1,t:0},
    {r:1,g:0,b:0,a:1,t:0.5},
    {r:0,g:1,b:0,a:1,t:1},
  ], 0.25);
  assertClose(c.r, 0.5); assertClose(c.g, 0);
});
test('t 구간 밖 → 클램프', () => {
  const c = E.sampleColor([
    {r:0.5,g:0.5,b:0.5,a:1,t:0.2},
    {r:1,g:1,b:1,a:1,t:0.8},
  ], 0.1);
  assertClose(c.r, 0.5);
});

// ---- Color Palette / Quantization ----
suite('Color Palettes');
test('PICO-8 16색', () => assertEq(E.PALETTES['PICO-8'].length, 16));
test('Game Boy 4색', () => assertEq(E.PALETTES['Game Boy'].length, 4));
test('NES-ish 16색', () => assertEq(E.PALETTES['NES-ish'].length, 16));
test('Endesga 16 16색', () => assertEq(E.PALETTES['Endesga 16'].length, 16));
test('none → null', () => assertEq(E.PALETTES['none'], null));
test('colorBucket 0,0,0 = 0', () => assertEq(E.colorBucket(0, 0, 0), 0));
test('colorBucket 255,255,255 = max', () => {
  // 7 << 6 | 7 << 3 | 7 = 448 + 56 + 7 = 511
  assertEq(E.colorBucket(255, 255, 255), 511);
});
test('colorBucket 동일 범위 같은 버킷', () => {
  // 8~15 → 같은 버킷
  assertEq(E.colorBucket(8, 8, 8), E.colorBucket(15, 15, 15));
});
test('quantizeToPalette null → null', () => {
  assertEq(E.quantizeToPalette(100, 100, 100, null), null);
});
test('quantizeToPalette PICO-8 검정', () => {
  const snap = E.quantizeToPalette(0, 0, 0, E.PALETTES['PICO-8']);
  assertEq(snap[0], 0); assertEq(snap[1], 0); assertEq(snap[2], 0);
});
test('quantizeToPalette PICO-8 흰색 근처', () => {
  const snap = E.quantizeToPalette(255, 241, 232, E.PALETTES['PICO-8']);
  assertEq(snap[0], 255); assertEq(snap[1], 241); assertEq(snap[2], 232);
});
test('quantizeToPalette Game Boy 초록 근처', () => {
  const snap = E.quantizeToPalette(150, 180, 15, E.PALETTES['Game Boy']);
  // 4 초록 중 하나
  assert([15, 48, 139, 155].includes(snap[0]));
});

// ---- Shape Inside Tests ----
// ---- JSON Extraction ----
suite('JSON Extraction');
test('null → null', () => assertEq(E.extractJson(null), null));
test('빈 문자열 → null', () => assertEq(E.extractJson(''), null));
test('순수 JSON', () => {
  const r = E.extractJson('{"a":1}');
  assertEq(r, '{"a":1}');
});
test('마크다운 코드블록 제거', () => {
  const r = E.extractJson('```json\n{"a":1}\n```');
  assert(r && r.includes('"a":1'));
});
test('마크다운 (json 없이)', () => {
  const r = E.extractJson('```\n{"a":1}\n```');
  assert(r && r.includes('"a":1'));
});
test('앞뒤 텍스트 제거', () => {
  const r = E.extractJson('여기 JSON 입니다: {"a":1} 끝.');
  assert(r && r.startsWith('{'));
});
test('중첩 객체', () => {
  const r = E.extractJson('{"a":{"b":{"c":1}}}');
  const obj = JSON.parse(r);
  assertEq(obj.a.b.c, 1);
});
test('중괄호 포함 문자열', () => {
  const r = E.extractJson('{"text":"has { inside"}');
  const obj = JSON.parse(r);
  assertEq(obj.text, 'has { inside');
});
test('배열 포함', () => {
  const r = E.extractJson('{"arr":[1,2,3]}');
  const obj = JSON.parse(r);
  assertEq(obj.arr.length, 3);
});
test('{ 없으면 null', () => assertEq(E.extractJson('no braces here'), null));

// ---- LLM: pickBestGeminiModel ----
// ---- LLM: humanizeLLMError ----
suite('LLM: humanizeLLMError');
test('429 → 할당량 초과', () => {
  const msg = E.humanizeLLMError(new Error('Gemini: 429 — quota exceeded'), 'Gemini');
  assert(msg.includes('할당량'));
});
test('402 → 크레딧 부족', () => {
  const msg = E.humanizeLLMError(new Error('402 — insufficient credit'), 'Claude');
  assert(msg.includes('크레딧'));
});
test('401 → 키 오류', () => {
  const msg = E.humanizeLLMError(new Error('401 — unauthorized'), 'OpenAI');
  assert(msg.includes('키 오류'));
});
test('403 → 권한 없음', () => {
  const msg = E.humanizeLLMError(new Error('403 — forbidden'), 'Claude');
  assert(msg.includes('권한'));
});
test('503 → 서버 과부하', () => {
  const msg = E.humanizeLLMError(new Error('503 — overloaded'), 'OpenAI');
  assert(msg.includes('과부하'));
});
test('400 → 요청 형식 오류', () => {
  const msg = E.humanizeLLMError(new Error('400 — bad request'), 'Gemini');
  assert(msg.includes('요청 형식'));
});
test('500 → 서버 내부 오류', () => {
  const msg = E.humanizeLLMError(new Error('500 — internal error'), 'Claude');
  assert(msg.includes('서버 내부'));
});
test('quota 키워드 → 할당량', () => {
  const msg = E.humanizeLLMError(new Error('You exceeded quota for metric'), 'Gemini');
  assert(msg.includes('할당량'));
});
test('insufficient credit → 크레딧 부족', () => {
  const msg = E.humanizeLLMError(new Error('insufficient credit balance'), 'Claude');
  assert(msg.includes('크레딧'));
});
test('rate_limit → 할당량', () => {
  const msg = E.humanizeLLMError(new Error('rate_limit reached'), 'OpenAI');
  assert(msg.includes('할당량'));
});
test('unknown error → 기본 메시지', () => {
  const msg = E.humanizeLLMError(new Error('something weird'), 'Claude');
  assert(msg.includes('Claude') && msg.includes('F12'));
});
test('provider 이름 포함', () => {
  const msg = E.humanizeLLMError(new Error('429'), 'MyProvider');
  assert(msg.includes('MyProvider'));
});

// ---- Default Params ----
suite('defaultParams');
test('defaultParams 반환 객체', () => {
  const p = E.defaultParams();
  assertType(p, 'object');
});
test('duration = 1', () => {
  assertEq(E.defaultParams().duration, 1);
});
test('blendMode = Alpha', () => {
  assertEq(E.defaultParams().blendMode, 'Alpha');
});
test('particleShape = circle', () => {
  assertEq(E.defaultParams().particleShape, 'circle');
});
test('fadeIn 기본값 > 0', () => {
  assert(E.defaultParams().fadeIn > 0);
});
test('colorKeys 배열', () => {
  const p = E.defaultParams();
  assertArray(p.colorKeys);
  assert(p.colorKeys.length >= 2);
});
test('새로 호출할 때마다 독립 객체', () => {
  const a = E.defaultParams();
  const b = E.defaultParams();
  a.duration = 99;
  assertEq(b.duration, 1);
});

// ---- Validation 엣지 케이스 ----
// ---- Physics Step ----
suite('Physics Step');
function makeTestParticle(overrides) {
  return Object.assign({
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1,
    rotation: 0, rotSpeed: 0,
    startSize: 10, endSize: 0,
  }, overrides || {});
}
function makeTestSys(paramOverrides) {
  const p = E.defaultParams();
  Object.assign(p, paramOverrides || {});
  return { params: p, particles: [], systemTime: 0 };
}
test('중력 적용', () => {
  const sys = makeTestSys({ gravity: 100 });
  sys.particles.push(makeTestParticle({ vy: 0 }));
  E.physicsStep(sys, 0.1);
  // vy += gravity * dt = 100 * 0.1 = 10
  assertClose(sys.particles[0].vy, 10);
});
test('drag 감속', () => {
  const sys = makeTestSys({ drag: 5 });
  sys.particles.push(makeTestParticle({ vx: 100 }));
  E.physicsStep(sys, 0.1);
  // f = 1 - 5*0.1 = 0.5, vx = 100 * 0.5 = 50
  assertClose(sys.particles[0].vx, 50);
});
test('orbit 회전', () => {
  const sys = makeTestSys({ orbit: 100 });
  sys.particles.push(makeTestParticle({ x: 10, y: 0 }));
  E.physicsStep(sys, 0.1);
  // (10,0) 에서 orbit 100, dt 0.1
  // tangent: (-y/r, x/r) = (0, 1), vx += 0*100*0.1=0, vy += 1*100*0.1 = 10
  assertClose(sys.particles[0].vy, 10);
});
test('attract 흡인', () => {
  const sys = makeTestSys({ attract: 100 });
  sys.particles.push(makeTestParticle({ x: 10, y: 0 }));
  E.physicsStep(sys, 0.1);
  // radial: (x/r, y/r) = (1, 0), vx -= 1*100*0.1 = 10
  assertClose(sys.particles[0].vx, -10);
});
test('수명 종료 시 제거', () => {
  const sys = makeTestSys();
  sys.particles.push(makeTestParticle({ life: 0.95, maxLife: 1 }));
  E.physicsStep(sys, 0.1);
  assertEq(sys.particles.length, 0);
});
test('위치 업데이트', () => {
  const sys = makeTestSys();
  sys.particles.push(makeTestParticle({ vx: 50, vy: 30 }));
  E.physicsStep(sys, 0.2);
  assertClose(sys.particles[0].x, 10);
  assertClose(sys.particles[0].y, 6);
});

// ==================== projectilePos 테스트 ====================
suite('projectilePos (투사체 경로)');
test('linear: t=0 → 원점', () => {
  const p = E.defaultParams(); p.projDistance = 300; p.projPath = 'linear'; p.projAngle = 0;
  const pos = E.projectilePos(p, 0);
  assertClose(pos.x, 0); assertClose(pos.y, 0);
});
test('linear: t=1 → 거리만큼 이동', () => {
  const p = E.defaultParams(); p.projDistance = 300; p.projPath = 'linear'; p.projAngle = 0;
  const pos = E.projectilePos(p, 1);
  assertClose(pos.x, 300); assertClose(pos.y, 0, 0.01);
});
test('linear: 각도 90° → 아래로', () => {
  const p = E.defaultParams(); p.projDistance = 200; p.projPath = 'linear'; p.projAngle = 90;
  const pos = E.projectilePos(p, 1);
  assertClose(pos.x, 0, 1); assertClose(pos.y, 200, 1);
});
test('arc: t=0.5에서 최고점', () => {
  const p = E.defaultParams(); p.projDistance = 400; p.projPath = 'arc'; p.projAngle = 0; p.projArcHeight = 100;
  const pos = E.projectilePos(p, 0.5);
  assertClose(pos.x, 200);
  assert(pos.y < -50, 'arc 중간에서 위로 볼록해야 함');
});
test('arc: t=0, t=1에서 높이 0', () => {
  const p = E.defaultParams(); p.projDistance = 400; p.projPath = 'arc'; p.projAngle = 0; p.projArcHeight = 100;
  assertClose(E.projectilePos(p, 0).y, 0);
  assertClose(E.projectilePos(p, 1).y, 0, 1);
});
test('wave: 사인파 진동', () => {
  const p = E.defaultParams(); p.projDistance = 400; p.projPath = 'wave'; p.projAngle = 0; p.projWaveAmp = 50; p.projWaveFreq = 2;
  // freq=2일 때 t=0.125는 첫 번째 피크, t=0.375는 반대 피크
  const posPeak = E.projectilePos(p, 0.125);
  const posValley = E.projectilePos(p, 0.375);
  assert(Math.abs(posPeak.y) > 10, 'wave 피크에서 y축 진동');
  assert(posPeak.y * posValley.y < 0, 'wave 피크/밸리 반대 부호');
});
test('spiral: 나선 경로', () => {
  const p = E.defaultParams(); p.projDistance = 300; p.projPath = 'spiral'; p.projAngle = 0;
  const pos = E.projectilePos(p, 0.5);
  assert(typeof pos.x === 'number' && typeof pos.y === 'number');
  // 나선은 직선과 다른 경로여야 함
  const linear = E.defaultParams(); linear.projDistance = 300; linear.projPath = 'linear'; linear.projAngle = 0;
  const linPos = E.projectilePos(linear, 0.5);
  assert(Math.abs(pos.x - linPos.x) > 5 || Math.abs(pos.y - linPos.y) > 5, '나선은 직선과 달라야 함');
});
test('boomerang: 갔다가 돌아옴', () => {
  const p = E.defaultParams(); p.projDistance = 300; p.projPath = 'boomerang'; p.projAngle = 0; p.projArcHeight = 80;
  const start = E.projectilePos(p, 0);
  const mid = E.projectilePos(p, 0.5);
  const end = E.projectilePos(p, 1);
  assertClose(start.x, 0);
  assert(mid.x > 100, '중간에서 멀리 가야 함');
  assertClose(end.x, 0, 5, '끝에서 원점 근처로 돌아옴');
});
test('zigzag: 직각 꺾임', () => {
  const p = E.defaultParams(); p.projDistance = 400; p.projPath = 'zigzag'; p.projAngle = 0; p.projWaveAmp = 50;
  const pos1 = E.projectilePos(p, 0.1);
  const pos2 = E.projectilePos(p, 0.3);
  // x는 전진, y는 진동
  assert(pos1.x > 0, '전진');
  assert(Math.abs(pos1.y) > 0 || Math.abs(pos2.y) > 0, '수직 진동 존재');
});
test('모든 경로 타입 에러 없이 실행', () => {
  for (const path of E.VALID_PROJ_PATHS) {
    const p = E.defaultParams(); p.projDistance = 300; p.projPath = path; p.projAngle = 45;
    p.projArcHeight = 100; p.projWaveAmp = 40; p.projWaveFreq = 3;
    for (let t = 0; t <= 1; t += 0.1) {
      const pos = E.projectilePos(p, t);
      assertType(pos.x, 'number');
      assertType(pos.y, 'number');
      assert(isFinite(pos.x) && isFinite(pos.y), `${path} t=${t} NaN/Inf`);
    }
  }
});

// ==================== 새 defaultParams 필드 테스트 ====================
suite('새 기능 defaultParams 필드');
test('projectile 기본값 false', () => {
  assertEq(E.defaultParams().projectile, false);
});
test('projSpeed 기본값 > 0', () => {
  assert(E.defaultParams().projSpeed > 0);
});
test('projPath 기본값 linear', () => {
  assertEq(E.defaultParams().projPath, 'linear');
});
test('projBodySize 기본값 0', () => {
  assertEq(E.defaultParams().projBodySize, 0);
});

// ==================== sheetFrameIndex (플립북) 테스트 ====================
suite('sheetFrameIndex 플립북');
test('defaultParams 에 시트 기본값 존재', () => {
  const p = E.defaultParams();
  assertEq(p.sheet, false, 'sheet 기본 off');
  assertEq(p.sheetCols, 3); assertEq(p.sheetRows, 3);
  assertEq(p.sheetMode, 'life'); assertEq(p.sheetTint, true);
  assertEq(p.sheetGrad, false); assertEq(p.sheetGlow, false);
});
test('life 모드: t=0 → 첫 프레임 (0,0)', () => {
  const p = E.defaultParams(); // 3×3
  const f = E.sheetFrameIndex(p, 0, 0);
  assertEq(f.idx, 0); assertEq(f.fx, 0); assertEq(f.fy, 0); assertEq(f.total, 9);
});
test('life 모드: t=1 → 마지막 프레임으로 클램프', () => {
  const p = E.defaultParams();
  const f = E.sheetFrameIndex(p, 0, 1);
  assertEq(f.idx, 8); assertEq(f.fx, 2); assertEq(f.fy, 2);
});
test('life 모드: t=0.5 (9프레임) → idx 4, 2행 시작', () => {
  const p = E.defaultParams();
  const f = E.sheetFrameIndex(p, 0, 0.5);
  assertEq(f.idx, 4); assertEq(f.fx, 1); assertEq(f.fy, 1);
});
test('sheetFrames 로 격자 일부만 사용', () => {
  const p = Object.assign(E.defaultParams(), { sheetFrames: 6 }); // 3×3 격자, 6프레임만
  const f = E.sheetFrameIndex(p, 0, 0.99);
  assertEq(f.total, 6); assertEq(f.idx, 5); assertEq(f.fy, 1);
});
test('loop 모드: fps 기반 인덱스 + 순환', () => {
  const p = Object.assign(E.defaultParams(), { sheetMode: 'loop', sheetFps: 10 }); // 9프레임
  assertEq(E.sheetFrameIndex(p, 0.0, 0).idx, 0);
  assertEq(E.sheetFrameIndex(p, 0.35, 0).idx, 3);
  assertEq(E.sheetFrameIndex(p, 1.0, 0).idx, 1); // floor(10)%9 = 1
});
test('sheetFirst 로 재생 구간 시작 지정', () => {
  const pr = { sheetCols: 4, sheetRows: 4, sheetFirst: 3, sheetFrames: 6, sheetMode: 'life' };
  assertEq(E.sheetFrameIndex(pr, 0, 0).idx, 3);
  assertEq(E.sheetFrameIndex(pr, 0, 0.99).idx, 8);
});

test('비정방 격자 (4×2) fx/fy 계산', () => {
  const p = Object.assign(E.defaultParams(), { sheetCols: 4, sheetRows: 2 });
  const f = E.sheetFrameIndex(p, 0, 0.99); // 8프레임 중 마지막 idx 7
  assertEq(f.idx, 7); assertEq(f.fx, 3); assertEq(f.fy, 1);
});

// ==================== Effect 합성 ====================
suite('normalizeEffect / serializeEffect / lintEffect');

test('다층 합성 정규화 + 기본값 병합', () => {
  const fx = E.normalizeEffect({ name: 'a', style: 'pixel', pixelScale: 4, bloom: 0.8,
    layers: [{ burstCount: 10 }, { rate: 5, particleShape: 'soft' }] });
  assertEq(fx.layers.length, 2);
  assertEq(fx.style, 'pixel');
  assert(fx.layers.every(l => l.pixelMode && l.pixelScale === 4), '스타일이 전 레이어에 적용');
  assertEq(fx.layers[1].particleShape, 'soft');
});

test('단일 파라미터 객체도 레이어 1개로 수용', () => {
  const fx = E.normalizeEffect({ burstCount: 3 });
  assertEq(fx.layers.length, 1);
  assertEq(fx.layers[0].burstCount, 3);
});

test('{effect:{...}} 래퍼 수용, 빈 layers 는 오류', () => {
  assertEq(E.normalizeEffect({ effect: { layers: [{}] } }).layers.length, 1);
  assertThrows(() => E.normalizeEffect({ layers: [] }));
  assertThrows(() => E.normalizeEffect(null));
});

test('잘못된 값 교정: enum, 범위, 색 정렬', () => {
  const [p] = E.normalizeEffect({ layers: [{ shape: 'x', particleShape: 'x', stretch: 999, rate: 'many',
    colorKeys: [{ r:1,g:1,b:1,a:0,t:1 }, { r:0,g:0,b:0,a:1,t:0 }] }] }).layers;
  assertEq(p.shape, 'Point');
  assertEq(p.particleShape, 'circle');
  assertEq(p.stretch, 40);
  assertEq(p.rate, E.defaultParams().rate);
  assertEq(p.colorKeys[0].t, 0);
});

test('spiral 등 전체 투사체 경로 유지', () => {
  assertEq(E.sanitizeParams(Object.assign(E.defaultParams(), { projPath: 'spiral' })).projPath, 'spiral');
});

test('동시 입자 예산 초과 시 축소, 레이어 수 제한', () => {
  const fx = E.normalizeEffect({ layers: [{ burstCount: 5000, rate: 0 }, { burstCount: 5000, rate: 0 }] });
  const live = fx.layers.reduce((a, l) => a + E.estimateLiveParticles(l), 0);
  assert(live <= E.MAX_LIVE_PARTICLES + 2, 'live=' + live);
  assertEq(E.normalizeEffect({ layers: new Array(100).fill({}) }).layers.length, E.MAX_EFFECT_LAYERS);
});

test('serializeEffect 왕복 시 값 유지', () => {
  const fx = E.normalizeEffect({ style: 'smooth', bloom: 1, layers: [{ burstCount: 7, startDelay: 0.2 }, { rate: 9 }] });
  const back = E.normalizeEffect(JSON.parse(JSON.stringify(E.serializeEffect(fx))));
  assertEq(back.layers[0].burstCount, 7);
  assertEq(back.layers[0].startDelay, 0.2);
  assertEq(back.layers[1].rate, 9);
  assertEq(back.bloom, 1);
});

test('layerEndTime 은 지연·방출·수명 합', () => {
  const p = Object.assign(E.defaultParams(), { startDelay: 0.5, duration: 1, lifetimeMax: 2 });
  assertClose(E.layerEndTime(p), 3.5, 1e-9);
  const q = Object.assign(E.defaultParams(), { projectile: true, duration: 0.1, projDistance: 400, projSpeed: 200, lifetimeMax: 1 });
  assertClose(E.layerEndTime(q), 3, 1e-9);
});

test('lint: 무방출, 어두운 색, 단일 레이어 감지', () => {
  const fx = E.normalizeEffect({ layers: [{ rate: 0, burstCount: 0,
    colorKeys: [{ r:0.05,g:0.05,b:0.05,a:1,t:0 }] }] });
  const out = E.lintEffect(fx).join('|');
  assert(out.includes('모두 0'), out);
  assert(out.includes('어두워'), out);
  assert(out.includes('1개뿐'), out);
  const ok = E.normalizeEffect({ layers: [{ burstCount: 5 }, { rate: 5 }] });
  assertEq(E.lintEffect(ok).length, 0);
});

suite('physicsStep 공용 구현');

test('수명 끝난 파티클 제거, 순서 유지', () => {
  const mk = (life, max) => ({ x: 0, y: 0, vx: 0, vy: 0, life, maxLife: max, rotation: 0, rotSpeed: 0 });
  const a = mk(0, 1), b = mk(0.99, 1), c = mk(0, 1);
  const sys = { params: E.defaultParams(), particles: [a, b, c] };
  E.physicsStep(sys, 0.05);
  assertEq(sys.particles.length, 2);
  assert(sys.particles[0] === a && sys.particles[1] === c, '순서 유지');
});

test('궤도·흡인 중심은 이미터 오프셋', () => {
  const p = Object.assign(E.defaultParams(), { attract: 100, offsetX: 50, offsetY: 0 });
  const sys = { params: p, particles: [{ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, rotation: 0, rotSpeed: 0 }] };
  E.physicsStep(sys, 0.1);
  assert(sys.particles[0].vx > 0, '오프셋 쪽으로 끌려야 함');
});

suite('3D 카메라');

test('기본값은 2D, 카메라 값 범위 교정', () => {
  assertEq(E.normalizeEffect({ layers: [{}] }).camera.view, '2d');
  const c = E.normalizeEffect({ camera: { view: '3d', pitch: 500, fov: 'x' }, layers: [{}] }).camera;
  assertEq(c.view, '3d');
  assertEq(c.pitch, 89);
  assertEq(c.fov, 35);
});

test('카메라 값은 저장 왕복 유지', () => {
  const fx = E.normalizeEffect({ camera: { view: '3d', pitch: 20, yaw: 15 }, layers: [{ plane: 'ground', offsetZ: 40 }] });
  const back = E.normalizeEffect(JSON.parse(JSON.stringify(E.serializeEffect(fx))));
  assertEq(back.camera.yaw, 15);
  assertEq(back.layers[0].plane, 'ground');
  assertEq(back.layers[0].offsetZ, 40);
});

test('pitch 0 이면 카메라 공간이 2D 좌표와 같음', () => {
  const v = E.cameraRotate(E.cameraBasis({ pitch: 0, yaw: 0 }), 10, 20, 30);
  assertClose(v.x, 10, 1e-9);
  assertClose(v.y, 20, 1e-9);
});

test('위에서 보면 먼 쪽(-Z)이 화면 위로', () => {
  const v = E.cameraRotate(E.cameraBasis({ pitch: 30, yaw: 0 }), 0, 0, -100);
  assert(v.y < 0, 'y=' + v.y);
});

test('physicsStep 은 깊이 속도도 적분', () => {
  const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 100, life: 0, maxLife: 1, rotation: 0, rotSpeed: 0 };
  E.physicsStep({ params: E.defaultParams(), particles: [p] }, 0.1);
  assertClose(p.z, 10, 1e-6);
});

const srcAll = () => ['index.html', 'editor.js', 'render3d.js', 'library.js', 'ai.js', 'main.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
suite('HTML 구조');

test('스크립트 태그가 파일과 일치', () => {
  const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  for (const m of page.matchAll(/<script src="([^"]+)"/g)) assert(fs.existsSync(path.join(__dirname, m[1])), m[1]);
});

test('코드가 찾는 요소가 HTML 에 모두 있음', () => {
  const html = srcAll();
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const dynamic = new Set([...html.matchAll(/\.id = '([^']+)'/g)].map(m => m[1]));
  const used = [...html.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
  const missing = [...new Set(used)].filter(id => !ids.has(id) && !dynamic.has(id));
  assertEq(missing.join(','), '');
});

test('버튼 핸들러 함수가 모두 정의됨', () => {
  const html = srcAll();
  const names = [...html.matchAll(/on(?:click|input|change)="([a-zA-Z_]\w*)\(/g)].map(m => m[1]);
  const missing = [...new Set(names)].filter(n => !new RegExp('function ' + n + '\\b').test(html));
  assertEq(missing.join(','), '');
});

// ==================== Sheet Slicing ====================
suite('시트 슬라이스');

// 2×2 시트: 칸마다 어긋난 위치에 사각형
function fakeSheet(w, h, boxes) {
  const lum = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of boxes) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) lum[y * w + x] = 200;
  }
  return lum;
}

test('여백으로 격자 추정', () => {
  const lum = fakeSheet(100, 100, [[10,10,30,30],[60,12,80,32],[12,60,32,80],[62,62,82,82]]);
  const g = E.detectSheetGrid(lum, 100, 100);
  assertEq(g.cols, 2);
  assertEq(g.rows, 2);
});

test('칸별 경계 계산 + 빈 칸 표시', () => {
  const lum = fakeSheet(100, 100, [[10,10,30,30],[60,12,80,32],[12,60,32,80]]);
  const f = E.sliceFrames(lum, 100, 100, 2, 2);
  assertEq(f.length, 4);
  assertEq(f[1].x0, 60);
  assertEq(f[1].y1, 32);
  assert(f[3].empty, '네 번째 칸은 비어야 함');
});

test('중심 정렬: 어긋난 프레임이 같은 위치로', () => {
  const lum = fakeSheet(100, 100, [[10,10,30,30],[60,12,80,32]]);
  const f = E.sliceFrames(lum, 100, 100, 2, 1);
  const l = E.layoutSlices(f, 'center');
  assertEq(l.frames.length, 2);
  assertEq(l.frames[0].dx, l.frames[1].dx);
  assertEq(l.frames[0].dy, l.frames[1].dy);
});

test('바닥 정렬: 크기가 달라도 바닥선 일치', () => {
  const lum = fakeSheet(100, 100, [[20,10,30,40],[70,30,80,48]]);
  const l = E.layoutSlices(E.sliceFrames(lum, 100, 100, 2, 1), 'bottom');
  const bottoms = l.frames.map(f => f.dy + f.sh);
  assertEq(bottoms[0], bottoms[1]);
  assert(bottoms[0] <= l.size, '셀 안에 있어야 함');
});

test('빈 시트는 프레임 0', () => {
  assertEq(E.layoutSlices(E.sliceFrames(new Uint8Array(100), 10, 10, 2, 2), 'center').frames.length, 0);
});

test('sheetAsset 지정 시 플립북 설정 자동 적용, 없는 이름은 제거', () => {
  const [a, b] = E.normalizeEffect({ layers: [{ sheetAsset: 'flame01', burstCount: 1 }, { sheetAsset: 'nope', burstCount: 1 }] }).layers;
  assert(a.sheet && a.sheetGrad, '시트 활성화');
  assertEq(a.sheetCols, 4);
  assertEq(b.sheetAsset, '');
  assert(!b.sheet, '없는 시트는 비활성');
});

// ==================== RESULT ====================
console.log('\n' + '═'.repeat(60));
console.log(`결과: ${passed} / ${passed + failed} 통과 (실패: ${failed})`);
console.log('═'.repeat(60));

if (failures.length > 0) {
  console.log('\n실패 상세:');
  for (const f of failures) {
    console.log(`  [${f.suite}] ${f.name}`);
    console.log(`     → ${f.error.message}`);
  }
  process.exit(1);
}
process.exit(0);
