/**
 * LiveNote — inject.js  (MAIN world content script, run_at: document_start)
 *
 * Method A: 페이지의 fetch / XMLHttpRequest 를 패치하여 유튜브 자막 스트림
 * (youtube.com/api/timedtext) 응답을 가로채고, 자막 텍스트만 추출해
 * window.postMessage 로 isolated content script(captureNet.js)에 전달한다.
 *
 * MAIN world 라서 chrome.* API 는 쓸 수 없다. 통신은 오직 postMessage.
 */
(() => {
  "use strict";

  const CHANNEL = "livenote";
  const TIMEDTEXT_RE = /\/api\/timedtext/i;

  function post(events) {
    if (!events || !events.length) return;
    try {
      window.postMessage({ source: CHANNEL, kind: "captions", events }, "*");
    } catch (_) {
      /* noop */
    }
  }

  /**
   * 유튜브 자막 응답을 방어적으로 파싱한다.
   * 지원: json3 ({events:[{tStartMs,segs:[{utf8}]}]}), srv3/ttml(xml <p t="..">text</p>)
   * @returns {{text:string, tStartMs:number}[]}
   */
  function parseTimedText(raw, url) {
    if (!raw) return [];
    const trimmed = raw.trim();
    const out = [];

    // json3
    if (trimmed.startsWith("{")) {
      try {
        const data = JSON.parse(trimmed);
        if (Array.isArray(data.events)) {
          for (const ev of data.events) {
            if (!ev.segs) continue;
            const text = ev.segs
              .map((s) => (s && s.utf8) || "")
              .join("")
              .replace(/\s+/g, " ")
              .trim();
            if (text && text !== "\n") {
              out.push({ text, tStartMs: Number(ev.tStartMs) || 0 });
            }
          }
          return out;
        }
      } catch (_) {
        /* fall through to xml */
      }
    }

    // srv3 / ttml xml: <p t="12345" ...>caption text</p>
    if (trimmed.startsWith("<")) {
      const pRe = /<p\b[^>]*\bt="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
      let m;
      while ((m = pRe.exec(trimmed)) !== null) {
        const text = m[2]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, " ")
          .trim();
        if (text) out.push({ text, tStartMs: Number(m[1]) || 0 });
      }
    }
    return out;
  }

  // ---- patch fetch ----
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const req = args[0];
      const url = typeof req === "string" ? req : req && req.url;
      const promise = origFetch.apply(this, args);
      if (url && TIMEDTEXT_RE.test(url)) {
        promise
          .then((res) => res.clone().text())
          .then((text) => post(parseTimedText(text, url)))
          .catch(() => {});
      }
      return promise;
    };
  }

  // ---- patch XMLHttpRequest ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__ln_url = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__ln_url && TIMEDTEXT_RE.test(this.__ln_url)) {
      this.addEventListener("load", function () {
        try {
          const text =
            this.responseType === "" || this.responseType === "text"
              ? this.responseText
              : null;
          if (text) post(parseTimedText(text, this.__ln_url));
        } catch (_) {}
      });
    }
    return origSend.apply(this, args);
  };

  // 페이지에 주입 완료를 알림 (디버그용)
  window.postMessage({ source: CHANNEL, kind: "ready" }, "*");
})();
