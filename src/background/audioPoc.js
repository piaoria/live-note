/**
 * LiveNote — background/audioPoc.js  (PoC: 탭 오디오 → 온디바이스 STT)
 *
 * offscreen 문서 수명 관리 + tabCapture 셋업.
 * service worker 는 미디어를 못 다루므로 실제 캡처/받아쓰기는 offscreen 에 위임한다.
 *
 *   popup → background : AUDIO_POC_START { streamId, tabId } / AUDIO_POC_STOP
 *   offscreen → 전체    : AUDIO_POC_EVENT { kind, ... }  (popup 이 열려 있으면 표시)
 */

const OFFSCREEN_PATH = "src/offscreen/offscreen.html";

async function hasOffscreen() {
  // chrome.offscreen.hasDocument 가 있으면 사용, 없으면 clients 로 확인.
  if (chrome.offscreen?.hasDocument) {
    return chrome.offscreen.hasDocument();
  }
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const matched = await clients.matchAll();
  return matched.some((c) => c.url === url);
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "탭 오디오를 캡처해 온디바이스 AI로 받아쓰기 (자막 없는 라이브 대응 PoC)",
  });
}

export async function startAudioPoc(streamId) {
  await ensureOffscreen();
  await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "AUDIO_POC_START",
    streamId,
  });
}

export async function stopAudioPoc() {
  if (!(await hasOffscreen())) return;
  await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "AUDIO_POC_STOP",
  });
  try {
    await chrome.offscreen.closeDocument();
  } catch (_) {}
}
