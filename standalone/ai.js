// ai.js — 프롬프트, 3안 생성, 렌더 자동 검수, 시트 자동 생성
let _lastLLMPrompt = ''; // 마지막 사용자 요청 (refine 용)








// Gemini 사용 가능 모델 캐시 (키별)
const _geminiModelCache = {};


let _llmBusy = false;
let _refImage = null;     // 레퍼런스 이미지 dataURL (PNG)

const LLM_MODEL = 'claude-opus-5-5';

// 브리지를 통해 로그인된 claude CLI 호출. 이미지는 base64 PNG 배열
async function callLLM(system, user, images) {
  if (location.protocol === 'file:') {
    throw new Error('run.bat 으로 열어야 합니다 (http://localhost:8788)');
  }
  const r = await fetch('/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, user, images: images || [], model: LLM_MODEL }),
  });
  const data = await r.json().catch(() => ({ error: '브리지 응답 파싱 실패' }));
  if (!r.ok || data.error) throw new Error(data.error || 'bridge ' + r.status);
  return data.text;
}

function parseLLMJson(text) {
  const jsonStr = extractJson(text);
  if (!jsonStr) { console.error('[JSON 추출 실패]', text); throw new Error('AI 응답에서 JSON 을 찾지 못함'); }
  return JSON.parse(jsonStr);
}

function setLLMBusy(busy, msg) {
  _llmBusy = busy;
  for (const id of ['llm-gen-btn', 'llm-refine-btn']) {
    const b = document.getElementById(id);
    if (b) b.disabled = busy;
  }
  document.querySelectorAll('#llm-chips button, #llm-variants .variant').forEach(b => {
    b.style.pointerEvents = busy ? 'none' : '';
    b.style.opacity = busy ? 0.5 : 1;
  });
  if (msg !== undefined) document.getElementById('llm-status').textContent = msg;
}

function refImagesB64() {
  return _refImage ? [_refImage.replace(/^data:image\/png;base64,/, '')] : [];
}

// ---- 시스템 프롬프트 ----
function getLLMSystemPrompt() {
  return `당신은 2D 게임 VFX 아티스트입니다. 아래 파티클 엔진으로 표현할 합성 이펙트를 JSON 으로 작성합니다.
출력은 JSON 객체 하나뿐입니다. 마크다운이나 설명을 붙이지 마세요.

목표 그림: 고급 카툰 스킬 이펙트. 면이 또렷하고 번짐이 적으며, 짧고 빠르게 끝납니다.
- 원으로 보이는 형태를 만들지 마세요. 공 모양 섬광, 도넛, 뿌연 원 덩어리는 실패입니다. 섬광은 kit_star01, 고리는 kit_ring01, 찌르기는 kit_needle01, 지면 먼지는 kit_dust01 처럼 형태가 있는 시트로 만듭니다.
- 총 길이는 0.8~1.3초. 크게 터지는 스킬도 1.5초 이내. 잔상을 오래 끌지 마세요.
- 색은 강조색 하나 + 흰색 + 회색 먼지까지만. 그라데이션을 여러 색으로 늘어놓지 마세요.
- bloom 은 0.1~0.3. 빛 번짐이 아니라 형태와 타이밍으로 힘을 표현합니다.
- 조각을 여러 위치에 흩어 공간을 만드세요. 같은 시트를 offsetX/Y 와 startDelay 를 달리해 레이어로 반복하면 됩니다. 바닥 위 평면은 scaleY 0.25~0.4 로 눕힙니다.
- 무언가 떨어지거나 날아가면 제자리에 띄우지 말고 실제로 목표까지 이동시키세요. 레이어 하나를 burstCount 1, speed 0 으로 두고 directionX/directionY(속력 px/s, Y 는 +가 위) 로 이동, lifetime 을 비행시간으로 맞춥니다. 시트 이미지는 startRotation 으로 진행 방향에 맞춥니다.
- 비행체 시트는 sheetFirst + sheetFrames 로 완성된 프레임 구간만 재생합니다 (kit_needle01 은 sheetFirst:3, sheetFrames:6).
- 여러 발이면 동시에 쏘지 말고 0.05~0.1초 간격 연타로. 발사 지점 번쩍임 → 비행 → 착탄 별 + 먼지가 한 세트입니다. 레이어는 최대 64개까지 씁니다.
- 회색 먼지·파편 시트는 blendMode "Alpha" + sheetCutout:true 로 불투명하게 씁니다.

좋은 이펙트는 한 종류의 파티클로 나오지 않습니다. 역할이 다른 레이어를 시간차로 겹칩니다.
- 예비(필요할 때): 모이거나 번뜩이며 뭔가 온다고 알림
- 코어: 0.05~0.15초 짧고 큰 섬광. Additive, soft, 흰색에 가까움
- 본체: 이펙트의 형태를 만드는 주 덩어리. 실루엣이 읽혀야 함
- 2차 입자: 빠르고 작은 불티·파편. 크기와 속도 편차를 크게
- 여운: 느린 연기·잔광. 본체보다 오래 남고 어둡게 식음
타이밍이 질감을 만듭니다. 빠른 시작, 느린 끝. 레이어를 startDelay 로 어긋나게 하세요.
색은 수명 안에서 식어야 합니다. 흰색 → 포화색 → 어두운 색 → 투명. 단색으로 유지하지 마세요.
Additive 는 겹칠수록 더해져 금방 흰색으로 타버립니다. 흰 덩어리는 이펙트 실패입니다. 흰색은 코어의 작은 영역에서 0.1초 안쪽으로만 쓰고,
큰 Additive 입자는 a 0.15~0.4 의 포화색(예: r0.6 g0.1 b1)으로 시작하세요. 형태는 흐린 덩어리 하나보다 작은 입자 다수, flame·spark 모양, stretch 로 만듭니다.

합성 스키마:
{
  "name": 짧은 이름,
  "style": "smooth" | "pixel",
  "pixelScale": 2~6 (pixel 일 때 화면 픽셀 크기),
  "bloom": 0~1.5 (Additive 레이어 번짐. 발광체 0.6~1.1, 물리 효과 0.2),
  "layers": [ 레이어, ... ]   // 2~6개, 앞이 뒤에 그려짐
}

레이어 파라미터 (생략 시 기본값, 필요한 것만 쓰기):
시간: startDelay(초), duration(방출 기간, 기본 1), loop(bool), lifetimeMin, lifetimeMax
방출: burstCount(시작 일제), burstSpread(burst 를 이 초에 나눠 방출, 기본 0.03), rate(초당)
이미터: shape "Point"|"Circle"|"Disc"|"Box"|"Cone", shapeRadius, shapeBoxW, shapeBoxH
  Circle=테두리, Disc=내부. Point/Circle/Disc/Box 의 속도 방향은 중심에서 바깥.
  Cone: emitAngle 방향(도, 0=오른쪽, -90=위, 90=아래, 기본 -90) 으로 ±coneAngle 안에 방출
offsetX, offsetY: 이미터 위치. 중심 기준 픽셀, +Y 는 아래
속도: speedMin, speedMax (기본 100~300, 정지 파티클은 둘 다 0), directionX/directionY: 모든 입자에 더하는 속도, directionY 는 +가 위
힘: gravity(+아래, -는 위로 뜸. px/s²), drag(감속 0~10), jitter(떨림 10~40), turbulence(바람 흐름 20~120)
  orbit(이미터 중심 소용돌이 300~1200), attract(중심으로 흡입 200~800, 음수는 밀어냄)
크기: sizeStart, sizeEnd (지름 px. sizeEnd 기본 0), sizeRandom 0~1, sizeCurve "linear"|"easeOut"|"easeIn"|"easeInOut"|"easeOutBack"
늘이기: stretch — 속도 방향으로 길이 1+stretch×min(1, 속력/800) 배. 스파크 1~3, 빠른 선 효과 8~20. 속력이 낮으면 안 늘어남
회전: startRotation(고정 각도), rotationRandom(±도), rotationSpeed. stretch>0 이면 진행 방향이 우선
모양 particleShape: "soft"(방사형 그라데이션. 원이 그대로 보이므로 지름 70px 이하의 잔광에만),
  "spark","circle","square","diamond","triangle","star","teardrop","ring","cross","hexagon","crescent","flame",
  "bar","pill","ellipse","bubble","heart","snowflake","bolt","shuriken","arrow","leaf","chevron","shield","sparkle","slash"
  slash=가로 호 형태 칼자국. startRotation 으로 방향, revealWipe:true + revealFrac 으로 휘두르듯 나타남
  ring 은 도넛이 그대로 보이니 쓰지 말 것. 충격파는 kit 시트나 impact 시트로
색: colorKeys [{"r":0~1,"g":0~1,"b":0~1,"a":0~1,"t":0~1}, ...], blendMode "Alpha"|"Additive"
  Additive: 빛·불·에너지 (겹치면 밝아지고 블룸이 걸림). Alpha: 연기·파편·액체·흙
  fadeIn, fadeOut: 수명 비율 0~0.5. outlineWidth 기본 1.5 이니 soft/발광 레이어는 0, 그 외도 대부분 0
화면: shakeAmount(0~30), shakeDuration, flashAmount(0~0.6), flashDuration, hitStop(0~0.12). 레이어 시작 시 발동. 큰 타격에만 쓰기
이동체: projectile:true, projSpeed, projDistance, projAngle(도, 0=오른쪽), projPath "linear"|"arc"|"wave"|"spiral"|"boomerang"|"zigzag",
  projArcHeight, projWaveAmp, projWaveFreq, projBodySize, duration 은 비행시간 이상. 도착 지점 폭발은 startDelay=비행시간 + offsetX/Y 로 별도 레이어 작성

이미지 시트 레이어: 파티클만으로는 불·폭발·연기의 질감이 안 나옵니다. 이런 효과의 본체는 시트 레이어로 만드세요.
  sheetAsset: ${Object.keys(SHEET_ASSETS).map(k => '"' + k + '"(' + SHEET_ASSETS[k].desc + ')').join(', ')}
  흑백 마스크라 colorKeys 로 색이 입혀집니다(휘도 낮은 곳=colorKeys 색, 높은 곳=흰색). 색은 전 구간 같은 포화색으로 두고 마지막 키만 a:0.
  기본은 수명 동안 프레임 전체를 1회 재생. 루프 불꽃은 sheetMode:"loop", sheetFps:12~18. sheetGlow:true 로 발광 추가
  sizeStart=sizeEnd 로 크기 고정(150~500), sizeCurve:"linear", speed 0, rotationRandom 0, stretch 0, outlineWidth 0, fadeIn 0, fadeOut 0.1~0.3, 보통 Additive, 연기는 Alpha
  불꽃 시트는 바닥이 이미터 위치 근처가 되도록 offsetY 를 조정합니다. 입자 1~6개를 Box 이미터로 겹치면 큰 화염이 됩니다.
  시트 레이어를 본체로 쓰고, 파티클은 불티·파편·섬광 보조로 쓰세요. 레이어당 동시 시트 입자는 8개 이하.

화면 기준: 800×600 어두운 배경(#050505), 원점은 화면 중앙. 일반 이펙트는 직경 200~450px, 대형은 600px 까지.
입자 수는 레이어당 10~150, 전체 동시 300개 안쪽이 적당합니다. 많이 뿌리기보다 크기 편차로 밀도를 만드세요.
어두운 테마도 밝은 테두리나 코어가 있어야 보입니다. 순수 검정은 배경에 묻힙니다.

예시 (형식 참고용. 그대로 베끼지 말고 요청에 맞게 새로 설계):
{"name":"낙뢰 찌르기","style":"smooth","bloom":0.2,"layers":[
{"startDelay":0.3,"duration":0.05,"burstCount":1,"burstSpread":0,"lifetimeMin":0.6,"lifetimeMax":0.6,"speedMin":0,"speedMax":0,"offsetY":40,"sizeStart":520,"sizeEnd":520,"sizeCurve":"linear","outlineWidth":0,"fadeIn":0,"fadeOut":0.1,"blendMode":"Alpha","sheetAsset":"kit_dust01","sheetCutout":true,"colorKeys":[{"r":0.8,"g":0.82,"b":0.85,"a":1,"t":0},{"r":0.8,"g":0.82,"b":0.85,"a":1,"t":1}]},
{"duration":0.05,"burstCount":1,"burstSpread":0,"lifetimeMin":0.7,"lifetimeMax":0.7,"speedMin":0,"speedMax":0,"offsetY":-190,"sizeStart":170,"sizeEnd":170,"sizeCurve":"linear","outlineWidth":0,"fadeIn":0,"fadeOut":0.1,"blendMode":"Additive","sheetAsset":"kit_ring01","colorKeys":[{"r":1,"g":0.8,"b":0.3,"a":1,"t":0},{"r":1,"g":0.8,"b":0.3,"a":1,"t":1}]},
{"startDelay":0.1,"duration":0.05,"burstCount":1,"burstSpread":0,"lifetimeMin":0.4,"lifetimeMax":0.4,"speedMin":0,"speedMax":0,"offsetY":40,"sizeStart":440,"sizeEnd":440,"sizeCurve":"linear","outlineWidth":0,"fadeIn":0,"fadeOut":0.1,"blendMode":"Additive","sheetAsset":"kit_needle01","colorKeys":[{"r":1,"g":0.8,"b":0.3,"a":1,"t":0},{"r":1,"g":0.8,"b":0.3,"a":1,"t":1}]},
{"startDelay":0.27,"duration":0.05,"burstCount":1,"burstSpread":0,"lifetimeMin":0.35,"lifetimeMax":0.35,"speedMin":0,"speedMax":0,"offsetY":255,"sizeStart":210,"sizeEnd":210,"sizeCurve":"linear","outlineWidth":0,"fadeIn":0,"fadeOut":0.1,"blendMode":"Additive","shakeAmount":8,"shakeDuration":0.18,"hitStop":0.04,"sheetAsset":"kit_star01","colorKeys":[{"r":1,"g":0.95,"b":0.8,"a":1,"t":0},{"r":1,"g":0.95,"b":0.8,"a":1,"t":1}]}]}`;
}

const ART_STYLES = {
  toon: 'Crisp hand-painted anime game effect style with clean cel-shaded shapes, not photographic.',
  painted: 'High-end painterly game VFX with rich tonal gradients, fine turbulent detail and soft volumetric shading.',
  real: 'Semi-realistic volumetric simulation look with detailed turbulent fluid structure, as if rendered from a 3D fire and smoke simulation.',
};

// 없는 재료를 ChatGPT 로 그려 라이브러리에 추가
async function makeNewSheets(list) {
  const status = document.getElementById('llm-status');
  const made = {};  // 요청 이름 → 실제 저장된 이름
  const style = ART_STYLES[document.getElementById('llm-art').value];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    status.textContent = `ChatGPT 로 재료 생성 중 (${i + 1}/${list.length}): ${s.desc || s.name} — 약 1~2분`;
    const r = await fetch('/make-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...s, style, model: LLM_MODEL }),
    });
    const data = await r.json().catch(() => ({ error: '브리지 응답 파싱 실패' }));
    if (!r.ok || data.error) throw new Error(data.error || 'make-sheet ' + r.status);
    SHEET_ASSETS[data.name] = data.asset;
    await loadSheetAsset(data.name);
    made[s.name] = data.name;
  }
  return made;
}

const VIEW_3D_RULES = `이 이펙트는 3D 입니다. 합성에 "camera":{"view":"3d","pitch":30,"yaw":0,"fov":35} 를 넣으세요.
좌표: +X 오른쪽, +Y 아래, +Z 카메라 쪽. 바닥은 Y=170 평면. 공중은 Y 가 작음(-200 등).
offsetX/offsetY/offsetZ 로 공간에 배치하고, 깊이로 앞뒤를 나눠 입체감을 만드세요(Z -220~220).
- 마법진·충격파·바닥 고리: plane:"ground" + kit_ring02 (위에서 본 원형 시트). kit_ring01 은 이미 납작해서 쓰지 말 것.
- 별·섬광·먼지·불꽃: 기본 plane:"screen" (카메라를 향함).
- 날아가는 침: directionX/directionY/directionZ 로 이동하고 alignVelocity:true. 시트 kit_needle01 은 끝이 아래를 향합니다. directionY 는 +가 위이므로 아래로 가려면 음수.`;

function styleInstruction() {
  const style = document.getElementById('llm-style').value;
  const view = document.getElementById('llm-view').value === '3d' ? '\n' + VIEW_3D_RULES : '';
  return (style === 'pixel'
    ? '스타일: style="pixel". 전체가 저해상도 격자로 도트화되고 알파는 디더됩니다. 입자를 조금 크게, 색 단계를 분명하게.'
    : '스타일: style="smooth".') + view;
}

// 설명이 빈약해도 결과로 좁힐 수 있게, 서로 다르게 해석한 3안을 만든다
async function generateVariants() {
  if (_llmBusy) return;
  const prompt = document.getElementById('llm-prompt').value.trim();
  if (!prompt) { document.getElementById('llm-status').textContent = '효과 설명을 입력하세요'; return; }
  _lastLLMPrompt = prompt;
  setLLMBusy(true, 'AI 가 3가지 해석을 설계 중... (1~2분)');
  document.getElementById('llm-variants').innerHTML = '';
  const user = `사용자 요청: "${prompt}"
${styleInstruction()}
${_refImage ? '첨부 이미지를 레퍼런스로 삼아 색·형태·분위기를 맞추세요.\n' : ''}
요청은 짧고 모호할 수 있습니다. 빠진 부분은 게임 VFX 관점에서 채우고, 서로 뚜렷하게 다른 해석 3개를 만드세요.
색만 바꾼 변주는 안 됩니다. 형태, 동작, 타이밍이 달라야 합니다 (예: 위로 솟는 기둥 / 바깥으로 터지는 폭발 / 안으로 빨려드는 소용돌이).
${document.getElementById('llm-autosheet').checked && location.protocol !== 'file:' ? `현재 시트로 본체를 표현할 수 없으면 새 시트를 요청하세요. 최대 2장이고 그려지는 데 장당 1~2분 걸리니 정말 필요할 때만 씁니다.
새 시트 요청 항목: {"name":"영문소문자_숫자 이름","subject":"그릴 대상과 시간에 따른 변화를 영어로 구체적으로","align":"center|bottom|right","loop":bool,"desc":"한국어 한 줄"}
variants 의 sheetAsset 에서 그 이름을 바로 쓰면 됩니다.
` : ''}출력: {"newSheets":[...없으면 빈 배열],"variants":[{"concept":"이 안의 해석 한 줄(한국어)","effect":{합성 스키마}}, ...3개]}`;
  try {
    const obj = parseLLMJson(await callLLM(getLLMSystemPrompt(), user, refImagesB64()));
    if (Array.isArray(obj.newSheets) && obj.newSheets.length && document.getElementById('llm-autosheet').checked) {
      const made = await makeNewSheets(obj.newSheets.slice(0, 2));
      for (const v of obj.variants || []) {
        for (const l of (v.effect || v).layers || []) {
          if (made[l.sheetAsset]) l.sheetAsset = made[l.sheetAsset];
        }
      }
    }
    const list = Array.isArray(obj.variants) ? obj.variants : [{ concept: '', effect: obj }];
    const variants = list.slice(0, 3).map(v => ({ concept: String(v.concept || ''), effect: normalizeEffect(v.effect || v) }));
    renderVariants(variants);
    setLLMBusy(false, '마음에 드는 안을 고르세요');
    return variants;
  } catch (e) {
    console.error('[LLM]', e);
    setLLMBusy(false, humanizeLLMError(e, 'Claude CLI'));
  }
}

function renderVariants(variants) {
  const wrap = document.getElementById('llm-variants');
  wrap.innerHTML = '';
  variants.forEach((v, i) => {
    const card = document.createElement('div');
    card.className = 'variant';
    card.style.cssText = 'cursor:pointer;border:1px solid var(--border);margin-top:6px;padding:4px;background:#111;';
    const img = document.createElement('img');
    img.src = renderContactSheet(v.effect, 4, 1, 80, 60);
    img.style.cssText = 'width:100%;display:block;image-rendering:auto;';
    const cap = document.createElement('div');
    cap.className = 'hint';
    cap.textContent = `${i + 1}. ${v.effect.name} — ${v.concept}`;
    card.append(img, cap);
    card.onclick = () => pickVariant(v, card);
    wrap.appendChild(card);
  });
}

async function pickVariant(v, card) {
  if (_llmBusy) return;
  document.querySelectorAll('#llm-variants .variant').forEach(c => { c.style.borderColor = ''; });
  card.style.borderColor = 'var(--accent)';
  applyEffect(v.effect);
  document.getElementById('llm-tune').style.display = '';
  const rounds = parseInt(document.getElementById('llm-rounds').value, 10) || 0;
  await reviewLoop('', rounds);
}

// 렌더 결과를 AI 가 직접 보고 고치는 루프
async function reviewLoop(feedback, rounds) {
  if (rounds <= 0) return;
  const label = 'Claude CLI';
  setLLMBusy(true);
  const status = document.getElementById('llm-status');
  try {
    for (let i = 1; i <= rounds; i++) {
      status.textContent = feedback ? 'AI 가 수정 중...' : `AI 가 렌더를 보고 검수 중 (${i}/${rounds})...`;
      const effect = currentEffectObj();
      const sheet = renderContactSheet(effect, 4, 3, 400, 300);
      saveDebugSheet(sheet, 'review' + i);
      const lint = [...lintEffect(effect), ...blowoutWarning()];
      const user = `사용자 원본 요청: "${_lastLLMPrompt}"
${feedback ? '사용자 수정 지시(최우선): "' + feedback + '"\n' : ''}${lint.length ? '자동 검사 경고: ' + lint.join(' / ') + '\n' : ''}
현재 이펙트 JSON:
${JSON.stringify(serializeEffect(effect))}

첫 번째 이미지는 현재 렌더입니다. 시간순으로 왼쪽→오른쪽, 위→아래 12칸이고 각 칸에 시각이 적혀 있습니다.
${_refImage ? '두 번째 이미지는 사용자 레퍼런스입니다.\n' : ''}
칸들을 움직임으로 읽고 평가하세요: 요청과 맞는가, 원형 덩어리나 도넛이 보이지 않는가, 뿌옇게 번지지 않고 형태가 또렷한가, 하얗게 타서 내부 형태와 색이 사라지지 않았는가, 실루엣이 읽히는가, 시작이 충분히 강한가, 끝이 어색하게 뚝 끊기지 않는가, 크기와 밝기 대비가 있는가, 화면에서 너무 작거나 잘리지 않는가.
수정 지시가 있으면 그 지시를 반영한 결과를 반드시 내세요. 기존 구조는 유지하고 필요한 값만 바꾸되, 레이어 추가·삭제는 자유입니다.
출력: {"pass":true|false,"issues":["발견한 문제(한국어, 짧게)"],"effect":{합성 스키마 전체}}
문제가 없고 수정 지시도 없으면 pass:true 만 내도 됩니다.`;
      const images = [sheet.replace(/^data:image\/png;base64,/, ''), ...refImagesB64()];
      const res = parseLLMJson(await callLLM(getLLMSystemPrompt(), user, images));
      const issues = Array.isArray(res.issues) ? res.issues.join(' · ') : '';
      if (res.effect) applyEffect(normalizeEffect(res.effect));
      status.textContent = res.pass && !res.effect ? '✓ 검수 통과' : ('✓ 반영: ' + (issues || '수정 완료'));
      if (res.pass && !feedback) break;
      feedback = '';
    }
    saveDebugSheet(renderContactSheet(currentEffectObj(), 4, 3, 400, 300), 'final');
  } catch (e) {
    console.error('[LLM]', e);
    status.textContent = humanizeLLMError(e, label);
  } finally {
    setLLMBusy(false);
  }
}

function refineWithFeedback(text) {
  const el = document.getElementById('llm-feedback');
  const fb = (text || el.value).trim();
  if (!fb) { document.getElementById('llm-status').textContent = '수정 지시를 입력하세요'; return; }
  if (!text) el.value = '';
  return reviewLoop(fb, 1);
}

let _sheetWhiteRatio = 0;  // 마지막 시트에서 보이는 영역 중 흰색으로 포화된 비율의 최대값
function measureWhiteRatio(c, W, H) {
  const d = c.getImageData(0, 0, W, H).data;
  let white = 0, lit = 0;
  for (let i = 0; i < d.length; i += 64) {
    if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) white++;
    if (d[i] + d[i + 1] + d[i + 2] > 90) lit++;
  }
  return lit > 0 ? white / lit : 0;
}
function blowoutWarning() {
  return _sheetWhiteRatio > 0.2
    ? ['보이는 영역의 최대 ' + Math.round(_sheetWhiteRatio * 100) + '% 가 흰색으로 포화됨 — Additive 알파와 입자 크기를 낮출 것'] : [];
}

// 이펙트를 라이브에 적용하지 않고 N칸 시간순 이미지로 렌더 (AI 검수 + 3안 썸네일)
function renderContactSheet(effect, cols, rows, cellW, cellH) {
  const W = 800, H = 600;
  const sheet = document.createElement('canvas');
  sheet.width = cols * cellW; sheet.height = rows * cellH;
  const sc = sheet.getContext('2d');
  const frame = document.createElement('canvas');
  frame.width = W; frame.height = H;
  const fc = frame.getContext('2d');
  const saved = beginOffline();
  const savedBloom = fxBloom, savedCamera = fxCamera;
  try {
    const layers = effect.layers.map(makeSys).map(cloneSys);
    mainSys = layers[layers.length - 1];
    extraSystems = layers.slice(0, -1);
    fxBloom = effect.bloom;
    fxCamera = effect.camera;
    const T = effectTotalTime();
    const N = cols * rows, step = 1 / 120;
    _sheetWhiteRatio = 0;
    let t = 0;
    for (let i = 0; i < N; i++) {
      const target = T * Math.pow((i + 1) / (N + 1), 1.5);  // 시작부를 촘촘히
      while (t < target) { offlineStep(step); t += step; }
      fc.fillStyle = bgMode === 'gray' ? '#464646' : '#050505';
      fc.fillRect(0, 0, W, H);
      composeFrame(fc, W, H, W / 2, H / 2, 1);
      _sheetWhiteRatio = Math.max(_sheetWhiteRatio, measureWhiteRatio(fc, W, H));
      const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
      sc.drawImage(frame, x, y, cellW, cellH);
      if (cellW >= 200) {
        sc.fillStyle = '#9a9';
        sc.font = '12px monospace';
        sc.fillText(t.toFixed(2) + 's', x + 4, y + 14);
        sc.strokeStyle = '#333';
        sc.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
      }
    }
  } finally {
    fxBloom = savedBloom;
    fxCamera = savedCamera;
    endOffline(saved);
  }
  return sheet.toDataURL('image/png');
}

// 검수 이미지를 브리지에 보관 (bridge/history) — 결과 추적용
function saveDebugSheet(dataUrl, tag) {
  if (location.protocol === 'file:') return;
  fetch('/save-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag, dataUrl }) }).catch(() => {});
}

// 표현을 몰라도 누를 수 있는 느낌 단어
const FEEL_CHIPS = {
  '더 묵직하게': '더 무겁고 질량감 있게. 느린 후반, 큰 덩어리, 낮은 중심, 강한 시작',
  '더 날카롭게': '더 날카롭고 빠르게. 얇고 길게, 짧은 수명, 강한 대비',
  '더 빠르게': '전체 시간을 30% 줄이고 시작을 더 폭발적으로',
  '더 천천히': '전체 시간을 50% 늘리고 여운을 길게',
  '더 크게': '전체 규모를 1.4배로',
  '더 작게': '전체 규모를 0.7배로',
  '더 화려하게': '2차 입자와 반짝임을 늘리고 색 단계를 풍부하게',
  '더 절제되게': '입자 수를 줄이고 형태 하나를 또렷하게',
  '더 밝게': '코어를 밝히고 블룸을 올리기',
  '더 어둡게': '어둡고 탁한 색 위주로, 밝은 지점은 코어만',
  '여운 추가': '끝에 천천히 식는 연기나 잔광 레이어 추가',
  '예비동작 추가': '터지기 전 0.2~0.4초 모이는 예비 동작 추가',
};
function buildFeelChips() {
  const wrap = document.getElementById('llm-chips');
  for (const label in FEEL_CHIPS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => refineWithFeedback(FEEL_CHIPS[label]);
    wrap.appendChild(b);
  }
}

document.getElementById('llm-ref-input').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 512 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    _refImage = cv.toDataURL('image/png');
    URL.revokeObjectURL(img.src);
    document.getElementById('llm-ref-info').innerHTML = '';
    const clear = document.createElement('a');
    clear.textContent = `레퍼런스: ${f.name} (해제)`;
    clear.href = '#';
    clear.onclick = ev => { ev.preventDefault(); _refImage = null; document.getElementById('llm-ref-info').innerHTML = ''; };
    document.getElementById('llm-ref-info').appendChild(clear);
  };
  img.src = URL.createObjectURL(f);
};
