/**
 * LiveNote — content/stocks.js
 * window.LN 네임스페이스 부트스트랩 + 종목/투자 키워드 사전 및 1차 필터.
 *
 * content_scripts(js 배열)는 ES 모듈이 아니므로 import 대신 window.LN 공유 네임스페이스를 사용한다.
 * 이 파일이 js 배열의 첫 번째라서 LN 을 생성한다.
 */
(() => {
  "use strict";
  const LN = (window.LN = window.LN || {});

  // 투자 행위/분석 관련 키워드 (잡담 컷용). 이 중 하나라도 있으면 통과 후보.
  const ACTION_KEYWORDS = [
    "매수", "매도", "분할매수", "분할매도", "손절", "익절", "물타기", "불타기",
    "지지선", "저항선", "추세", "차트", "캔들", "거래량", "이평선", "골든크로스", "데드크로스",
    "실적", "어닝", "가이던스", "목표가", "적정주가", "밸류", "per", "pbr", "roe",
    "상한가", "하한가", "급등", "급락", "반등", "조정", "횡보", "돌파", "이탈",
    "호재", "악재", "공시", "배당", "유상증자", "무상증자", "자사주", "테마", "수급",
    "외국인", "기관", "개미", "공매도", "선물", "옵션", "코스피", "코스닥", "나스닥",
    "buy", "sell", "long", "short", "target", "earnings", "rally", "breakout", "support", "resistance",
  ];

  // 대표 종목명 사전 (실데이터로 계속 확장). 표기 변형 일부 포함.
  const STOCK_NAMES = [
    // 국내 대형주
    "삼성전자", "삼전", "에스케이하이닉스", "sk하이닉스", "하이닉스", "lg에너지솔루션", "엘지엔솔",
    "삼성바이오로직스", "현대차", "기아", "포스코", "posco", "네이버", "naver", "카카오", "kakao",
    "셀트리온", "lg화학", "삼성sdi", "현대모비스", "kb금융", "신한지주", "하나금융", "한미반도체",
    "에코프로", "에코프로비엠", "포스코퓨처엠", "두산에너빌리티", "한화에어로스페이스", "현대로템",
    "lg전자", "sk이노베이션", "삼성물산", "고려아연", "유한양행", "알테오젠", "리노공업", "이수페타시스",
    // 해외/미국
    "애플", "apple", "엔비디아", "nvidia", "테슬라", "tesla", "마이크로소프트", "microsoft",
    "아마존", "amazon", "구글", "알파벳", "google", "alphabet", "메타", "meta", "넷플릭스", "netflix",
    "팔란티어", "palantir", "amd", "인텔", "intel", "브로드컴", "broadcom", "마이크론", "micron",
    "tsmc", "asml", "코인베이스", "coinbase", "리비안", "rivian", "비트코인", "bitcoin", "이더리움",
  ];

  // 빠른 탐색을 위해 소문자 셋으로 보관
  const actionSet = ACTION_KEYWORDS.map((k) => k.toLowerCase());
  let stockSet = STOCK_NAMES.map((k) => k.toLowerCase());

  /** 사용자 정의 종목/키워드를 합친다(설정에서 추가). */
  function setExtraKeywords(extra = []) {
    const cleaned = extra.map((k) => String(k).toLowerCase().trim()).filter(Boolean);
    stockSet = Array.from(new Set([...STOCK_NAMES.map((k) => k.toLowerCase()), ...cleaned]));
  }

  /**
   * 텍스트에 종목명 또는 투자 키워드가 있는지 검사.
   * @returns {{pass:boolean, hitStocks:string[], hitKeywords:string[]}}
   */
  function inspect(text) {
    if (!text) return { pass: false, hitStocks: [], hitKeywords: [] };
    const lower = text.toLowerCase();
    const hitStocks = stockSet.filter((s) => lower.includes(s));
    const hitKeywords = actionSet.filter((k) => lower.includes(k));
    // 종목명이 있거나, (키워드가 있고 텍스트가 충분히 길면) 통과
    const pass = hitStocks.length > 0 || hitKeywords.length > 0;
    return { pass, hitStocks, hitKeywords };
  }

  LN.stocks = { inspect, setExtraKeywords, STOCK_NAMES, ACTION_KEYWORDS };
})();
