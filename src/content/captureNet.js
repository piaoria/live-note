/**
 * LiveNote — content/captureNet.js  (Method A 브릿지)
 * MAIN world 의 inject.js 가 postMessage 로 보낸 자막 이벤트를 수신한다.
 */
(() => {
  "use strict";
  const LN = (window.LN = window.LN || {});

  function start(onCaption) {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== "livenote") return;
      if (data.kind === "ready") {
        console.debug("[LiveNote] network interceptor ready");
        return;
      }
      if (data.kind === "captions" && Array.isArray(data.events)) {
        for (const ev of data.events) {
          if (ev && ev.text) onCaption(ev.text, ev.tStartMs || 0, "net");
        }
      }
    });
  }

  LN.captureNet = { start };
})();
