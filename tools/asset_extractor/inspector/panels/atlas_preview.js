/**
 * atlas_preview.js — load any source PNG; overlay all parsed rects;
 * click a rect to inspect the AssetRef JSON.
 */

export class AtlasPreviewPanel {
  static ID    = "atlas-preview";
  static LABEL = "Atlas Preview";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <label>Category:</label>
        <select id="ap-cat-select"><option value="">-- pick category --</option></select>
        <label>PNG:</label>
        <select id="ap-png-select"><option value="">-- pick PNG --</option></select>
        <button class="btn" id="ap-load-btn">Load</button>
        <div class="zoom-controls">
          <label>Zoom:</label>
          <button class="btn" data-zoom="1">1×</button>
          <button class="btn" data-zoom="2">2×</button>
          <button class="btn" data-zoom="4">4×</button>
          <button class="btn" data-zoom="8">8×</button>
        </div>
      </div>
      <div class="panel-body" style="display:flex;gap:16px;overflow:auto">
        <div id="ap-canvas-wrap" style="flex:0 0 auto;position:relative">
          <canvas id="ap-canvas"></canvas>
        </div>
        <div id="ap-detail" style="flex:1;overflow:auto;font-size:0.82rem;min-width:260px">
          <p style="color:var(--text-dim)">Click a rect to inspect</p>
        </div>
      </div>`;

    this._zoom = 1;
    this._refs = [];
    this._img  = null;
    this._currentCat = null;

    this.el.querySelector("#ap-load-btn").addEventListener("click", () => this._load());
    this.el.querySelectorAll("[data-zoom]").forEach(b =>
      b.addEventListener("click", () => { this._zoom = +b.dataset.zoom; this._draw(); })
    );
    this.el.querySelector("#ap-cat-select").addEventListener("change", async (e) => {
      await this._populatePngs(e.target.value);
    });
    this.el.querySelector("#ap-canvas").addEventListener("click", e => this._onCanvasClick(e));
  }

  async onActivate() {
    await this._populateCategories();
  }

  async _populateCategories() {
    try {
      const cats = await window.KA.apiFetch("categories");
      const sel = this.el.querySelector("#ap-cat-select");
      cats.forEach(c => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = c;
        sel.appendChild(opt);
      });
    } catch { /* silent */ }
  }

  async _populatePngs(cat) {
    // Just set a hint; actual PNG list comes from registry
    this._currentCat = cat;
  }

  async _load() {
    const cat = this.el.querySelector("#ap-cat-select").value;
    if (!cat) return;

    try {
      const registry = await window.KA.apiFetch("registry");
      this._refs = registry.filter(r => r.category === cat && r.sourcePng && r.rect);

      if (!this._refs.length) {
        this.el.querySelector("#ap-detail").innerHTML = "<p style='color:var(--err)'>No refs for this category</p>";
        return;
      }

      // Group by sourcePng — load the first sheet
      const firstPng = this._refs[0].sourcePng;
      await this._loadImage(firstPng);
      this._draw();
    } catch (e) {
      this.el.querySelector("#ap-detail").innerHTML = `<p style='color:var(--err)'>${e.message}</p>`;
    }
  }

  _loadImage(relPath) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { this._img = img; resolve(); };
      img.onerror = reject;
      img.src = window.KA.imageUrl(relPath);
    });
  }

  _draw() {
    if (!this._img) return;
    const canvas = this.el.querySelector("#ap-canvas");
    const z = this._zoom;
    canvas.width  = this._img.naturalWidth  * z;
    canvas.height = this._img.naturalHeight * z;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._img, 0, 0, canvas.width, canvas.height);

    const COLORS = ["#f00","#0f0","#44f","#ff0","#c0f","#0ff","#f80"];
    this._refs.forEach((ref, i) => {
      const r = ref.rect;
      const color = COLORS[i % COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x * z, r.y * z, r.w * z, r.h * z);

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(r.x * z, r.y * z, 36, 11);
      ctx.fillStyle = color;
      ctx.font = "8px monospace";
      const label = ref.atlasCoords ? `${ref.atlasCoords.u},${ref.atlasCoords.v}` : `${r.x},${r.y}`;
      ctx.fillText(label, r.x * z + 1, r.y * z + 9);
    });
  }

  _onCanvasClick(e) {
    if (!this._refs.length) return;
    const canvas = this.el.querySelector("#ap-canvas");
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / this._zoom;
    const cy = (e.clientY - rect.top)  / this._zoom;

    const hit = this._refs.find(r =>
      cx >= r.rect.x && cx <= r.rect.x + r.rect.w &&
      cy >= r.rect.y && cy <= r.rect.y + r.rect.h
    );
    if (hit) {
      const detail = this.el.querySelector("#ap-detail");
      detail.innerHTML = `<pre class="json-viewer">${JSON.stringify(hit, null, 2)}</pre>`;
    }
  }
}
