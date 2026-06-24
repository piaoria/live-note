/**
 * LiveNote — background/index.js  (service worker, type: module)
 * content script ↔ AI(Gemini Nano) 메시지 라우팅.
 *
 *   REFINE_CHUNK { text }  -> { summary: string|null }
 *   AI_STATUS              -> { status: string }
 */

import { summarize, getStatus } from "./ai.js";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "REFINE_CHUNK") {
    summarize(msg.text || "")
      .then((summary) => sendResponse({ summary }))
      .catch((e) => sendResponse({ summary: null, error: String(e) }));
    return true; // async response
  }

  if (msg.type === "AI_STATUS") {
    getStatus()
      .then((status) => sendResponse({ status }))
      .catch(() => sendResponse({ status: "확인 실패" }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.debug("[LiveNote] service worker installed");
  getStatus().then((s) => console.debug("[LiveNote] AI status:", s));
});
