# Sparklet

설명을 입력하면 AI가 2D 게임 이펙트 초안을 만들고, 고른 안을 다듬어 스프라이트 시트로 내보내는 로컬 도구입니다.

흑백 플립북 시트를 본체로 쓰고, 파티클은 불티·파편 같은 보조로 씁니다.

## 필요 환경

| 구성 요소 | 용도 |
|---|---|
| Node.js | 로컬 서버 (`bridge.js`, 의존성 없음) |
| Claude Code CLI 로그인 | 이펙트 설계와 렌더 검수. API 키 불필요 |
| Chrome + Claude 확장 + ChatGPT 로그인 | 없는 재료 시트 자동 생성 (선택) |

Chrome이 여러 개 연결돼 있으면 `standalone/bridge/config.json`에 사용할 브라우저를 지정합니다.

```json
{ "chromeDevice": "<deviceId>" }
```

## 실행

`standalone/run.bat`을 실행하면 http://localhost:8788 이 열립니다.

## 사용 흐름

1. **만들기**: 효과를 대충 적고 스타일과 그림체를 고른 뒤 **3가지 해석으로 만들기**를 누릅니다.
2. 형태와 동작이 다른 3안 중 하나를 고르면 AI가 렌더 12칸을 보고 자동 검수합니다.
3. 느낌 칩이나 직접 지시, 레퍼런스 이미지로 다듬습니다.
4. **이펙트**: 저장하거나 스프라이트 시트로 내보냅니다.

없는 재료가 필요하면 CLI가 Chrome으로 ChatGPT에서 4×4 흑백 시트를 그려 `assets/ai`에 등록합니다. 시트 한 장에 1~2분 걸립니다.

## 시트 가져오기

외부 시트를 열면 칸을 자동으로 찾고, 프레임 기준점을 맞춰 균일한 시트로 재구성합니다.

- 정렬: 중심(폭발·연기), 바닥(불꽃), 오른쪽(날아가는 물체)
- 미리보기에서 칸을 눌러 프레임 제외

## 내보내기

`standalone/exports`에 PNG와 Aseprite 형식 JSON을 저장합니다. 이펙트가 잘리지 않게 배율을 자동으로 맞추고, 비루프 효과는 전체 길이를 프레임 수에 맞춥니다.

JSON의 `meta.sparklet`에 fps, 피벗, 레이어 구성이 들어 있습니다.

## 파일 구조

```
standalone/
├── run.bat               실행
├── bridge.js             로컬 서버, CLI 호출, 시트 생성
├── particle_editor.html  에디터 (engine.js 인라인 포함)
├── engine.js             순수 로직 (node test.js 용)
├── test.js               테스트
├── compare.html          기준 영상 비교 화면
├── assets/ai/            AI 생성 시트와 manifest.json
└── effects/              저장한 이펙트
```

`engine.js`를 고치면 HTML의 `ENGINE_INLINE_BEGIN~END` 구간도 같이 맞춰야 합니다. 테스트가 어긋남을 잡아냅니다.

## 테스트

```
cd standalone
node test.js
```

## 알려진 제한

- 세부 조정 탭은 맨 위 레이어만 편집합니다.
- 난수 시드가 없어 같은 이펙트도 재생마다 입자가 조금 다릅니다.
- `assets/ai` 이미지는 ChatGPT로 생성했습니다. 상용 사용과 공개 배포 전에 이용 조건을 확인하세요.

## 라이선스

MIT (코드 기준)
