# ✨ Sparklet

> **브라우저에서 바로 동작하는 2D 게임용 파티클 이펙트 에디터.**
> 픽셀 아트와 부드러운 벡터 2D 스타일 모두 지원.
> 파일 하나 더블클릭으로 실행. 설치·빌드 불필요.

---

## 주요 기능

### 🎨 파티클 엔진
- **28가지 파티클 모양** — circle / square / diamond / triangle / star / teardrop / ring / cross / hexagon / spark / crescent / flame / pentagon / octagon / bar / pill / ellipse / bubble / heart / snowflake / bolt / shuriken / arrow / leaf / chevron / shield / sparkle / **slash**(검 휘두름 호)
- **2가지 렌더 모드**
  - **Smooth Vector** (기본) — 안티앨리어싱된 부드러운 2D 스프라이트 (Hollow Knight / Ori 스타일)
  - **Pixel Art** — 정확한 격자 래스터화 + nearest-neighbor 업스케일 (Celeste / Stardew 스타일)
- **`pixelScale`** — 1~8 로 픽셀 블록 크기 조절
- **외곽선** — 손그림 2D 스타일 검정 테두리 (자동 두께 축소)

### 🎮 이미터 / 물리
- 이미터 모양: Point / Circle / Disc / Box / Cone
- Velocity / direction bias / gravity / drag
- **Stretch** — 속도 방향으로 파티클 신장 (베기·번개·빔 효과)
- **Jitter / Turbulence** — 살아있는 느낌의 미세 요동 + 사인파 바람
- **BurstSpread** — 동시 스폰을 짧은 시간에 분산 (기계적 느낌 제거)
- **Ease 곡선** — linear / easeOut / easeIn / easeInOut / **easeOutBack** (임팩트 튕김)
- **fadeIn / fadeOut** — 소프트 페이드인/아웃

### ✨ 게임 필 FX
- **Screen Shake** — 진폭 + 감쇠 지속시간
- **Screen Flash** — 화면 전체 플래시 오버레이
- **Hit Stop** — 시작 시 시뮬레이션 순간 정지
- 효과는 파라미터에 내장 — 치명타 프리셋 하나 재생하면 파티클 + 흔들림 + 플래시 + 히트스톱이 한번에

### 🎬 콤보 시스템 (다중 레이어)
여러 파티클 시스템을 동시 재생하는 콤보 프리셋. 예: `💎 보스 처치` = 6레이어 (플래시 + 화염 + 파편 + 영혼 + 반짝임 + 연기).

### 🎨 색 팔레트 양자화 (레트로 모드)
클릭 한 번으로 전체 이펙트 색이 고전 콘솔 팔레트에 스냅:
- **PICO-8** (16색)
- **Game Boy** (4단계 초록)
- **NES-ish** (16색)
- **Endesga 16** (현대 픽셀 팔레트)

### 📷 스프라이트 시트 내보내기
- N×M 프레임으로 녹화 → **투명 배경 PNG** + JSON 메타데이터 자동 다운로드
- Unity / Godot / GameMaker / Unreal 2D 등 어떤 엔진에도 임포트 가능
- Cols / Rows / 셀 크기 / FPS 지정 가능

### 🤖 LLM 생성 (선택 기능)
자연어 설명 → LLM API → JSON 파라미터 자동 생성.
> 예: "거대한 보라색 어둠의 화염" → 파티클 파라미터 + 색 / 움직임 / 크기 자동 설정

**🤖 Claude Code 모드 (키 없이)** — API 키·과금 없이, 열려있는 Claude Code 세션을 두뇌로 사용. 버튼을 누르면 프롬프트가 클립보드에 복사됨 → Claude Code 대화창에 붙여넣기 → 받은 JSON 을 패널에 붙여넣어 적용. (`file://` 보안상 복사→붙여넣기 방식)

**프로바이더 선택 가능 (API 키 직접 호출)** — Claude (Anthropic) / Gemini (Google) / GPT (OpenAI). 사이드바 드롭다운에서 선택.
**비전 개선** — 생성 후 `🔍 비전으로 개선` 을 누르면 현재 렌더 스크린샷을 LLM 에 보여주고 자동 수정안을 받습니다.

**필요한 것**: 선택한 프로바이더의 본인 API 키
- Claude: [console.anthropic.com](https://console.anthropic.com)
- Gemini: [aistudio.google.com](https://aistudio.google.com/app/apikey)
- OpenAI: [platform.openai.com](https://platform.openai.com/api-keys)

자세한 제약사항은 [LLM 기능 사용법](#-llm-기능-사용법-선택) 섹션 참고.

### 🗡️ 2D 스프라이트 FX (손그림/픽셀 느낌)
파티클이 "먼지처럼 흩뿌려지는" 느낌이 아니라 **손으로 그린 한 획** 처럼 보이게 하는 기능군.
- **`slash` 모양** — 검 휘두름 호(arc). 단일 형상으로 베기·참격을 표현 (회전/stretch 와 조합)
- **🖌 셀 프리셋팩** — 굵은 외곽선 + 플랫 채색 + 소수·대형 요소 (Hollow Knight / 바닐라웨어식). `🖌 셀: 베기 / 더블 베기 / 충격파 / 폭발 / 마법진 펄스 / 회복`
- **🎮 픽셀 스프라이트 프리셋팩** — 격자 래스터 + 끊어치는 타이밍 (Celeste / Stardew식). `🎮 픽셀: 폭발 / 베기 / 충격파 / 반짝(획득) / 불꽃`
- **🎮 게임 액션 프리셋팩** — 2D 액션·플랫포머의 실제 순간. `🎮 액션: 점프 먼지 / 착지 먼지 / 대시 잔상 / 피격 스파크 / 코인 획득 / 회복 + / 레벨업 / 사망 poof`
- **🎞 스텝 재생** — 미리보기를 12 / 8 / 6 fps 로 끊어서 재생해 손키프레임 같은 임팩트감 부여 (하단 `🎞` 버튼으로 순환)
- **프리셋 목록 = 스프라이트 우선** — 사이드바엔 스프라이트 팩(🖌/🎮)만 노출. 기존 클래식(전투/속성/환경 등) 프리셋은 `▸ 기본 프리셋` 토글 뒤에 접혀 있으며 검색하면 자동으로 펼쳐짐.

### 🛠️ 기타
- **60+ 단일 프리셋** — 전투/속성/버프/환경/움직임/상호작용/스킬 + 셀/픽셀 스프라이트 팩
- **6 콤보 프리셋** — 💥 픽셀 폭발 / ⚡ 번개 스트라이크 / 🗡️ 필살기 베기 / 🌟 레벨업 / 🌸 벚꽃 참격 / 💎 보스 처치
- **프리셋 검색** — 실시간 필터
- **배경 모드** — 어둠 / 체커보드 / 검정 순환
- **그리드 오버레이** — 32px 격자 + 중앙 십자선
- **한 프레임 스텝** — 일시정지 상태에서 1/60초씩 전진 (이펙트 프레임별 분석)
- **JSON 저장/불러오기** — 커스텀 프리셋 공유
- **FPS 오버레이** — 실시간 성능 표시
- **키보드 단축키** — Space / R / . / B / G

---

## 설치 & 사용법

### 가장 간단한 방법
1. 이 저장소를 Clone 또는 ZIP 다운로드
2. `standalone/particle_editor.html` 을 브라우저로 열기 (더블클릭 또는 드래그)
3. 끝

그 외 설치나 빌드 과정 없음.

### 권장 브라우저
Chrome / Edge / Firefox 최신 버전. (Canvas 2D + `setTransform` + `filter` 를 사용)

---

## 기본 사용 흐름

1. **좌측 사이드바** 에서 프리셋 또는 콤보 선택 → 자동 재생
2. **파라미터 패널** (접이식 그룹) 에서 슬라이더 / 숫자로 조정
3. **캔버스 우상단** 에 실시간 FPS 표시
4. 하단 버튼:
   - `▶ 재생 / ■ 정지`
   - `⟲ 리스타트` (또는 `R` 키)
   - `▶| 스텝` — 한 프레임 전진
   - `◧ 배경` — 어둠/체커/검정 순환
   - `⊞ 그리드` — 32px 격자 토글
   - `📋 복사` — 현재 파라미터를 JSON 으로 클립보드에 복사
5. **📷 스프라이트 시트 내보내기** 섹션에서 Cols/Rows/Cell/FPS 지정 후 `PNG + JSON 다운로드`

### 키보드 단축키
| 키 | 동작 |
|---|---|
| `Space` | 재생/정지 |
| `R` | 리스타트 |
| `.` | 한 프레임 스텝 |
| `B` | 배경 모드 순환 |
| `G` | 그리드 오버레이 토글 |

---

## ✦ AI 로 만들기

`standalone/run.bat` 으로 실행하면 로그인된 Claude CLI 를 사용합니다 (API 키 불필요, http://localhost:8788).

1. 효과를 대충 적고 **3가지 해석으로 만들기** — 형태와 동작이 다른 3안이 나옵니다
2. 마음에 드는 안을 고르면 AI 가 렌더 12칸을 보고 자동 검수합니다
3. **더 묵직하게** 같은 느낌 칩이나 직접 지시로 다듬습니다. 🖼 레퍼런스 이미지도 첨부할 수 있습니다

이미지 시트(`assets/ai`)를 본체로 쓰고 파티클은 불티·섬광 보조로 씁니다. 외부 시트는 **🎞 시트 가져오기**로 자동 슬라이스하고 프레임 기준점을 맞출 수 있습니다.

검수 이미지는 `standalone/bridge/history/` 에 남습니다. API 키 방식은 AI 설정에서 고릅니다.

## 🤖 LLM 기능 사용법 (선택)

**주의: 이 기능은 선택 사항입니다. 쓰지 않아도 나머지 기능은 모두 동작합니다.**

1. 사이드바 **✦ LLM 으로 생성** 패널에서 프로바이더 선택 (Claude / Gemini / OpenAI)
2. 해당 프로바이더에서 API 키 발급
   - Claude: [console.anthropic.com](https://console.anthropic.com) (`sk-ant-...`)
   - Gemini: [aistudio.google.com](https://aistudio.google.com/app/apikey) (`AIza...`)
   - OpenAI: [platform.openai.com](https://platform.openai.com/api-keys) (`sk-...`)
3. **API Key** 입력 (브라우저 `localStorage` 에 프로바이더별로 저장됨)
4. 효과 설명 입력 (예: "거대한 보라색 어둠의 화염이 솟아오르는 효과")
5. **생성** 클릭 → 파라미터가 자동 로드됨
6. (선택) **🔍 비전으로 개선** — 현재 렌더 스크린샷을 LLM 에 보여주고 수정안 받기

### ⚠️ LLM 기능 제약사항 (반드시 읽기)

- **로컬 실험용 전용**: 브라우저에서 LLM API 를 직접 호출합니다 (Claude 의 경우 `anthropic-dangerous-direct-browser-access: true` 헤더 사용). **프로덕션 / 공개 서비스용이 아닙니다.**
- **API 키 유출 주의**: 키는 `localStorage` 에만 저장되며 HTML 파일 자체에 임베드되지 않습니다. 그래도 남한테 파일을 보낼 땐 LLM 패널을 쓰지 않은 상태에서 보내는 것이 안전합니다.
- **과금**: 각 프로바이더 계정 기준 요금 발생. 파티클 생성 1회당 짧은 JSON 응답 (Claude 기준 ~$0.01~0.05 예상).
- **기본 모델**: Claude `claude-opus-4-8` / Gemini `gemini-2.0-flash`(사용 가능한 최신 모델 자동 선택) / OpenAI `gpt-4o`

---

## 기술 스펙

- **렌더러**: HTML5 Canvas 2D (단일 파일, 의존성 없음)
- **파일 크기**: ~120KB (단일 HTML, 모든 로직 포함)
- **성능**: 60fps 기준 ~2000 파티클 (6레이어 콤보 안정 재생)
- **주요 최적화**:
  - 픽셀 모양 캐시 (오프스크린 비트맵 + LRU 400 엔트리)
  - `setTransform` 매트릭스 합성 (save/restore 제거)
  - 오프스크린 컬링
  - 색 버킷 양자화 (캐시 키 수 제한)

---

## 포함 파일 구조

```
.
├── README.md
├── LICENSE
├── standalone/
│   ├── particle_editor.html      ← 메인 에디터 (단일 파일)
│   ├── engine.js                 ← 순수 로직 모듈 (Node 테스트용)
│   └── test.js                   ← 테스트 스위트 (node test.js)
```

---

## 추천 사용 시나리오

### ✅ 이 툴이 잘 어울리는 용도
- 픽셀 아트 2D 게임 이펙트 디자인
- 손그림 2D (Hollow Knight 류) 이펙트 프로토타이핑
- 스프라이트 시트 에셋 생산 (PNG 시트로 뽑아 모든 엔진에 임포트)
- 이펙트 아이디어 빠른 탐색
- LLM 으로 자연어 기반 이펙트 생성 실험

### ⚠️ 이 툴로는 어려운 것
- 대규모 탄막 (수천 파티클 이상) — Unity / Godot 의 GPU 파티클 필요
- 게임 로직과의 실시간 연동 — 게임 엔진에서 해야 함
- 커스텀 셰이더 / 포스트 프로세싱 — Canvas 2D 제약
- 3D 효과 — 의도적으로 2D 전용

---

## 타 게임 엔진에 이펙트 가져오기

1. 에디터에서 이펙트 디자인
2. **📷 스프라이트 시트 내보내기** 버튼으로 PNG + JSON 다운로드
3. 게임 엔진에 PNG 임포트:
   - **Unity**: Sprite → Multiple → Slice (Cells by Cell Count: Cols × Rows) → Animator / Animation 로 재생
   - **Godot**: AnimatedSprite2D + SpriteFrames 로 임포트
   - **GameMaker**: Strip image import
   - **Phaser / PixiJS / LÖVE**: 각 엔진의 스프라이트 시트 로더 사용
4. JSON 메타데이터에 FPS 와 프레임 수가 있으니 애니메이션 재생 속도에 참고

---

## 라이선스

MIT License — 자유롭게 사용, 수정, 배포 가능.

---

## 기여 / 피드백

이슈 / PR 환영. 특히:
- 새 파티클 모양 추가
- 새 팔레트 추가
- 프리셋 개선
- 버그 리포트

---

## 알려진 제한사항

- **Canvas 2D 기반**: 2000 파티클 이상에서는 성능 저하. 수만 파티클 필요한 효과는 불가.
- **Unity 브릿지 미검증**: Unity 쪽 C# 파일들은 초기 버전 후 업데이트 안 됨. 권장 방식은 스프라이트 시트 내보내기.
- **커스텀 경로 기능 없음**: 한때 구현했다가 기대만큼 동작하지 않아 제거. 나중에 재구현 예정.
- **LLM 기능은 API 키 필요**: 공짜가 아님. 선택 기능이므로 없어도 모든 프리셋 / 편집 가능.

---

## Changelog (요약)

- **v1.2** — 스프라이트 게임 컨셉 전환: 🎮 게임 액션 프리셋팩(점프/착지/대시/피격/획득/회복/레벨업/사망 8종). 프리셋 목록을 스프라이트 우선으로 — 클래식 프리셋(51종)은 `▸ 기본 프리셋` 토글 뒤로 숨김(검색 시 자동 펼침).
- **v1.1** — 2D 스프라이트 FX 강화: `slash`(검 휘두름 호) 모양 추가, 🖌 셀(손그림 벡터) + 🎮 픽셀 스프라이트 프리셋팩(11종), 🎞 스텝 재생(12/8/6fps). LLM 멀티 프로바이더(Claude/Gemini/OpenAI) 문서화, Claude 기본 모델 `claude-opus-4-8`.
- **v1.0** — 초기 공개. 12가지 파티클 모양, 30+ 프리셋, 6 콤보, 스프라이트 시트 내보내기, LLM 생성, 5 팔레트, 게임 필 FX, 성능 최적화.
