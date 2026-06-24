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
      this.recording = true;
      this.root = null;
    }

    mount() {
      if (document.getElementById("ln-sidebar")) return;
      const host = document.querySelector("#secondary, #secondary-inner") || document.body;

      const root = document.createElement("div");
      root.id = "ln-sidebar";
      root.innerHTML = `
        <div class="ln-header">
          <span class="ln-title">📝 LiveNote</span>
          <div class="ln-controls">
            <button class="ln-btn" data-act="record" title="기록 시작/일시정지">⏸</button>
            <button class="ln-btn" data-act="copy" title="전체 복사">📋</button>
            <button class="ln-btn" data-act="download" title=".md 다운로드">⬇</button>
            <button class="ln-btn" data-act="settings" title="설정">⚙</button>
          </div>
        </div>
        <div class="ln-settings" hidden>
          <label class="ln-row">
            <input type="checkbox" data-set="hide" /> 자막 화면 숨기기(DOM 수집 시)
          </label>
          <label class="ln-row ln-col">
            <span>추가 종목/키워드 (쉼표로 구분)</span>
            <textarea data-set="keywords" rows="2" placeholder="예: 두산로보틱스, SOXL"></textarea>
          </label>
          <div class="ln-status" data-set="status">AI 상태: 확인 중…</div>
        </div>
        <div class="ln-list" id="ln-list">
          <div class="ln-empty">자막을 수집하면 여기에 종목 타임라인이 쌓입니다.</div>
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
      settings.querySelector('[data-set="keywords"]').addEventListener("change", (e) => {
        const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
        this.handlers.onSettingsChange?.({ keywords: list });
      });

      return this;
    }

    applySettings({ hide, keywords } = {}) {
      if (!this.root) return;
      if (typeof hide === "boolean")
        this.root.querySelector('[data-set="hide"]').checked = hide;
      if (Array.isArray(keywords))
        this.root.querySelector('[data-set="keywords"]').value = keywords.join(", ");
    }

    setAiStatus(text) {
      const el = this.root?.querySelector('[data-set="status"]');
      if (el) el.textContent = `AI 상태: ${text}`;
    }

    toggleSettings() {
      const el = this.root.querySelector(".ln-settings");
      el.hidden = !el.hidden;
    }

    toggleRecord() {
      this.recording = !this.recording;
      const btn = this.root.querySelector('[data-act="record"]');
      btn.textContent = this.recording ? "⏸" : "▶";
      btn.classList.toggle("ln-paused", !this.recording);
      this.handlers.onToggleRecord?.(this.recording);
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
      if (persist) this.handlers.onPersist?.(this.entries);
    }

    restore(entries = []) {
      this.entries = [];
      this.listEl.innerHTML = "";
      if (!entries.length) {
        this.listEl.innerHTML =
          '<div class="ln-empty">자막을 수집하면 여기에 종목 타임라인이 쌓입니다.</div>';
        return;
      }
      entries.forEach((e) => this.addEntry(e, false));
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
