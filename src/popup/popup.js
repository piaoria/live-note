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

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  refreshStatus();
  setDictInfo();

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
