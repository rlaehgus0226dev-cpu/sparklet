// main.js — 탭 전환과 초기화. 다른 스크립트가 모두 로드된 뒤 실행
// ═══════════════════════ 탭 전환 ═══════════════════════
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-bar button').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  // 탭 버튼 활성화
  const idx = ['tab-preset','tab-library','tab-param'].indexOf(tabId);
  if (idx >= 0) document.querySelectorAll('.tab-bar button')[idx].classList.add('active');
  if (tabId === 'tab-library') loadEffectLibrary();
}

// =================================================================
//                           초기화
// =================================================================
buildFeelChips();
sheetLibraryReady = loadSheetLibrary();
buildParamPanel();
buildPaletteSelect();

// 비교 화면용: ?load=저장이펙트이름&bg=gray&bare=1
(async function loadFromURL() {
  const q = new URLSearchParams(location.search);
  if (q.get('bare')) {
    fitView = true;
    document.getElementById('sidebar').style.display = 'none';
    for (const el of [document.getElementById('bottom')]) {
      if (el) el.style.display = 'none';
    }
    setTimeout(resizeCanvas, 50);
  }
  if (q.get('bg')) bgMode = q.get('bg');
  if (!q.get('load')) return;
  await sheetLibraryReady;
  const list = await fetch('/effects').then(r => r.json());
  const it = list.find(x => x.name === q.get('load'));
  if (it) applyEffect(normalizeEffect(it.effect));
})();

// 검증용 자동 실행: ?autogen=설명&style=pixel&pick=0
(async function autoGenFromURL() {
  const q = new URLSearchParams(location.search);
  const prompt = q.get('autogen');
  if (!prompt) return;
  document.getElementById('llm-prompt').value = prompt;
  if (q.get('style')) document.getElementById('llm-style').value = q.get('style');
  await sheetLibraryReady;
  const variants = await generateVariants();
  if (!variants) { saveDebugSheet('data:image/png;base64,', 'error'); return; }
  variants.forEach((v, i) => saveDebugSheet(renderContactSheet(v.effect, 4, 3, 400, 300), 'variant' + i));
  const card = document.querySelectorAll('#llm-variants .variant')[parseInt(q.get('pick'), 10) || 0];
  if (card) await pickVariant(variants[parseInt(q.get('pick'), 10) || 0], card);
  saveDebugSheet('data:image/png;base64,', 'done');
})();

// 키보드 단축키
window.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.code === 'KeyR') { e.preventDefault(); restart(); }
  else if (e.code === 'Period') { e.preventDefault(); stepFrame(); }
  else if (e.code === 'KeyB') { e.preventDefault(); cycleBg(); }
  else if (e.code === 'KeyG') { e.preventDefault(); toggleGrid(); }
});

loadPreset('소용돌이');
