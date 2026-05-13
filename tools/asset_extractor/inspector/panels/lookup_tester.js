/**
 * lookup_tester.js — Enter iconU + iconV to find matching AssetRefs.
 * Renders the sprite on a canvas via /api/image.  Useful for Item icons and MapChips.
 */

export class LookupTesterPanel {
  static ID    = "lookup-tester";
  static LABEL = "Lookup";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <label>iconU:</label>
        <input id="lt-u" type="number" min="0" value="0" style="width:70px">
        <label>iconV:</label>
        <input id="lt-v" type="number" min="0" value="0" style="width:70px">
        <label>Category:</label>
        <select id="lt-cat"><option value="">All</option></select>
        <button class="btn primary" id="lt-lookup-btn">Lookup</button>
      </div>
      <div class="panel-body" style="display:flex;gap:16px;flex-wrap:wrap">
        <div id="lt-sprites" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start"></div>
        <div id="lt-json" style="flex:1;min-width:300px;overflow:auto;font-size:0.8rem">
          <p style="color:var(--text-dim)">Enter u/v and click Lookup</p>
        </div>
      </div>`;

    this._registry = null;
    this.el.querySelector("#lt-lookup-btn").addEventListener("click", () => this._lookup());
  }

  async onActivate() {
    if (this._registry) return;
    try {
      this._registry = await window.KA.apiFetch("registry");
      const cats = [...new Set(this._registry.map(r => r.category))].sort();
      const sel = this.el.querySelector("#lt-cat");
      cats.forEach(c => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = c;
        sel.appendChild(opt);
      });
    } catch { /* silent — registry may not be generated yet */ }
  }

  _lookup() {
    if (!this._registry) { return; }
    const u = parseInt(this.el.querySelector("#lt-u").value, 10);
    const v = parseInt(this.el.querySelector("#lt-v").value, 10);
    const cat = this.el.querySelector("#lt-cat").value;

    let hits = this._registry.filter(r =>
      r.atlasCoords && r.atlasCoords.u === u && r.atlasCoords.v === v
    );
    if (cat) hits = hits.filter(r => r.category === cat);

    const spritesEl = this.el.querySelector("#lt-sprites");
    const jsonEl = this.el.querySelector("#lt-json");
    spritesEl.innerHTML = "";
    jsonEl.innerHTML = "";

    if (!hits.length) {
      spritesEl.innerHTML = `<div style="color:var(--err);font-size:0.9rem">NOT FOUND — no ref with u=${u} v=${v}${cat ? " cat="+cat : ""}</div>`;
      return;
    }

    for (const ref of hits) {
      const cell = document.createElement("div");
      cell.className = "sprite-cell";
      cell.title = ref.assetId;

      const canvas = document.createElement("canvas");
      const maxDim = 96;
      const rw = ref.rect?.w ?? 0;
      const rh = ref.rect?.h ?? 0;
      const scale = Math.min(4, Math.floor(maxDim / Math.max(1, rw, rh))) || 1;
      canvas.width  = rw * scale || maxDim;
      canvas.height = rh * scale || maxDim;

      if (ref.sourcePng && ref.rect) {
        const img = new Image();
        img.src = window.KA.imageUrl(ref.sourcePng);
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, ref.rect.x, ref.rect.y, ref.rect.w, ref.rect.h,
                        0, 0, canvas.width, canvas.height);
        };
      }

      const lbl = document.createElement("small");
      lbl.textContent = ref.category;

      cell.appendChild(canvas);
      cell.appendChild(lbl);
      cell.addEventListener("click", () => {
        jsonEl.innerHTML = `<pre class="json-viewer" style="white-space:pre-wrap">${JSON.stringify(ref, null, 2)}</pre>`;
      });
      spritesEl.appendChild(cell);
    }

    // Show JSON of first hit immediately
    jsonEl.innerHTML = `<pre class="json-viewer" style="white-space:pre-wrap">${JSON.stringify(hits[0], null, 2)}</pre>`;
  }
}
