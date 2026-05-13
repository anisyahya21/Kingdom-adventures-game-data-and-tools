/**
 * char_assembler.js — Pick a job; composite body layers on a canvas.
 * Each layer can be toggled via checkbox.
 */

const LAYER_ORDER = ["body", "feet", "hands", "head", "hair", "weapon", "shield"];
const LAYER_COLORS = {
  body:   "#4a90e2",
  feet:   "#74b840",
  hands:  "#d4a017",
  head:   "#c45858",
  hair:   "#9b59b6",
  weapon: "#e67e22",
  shield: "#1abc9c",
};

export class CharAssemblerPanel {
  static ID    = "char-assembler";
  static LABEL = "Char Assembler";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <label>Job:</label>
        <select id="ca-job-select"><option value="">-- pick job --</option></select>
        <button class="btn primary" id="ca-render-btn">Render</button>
        <div class="zoom-controls">
          <label>Zoom:</label>
          <button class="btn" data-zoom="1">1×</button>
          <button class="btn active" data-zoom="2">2×</button>
          <button class="btn" data-zoom="4">4×</button>
        </div>
      </div>
      <div class="panel-body" style="display:flex;gap:16px;overflow:auto">
        <div id="ca-layers" style="width:160px;flex-shrink:0">
          <p style="color:var(--text-dim);font-size:0.82rem;margin-bottom:8px">Layers</p>
          ${LAYER_ORDER.map(l => `
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:4px;cursor:pointer">
              <input type="checkbox" data-layer="${l}" checked>
              <span style="color:${LAYER_COLORS[l] ?? 'var(--text)'};font-size:0.85rem">${l}</span>
            </label>`).join("")}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:16px">
          <canvas id="ca-canvas" style="background:var(--bg3);border:1px solid var(--border)"></canvas>
          <div id="ca-strip" style="display:flex;gap:4px;align-items:flex-start;flex-wrap:wrap"></div>
        </div>
        <div id="ca-log" style="flex:1;overflow:auto;font-size:0.78rem;color:var(--text-dim)"></div>
      </div>`;

    this._registry = null;
    this._zoom = 2;
    this._jobs = [];

    this.el.querySelectorAll("[data-zoom]").forEach(b =>
      b.addEventListener("click", () => {
        this._zoom = +b.dataset.zoom;
        this.el.querySelectorAll("[data-zoom]").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
      })
    );
    this.el.querySelector("#ca-render-btn").addEventListener("click", () => this._render());
  }

  async onActivate() {
    if (this._registry) return;
    try {
      this._registry = await window.KA.apiFetch("registry");
      // Build unique job names from character_parts manifest if available
      // Fall back: find refs with layer in LAYER_ORDER
      const jobNames = [...new Set(
        this._registry
          .filter(r => LAYER_ORDER.includes(r.layer))
          .map(r => r.gameDataLinks?.jobName ?? r.subCategory ?? r.assetId ?? "")
          .filter(Boolean)
      )].sort().slice(0, 200);

      const sel = this.el.querySelector("#ca-job-select");
      jobNames.forEach(name => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = name;
        sel.appendChild(opt);
      });
    } catch { /* silent */ }
  }

  async _render() {
    if (!this._registry) return;
    const jobName = this.el.querySelector("#ca-job-select").value;
    if (!jobName) return;

    const enabledLayers = new Set(
      [...this.el.querySelectorAll("[data-layer]")]
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.layer)
    );

    // Find refs that belong to this job
    const jobRefs = this._registry.filter(r =>
      (r.gameDataLinks?.jobName === jobName || r.subCategory === jobName) &&
      LAYER_ORDER.includes(r.layer)
    );

    const log = this.el.querySelector("#ca-log");
    const strip = this.el.querySelector("#ca-strip");
    log.innerHTML = "";
    strip.innerHTML = "";

    const canvas = this.el.querySelector("#ca-canvas");
    const z = this._zoom;
    canvas.width  = 80 * z;
    canvas.height = 120 * z;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const layer of LAYER_ORDER) {
      const ref = jobRefs.find(r => r.layer === layer);
      const logLine = document.createElement("div");

      if (!ref) {
        logLine.innerHTML = `<span style="color:var(--text-dim)">${layer}: <em>no ref</em></span>`;
        log.appendChild(logLine);
        continue;
      }

      logLine.innerHTML = `<span style="color:${LAYER_COLORS[layer] ?? 'var(--text)'}">${layer}</span>: ${ref.assetId} — <span class="badge badge-${ref.reviewStatus === 'auto' ? 'auto' : 'miss'}">${ref.reviewStatus}</span>`;
      log.appendChild(logLine);

      if (!enabledLayers.has(layer)) continue;

      // Layer strip cell
      const cell = document.createElement("div");
      cell.className = "sprite-cell";
      cell.title = layer;
      const lc = document.createElement("canvas");
      lc.width  = (ref.rect?.w ?? 40) * 2;
      lc.height = (ref.rect?.h ?? 60) * 2;
      const lctx = lc.getContext("2d");
      lctx.imageSmoothingEnabled = false;

      const lbl = document.createElement("small");
      lbl.textContent = layer;
      lbl.style.color = LAYER_COLORS[layer] ?? "var(--text-dim)";
      cell.appendChild(lc);
      cell.appendChild(lbl);
      strip.appendChild(cell);

      if (ref.sourcePng && ref.rect && ref.reviewStatus === "auto") {
        await new Promise(resolve => {
          const img = new Image();
          img.src = window.KA.imageUrl(ref.sourcePng);
          img.onload = () => {
            const r = ref.rect;
            ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
            lctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, lc.width, lc.height);
            resolve();
          };
          img.onerror = () => { this._drawPlaceholder(ctx, layer, canvas.width, canvas.height, z); resolve(); };
        });
      } else {
        this._drawPlaceholder(ctx, layer, canvas.width, canvas.height, z);
        this._drawPlaceholderSmall(lctx, layer, lc.width, lc.height);
      }
    }
  }

  _drawPlaceholder(ctx, label, w, h, z) {
    ctx.fillStyle = "rgba(80,80,80,0.3)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#888";
    ctx.font = `${8 * z}px monospace`;
    ctx.fillText(label, 4, 14 * z);
  }

  _drawPlaceholderSmall(ctx, label, w, h) {
    ctx.fillStyle = "rgba(80,80,80,0.4)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.fillText("?", w / 2 - 4, h / 2 + 4);
  }
}
