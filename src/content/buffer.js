/**
 * LiveNote — content/buffer.js
 * 잘게 들어오는 자막 조각을 30초 / 150자 청크로 조립한다.
 *
 * flush 조건 (먼저 도달하는 것):
 *   - 누적 글자수 >= maxChars (기본 150)
 *   - 첫 조각 이후 경과 >= maxMs (기본 30s)
 *   - 무음(새 조각 없음) >= idleMs (기본 10s) 이면 강제 flush
 *
 * 중복 제거: 동일 텍스트(라이브 자막은 누적 갱신되며 같은 문장이 반복됨)는 합치지 않고,
 * 직전 조각의 prefix 인 경우(부분→완성 갱신)는 더 긴 쪽으로 대체한다.
 */
(() => {
  "use strict";
  const LN = (window.LN = window.LN || {});

  class ChunkBuffer {
    constructor(onFlush, opts = {}) {
      this.onFlush = onFlush;
      this.maxChars = opts.maxChars || 150;
      this.maxMs = opts.maxMs || 30000;
      this.idleMs = opts.idleMs || 10000;
      this.reset();
      this._idleTimer = null;
    }

    reset() {
      this.parts = []; // {text, tStartMs}
      this.startedAt = 0;
      this.firstVideoTimeSec = null;
    }

    get length() {
      return this.parts.reduce((n, p) => n + p.text.length, 0);
    }

    /** 자막 조각 추가. videoTimeSec 은 현재 영상 재생시간(초, 선택). */
    add(text, tStartMs = 0, videoTimeSec = null) {
      text = (text || "").trim();
      if (!text) return;

      const last = this.parts[this.parts.length - 1];
      if (last) {
        if (last.text === text) return; // 완전 중복
        // 라이브 자막의 누적 갱신: 이전이 새 텍스트의 prefix → 더 긴 것으로 교체
        if (text.startsWith(last.text)) {
          last.text = text;
          this._kick();
          return;
        }
        if (last.text.startsWith(text)) return; // 더 짧은 갱신 무시
      }

      if (this.parts.length === 0) {
        this.startedAt = Date.now();
        this.firstVideoTimeSec = videoTimeSec;
      }
      this.parts.push({ text, tStartMs });
      this._kick();

      if (this.length >= this.maxChars || Date.now() - this.startedAt >= this.maxMs) {
        this.flush();
      }
    }

    _kick() {
      if (this._idleTimer) clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => this.flush(), this.idleMs);
    }

    flush() {
      if (this._idleTimer) {
        clearTimeout(this._idleTimer);
        this._idleTimer = null;
      }
      if (this.parts.length === 0) return;
      const chunk = {
        text: this.parts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim(),
        startedAt: this.startedAt,
        videoTimeSec: this.firstVideoTimeSec,
        tStartMs: this.parts[0].tStartMs,
      };
      this.reset();
      if (chunk.text) this.onFlush(chunk);
    }
  }

  LN.ChunkBuffer = ChunkBuffer;
})();
