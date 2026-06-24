/**
 * LiveNote — content/index.js
 * 파이프라인 조립: 수집(Net+DOM) → 버퍼 → 키워드 필터 → background(AI) → 사이드바.
 * 유튜브는 SPA 이므로 yt-navigate-finish 로 영상 전환을 감지해 타임라인을 교체한다.
 */
(() => {
  "use strict";
  const LN = window.LN;
  if (!LN || !LN.Sidebar) {
    console.warn("[LiveNote] namespace not ready");
    return;
  }

  const state = {
    sidebar: null,
    buffer: null,
    domHandle: null,
    recording: true,
    settings: { hide: false, keywords: [] },
    videoId: null,
  };

  const getVideoId = () =>
    new URLSearchParams(location.search).get("v") || location.pathname;

  const storageKey = (vid) => `ln_timeline_${vid}`;

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage?.local.get(["ln_settings"], (r) => {
        if (r && r.ln_settings) state.settings = { ...state.settings, ...r.ln_settings };
        LN.stocks.setExtraKeywords(state.settings.keywords);
        resolve();
      });
    });
  }

  function saveSettings() {
    chrome.storage?.local.set({ ln_settings: state.settings });
  }

  function persistTimeline(entries) {
    if (!state.videoId) return;
    chrome.storage?.local.set({ [storageKey(state.videoId)]: entries });
  }

  function restoreTimeline(vid) {
    chrome.storage?.local.get([storageKey(vid)], (r) => {
      const entries = (r && r[storageKey(vid)]) || [];
      state.sidebar?.restore(entries);
    });
  }

  // ---- AI 호출 (background service worker) ----
  function refine(chunk) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) resolve(null);
      }, 20000);
      try {
        chrome.runtime.sendMessage(
          { type: "REFINE_CHUNK", text: chunk.text },
          (resp) => {
            done = true;
            clearTimeout(timer);
            if (chrome.runtime.lastError) return resolve(null);
            resolve(resp || null);
          }
        );
      } catch (_) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  async function onChunk(chunk) {
    if (!state.recording) return;
    const insp = LN.stocks.inspect(chunk.text);
    if (!insp.pass) return; // 잡담 컷 — AI 호출 안 함

    const resp = await refine(chunk);
    const summary = resp && resp.summary ? resp.summary.trim() : "";
    if (!summary || /^\[SKIP\]/i.test(summary)) return;

    const ts =
      chunk.videoTimeSec != null
        ? LN.fmtClock(chunk.videoTimeSec)
        : LN.fmtClock(null);
    state.sidebar.addEntry({ timestamp: ts, markdown: summary });
  }

  function onCaption(text, tStartMs, source, videoTimeSec) {
    if (!state.recording || !state.buffer) return;
    const vt =
      videoTimeSec != null ? videoTimeSec : LN.captureDom.currentVideoTimeSec();
    state.buffer.add(text, tStartMs, vt);
  }

  async function queryAiStatus() {
    try {
      chrome.runtime.sendMessage({ type: "AI_STATUS" }, (resp) => {
        if (chrome.runtime.lastError) return;
        state.sidebar?.setAiStatus(resp?.status || "알 수 없음");
      });
    } catch (_) {}
  }

  // ---- 마운트 / 재마운트 ----
  function buildSidebar() {
    const sidebar = new LN.Sidebar({
      onToggleRecord: (rec) => {
        state.recording = rec;
        if (!rec) state.buffer?.flush();
      },
      onPersist: persistTimeline,
      onSettingsChange: (patch) => {
        state.settings = { ...state.settings, ...patch };
        if (patch.keywords) LN.stocks.setExtraKeywords(patch.keywords);
        if (typeof patch.hide === "boolean") state.domHandle?.setHidden(patch.hide);
        saveSettings();
      },
    });
    sidebar.mount();
    sidebar.applySettings(state.settings);
    return sidebar;
  }

  function ensureMounted() {
    if (!document.getElementById("ln-sidebar")) {
      if (!document.querySelector("#secondary, #secondary-inner")) return false;
      state.sidebar = buildSidebar();
      queryAiStatus();
    }
    return true;
  }

  function startPipeline() {
    if (state.buffer) return;
    state.buffer = new LN.ChunkBuffer(onChunk, { maxChars: 150, maxMs: 30000 });
    LN.captureNet.start(onCaption);
    state.domHandle = LN.captureDom.start(onCaption, { hide: state.settings.hide });
  }

  function handleNavigation() {
    const vid = getVideoId();
    if (!ensureMounted()) {
      // #secondary 가 아직 없으면 잠시 후 재시도
      setTimeout(handleNavigation, 800);
      return;
    }
    if (vid !== state.videoId) {
      state.videoId = vid;
      state.buffer?.flush();
      restoreTimeline(vid);
    }
    startPipeline();
  }

  // ---- 부트스트랩 ----
  (async function init() {
    await loadSettings();
    // 유튜브 SPA 이벤트 + 초기 진입 모두 처리
    window.addEventListener("yt-navigate-finish", () =>
      setTimeout(handleNavigation, 300)
    );
    document.addEventListener("yt-page-data-updated", () =>
      setTimeout(handleNavigation, 300)
    );
    // 폴링 백업 (이벤트 누락 대비)
    const poll = setInterval(() => {
      if (location.pathname.startsWith("/watch")) handleNavigation();
    }, 3000);
    window.addEventListener("beforeunload", () => clearInterval(poll));

    // 팝업에서 설정이 바뀌면 즉시 반영
    chrome.storage?.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.ln_settings) return;
      const s = changes.ln_settings.newValue || {};
      state.settings = { ...state.settings, ...s };
      if (Array.isArray(s.keywords)) LN.stocks.setExtraKeywords(s.keywords);
      if (typeof s.hide === "boolean") state.domHandle?.setHidden(s.hide);
      state.sidebar?.applySettings(state.settings);
    });

    handleNavigation();
    console.debug("[LiveNote] content pipeline initialized");
  })();
})();
