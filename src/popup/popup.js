/* LiveNote — popup.js : 설정 읽기/쓰기 + AI 상태 표시 */
"use strict";

const $ = (id) => document.getElementById(id);

function setBadge(text) {
  const el = $("ai-status");
  el.textContent = text;
  el.classList.remove("ok", "warn", "err");
  if (/사용 가능/.test(text)) el.classList.add("ok");
  else if (/다운로드|중/.test(text)) el.classList.add("warn");
  else if (/미지원|불가|실패/.test(text)) el.classList.add("err");
}

// AI 상태는 background 에 물어본다(LanguageModel 은 service worker 에서 확인).
function refreshStatus() {
  try {
    chrome.runtime.sendMessage({ type: "AI_STATUS" }, (resp) => {
      if (chrome.runtime.lastError) return setBadge("확인 실패");
      setBadge(resp?.status || "알 수 없음");
    });
  } catch (_) {
    setBadge("확인 실패");
  }
}

let keywords = [];

const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function renderChips() {
  const wrap = $("chips");
  if (!keywords.length) {
    wrap.innerHTML = '<span class="chip-empty">추가 항목 없음 · 기본 사전만 사용</span>';
    return;
  }
  wrap.innerHTML = keywords
    .map(
      (k, i) =>
        `<span class="chip">${escapeHtml(k)}<button data-rm="${i}" aria-label="삭제" title="삭제">×</button></span>`
    )
    .join("");
}

function showSaved() {
  const saved = $("saved");
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1200);
}

function persist() {
  const settings = { hide: $("hide").checked, keywords: keywords.slice() };
  chrome.storage.local.set({ ln_settings: settings }, showSaved);
}

function addKeyword(value) {
  const v = (value || "").trim();
  if (!v) return false;
  if (keywords.some((k) => k.toLowerCase() === v.toLowerCase())) return false;
  keywords.push(v);
  renderChips();
  persist();
  return true;
}

function removeKeyword(i) {
  keywords.splice(i, 1);
  renderChips();
  persist();
}

function loadSettings() {
  chrome.storage.local.get(["ln_settings"], (r) => {
    const s = (r && r.ln_settings) || {};
    $("hide").checked = !!s.hide;
    keywords = Array.isArray(s.keywords) ? s.keywords.slice() : [];
    renderChips();
  });
}

function setDictInfo() {
  const stocks = window.LN && window.LN.stocks;
  if (stocks)
    $("dict-info").textContent = `기본 ${stocks.STOCK_NAMES.length}종목·${stocks.ACTION_KEYWORDS.length}키워드 내장`;
}

// ---- 오디오 STT PoC ----
let pocRunning = false;

function setPocStatus(text) {
  $("poc-status").textContent = text || "";
}

function appendPocLog(text, ms) {
  const log = $("poc-log");
  const line = document.createElement("div");
  line.className = "poc-line";
  const t = new Date().toLocaleTimeString("ko-KR");
  line.textContent = `[${t}] ${text || "(빈 결과)"}${ms ? ` · ${ms}ms` : ""}`;
  log.prepend(line);
}

async function startPoc() {
  // getMediaStreamId 는 사용자 제스처(버튼 클릭) 컨텍스트에서 호출해야 안전.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return setPocStatus("활성 탭을 찾지 못했습니다.");
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (e) {
    return setPocStatus("탭 캡처 권한 획득 실패: " + (e?.message || e));
  }
  chrome.runtime.sendMessage({ type: "AUDIO_POC_START", streamId }, (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      return setPocStatus("시작 실패: " + (resp?.error || chrome.runtime.lastError?.message || ""));
    }
    pocRunning = true;
    $("poc-toggle").textContent = "중지";
    setPocStatus("캡처 시작 — 청크가 모이면 받아쓰기됩니다…");
  });
}

function stopPoc() {
  chrome.runtime.sendMessage({ type: "AUDIO_POC_STOP" }, () => {
    pocRunning = false;
    $("poc-toggle").textContent = "시작";
    setPocStatus("중지됨");
  });
}

// offscreen → 이벤트 수신(popup 이 열려 있을 때만 표시)
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "AUDIO_POC_EVENT") return;
  if (msg.kind === "transcript") appendPocLog(msg.text, msg.ms);
  else if (msg.kind === "status") setPocStatus(msg.status);
  else if (msg.kind === "error") setPocStatus("오류: " + msg.message);
});

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  refreshStatus();
  setDictInfo();

  $("poc-toggle").addEventListener("click", () => {
    if (pocRunning) stopPoc();
    else startPoc();
  });

  $("hide").addEventListener("change", persist);

  const input = $("kw-input");
  const commit = () => {
    if (addKeyword(input.value)) input.value = "";
    input.focus();
  };
  $("kw-add").addEventListener("click", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  });
  $("chips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rm]");
    if (btn) removeKeyword(Number(btn.getAttribute("data-rm")));
  });
});
