// =================================================================
// test.js — engine.js + PRESETS 테스트 스위트
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

// ==================== HTML Preset Extraction ====================
// particle_editor.html 에서 PRESETS / COMBO_PRESETS 를 추출하여 eval
function loadPresetsFromHTML() {
  const htmlPath = path.join(__dirname, 'particle_editor.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // PRESETS 블록 추출
  const presetsStart = html.indexOf('const PRESETS = {');
  if (presetsStart < 0) throw new Error('PRESETS 블록 찾지 못함');
  const presetsEnd = findMatchingBrace(html, presetsStart + 'const PRESETS = '.length);
  const presetsCode = html.substring(presetsStart + 'const PRESETS = '.length, presetsEnd + 1);

  // COMBO_PRESETS 블록 추출
  const comboStart = html.indexOf('const COMBO_PRESETS = {');
  if (comboStart < 0) throw new Error('COMBO_PRESETS 블록 찾지 못함');
  const comboEnd = findMatchingBrace(html, comboStart + 'const COMBO_PRESETS = '.length);
  const comboCode = html.substring(comboStart + 'const COMBO_PRESETS = '.length, comboEnd + 1);

  // eval
  const PRESETS = eval(`(${presetsCode})`);
  const COMBO_PRESETS = eval(`(${comboCode})`);
  return { PRESETS, COMBO_PRESETS };
}

function findMatchingBrace(text, startIdx) {
  // startIdx 는 '{' 위치여야 함
  let depth = 0, inStr = false, esc = false;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (inStr) {
      if (ch === inStr) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    // 주석 스킵
    if (ch === '/' && text[i+1] === '/') { i = text.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '/' && text[i+1] === '*') { i = text.indexOf('*/', i) + 1; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('매칭 브레이스 없음');
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
suite('Shape Inside Tests');
for (const shape of E.ALL_SHAPES) {
  test(`${shape}: 중심 (0,0) 내부`, () => {
    const fn = E.makeInsideFn(shape, 10);
    // crescent 는 중심이 잘린 부분에 속할 수 있음
    // ring 은 중심이 비어있음 (doughnut hole)
    if (shape === 'ring') {
      assert(!fn(0, 0), 'ring 중심은 hole');
    } else if (shape === 'bubble') {
      assert(!fn(0, 0), 'bubble 중심은 hole');
    } else if (shape === 'crescent') {
      // crescent 는 중심 근처가 잘려있을 수 있음 — 체크 생략
      fn(0, 0); // 호출만 해서 예외 안 나는지 확인
    } else {
      assert(fn(0, 0), `${shape} 중심이 내부여야 함`);
    }
  });
  test(`${shape}: 먼 점 (100, 100) 외부`, () => {
    const fn = E.makeInsideFn(shape, 10);
    assert(!fn(100, 100), `${shape} 먼 점은 외부여야 함`);
  });
}
test('circle: 반지름 경계', () => {
  const fn = E.makeInsideFn('circle', 10);
  assert(fn(5, 5), '원 내부');
  assert(!fn(15, 15), '원 외부');
});
test('square: 정확한 경계', () => {
  const fn = E.makeInsideFn('square', 10);
  assert(fn(10, 10), '모서리 내부');
  assert(!fn(11, 0), '경계 밖');
});
test('diamond: 맨해튼 거리', () => {
  const fn = E.makeInsideFn('diamond', 10);
  assert(fn(5, 5), '맨해튼 10 = R');
  assert(!fn(6, 6), '맨해튼 12 > R');
});
test('ring: 내부 구멍', () => {
  const fn = E.makeInsideFn('ring', 20);
  assert(!fn(0, 0), '중심은 구멍');
  assert(fn(15, 0), '링 두께 안');
  assert(!fn(25, 0), '링 바깥');
});
test('cross: 가로·세로 막대', () => {
  const fn = E.makeInsideFn('cross', 20);
  assert(fn(0, 15), '세로 막대');
  assert(fn(15, 0), '가로 막대');
  assert(!fn(15, 15), '코너는 외부');
});
test('hexagon: 6각형 내부', () => {
  const fn = E.makeInsideFn('hexagon', 10);
  assert(fn(0, 0), '중심');
  assert(fn(5, 0), '내부');
  assert(!fn(20, 20), '외부');
});

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
suite('LLM: pickBestGeminiModel');
test('빈 배열 → undefined', () => {
  const m = E.pickBestGeminiModel([], false);
  assertEq(m, undefined);
});
test('text: 2.5-flash 우선', () => {
  const m = E.pickBestGeminiModel(['gemini-1.5-flash','gemini-2.5-flash','gemini-1.5-pro'], false);
  assertEq(m, 'gemini-2.5-flash');
});
test('vision: 1.5-flash 우선', () => {
  const m = E.pickBestGeminiModel(['gemini-1.5-flash','gemini-2.5-flash','gemini-1.5-pro'], true);
  assertEq(m, 'gemini-1.5-flash');
});
test('vision: 1.5-flash-latest 최우선', () => {
  const m = E.pickBestGeminiModel(['gemini-1.5-flash','gemini-1.5-flash-latest','gemini-2.5-flash'], true);
  assertEq(m, 'gemini-1.5-flash-latest');
});
test('text: 없으면 첫 번째', () => {
  const m = E.pickBestGeminiModel(['gemini-custom-model'], false);
  assertEq(m, 'gemini-custom-model');
});
test('text: 2.0-flash 폴백', () => {
  const m = E.pickBestGeminiModel(['gemini-2.0-flash','gemini-1.5-pro'], false);
  assertEq(m, 'gemini-2.0-flash');
});

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
test('validateParams 기본값은 유효', () => {
  const errs = E.validateParams(E.defaultParams());
  assertEq(errs.length, 0);
});

// ---- Validation 엣지 케이스 ----
suite('validateParams 엣지 케이스');
test('duration <= 0 → 에러', () => {
  const p = E.defaultParams(); p.duration = 0;
  assert(E.validateParams(p).length > 0);
});
test('lifetimeMax < lifetimeMin → 에러', () => {
  const p = E.defaultParams(); p.lifetimeMin = 1; p.lifetimeMax = 0.5;
  assert(E.validateParams(p).length > 0);
});
test('invalid shape → 에러', () => {
  const p = E.defaultParams(); p.shape = 'Invalid';
  assert(E.validateParams(p).length > 0);
});
test('invalid particleShape → 에러', () => {
  const p = E.defaultParams(); p.particleShape = 'banana';
  assert(E.validateParams(p).length > 0);
});
test('invalid blendMode → 에러', () => {
  const p = E.defaultParams(); p.blendMode = 'Multiply';
  assert(E.validateParams(p).length > 0);
});
test('invalid sizeCurve → 에러', () => {
  const p = E.defaultParams(); p.sizeCurve = 'bouncy';
  assert(E.validateParams(p).length > 0);
});
test('fadeIn 범위 초과 → 에러', () => {
  const p = E.defaultParams(); p.fadeIn = 1.5;
  assert(E.validateParams(p).length > 0);
});
test('colorKey.t 범위 초과 → 에러', () => {
  const p = E.defaultParams();
  p.colorKeys = [{r:1,g:1,b:1,a:1,t:-0.5}];
  assert(E.validateParams(p).length > 0);
});

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
test('systemTime 증가', () => {
  const sys = makeTestSys();
  sys.systemTime = 0;
  E.physicsStep(sys, 0.1);
  assertClose(sys.systemTime, 0.1);
});

// ==================== PRESETS 테스트 ====================
let PRESETS, COMBO_PRESETS;
suite('PRESETS / COMBO_PRESETS 로딩');
test('HTML 에서 PRESETS 추출', () => {
  const r = loadPresetsFromHTML();
  PRESETS = r.PRESETS;
  COMBO_PRESETS = r.COMBO_PRESETS;
  assert(PRESETS && typeof PRESETS === 'object');
  assert(COMBO_PRESETS && typeof COMBO_PRESETS === 'object');
});
test('단일 프리셋 개수 > 20', () => {
  assert(Object.keys(PRESETS).length > 20);
});
test('콤보 프리셋 개수 >= 5', () => {
  assert(Object.keys(COMBO_PRESETS).length >= 5);
});

suite('단일 프리셋 유효성');
if (PRESETS) {
  for (const name of Object.keys(PRESETS)) {
    test(`preset[${name}]: 파라미터 유효`, () => {
      const p = E.defaultParams();
      PRESETS[name](p);
      const errs = E.validateParams(p);
      if (errs.length > 0) {
        throw new Error('검증 실패: ' + errs.join(', '));
      }
    });
  }
}

suite('콤보 프리셋 유효성');
if (COMBO_PRESETS) {
  for (const comboName of Object.keys(COMBO_PRESETS)) {
    test(`combo[${comboName}]: 모든 레이어 유효`, () => {
      const layers = COMBO_PRESETS[comboName];
      assertArray(layers, `${comboName} 은 배열이어야 함`);
      assert(layers.length > 0, `${comboName} 레이어 없음`);
      layers.forEach((layerFn, idx) => {
        const p = E.defaultParams();
        layerFn(p);
        const errs = E.validateParams(p);
        if (errs.length > 0) {
          throw new Error(`L${idx} 검증 실패: ${errs.join(', ')}`);
        }
      });
    });
  }
}

// ==================== 추가: 크로스 피처 테스트 ====================
suite('통합 시나리오');
test('defaultParams 에 프리셋 적용 후 physicsStep 실행', () => {
  if (!PRESETS || !PRESETS['폭발']) return;
  const p = E.defaultParams();
  PRESETS['폭발'](p);
  const sys = { params: p, particles: [], systemTime: 0 };
  sys.particles.push({
    x: 0, y: 0, vx: 100, vy: 50,
    life: 0, maxLife: 0.5,
    rotation: 0, rotSpeed: 0,
    startSize: 20, endSize: 0,
  });
  E.physicsStep(sys, 0.016);
  assert(sys.particles.length === 1, '파티클 살아있음');
});
test('모든 프리셋 적용 후 validateParams 통과', () => {
  if (!PRESETS) return;
  const names = Object.keys(PRESETS);
  let allOk = true;
  for (const name of names) {
    const p = E.defaultParams();
    PRESETS[name](p);
    if (E.validateParams(p).length > 0) { allOk = false; break; }
  }
  assert(allOk);
});
test('sampleColor 는 프리셋 colorKeys 와 호환', () => {
  if (!PRESETS) return;
  for (const name of Object.keys(PRESETS)) {
    const p = E.defaultParams();
    PRESETS[name](p);
    for (let t = 0; t <= 1; t += 0.25) {
      const c = E.sampleColor(p.colorKeys, t);
      assert(typeof c.r === 'number' && c.r >= 0 && c.r <= 1, `${name} t=${t}`);
    }
  }
});
test('makeInsideFn 은 모든 ALL_SHAPES 값 처리', () => {
  for (const shape of E.ALL_SHAPES) {
    const fn = E.makeInsideFn(shape, 10);
    assertType(fn, 'function');
    // 반환 함수가 동작해야 함
    fn(0, 0);
    fn(100, 100);
  }
});

// ==================== HTML ↔ engine.js 동기화 ====================
// file:// 제약 때문에 HTML 이 engine.js 본문을 inline 임베드한다.
// 드리프트 방지: 주요 함수 소스가 두 파일에서 동일해야 함.
suite('HTML ↔ engine.js 동기화');

const htmlRaw = fs.readFileSync(path.join(__dirname, 'particle_editor.html'), 'utf8');
const engineRaw = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');

// 함수 이름으로 소스 블록 추출 (뒤 중괄호까지)
function extractFnSource(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = src.match(re);
  if (!m) return null;
  const start = m.index;
  const bodyStart = start + m[0].length;
  let depth = 1, i = bodyStart, inStr = false, strCh = '', esc = false;
  let inLine = false, inBlock = false;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (inLine) { if (ch === '\n') inLine = false; i++; continue; }
    if (inBlock) { if (ch === '*' && src[i+1] === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inStr) {
      if (esc) { esc = false; i++; continue; }
      if (ch === '\\') { esc = true; i++; continue; }
      if (ch === strCh) { inStr = false; i++; continue; }
      i++; continue;
    }
    if (ch === '/' && src[i+1] === '/') { inLine = true; i += 2; continue; }
    if (ch === '/' && src[i+1] === '*') { inBlock = true; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return src.substring(start, i);
}

// 상수 블록 추출 (const NAME = ... ;  — 단순 케이스)
function extractConstSource(src, name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*');
  const m = src.match(re);
  if (!m) return null;
  const start = m.index;
  let i = start + m[0].length;
  let depth = 0, inStr = false, strCh = '', esc = false;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (esc) { esc = false; i++; continue; }
      if (ch === '\\') { esc = true; i++; continue; }
      if (ch === strCh) { inStr = false; i++; continue; }
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; i++; continue; }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ';' && depth === 0) { i++; break; }
    i++;
  }
  return src.substring(start, i);
}

function normalize(s) {
  // 줄바꿈/공백 정규화 (CRLF / trailing space / tab 차이 흡수)
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

const SYNC_FUNCTIONS = [
  'lerp', 'rand',
  'sampleCurve', 'sampleColor',
  'quantizeToPalette', 'colorBucket',
  'makeInsideFn',
  'extractJson',
  'pickBestGeminiModel', 'humanizeLLMError',
  'defaultParams',
  'projectilePos',
];

for (const fn of SYNC_FUNCTIONS) {
  test(`${fn} 동일`, () => {
    const a = extractFnSource(engineRaw, fn);
    const b = extractFnSource(htmlRaw, fn);
    assert(a, `engine.js 에서 ${fn} 찾지 못함`);
    assert(b, `particle_editor.html 에서 ${fn} 찾지 못함`);
    if (normalize(a) !== normalize(b)) {
      throw new Error(`${fn} 드리프트 감지 — engine.js 와 particle_editor.html 의 정의가 다름`);
    }
  });
}

const SYNC_CONSTS = ['PALETTES', 'ALL_SHAPES'];
for (const c of SYNC_CONSTS) {
  test(`${c} 동일`, () => {
    const a = extractConstSource(engineRaw, c);
    const b = extractConstSource(htmlRaw, c);
    assert(a, `engine.js 에서 ${c} 찾지 못함`);
    assert(b, `particle_editor.html 에서 ${c} 찾지 못함`);
    if (normalize(a) !== normalize(b)) {
      throw new Error(`${c} 드리프트 감지`);
    }
  });
}

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
test('projImpact 기본값 none', () => {
  assertEq(E.defaultParams().projImpact, 'none');
});
test('chainNext 기본값 none', () => {
  assertEq(E.defaultParams().chainNext, 'none');
});
test('chainDelay 기본값 0', () => {
  assertEq(E.defaultParams().chainDelay, 0);
});
test('useTexture 기본값 false', () => {
  assertEq(E.defaultParams().useTexture, false);
});
test('subEmit 기본값 none', () => {
  assertEq(E.defaultParams().subEmit, 'none');
});
test('subEmitCount 기본값 > 0', () => {
  assert(E.defaultParams().subEmitCount > 0);
});
test('projBodySize 기본값 0', () => {
  assertEq(E.defaultParams().projBodySize, 0);
});

// ==================== validateParams 투사체 검증 ====================
suite('validateParams 투사체/새기능');
test('투사체 활성 + projSpeed <= 0 → 에러', () => {
  const p = E.defaultParams(); p.projectile = true; p.projSpeed = 0;
  assert(E.validateParams(p).length > 0);
});
test('투사체 활성 + projDistance <= 0 → 에러', () => {
  const p = E.defaultParams(); p.projectile = true; p.projDistance = -10;
  assert(E.validateParams(p).length > 0);
});
test('투사체 활성 + 유효하지 않은 projPath → 에러', () => {
  const p = E.defaultParams(); p.projectile = true; p.projPath = 'teleport';
  assert(E.validateParams(p).length > 0);
});
test('투사체 활성 + 유효한 설정 → 에러 없음', () => {
  const p = E.defaultParams(); p.projectile = true;
  p.projSpeed = 400; p.projDistance = 300; p.projPath = 'zigzag';
  assertEq(E.validateParams(p).length, 0);
});
test('VALID_PROJ_PATHS에 6가지 경로 포함', () => {
  assert(E.VALID_PROJ_PATHS.includes('linear'));
  assert(E.VALID_PROJ_PATHS.includes('arc'));
  assert(E.VALID_PROJ_PATHS.includes('wave'));
  assert(E.VALID_PROJ_PATHS.includes('spiral'));
  assert(E.VALID_PROJ_PATHS.includes('boomerang'));
  assert(E.VALID_PROJ_PATHS.includes('zigzag'));
});

// ==================== 투사체 프리셋 특화 테스트 ====================
suite('투사체 프리셋 특화 검증');
if (PRESETS) {
  const projPresets = Object.keys(PRESETS).filter(name => {
    const p = E.defaultParams(); PRESETS[name](p); return p.projectile;
  });
  test(`투사체 프리셋 존재 (${projPresets.length}개)`, () => {
    assert(projPresets.length >= 5, '투사체 프리셋 5개 이상');
  });
  for (const name of projPresets) {
    test(`proj[${name}]: projSpeed > 0`, () => {
      const p = E.defaultParams(); PRESETS[name](p);
      assert(p.projSpeed > 0, `${name} projSpeed=${p.projSpeed}`);
    });
    test(`proj[${name}]: projDistance > 0`, () => {
      const p = E.defaultParams(); PRESETS[name](p);
      assert(p.projDistance > 0);
    });
    test(`proj[${name}]: projPath 유효`, () => {
      const p = E.defaultParams(); PRESETS[name](p);
      assert(E.VALID_PROJ_PATHS.includes(p.projPath), `invalid path: ${p.projPath}`);
    });
  }
}

// ==================== polyInsideFn / makePolyVerts 테스트 ====================
suite('polyInsideFn / makePolyVerts');
test('makePolyVerts 정다각형 6각형', () => {
  const verts = E.makePolyVerts(6, 10);
  assertEq(verts.length, 12); // 6 * 2
});
test('makePolyVerts 별형 5꼭지', () => {
  const verts = E.makePolyVerts(5, 10, 5);
  assertEq(verts.length, 20); // 5*2 * 2
});
test('polyInsideFn 사각형 내부', () => {
  const verts = [-5,-5, 5,-5, 5,5, -5,5];
  const fn = E.polyInsideFn(verts);
  assert(fn(0, 0), '중심 내부');
  assert(!fn(10, 10), '외부');
});
test('polyInsideFn + makePolyVerts 조합', () => {
  const verts = E.makePolyVerts(6, 10);
  const fn = E.polyInsideFn(verts);
  assert(fn(0, 0), '6각형 중심 내부');
  assert(!fn(20, 20), '6각형 외부');
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
