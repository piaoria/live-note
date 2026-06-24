# LiveNote — 실시간 유튜브 라이브 자막 정제 & 타임라인 기록

> 유튜브 라이브(특히 주식/투자 방송)의 실시간 자동 자막을 가로채 Chrome 내장 AI(Gemini Nano)로
> 정제하고, 우측 사이드바에 `[타임스탬프 + 종목명 + 핵심 요약]` 마크다운 타임라인으로 누적 기록하는
> 크롬 확장 프로그램.

---

## 1. 핵심 가치

늦게 입장한 시청자가 **STT 서버 비용 0원**으로, 방송에서 지금까지 어떤 종목에 대해 어떤 의견이
오갔는지를 실시간 타임라인으로 빠르게 파악할 수 있게 한다.

- 외부 STT 서버 / 외부 LLM API **불필요** — 전적으로 브라우저 내장 AI(Gemini Nano)만 사용.
- 모든 처리가 로컬(온디바이스)에서 이뤄지므로 비용·프라이버시 측면에서 유리.

---

## 2. 데이터 파이프라인

```
[1. 자막 수집] ──> [2. 버퍼링 & 1차 필터] ──> [3. AI 문맥 정제] ──> [4. 마크다운 UI 출력]
 (네트워크 가로채기 /   (30초 / 150자 청크 조립    (Gemini Nano로 종목      (우측 사이드바 누적,
  DOM MutationObserver)   + 종목 키워드 필터)        단위 1줄 요약/구조화)     복사·다운로드)
```

| 단계 | 실행 컨텍스트 | 파일 |
|---|---|---|
| 1. 수집 (네트워크) | MAIN world | `src/inject.js` |
| 1. 수집 (DOM) | isolated content | `src/content/captureDom.js` |
| 2. 버퍼/필터 | isolated content | `src/content/buffer.js`, `src/shared/stocks.js` |
| 3. AI 정제 | service worker | `src/background/index.js`, `src/background/ai.js` |
| 4. UI | isolated content | `src/content/sidebar.js`, `src/content/sidebar.css` |

> **왜 AI를 background(service worker)에서 돌리나?**
> Chrome 내장 `LanguageModel` API는 확장 프로그램의 service worker / 확장 페이지 컨텍스트에서
> 안정적으로 노출된다. content script의 isolated world에서는 노출이 보장되지 않으므로,
> content → background로 청크를 메시지 전달하고 요약 결과를 돌려받는 구조를 사용한다.

---

## 3. 단계별 세부 명세

### ① 자막 데이터 수집

사용자가 CC 버튼을 켜지 않아도 동작해야 한다. 두 경로를 **동시에** 운용하고 중복은 제거한다.

- **Method A (네트워크 가로채기, 권장):** `manifest`의 `world: "MAIN"` content script(`inject.js`)가
  페이지의 `window.fetch` / `XMLHttpRequest`를 패치하여 `youtube.com/api/timedtext` 응답을 가로채고,
  자막 텍스트만 추출해 `window.postMessage`로 isolated content script에 전달한다.
- **Method B (DOM 우회):** 백그라운드에서 자막 트랙을 강제 활성화하고 캡션 박스를 `opacity:0`으로 숨긴 뒤,
  `.ytp-caption-segment` 노드를 `MutationObserver`로 관찰하여 텍스트 변화를 수집한다.

두 경로 모두 `{ text, tStartMs, videoTimeSec }` 형태의 정규화된 자막 이벤트를 buffer로 보낸다.

### ② 버퍼링 & 1차 필터

- **시간/분량 버퍼:** 자막 조각을 **30초 단위 또는 누적 150자**가 차면 하나의 청크(Chunk)로 조립.
  (둘 중 먼저 도달하는 조건으로 flush. 무음 10초 이상이면 강제 flush.)
- **종목 키워드 필터:** `src/shared/stocks.js`에 내장된 국내/해외 종목명 + 투자 키워드(매수/매도/지지선/
  차트/실적/목표가 등) 사전으로 1차 필터. 종목/키워드가 하나도 없는 청크는 AI로 보내지 않고 버림(잡담 컷).

### ③ AI 문맥 정제 (Gemini Nano)

- 엔진: `LanguageModel`(Chrome 138+). `availability()`로 상태 확인, 다운로드 진행률 monitor.
- 세션은 한 번 만들어 재사용하고, `contextoverflow` 시 재생성.
- 프롬프트 규칙(system): 주식 라이브 자막 요약 전문가. 입력 청크에서 **[종목 분석/질문답변/투자의견]**을
  찾아 **출력 규격에 맞는 딱 1줄 마크다운**으로 요약. 잡담이면 `[SKIP]`만 반환.
- 출력 규격: `[종목명] 핵심 요약 (중요 단어 **Bold**)`

### ④ UI 출력 & 마크다운 누적

- 유튜브 영상 우측(`#secondary` 영역)에 커스텀 사이드바를 삽입.
- AI 결과가 `[SKIP]`이 아니면 `- \`[HH:MM:SS]\` [종목명] 요약` 형태로 사이드바에 append.
- 상단 컨트롤러: **기록 시작/일시정지**, **전체 복사**, **.md 다운로드**, **설정**.
- 라이트/다크 테마 대응, 스크롤로 과거 기록 열람.

---

## 4. 권한 (manifest)

| 권한 | 용도 |
|---|---|
| `storage` | 설정(필터 단어, 기록 on/off, 누적 타임라인) 저장 |
| `scripting` | 동적 주입 보조 |
| `host_permissions: *://*.youtube.com/*` | 유튜브에서만 동작 |
| `trial_tokens` (선택) | 내장 AI Origin Trial이 필요한 채널에서의 토큰 |

> 외부 네트워크 권한 없음. 모든 AI 처리는 온디바이스.

---

## 5. 디렉터리 구조

```
live-note/
├── manifest.json
├── docs/
│   └── PROJECT.md
├── src/
│   ├── inject.js                 # MAIN world: fetch/XHR 가로채기
│   ├── background/               # service worker (type: module → ES import 사용)
│   │   ├── index.js              # 엔트리, 메시지 라우팅
│   │   ├── ai.js                 # Gemini Nano 세션 관리 + 요약
│   │   └── prompt.js             # AI 프롬프트 템플릿
│   ├── content/                  # ISOLATED world (모듈 아님 → window.LN 공유, manifest js 순서대로 로드)
│   │   ├── stocks.js             # window.LN 부트스트랩 + 종목/키워드 사전 & 필터
│   │   ├── buffer.js             # 청크 버퍼 + flush
│   │   ├── captureNet.js         # postMessage 수신 (Method A 브릿지)
│   │   ├── captureDom.js         # MutationObserver 캡션 수집 (Method B)
│   │   ├── sidebar.js            # 사이드바 UI
│   │   ├── sidebar.css
│   │   └── index.js              # 파이프라인 조립 엔트리
│   └── popup/
│       ├── popup.html
│       ├── popup.js
│       └── popup.css
└── README.md
```

---

## 6. 개발 단계 (진행 체크리스트)

- [x] 0. 프로젝트 문서 + manifest 뼈대
- [x] 1. content.js 자막 파싱 (Method A + B) — **우선 구현**
- [x] 2. 버퍼링 & 종목 키워드 필터
- [x] 3. background Gemini Nano 정제
- [x] 4. 사이드바 UI + 복사/다운로드
- [x] 5. 팝업 설정(필터 단어, 기록 토글)
- [ ] 6. 실제 라이브 방송 대상 셀렉터/엔드포인트 안정화 (실데이터 튜닝)

---

## 7. 알려진 리스크 / 후속 과제

- 유튜브 `timedtext` 엔드포인트 포맷(`fmt=json3`/`srv3`)은 변동 가능 → 파서를 방어적으로 작성, DOM 경로로 폴백.
- Gemini Nano는 영어 최적화 — 한국어 입력 요약 품질은 실데이터로 프롬프트 튜닝 필요(7-2).
- 자막 강제 활성화(Method B)는 유튜브 플레이어 내부 API 변경에 취약 → Method A를 1순위로.
