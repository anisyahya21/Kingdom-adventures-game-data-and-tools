/**
 * overlay_viewer.js — Browse overlay PNG outputs from generated/previews/overlays/.
 * File list on left, large image on right, zoom controls.
 */

export class OverlayViewerPanel {
  static ID    = "overlay-viewer";
  static LABEL = "Overlays";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <div class="zoom-controls">
          <label>Zoom:</label>
          <button class="btn" data-zoom="0.25">¼×</button>
          <button class="btn" data-zoom="0.5">½×</button>
          <button class="btn active" data-zoom="1">1×</button>
          <button class="btn" data-zoom="2">2×</button>
          <button class="btn" data-zoom="4">4×</button>
        </div>
        <input id="ov-filter" type="text" placeholder="filter…" style="width:200px">
      </div>
      <div class="panel-body" style="display:flex;gap:0;padding:0;overflow:hidden">
        <div id="ov-file-list" style="width:220px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;padding:8px"></div>
        <div id="ov-image-wrap" style="flex:1;overflow:auto;padding:16px;display:flex;align-items:flex-start;justify-content:flex-start">
          <p style="color:var(--text-dim)">Select an overlay PNG</p>
        </div>
      </div>`;

    this._zoom = 1;
    this._files = [];

    this.el.querySelectorAll("[data-zoom]").forEach(b =>
      b.addEventListener("click", () => {
        this._zoom = +b.dataset.zoom;
        this.el.querySelectorAll("[data-zoom]").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        this._renderCurrentImage();
      })
    );
    this.el.querySelector("#ov-filter").addEventListener("input", e => this._filterList(e.target.value));
  }

  async onActivate() {
    if (this._files.length) return; // already loaded
    await this._loadFileList();
  }

  async _loadFileList() {
    try {
      this._files = await window.KA.apiFetch("list-previews?dir=overlays");
      this._renderList(this._files);
      // Auto-select chip overlay if present, otherwise first
      if (this._files.length) {
        const first = this._files.find(f => f.startsWith("chip_")) || this._files[0];
        this._currentFile = first;
        this._renderCurrentImage();
      }
    } catch (e) {
      this.el.querySelector("#ov-file-list").innerHTML =
        `<p style="color:var(--err);font-size:0.8rem">${e.message}</p>`;
    }
  }

  _renderList(files) {
    const el = this.el.querySelector("#ov-file-list");
    el.innerHTML = "";
    files.forEach(f => {
      const btn = document.createElement("div");
      btn.dataset.overlay = f;
      btn.style.cssText = "padding:4px 6px;cursor:pointer;border-radius:3px;font-size:0.8rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      btn.textContent = f.replace("_overlay.png", "");
      btn.title = f;
      if (f === this._currentFile) btn.style.background = "var(--bg3)";
      btn.addEventListener("mouseenter", () => btn.style.background = "var(--bg3)");
      btn.addEventListener("mouseleave", () => btn.style.background = f === this._currentFile ? "var(--bg3)" : "");
      btn.addEventListener("click", () => {
        this._currentFile = f;
        el.querySelectorAll("[data-overlay]").forEach(b => b.style.background = "");
        btn.style.background = "var(--bg3)";
        this._renderCurrentImage();
      });
      el.appendChild(btn);
    });
    if (!files.length) {
      el.innerHTML = "<p style='color:var(--text-dim);font-size:0.8rem'>No overlay files found — run: python main.py preview --type overlay</p>";
    }
  }

  _filterList(q) {
    const filtered = q ? this._files.filter(f => f.includes(q)) : this._files;
    this._renderList(filtered);
  }

  _renderCurrentImage() {
    const wrap = this.el.querySelector("#ov-image-wrap");
    if (!this._currentFile) return;
    const url = window.KA.previewImageUrl(`overlays/${this._currentFile}`);
    const z = this._zoom;
    wrap.innerHTML = `<img class="pixel" src="${url}"
      style="transform-origin:top left;transform:scale(${z});cursor:zoom-in"
      onerror="this.replaceWith(Object.assign(document.createElement('p'),{style:'color:var(--err)',textContent:'Not generated yet'}))"
    >`;
  }
}
