/**
 * sprite_sheet.js — Browse contact sheet PNGs from generated/previews/sheets/.
 * Sheet list on left, large preview on right.
 */

export class SpriteSheetPanel {
  static ID    = "sprite-sheet";
  static LABEL = "Sheets";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <label>Scale:</label>
        <button class="btn active" data-zoom="1">1×</button>
        <button class="btn" data-zoom="2">2×</button>
        <input id="ss-filter" type="text" placeholder="filter…" style="width:160px">
      </div>
      <div class="panel-body" style="display:flex;gap:0;padding:0;overflow:hidden">
        <div id="ss-list" style="width:180px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;padding:8px"></div>
        <div id="ss-preview" style="flex:1;overflow:auto;padding:16px">
          <p style="color:var(--text-dim)">Select a contact sheet</p>
        </div>
      </div>`;

    this._zoom = 1;
    this._sheets = [];

    this.el.querySelectorAll("[data-zoom]").forEach(b =>
      b.addEventListener("click", () => {
        this._zoom = +b.dataset.zoom;
        this.el.querySelectorAll("[data-zoom]").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        if (this._currentSheet) this._showSheet(this._currentSheet);
      })
    );
    this.el.querySelector("#ss-filter").addEventListener("input", e => this._filterList(e.target.value));
  }

  async onActivate() {
    if (this._sheets.length) return; // already loaded
    try {
      // Use list-previews to get only sheets that actually exist
      this._sheets = await window.KA.apiFetch("list-previews?dir=sheets");
      this._renderList(this._sheets);
      // Auto-select first sheet
      if (this._sheets.length) {
        const first = this._sheets.find(f => f.startsWith("chip")) || this._sheets[0];
        this._currentSheet = first;
        this._showSheet(first);
      }
    } catch (e) {
      this.el.querySelector("#ss-list").textContent = e.message;
    }
  }

  _renderList(sheets) {
    const el = this.el.querySelector("#ss-list");
    el.innerHTML = "";
    sheets.forEach(f => {
      const btn = document.createElement("div");
      btn.dataset.sheet = f;
      btn.style.cssText = "padding:4px 6px;cursor:pointer;border-radius:3px;font-size:0.8rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      btn.textContent = f.replace("_sheet.png", "");
      btn.title = f;
      if (f === this._currentSheet) btn.style.background = "var(--bg3)";
      btn.addEventListener("mouseenter", () => btn.style.background = "var(--bg3)");
      btn.addEventListener("mouseleave", () => btn.style.background = f === this._currentSheet ? "var(--bg3)" : "");
      btn.addEventListener("click", () => {
        this._currentSheet = f;
        el.querySelectorAll("[data-sheet]").forEach(b => b.style.background = "");
        btn.style.background = "var(--bg3)";
        this._showSheet(f);
      });
      el.appendChild(btn);
    });
    if (!sheets.length) {
      el.innerHTML = "<p style='color:var(--text-dim);font-size:0.8rem'>No sheets found — run: python main.py preview --type sheet</p>";
    }
  }

  _filterList(q) {
    const filtered = q ? this._sheets.filter(f => f.includes(q)) : this._sheets;
    this._renderList(filtered);
  }

  _showSheet(f) {
    const preview = this.el.querySelector("#ss-preview");
    const url = window.KA.previewImageUrl(`sheets/${f}`);
    const z = this._zoom;
    preview.innerHTML = `
      <p style="color:var(--text-dim);font-size:0.8rem;margin-bottom:8px">${f}</p>
      <img class="pixel" src="${url}"
        style="transform-origin:top left;transform:scale(${z})"
        onerror="this.replaceWith(Object.assign(document.createElement('p'),{style:'color:var(--err)',textContent:'Not generated yet — run preview --type sheet'}))"
      >`;
  }
}
