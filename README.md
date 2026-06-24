# LiveNote 📝

유튜브 라이브 방송(특히 주식/투자 방송)의 **실시간 자동 자막**을 가로채
**Chrome 내장 AI(Gemini Nano)** 로 정제하고, 영상 우측 사이드바에
`[타임스탬프 + 종목명 + 핵심 요약]` 마크다운 타임라인으로 누적 기록하는 크롬 확장 프로그램입니다.

> 외부 STT 서버 / 외부 LLM API **없이**, 전적으로 브라우저 온디바이스 AI 만 사용합니다.

자세한 설계는 [`docs/PROJECT.md`](docs/PROJECT.md) 참고.

## 동작 파이프라인

```
자막 수집(네트워크 가로채기 + DOM 관찰) → 30초/150자 버퍼링 → 종목 키워드 필터
→ Gemini Nano 로 1줄 요약 → 우측 사이드바에 누적
```

## 설치 (개발자 모드)

1. Chrome **138 이상** 사용. 내장 AI(Prompt API)가 필요합니다.
   - 필요 시 `chrome://flags` 에서 **Prompt API for Gemini Nano** 관련 플래그를 Enabled 로 설정 후 재시작.
   - `chrome://components` 의 *Optimization Guide On Device Model* 이 최신인지 확인(첫 실행 시 모델 다운로드).
2. `chrome://extensions` → 우측 상단 **개발자 모드** 켜기.
3. **압축해제된 확장 프로그램을 로드** → 이 저장소 폴더 선택.
4. 유튜브 라이브 영상으로 이동하면 우측에 **LiveNote** 사이드바가 나타납니다.

## 사용법

- 사이드바 상단 버튼: **⏸ 기록 시작/일시정지 · 📋 전체 복사 · ⬇ .md 다운로드 · ⚙ 설정**
- 확장 아이콘(툴바) 클릭 → 팝업에서 AI 상태 확인 / 자막 숨김 / 추가 종목·키워드 등록.

## 빌드 / 패키징

무빌드 구조라 별도 번들링은 없습니다. 배포 자산만 스크립트로 생성합니다.

```bash
node scripts/generate-icons.js   # assets/icon16·48·128.png 생성
node scripts/package.mjs         # dist/live-note-<version>.zip (스토어 업로드용) 생성
```

## Chrome 웹스토어 등록

등록에 필요한 아이콘·권한 정리·패키징·리스팅 문안·개인정보 처리방침이 모두 준비되어 있습니다.

- 등록 가이드 & 복사용 리스팅 문안: [`docs/STORE.md`](docs/STORE.md)
- 개인정보 처리방침: [`PRIVACY.md`](PRIVACY.md)

## 패치 내역 (Changelog)

버전별 변경 사항은 [`CHANGELOG.md`](CHANGELOG.md)에서 관리합니다. (최신: **v0.2.0** — UI 리디자인 + 웹스토어 등록 준비)

## 상태

파이프라인 구현 + UI 다듬기 + 웹스토어 등록 준비 완료. 남은 것은 실제 라이브 방송 대상 셀렉터/엔드포인트
안정화(실데이터 튜닝)입니다. 체크리스트는 [`docs/PROJECT.md` §6](docs/PROJECT.md) 참고.
