/**
 * LiveNote — content/sidebar.js
 * 유튜브 우측(#secondary)에 타임라인 사이드바를 삽입하고 컨트롤/렌더링을 담당한다.
 */
(() => {
  "use strict";
  const LN = (window.LN = window.LN || {});

  const fmtClock = (sec) => {
    if (sec == null || Number.isNaN(sec)) {
      const d = new Date();
      return d.toTimeString().slice(0, 8);
    }
    const s = Math.max(0, Math.floor(sec));
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${ss}`;
  };

  const escapeHtml = (str) =>
    str.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // 아주 작은 마크다운: **bold** → <strong>
  const renderInline = (str) =>
    escapeHtml(str).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  class Sidebar {
    constructor(handlers = {}) {
      this.handlers = handlers; // { onToggleRecord, onClear, onSettingsChange }
      this.entries = []; // {timestamp, markdown}
      this.keywords = []; // 사용자 추가 종목/키워드
      this.recording = true;
      this.aiStatus = "확인 중…";
      this.pipeline = "idle"; // idle | listening | active | paused
      this.root = null;
    }

    mount() {
      if (document.getElementById("ln-sidebar")) return;
      const host = document.querySelector("#secondary, #secondary-inner") || document.body;

      const root = document.createElement("div");
      root.id = "ln-sidebar";
      root.classList.add("ln-recording");
      root.innerHTML = `
        <div class="ln-header">
          <div class="ln-brand">
            <span class="ln-dot" title="기록 중"></span>
            <span class="ln-title">LiveNote</span>
            <span class="ln-count" data-set="count">0</span>
          </div>
          <div class="ln-controls">
            <button class="ln-btn" data-act="record" title="기록 시작/일시정지" aria-label="기록 토글">
              <svg viewBox="0 0 24 24" class="ln-ic"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            </button>
            <button class="ln-btn" data-act="copy" title="전체 복사" aria-label="복사">
              <svg viewBox="0 0 24 24" class="ln-ic"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            <button class="ln-btn" data-act="download" title=".md 다운로드" aria-label="다운로드">
              <svg viewBox="0 0 24 24" class="ln-ic"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="ln-btn" data-act="settings" title="설정" aria-label="설정">
              <svg viewBox="0 0 24 24" class="ln-ic"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
        <div class="ln-statusbar" data-set="statusbar">
          <span class="ln-sb-dot"></span>
          <span class="ln-sb-text" data-set="sb-text">준비 중…</span>
        </div>
        <div class="ln-settings" hidden>
          <label class="ln-row">
            <input type="checkbox" data-set="hide" /> <span>자막 화면 숨기기 (DOM 수집 시)</span>
          </label>
          <div class="ln-field">
            <div class="ln-field-head">
              <span>내 종목 / 키워드 사전</span>
              <span class="ln-dict-info" data-set="dictinfo"></span>
            </div>
            <div class="ln-chip-input">
              <input type="text" data-set="kw-input" placeholder="종목·키워드 입력 후 Enter" />
              <button class="ln-add" data-set="kw-add" type="button">추가</button>
            </div>
            <div class="ln-chips" data-set="chips"></div>
          </div>
          <div class="ln-status" data-set="status">내장 AI: 확인 중…</div>
        </div>
        <div class="ln-list" id="ln-list">
          <div class="ln-empty">
            <span class="ln-empty-ic">🎧</span>
            <span class="ln-empty-title">자막을 기다리는 중</span>
            <span class="ln-empty-desc">유튜브 자막이 감지되면 종목 언급을 골라<br/>여기에 타임라인으로 쌓습니다.</span>
          </div>
        </div>`;
      host.prepend(root);
      this.root = root;
      this.listEl = root.querySelector("#ln-list");

      root.querySelector(".ln-controls").addEventListener("click", (e) => {
        const act = e.target.getAttribute("data-act");
        if (!act) return;
        if (act === "record") this.toggleRecord();
        else if (act === "copy") this.copyAll();
        else if (act === "download") this.download();
        else if (act === "settings") this.toggleSettings();
      });

      const settings = root.querySelector(".ln-settings");
      settings.querySelector('[data-set="hide"]').addEventListener("change", (e) => {
        this.handlers.onSettingsChange?.({ hide: e.target.checked });
      });

      const input = settings.querySelector('[data-set="kw-input"]');
      const commit = () => {
        if (this.addKeyword(input.value)) input.value = "";
      };
      settings.querySelector('[data-set="kw-add"]').addEventListener("click", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      });
      // 칩 삭제 (이벤트 위임)
      settings.querySelector('[data-set="chips"]').addEventListener("click", (e) => {
        const btn = e.target.closest("[data-rm]");
        if (btn) this.removeKeyword(Number(btn.getAttribute("data-rm")));
      });

      this.renderChips();
      this.setDictInfo();
      return this;
    }

    applySettings({ hide, keywords } = {}) {
      if (!this.root) return;
      if (typeof hide === "boolean")
        this.root.querySelector('[data-set="hide"]').checked = hide;
      if (Array.isArray(keywords)) {
        this.keywords = keywords.slice();
        this.renderChips();
      }
    }

    // ── 사전(키워드) 관리 ──
    addKeyword(value) {
      const v = (value || "").trim();
      if (!v) return false;
      if (this.keywords.some((k) => k.toLowerCase() === v.toLowerCase())) return false;
      this.keywords.push(v);
      this.renderChips();
      this.handlers.onSettingsChange?.({ keywords: this.keywords.slice() });
      return true;
    }

    removeKeyword(index) {
      if (index < 0 || index >= this.keywords.length) return;
      this.keywords.splice(index, 1);
      this.renderChips();
      this.handlers.onSettingsChange?.({ keywords: this.keywords.slice() });
    }

    renderChips() {
      const wrap = this.root?.querySelector('[data-set="chips"]');
      if (!wrap) return;
      if (!this.keywords.length) {
        wrap.innerHTML =
          '<span class="ln-chip-empty">추가 항목 없음 · 기본 사전만 사용</span>';
        return;
      }
      wrap.innerHTML = this.keywords
        .map(
          (k, i) =>
            `<span class="ln-chip">${escapeHtml(k)}<button data-rm="${i}" aria-label="삭제" title="삭제">×</button></span>`
        )
        .join("");
    }

    setDictInfo() {
      const el = this.root?.querySelector('[data-set="dictinfo"]');
      if (el && LN.stocks)
        el.textContent = `기본 ${LN.stocks.STOCK_NAMES.length}종목·${LN.stocks.ACTION_KEYWORDS.length}키워드 내장`;
    }

    // ── 상태 표시 ──
    setAiStatus(text) {
      this.aiStatus = text;
      const el = this.root?.querySelector('[data-set="status"]');
      if (el) el.textContent = `내장 AI: ${text}`;
      this.refreshStatus();
    }

    /** content 파이프라인이 호출: idle/listening/active/paused */
    setPipeline(state) {
      this.pipeline = state;
      this.refreshStatus();
    }

    /** 헤더 아래 상태바 + 빈 화면 안내를 현재 상태에 맞게 갱신 */
    refreshStatus() {
      if (!this.root) return;
      const bar = this.root.querySelector('[data-set="statusbar"]');
      const text = this.root.querySelector('[data-set="sb-text"]');
      const ai = this.aiStatus || "";
      let tone = "ok";
      let msg;

      if (/미지원|불가|실패/.test(ai)) {
        tone = "err";
        msg = `내장 AI 사용 불가 — Chrome 138+ 확인`;
      } else if (/다운로드|중…|중$/.test(ai)) {
        tone = "warn";
        msg = `AI 준비 중 · ${ai}`;
      } else if (!this.recording) {
        tone = "idle";
        msg = "일시정지됨";
      } else if (this.entries.length > 0) {
        tone = "ok";
        msg = `기록 중 · ${this.entries.length}개`;
      } else if (this.pipeline === "listening") {
        tone = "ok";
        msg = "자막 수신 중 · 종목 언급 대기";
      } else {
        tone = "idle";
        msg = "자막 대기 중…";
      }

      if (bar) bar.className = `ln-statusbar ln-tone-${tone}`;
      if (text) text.textContent = msg;
      this.refreshEmpty();
    }

    refreshEmpty() {
      const empty = this.listEl?.querySelector(".ln-empty");
      if (!empty) return; // 항목이 이미 있으면 빈 화면 없음
      const titleEl = empty.querySelector(".ln-empty-title");
      const descEl = empty.querySelector(".ln-empty-desc");
      const ic = empty.querySelector(".ln-empty-ic");
      if (!titleEl || !descEl) return;
      const ai = this.aiStatus || "";

      if (/미지원|불가|실패/.test(ai)) {
        ic.textContent = "⚠️";
        titleEl.textContent = "내장 AI를 쓸 수 없어요";
        descEl.innerHTML =
          "Chrome 138 이상인지, <code>chrome://flags</code>의<br/>Prompt API 플래그가 켜져 있는지 확인하세요.";
      } else if (/다운로드|중/.test(ai)) {
        ic.textContent = "⏳";
        titleEl.textContent = "AI 모델 준비 중";
        descEl.innerHTML = `${escapeHtml(ai)}<br/>완료되면 자동으로 요약을 시작합니다.`;
      } else if (!this.recording) {
        ic.textContent = "⏸️";
        titleEl.textContent = "기록이 일시정지됨";
        descEl.innerHTML = "상단 ▶ 버튼을 눌러 다시 시작하세요.";
      } else if (this.pipeline === "listening") {
        ic.textContent = "👂";
        titleEl.textContent = "자막을 듣고 있어요";
        descEl.innerHTML =
          "종목·투자 키워드가 언급되면<br/>요약해서 여기에 추가합니다.";
      } else {
        ic.textContent = "🎧";
        titleEl.textContent = "자막을 기다리는 중";
        descEl.innerHTML =
          "유튜브 자막이 감지되면 종목 언급을 골라<br/>여기에 타임라인으로 쌓습니다.";
      }
    }

    toggleSettings() {
      const el = this.root.querySelector(".ln-settings");
      el.hidden = !el.hidden;
    }

    toggleRecord() {
      this.recording = !this.recording;
      const btn = this.root.querySelector('[data-act="record"]');
      btn.classList.toggle("ln-paused", !this.recording);
      btn.title = this.recording ? "일시정지" : "기록 시작";
      btn.innerHTML = this.recording
        ? '<svg viewBox="0 0 24 24" class="ln-ic"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
        : '<svg viewBox="0 0 24 24" class="ln-ic"><path d="M7 4l13 8-13 8z"/></svg>';
      this.root.classList.toggle("ln-recording", this.recording);
      this.refreshStatus();
      this.handlers.onToggleRecord?.(this.recording);
    }

    updateCount() {
      const el = this.root?.querySelector('[data-set="count"]');
      if (el) el.textContent = String(this.entries.length);
    }

    /** @param {{timestamp:string, markdown:string}} entry */
    addEntry(entry, persist = true) {
      if (this.listEl.querySelector(".ln-empty"))
        this.listEl.innerHTML = "";
      this.entries.push(entry);
      const row = document.createElement("div");
      row.className = "ln-entry";
      row.innerHTML = `<code class="ln-time">[${entry.timestamp}]</code> <span class="ln-text">${renderInline(
        entry.markdown
      )}</span>`;
      this.listEl.appendChild(row);
      this.listEl.scrollTop = this.listEl.scrollHeight;
      this.updateCount();
      this.refreshStatus();
      if (persist) this.handlers.onPersist?.(this.entries);
    }

    restore(entries = []) {
      this.entries = [];
      this.listEl.innerHTML = "";
      if (!entries.length) {
        this.listEl.innerHTML =
          '<div class="ln-empty"><span class="ln-empty-ic">🎧</span><span class="ln-empty-title">자막을 기다리는 중</span><span class="ln-empty-desc">유튜브 자막이 감지되면 종목 언급을 골라<br/>여기에 타임라인으로 쌓습니다.</span></div>';
        this.updateCount();
        this.refreshStatus();
        return;
      }
      entries.forEach((e) => this.addEntry(e, false));
      this.updateCount();
      this.refreshStatus();
    }

    toMarkdown() {
      const lines = this.entries.map((e) => `- \`[${e.timestamp}]\` ${e.markdown}`);
      return `# LiveNote 타임라인\n\n${lines.join("\n")}\n`;
    }

    async copyAll() {
      try {
        await navigator.clipboard.writeText(this.toMarkdown());
        this.flash("copy", "✅");
      } catch (_) {
        this.flash("copy", "⚠");
      }
    }

    download() {
      const blob = new Blob([this.toMarkdown()], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `livenote-${stamp}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    flash(act, sym) {
      const btn = this.root.querySelector(`[data-act="${act}"]`);
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = sym;
      setTimeout(() => (btn.textContent = prev), 900);
    }
  }

  LN.Sidebar = Sidebar;
  LN.fmtClock = fmtClock;
})();
