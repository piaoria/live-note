# Changelog

이 프로젝트의 모든 주요 변경 사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르며,
버전은 [유의적 버전(SemVer)](https://semver.org/lang/ko/)을 따릅니다.

## [Unreleased]
### 예정
- 실제 라이브 방송 대상 `timedtext` 포맷 / 플레이어 셀렉터 안정화
- 한국어 요약 프롬프트 실데이터 튜닝
- 사용자 사전 import/export

## [0.3.0] - 2026-06-24
### Added
- **파이프라인 상태 안내**: 헤더 아래 상태바 추가. 현재 상태를 색상 점 + 문구로 표시
  (`자막 대기 중` / `자막 수신 중·종목 언급 대기` / `기록 중·N개` / `AI 준비 중` / `사용 불가` / `일시정지`).
- **상황별 빈 화면 안내**: AI 미지원·다운로드 중·일시정지·자막 수신 중 등 상태에 맞춰 빈 화면 아이콘/문구가 바뀜.
- **사전 관리 UI(칩)**: 사이드바 설정과 팝업 모두 textarea → **칩(chip) 추가/삭제** 방식으로 개편.
  Enter 또는 추가 버튼으로 등록, × 로 삭제, 중복 자동 방지. 기본 내장 사전 규모(종목·키워드 수) 표시.
- content→사이드바 상태 신호(`setPipeline`)와 AI 상태 주기적 갱신(12초)으로 다운로드 진행률 등을 반영.

### Changed
- 팝업 키워드 편집을 칩 UI로 교체하고, 추가/삭제 시 자동 저장(별도 저장 버튼 제거).

## [0.2.0] - 2026-06-24
### Added
- **Chrome 웹스토어 등록 준비**: 실제 PNG 아이콘(16/48/128) 생성기(`scripts/generate-icons.js`)와 아이콘 적용.
- 매니페스트에 `icons` / `action.default_icon` / `homepage_url` 추가.
- 배포 패키징 스크립트 `scripts/package.mjs` (스토어 업로드용 zip 생성).
- 개인정보 처리방침 `PRIVACY.md`, 스토어 등록 가이드/리스팅 문안 `docs/STORE.md`.
- `CHANGELOG.md` 추가, README에 패치 내역 섹션 추가.

### Changed
- **UI 리디자인**: 헤더에 LIVE 펄스 점 + 기록 개수 배지, SVG 아이콘 버튼, 둥근 카드/커스텀 스크롤바,
  새 항목 페이드인, 다크/라이트 테마 색상 정돈 등 전반적으로 미니멀하게 다듬음.

### Removed
- 사용하지 않던 `scripting` 권한 제거 (웹스토어 심사 시 불필요 권한 지적 방지). 이제 `storage`만 요청.

## [0.1.0] - 2026-06-24
### Added
- 초기 뼈대(MV3)와 전체 데이터 파이프라인.
- 자막 수집 2경로: `inject.js`(MAIN world `fetch`/XHR `timedtext` 파싱) + `captureDom.js`(MutationObserver 폴백).
- 버퍼링/필터: 30초·150자 청크 조립 + 종목/투자 키워드 1차 필터(`stocks.js`).
- AI 정제: background service worker에서 Chrome 내장 Gemini Nano(`LanguageModel`) 세션 관리 및 1줄 요약.
- UI: 우측 사이드바 타임라인(복사 / `.md` 다운로드 / 설정), 설정 팝업.
- 문서: `docs/PROJECT.md`, `README.md`.

[Unreleased]: https://github.com/piaoria/live-note/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/piaoria/live-note/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/piaoria/live-note/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/piaoria/live-note/releases/tag/v0.1.0
