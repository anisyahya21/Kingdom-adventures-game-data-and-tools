/**
 * char_assembler.js — Preview and export job characters using server-side rendering.
 * Uses /api/jobs for job list, /api/job-preview for composited character images,
 * and /api/batch-export-jobs for bulk export.
 */

export class CharAssemblerPanel {
  static ID    = "char-assembler";
  static LABEL = "Char Assembler";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar" style="flex-wrap:wrap;gap:6px">
        <label>Job:</label>
        <select id="ca-job-select" style="min-width:160px"><option value="">-- pick job --</option></select>
        <label>Variant:</label>
        <select id="ca-variant-select">
          <option value="1">Male</option>
          <option value="2">Female</option>
        </select>
        <label>Facing:</label>
        <select id="ca-state-select">
          <option value="front-right">Front facing, looking right</option>
          <option value="back">Back facing</option>
        </select>
        <label>Menu pose:</label>
        <select id="ca-pose-frame-select">
          <option value="0">Tall frame</option>
          <option value="2">Short frame</option>
        </select>
        <label style="margin-left:8px">Weapon:</label>
        <select id="ca-weapon-select" style="min-width:140px">
          <option value="-1">-- Job Default --</option>
        </select>
        <label>Shield:</label>
        <select id="ca-shield-select" style="min-width:140px">
          <option value="-1">-- Job Default --</option>
        </select>
        <label>Shield cell:</label>
        <select id="ca-shield-cell-select">
          <option value="auto">Auto</option>
          <option value="0">0 front</option>
          <option value="1">1 side</option>
        </select>
        <label>dx:</label>
        <input id="ca-shield-dx" type="number" value="0" style="width:52px;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:3px 5px">
        <label>dy:</label>
        <input id="ca-shield-dy" type="number" value="0" style="width:52px;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:3px 5px">
        <button class="btn" id="ca-reset-shield-offsets" title="Reset manual shield offsets">Reset offsets</button>
        <button class="btn primary" id="ca-render-btn">Render</button>
        <div style="display:flex;align-items:center;gap:4px;margin-left:8px">
          <label>Zoom:</label>
          <button class="btn" data-zoom="1">1×</button>
          <button class="btn" data-zoom="2">2×</button>
          <button class="btn active" data-zoom="4">4×</button>
          <button class="btn" data-zoom="8">8×</button>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-left:8px;border-left:1px solid var(--border);padding-left:8px">
          <label>Export scale:</label>
          <select id="ca-export-scale-select">
            <option value="1">1× (native)</option>
            <option value="4">4×</option>
            <option value="8" selected>8× (default)</option>
            <option value="16">16×</option>
          </select>
          <button class="btn" id="ca-export-btn" title="Export current view as PNG" disabled>Export PNG</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:0.82rem;flex-wrap:wrap">
        <label>Batch export to:</label>
        <input id="ca-batch-dir" type="text" placeholder="C:\\exports\\characters" style="flex:1;min-width:200px;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:3px 6px;font-size:0.82rem">
        <label>Scale:</label>
        <select id="ca-batch-scale-select" style="font-size:0.82rem">
          <option value="1">1× (native)</option>
          <option value="4">4×</option>
          <option value="8" selected>8×</option>
          <option value="16">16×</option>
        </select>
        <button class="btn" id="ca-batch-btn">Batch Export All Jobs</button>
        <span id="ca-batch-status" style="color:var(--text-dim)"></span>
      </div>
      <div class="panel-body" style="padding:16px;overflow:auto">
        <div id="ca-preview-area" style="display:inline-block;background:var(--bg3);border:1px solid var(--border);padding:8px;min-width:64px;min-height:64px">
          <span id="ca-placeholder" style="color:var(--text-dim);font-size:0.82rem">Pick a job and click Render</span>
          <img id="ca-preview-img" style="display:none;image-rendering:pixelated">
        </div>
        <div id="ca-shield-debug" style="display:none;margin-top:12px;padding:10px;background:var(--bg2);border:1px solid var(--border);font-size:0.78rem;color:var(--text-dim)"></div>
        <div id="ca-info" style="margin-top:12px;font-size:0.82rem;color:var(--text-dim)"></div>
      </div>`;

    this._jobs = [];
    this._weapons = [];
    this._shields = [];
    this._zoom = 4;
    this._currentJobId = null;
    this._currentVariant = 1;
    this._currentState = "front-right";

    // Zoom buttons
    this.el.querySelectorAll("[data-zoom]").forEach(b =>
      b.addEventListener("click", () => {
        this._zoom = +b.dataset.zoom;
        this.el.querySelectorAll("[data-zoom]").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        this._updatePreviewSize();
      })
    );

    // Render button
    this.el.querySelector("#ca-render-btn").addEventListener("click", () => this._render());

    this.el.querySelector("#ca-reset-shield-offsets").addEventListener("click", () => {
      this.el.querySelector("#ca-shield-dx").value = "0";
      this.el.querySelector("#ca-shield-dy").value = "0";
      if (this._currentJobId) this._render();
    });

    // Export current PNG
    this.el.querySelector("#ca-export-btn").addEventListener("click", () => this._exportPng());

    // Batch export
    this.el.querySelector("#ca-batch-btn").addEventListener("click", () => this._batchExport());
  }

  async onActivate() {
    if (this._jobs.length > 0) return;
    try {
      const [jobs, weapons, shields] = await Promise.all([
        fetch("/api/jobs").then(r => r.json()),
        fetch("/api/equip?category=0").then(r => r.json()),
        fetch("/api/equip?category=1").then(r => r.json())
      ]);
      this._jobs = jobs;
      this._weapons = weapons;
      this._shields = shields;

      const sel = this.el.querySelector("#ca-job-select");
      jobs.forEach(j => {
        const opt = document.createElement("option");
        opt.value = j.id;
        opt.textContent = `${j.name} (#${j.id})`;
        sel.appendChild(opt);
      });

      const weaponSel = this.el.querySelector("#ca-weapon-select");
      weapons.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w.id;
        opt.textContent = w.name;
        weaponSel.appendChild(opt);
      });

      const shieldSel = this.el.querySelector("#ca-shield-select");
      shields.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        shieldSel.appendChild(opt);
      });

      this.el.querySelector("#ca-info").textContent = `${jobs.length} jobs, ${weapons.length} weapons, ${shields.length} shields loaded.`;
    } catch (e) {
      this.el.querySelector("#ca-info").textContent = `Failed to load data: ${e.message}`;
    }
  }

  async _render() {
    const jobId   = this.el.querySelector("#ca-job-select").value;
    const variant = this.el.querySelector("#ca-variant-select").value;
    const state   = this.el.querySelector("#ca-state-select").value;
    const poseFrame = this.el.querySelector("#ca-pose-frame-select").value;
    const weaponId = this.el.querySelector("#ca-weapon-select").value;
    const shieldId = this.el.querySelector("#ca-shield-select").value;
    const shieldCell = this.el.querySelector("#ca-shield-cell-select").value;
    const dxShield = this.el.querySelector("#ca-shield-dx").value || "0";
    const dyShield = this.el.querySelector("#ca-shield-dy").value || "0";

    if (!jobId) {
      this.el.querySelector("#ca-info").textContent = "Pick a job first.";
      return;
    }

    this._currentJobId   = jobId;
    this._currentVariant = +variant;
    this._currentState   = state;

    const img         = this.el.querySelector("#ca-preview-img");
    const placeholder = this.el.querySelector("#ca-placeholder");
    const info        = this.el.querySelector("#ca-info");

    // Fetch at scale=1 (native), then CSS-zoom up
    const url = this._buildPreviewUrl({ jobId, variant, state, poseFrame, weaponId, shieldId, shieldCell, dxShield, dyShield, scale: "1" });
    info.textContent = "Rendering…";

    img.onload = () => {
      placeholder.style.display = "none";
      img.style.display = "block";
      this._updatePreviewSize();
      const w = img.naturalWidth, h = img.naturalHeight;
      const jobName    = this.el.querySelector("#ca-job-select").selectedOptions[0]?.textContent || "";
      const variantName = +variant === 1 ? "Male" : "Female";
      const facingName = this.el.querySelector("#ca-state-select").selectedOptions[0]?.textContent || state;
      const poseName = this.el.querySelector("#ca-pose-frame-select").selectedOptions[0]?.textContent || `frame ${poseFrame}`;
      info.textContent = `${jobName} — ${variantName}, ${facingName}, ${poseName} — native ${w}×${h}px`;
      this.el.querySelector("#ca-export-btn").disabled = false;
      this._renderShieldDebug({ jobId, variant, state, poseFrame, shieldId, shieldCell, dxShield, dyShield });
    };
    img.onerror = () => {
      info.textContent = "⚠ Render failed — check server logs.";
    };
    img.src = url + `&_t=${Date.now()}`;
  }

  _buildPreviewUrl({ jobId, variant, state, poseFrame, weaponId, shieldId, shieldCell, dxShield, dyShield, scale }) {
    const params = new URLSearchParams({
      jobId,
      variant,
      equipState: state,
      poseFrame,
      weaponId,
      shieldId,
      shieldCell,
      dx_shield: dxShield,
      dy_shield: dyShield,
      scale,
    });
    return `/api/job-preview?${params.toString()}`;
  }

  async _renderShieldDebug({ jobId, variant, state, poseFrame, shieldId, shieldCell, dxShield, dyShield }) {
    const debug = this.el.querySelector("#ca-shield-debug");
    debug.style.display = "none";
    debug.textContent = "";

    if (!shieldId || shieldId === "-1") return;

    const raw0 = `/api/shield-raw?shieldId=${encodeURIComponent(shieldId)}&cell=0&scale=8&_t=${Date.now()}`;
    const raw1 = `/api/shield-raw?shieldId=${encodeURIComponent(shieldId)}&cell=1&scale=8&_t=${Date.now()}`;
    const params = new URLSearchParams({
      jobId,
      variant,
      shieldId,
      equipState: state,
      poseFrame,
      shieldCell,
      dx_shield: dxShield,
      dy_shield: dyShield,
    });

    try {
      const resp = await fetch(`/api/shield-anchor-debug?${params.toString()}`);
      const data = await resp.json();
      debug.style.display = "block";
      debug.innerHTML = `
        <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
          <div>
            <div style="font-weight:700;color:var(--text);margin-bottom:4px">Shield cells</div>
            <div style="display:flex;gap:8px;align-items:flex-start">
              <div><div>cell 0</div><img src="${raw0}" style="image-rendering:pixelated;background:var(--bg3);border:1px solid var(--border)"></div>
              <div><div>cell 1</div><img src="${raw1}" style="image-rendering:pixelated;background:var(--bg3);border:1px solid var(--border)"></div>
            </div>
          </div>
          <div style="min-width:260px;white-space:pre-wrap">
            <div style="font-weight:700;color:var(--text);margin-bottom:4px">Anchor debug</div>
            ${this._formatShieldDebug(data)}
          </div>
        </div>`;
    } catch (e) {
      debug.style.display = "block";
      debug.textContent = `Shield debug failed: ${e.message}`;
    }
  }

  _formatShieldDebug(data) {
    if (data.error) return data.error;
    const slot = data.shield_slot || {};
    const correction = data.auto_anchor_correction || {};
    const anchor = data.shield_anchor || {};
    const base = data.base_shield_bbox || {};
    const final = data.final_shield_bbox || {};
    const rel = data.shield_seb_rel || {};
    return [
      `png: ${data.shield_png || "?"}`,
      `facing: ${data.facing || "?"}`,
      `menu pose frame: ${data.pose_frame ?? "?"}`,
      `seb: ${data.seb || "?"}`,
      `selected cell: v=${slot.v ?? "?"}`,
      `slot dest/size: (${slot.dest_x ?? "?"},${slot.dest_y ?? "?"}) ${slot.w ?? "?"}x${slot.h ?? "?"}`,
      `seb rel: (${rel.x ?? "?"},${rel.y ?? "?"})`,
      `base bbox: (${base.x0 ?? "?"},${base.y0 ?? "?"})-(${base.x1 ?? "?"},${base.y1 ?? "?"})`,
      `anchor mode: ${anchor.mode || "?"}`,
      `auto correction: (${correction.dx ?? 0},${correction.dy ?? 0})`,
      `manual offset: (${data.dx_shield ?? 0},${data.dy_shield ?? 0})`,
      `final bbox: (${final.x0 ?? "?"},${final.y0 ?? "?"})-(${final.x1 ?? "?"},${final.y1 ?? "?"})`,
    ].join("\n");
  }

  _updatePreviewSize() {
    const img = this.el.querySelector("#ca-preview-img");
    if (img.style.display === "none") return;
    img.style.width  = `${img.naturalWidth  * this._zoom}px`;
    img.style.height = `${img.naturalHeight * this._zoom}px`;
  }

  async _exportPng() {
    if (!this._currentJobId) return;

    const exportScale = this.el.querySelector("#ca-export-scale-select").value;
    const variant     = this._currentVariant;
    const state       = this._currentState;
    const poseFrame   = this.el.querySelector("#ca-pose-frame-select").value;
    const weaponId    = this.el.querySelector("#ca-weapon-select").value;
    const shieldId    = this.el.querySelector("#ca-shield-select").value;
    const shieldCell  = this.el.querySelector("#ca-shield-cell-select").value;
    const dxShield    = this.el.querySelector("#ca-shield-dx").value || "0";
    const dyShield    = this.el.querySelector("#ca-shield-dy").value || "0";
    const variantName = variant === 1 ? "male" : "female";

    const url = this._buildPreviewUrl({ jobId: this._currentJobId, variant: String(variant), state, poseFrame, weaponId, shieldId, shieldCell, dxShield, dyShield, scale: exportScale });

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob      = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);

      const scaleSuffix = exportScale !== "1" ? `_${exportScale}x` : "";
      const jobName = this.el.querySelector("#ca-job-select").selectedOptions[0]
        ?.textContent?.split(" (#")[0]?.replace(/\s+/g, "_") || `job_${this._currentJobId}`;
      const filename = `${jobName}_${variantName}_${state}${scaleSuffix}.png`;

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      this.el.querySelector("#ca-info").textContent = `Export failed: ${e.message}`;
    }
  }

  async _batchExport() {
    const outputDir = this.el.querySelector("#ca-batch-dir").value.trim();
    if (!outputDir) {
      this.el.querySelector("#ca-batch-status").textContent = "⚠ Set an output directory first.";
      return;
    }

    const exportScale = this.el.querySelector("#ca-batch-scale-select").value;
    const statusEl    = this.el.querySelector("#ca-batch-status");
    const btn         = this.el.querySelector("#ca-batch-btn");

    btn.disabled = true;
    statusEl.style.color = "var(--text-dim)";
    statusEl.textContent = "Exporting…";

    try {
      const url  = `/api/batch-export-jobs?output_dir=${encodeURIComponent(outputDir)}&scale=${exportScale}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.success) {
        statusEl.textContent = `✓ ${data.exported} exported, ${data.failed} failed → ${data.output_dir}`;
        statusEl.style.color = "#4a4";
      } else {
        statusEl.textContent = `⚠ ${data.error || "Unknown error"}`;
        statusEl.style.color = "#f80";
      }
    } catch (e) {
      statusEl.textContent = `✗ ${e.message}`;
      statusEl.style.color = "#f55";
    } finally {
      btn.disabled = false;
    }
  }
}
