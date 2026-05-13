/**
 * terrain_grid.js — 10-column grid of MapChip tile sprites.
 * Click a tile to see its MapChip CSV data + AssetRef JSON in a side panel.
 */

export class TerrainGridPanel {
  static ID    = "terrain-grid";
  static LABEL = "Terrain";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <div class="zoom-controls">
          <label>Cell:</label>
          <button class="btn" data-zoom="1">1×</button>
          <button class="btn active" data-zoom="2">2×</button>
          <button class="btn" data-zoom="4">4×</button>
        </div>
        <input id="tg-filter" type="text" placeholder="filter by name…" style="width:160px">
        <span id="tg-count" style="color:var(--text-dim);font-size:0.82rem"></span>
      </div>
      <div class="panel-body" style="display:flex;gap:0;padding:0;overflow:hidden">
        <div id="tg-grid" style="flex:1;overflow:auto;padding:12px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:2px"></div>
        <div id="tg-detail" style="width:280px;flex-shrink:0;border-left:1px solid var(--border);overflow:auto;padding:12px;font-size:0.8rem">
          <p style="color:var(--text-dim)">Click a tile</p>
        </div>
      </div>`;

    this._chipRefs = null;
    this._zoom = 2;

    this.el.querySelectorAll("[data-zoom]").forEach(b =>
      b.addEventListener("click", () => {
        this._zoom = +b.dataset.zoom;
        this.el.querySelectorAll("[data-zoom]").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        if (this._chipRefs) this._renderGrid(this._chipRefs);
      })
    );
    this.el.querySelector("#tg-filter").addEventListener("input", e => {
      if (!this._chipRefs) return;
      const q = e.target.value.toLowerCase();
      const filtered = q ? this._chipRefs.filter(r =>
        r.assetId?.toLowerCase().includes(q) ||
        r.spriteName?.toLowerCase().includes(q) ||
        (r.gameDataLinks?.name ?? "").toLowerCase().includes(q)
      ) : this._chipRefs;
      this._renderGrid(filtered);
    });
  }

  async onActivate() {
    if (this._chipRefs) return;
    try {
      const registry = await window.KA.apiFetch("registry");
      // Map assets are category "chip" or subCategory containing mapchip
      this._chipRefs = registry.filter(r =>
        r.category === "chip" ||
        r.subCategory?.toLowerCase().includes("chip") ||
        r.tags?.includes("mapchip")
      );
      if (!this._chipRefs.length) {
        // Fall back: look for map manifest
        try {
          const mapMfst = await window.KA.apiFetch("manifests/map_assets");
          this._chipRefs = mapMfst;
        } catch { /* silent */ }
      }
      this.el.querySelector("#tg-count").textContent = `${this._chipRefs.length} chips`;
      this._renderGrid(this._chipRefs);
    } catch (e) {
      this.el.querySelector("#tg-grid").innerHTML =
        `<p style="color:var(--err)">${e.message}</p>`;
    }
  }

  _renderGrid(refs) {
    const grid = this.el.querySelector("#tg-grid");
    grid.innerHTML = "";
    const z = this._zoom;

    refs.slice(0, 500).forEach((ref, i) => {
      const cell = document.createElement("div");
      cell.className = "sprite-cell";
      cell.title = ref.gameDataLinks?.name ?? ref.spriteName ?? ref.assetId;
      cell.style.cursor = "pointer";

      const canvas = document.createElement("canvas");
      const rw = ref.rect?.w ?? 32;
      const rh = ref.rect?.h ?? 32;
      canvas.width  = rw * z;
      canvas.height = rh * z;

      const idx = document.createElement("small");
      idx.textContent = i + 1;

      cell.appendChild(canvas);
      cell.appendChild(idx);
      cell.addEventListener("click", () => this._showDetail(ref));

      if (ref.sourcePng && ref.rect && ref.reviewStatus === "auto") {
        const img = new Image();
        img.src = window.KA.imageUrl(ref.sourcePng);
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          const r = ref.rect;
          ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
        };
      } else {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#333";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#666";
        ctx.fillText("?", 4, 12);
      }

      grid.appendChild(cell);
    });

    if (!refs.length) {
      grid.innerHTML = "<p style='color:var(--text-dim)'>No chip refs — run extract first</p>";
    }
  }

  _showDetail(ref) {
    const detail = this.el.querySelector("#tg-detail");
    const csv = ref.gameDataLinks ? Object.entries(ref.gameDataLinks)
      .map(([k, v]) => `<tr><td style="color:var(--text-em)">${k}</td><td>${v}</td></tr>`).join("") : "";
    detail.innerHTML = `
      <p style="color:var(--accent);margin-bottom:8px;font-weight:700">${ref.assetId}</p>
      ${csv ? `<table>${csv}</table>` : ""}
      <details open style="margin-top:8px">
        <summary style="cursor:pointer;color:var(--text-dim)">Full JSON</summary>
        <pre class="json-viewer" style="white-space:pre-wrap;margin-top:4px">${JSON.stringify(ref, null, 2)}</pre>
      </details>`;
  }
}
