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

function loadSettings() {
  chrome.storage.local.get(["ln_settings"], (r) => {
    const s = (r && r.ln_settings) || {};
    $("hide").checked = !!s.hide;
    $("keywords").value = Array.isArray(s.keywords) ? s.keywords.join(", ") : "";
  });
}

function saveSettings() {
  const settings = {
    hide: $("hide").checked,
    keywords: $("keywords").value.split(",").map((s) => s.trim()).filter(Boolean),
  };
  chrome.storage.local.set({ ln_settings: settings }, () => {
    const saved = $("saved");
    saved.hidden = false;
    setTimeout(() => (saved.hidden = true), 1500);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  refreshStatus();
  $("save").addEventListener("click", saveSettings);
  $("hide").addEventListener("change", saveSettings);
});
