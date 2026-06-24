/**
 * LiveNote — background/ai.js
 * Chrome 내장 Prompt API(Gemini Nano, 전역 LanguageModel)를 감싸 세션을 관리하고 요약을 수행한다.
 * 참고: https://developer.chrome.com/docs/ai/prompt-api  (Chrome 138+)
 *
 * - availability(): 'unavailable' | 'downloadable' | 'downloading' | 'available'
 * - create(): 모델 미다운로드 시 monitor 로 진행률 추적 (최초 1회 큰 다운로드)
 * - 세션은 재사용하고, contextoverflow 발생 시 폐기 후 재생성한다.
 */

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

let sessionPromise = null;
let lastStatus = "확인 전";

function hasApi() {
  return typeof LanguageModel !== "undefined";
}

export async function getStatus() {
  if (!hasApi()) {
    lastStatus = "미지원(Chrome 138+ / 플래그 필요)";
    return lastStatus;
  }
  try {
    const a = await LanguageModel.availability();
    lastStatus =
      {
        available: "사용 가능",
        downloadable: "다운로드 필요(첫 요약 시 시작)",
        downloading: "모델 다운로드 중…",
        unavailable: "사용 불가(기기 미지원)",
      }[a] || a;
    return lastStatus;
  } catch (e) {
    lastStatus = "확인 실패";
    return lastStatus;
  }
}

async function createSession() {
  if (!hasApi()) throw new Error("LanguageModel API unavailable");

  const availability = await LanguageModel.availability();
  if (availability === "unavailable")
    throw new Error("LanguageModel unavailable on this device");

  const session = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        lastStatus = `모델 다운로드 ${Math.round((e.loaded || 0) * 100)}%`;
      });
    },
  });

  session.addEventListener?.("contextoverflow", () => {
    // 컨텍스트 초과 → 세션 폐기하여 다음 호출 때 재생성
    try { session.destroy(); } catch (_) {}
    sessionPromise = null;
  });

  return session;
}

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = createSession().catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}

/**
 * 자막 청크를 1줄 마크다운으로 요약. 실패/미지원 시 null 반환(상위에서 폴백 처리).
 * @returns {Promise<string|null>}
 */
export async function summarize(text) {
  if (!hasApi()) return null;
  try {
    const session = await getSession();
    const result = await session.prompt(buildUserPrompt(text));
    return (result || "").trim();
  } catch (e) {
    // 세션이 오염됐을 수 있으니 폐기 후 다음 호출에서 재생성
    sessionPromise = null;
    console.warn("[LiveNote] summarize failed:", e?.message || e);
    return null;
  }
}
