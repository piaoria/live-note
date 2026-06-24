/**
 * LiveNote — content/captureDom.js  (Method B)
 * 캡션 DOM(.ytp-caption-segment)을 MutationObserver 로 관찰해 텍스트를 수집한다.
 * Method A(네트워크)가 동작하면 보통 그쪽이 먼저 잡지만, 엔드포인트/포맷 변경에 대비한 폴백이다.
 *
 * - 자막이 꺼져 있으면 자막 버튼을 1회 클릭해 강제 활성화 시도.
 * - opts.hide=true 면 캡션 박스를 opacity:0 으로 가린다(시청 방해 최소화).
 * - 중복은 buffer 단계에서 prefix 병합으로 처리하므로 여기선 보이는 텍스트만 그대로 전달.
 */
(() => {
  "use strict";
  const LN = (window.LN = window.LN || {});

  const CAPTION_SELECTOR = ".ytp-caption-segment, .captions-text .ytp-caption-segment";
  const HIDE_STYLE_ID = "ln-hide-captions";

  function currentVideoTimeSec() {
    const v = document.querySelector("video.html5-main-video, video");
    return v && !Number.isNaN(v.currentTime) ? Math.floor(v.currentTime) : null;
  }

  function enableCaptions() {
    try {
      const btn = document.querySelector(".ytp-subtitles-button");
      if (btn && btn.getAttribute("aria-pressed") === "false") {
        btn.click();
      }
    } catch (_) {}
  }

  function setHidden(hide) {
    let el = document.getElementById(HIDE_STYLE_ID);
    if (hide) {
      if (!el) {
        el = document.createElement("style");
        el.id = HIDE_STYLE_ID;
        el.textContent =
          ".ytp-caption-window-container,.caption-window{opacity:0 !important;}";
        document.documentElement.appendChild(el);
      }
    } else if (el) {
      el.remove();
    }
  }

  function readVisibleCaption() {
    const segs = document.querySelectorAll(CAPTION_SELECTOR);
    if (!segs.length) return "";
    return Array.from(segs)
      .map((s) => s.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function start(onCaption, opts = {}) {
    if (opts.hide) setHidden(true);

    // 자막 트랙 강제 활성화 시도 (플레이어 로드 지연 대비 재시도)
    let tries = 0;
    const enableTimer = setInterval(() => {
      enableCaptions();
      if (++tries >= 5) clearInterval(enableTimer);
    }, 2000);

    let lastText = "";
    const emit = () => {
      const text = readVisibleCaption();
      if (text && text !== lastText) {
        lastText = text;
        onCaption(text, 0, "dom", currentVideoTimeSec());
      }
    };

    const observer = new MutationObserver(emit);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return {
      stop() {
        clearInterval(enableTimer);
        observer.disconnect();
        setHidden(false);
      },
      setHidden,
    };
  }

  LN.captureDom = { start, currentVideoTimeSec };
})();
