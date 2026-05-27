/**
 * facility_inspector.js — Browse facilities and view their building sprites.
 *
 * Uses /api/facilities to list all facilities with chip info, and
 * /api/facility-preview?id=N&scale=S to show the assembled building PNG.
 * Also supports /api/building-preview?idx=N to show raw building sprites by index.
 */

export class FacilityInspectorPanel {
  static ID    = "facility-inspector";
  static LABEL = "Facilities";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar" style="flex-wrap:wrap;gap:8px;align-items:center">
        <input id="fi-search" class="search-input" placeholder="Filter facilities…" style="min-width:180px">
        <label>Scale:</label>
        <select id="fi-scale">
          <option value="2">2×</option>
          <option value="3">3×</option>
          <option value="4" selected>4×</option>
          <option value="6">6×</option>
        </select>
        <label style="margin-left:8px">
          <input type="checkbox" id="fi-only-sprites"> Only facilities with sprites
        </label>
        <span id="fi-count" style="color:var(--text-dim);font-size:0.82rem;margin-left:auto"></span>
      </div>
      <div class="panel-body" style="display:flex;gap:0;overflow:hidden;height:100%">
        <!-- Left: facility list -->
        <div id="fi-list" style="width:260px;flex-shrink:0;overflow-y:auto;border-right:1px solid var(--border);padding:4px"></div>
        <!-- Right: detail view -->
        <div id="fi-detail" style="flex:1;overflow:auto;padding:12px">
          <p style="color:var(--text-dim)">Select a facility to preview its building sprite.</p>
        </div>
      </div>`;

    this._facilities  = [];
    this._filtered    = [];
    this._scale       = 4;
    this._onlySprites = false;

    this.el.querySelector("#fi-search").addEventListener("input", () => this._applyFilter());
    this.el.querySelector("#fi-scale").addEventListener("change", e => {
      this._scale = +e.target.value;
      if (this._selectedId != null) this._showDetail(this._selectedId);
    });
    this.el.querySelector("#fi-only-sprites").addEventListener("change", e => {
      this._onlySprites = e.target.checked;
      this._applyFilter();
    });
  }

  async onActivate() {
    if (this._facilities.length) return;
    try {
      this._facilities = await window.KA.apiFetch("facilities");
      this._applyFilter();
    } catch (e) {
      this.el.querySelector("#fi-list").innerHTML =
        `<p style="color:#e55;padding:8px">Error: ${e.message}</p>`;
    }
  }

  _applyFilter() {
    const q = (this.el.querySelector("#fi-search").value || "").toLowerCase().trim();
    this._filtered = this._facilities.filter(f => {
      if (this._onlySprites && !f.chips.some(c => c.exists && c.idx !== 0)) return false;
      if (q && !f.name.toLowerCase().includes(q) && !String(f.id).includes(q)) return false;
      return true;
    });
    this._renderList();
  }

  _renderList() {
    const list = this.el.querySelector("#fi-list");
    const cnt  = this.el.querySelector("#fi-count");
    cnt.textContent = `${this._filtered.length} / ${this._facilities.length}`;

    list.innerHTML = this._filtered.map(f => {
      const hasSprite = f.chips.some(c => c.exists && c.idx !== 0);
      const icon = hasSprite ? "🏛" : "·";
      return `<div class="list-row${this._selectedId === f.id ? " selected" : ""}"
                   data-id="${f.id}"
                   style="cursor:pointer;padding:3px 6px;border-radius:3px;
                          display:flex;gap:6px;align-items:center;font-size:0.82rem"
                   title="id=${f.id}, chips=[${f.chips.map(c=>c.idx).join(",")}]">
                <span style="opacity:0.6;min-width:30px;text-align:right">${f.id}</span>
                <span>${icon}</span>
                <span>${f.name || "(unnamed)"}</span>
              </div>`;
    }).join("");

    list.querySelectorAll(".list-row").forEach(row => {
      row.addEventListener("click", () => {
        this._selectedId = +row.dataset.id;
        list.querySelectorAll(".list-row").forEach(r =>
          r.classList.toggle("selected", +r.dataset.id === this._selectedId));
        this._showDetail(this._selectedId);
      });
      row.addEventListener("mouseenter", () => row.style.background = "var(--bg3)");
      row.addEventListener("mouseleave", () => {
        row.style.background = row.classList.contains("selected") ? "" : "";
      });
    });
  }

  _showDetail(id) {
    const fac = this._facilities.find(f => f.id === id);
    if (!fac) return;
    const detail = this.el.querySelector("#fi-detail");

    const chipRows = fac.chips.map(c => {
      const label = c.file ? c.file : "(no file)";
      const status = c.exists ? `<span style="color:#5d9">✓ exists</span>` : `<span style="color:#e55">✗ missing</span>`;
      return `<tr>
        <td style="padding:2px 8px">${c.idx}</td>
        <td style="padding:2px 8px;font-family:monospace">${label}</td>
        <td style="padding:2px 8px">${status}</td>
      </tr>`;
    }).join("");

    const scale = this._scale;
    const hasAnySprite = fac.chips.some(c => c.exists);

    detail.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:1rem">${fac.name || "(unnamed)"} <small style="color:var(--text-dim)">#${fac.id}</small></h3>
      <table style="font-size:0.82rem;border-collapse:collapse;margin-bottom:12px">
        <thead><tr>
          <th style="padding:2px 8px;text-align:left;color:var(--text-dim)">Chip idx</th>
          <th style="padding:2px 8px;text-align:left;color:var(--text-dim)">PNG file</th>
          <th style="padding:2px 8px;text-align:left;color:var(--text-dim)">Status</th>
        </tr></thead>
        <tbody>${chipRows || "<tr><td colspan='3' style='color:var(--text-dim);padding:4px'>No chips</td></tr>"}</tbody>
      </table>
      ${hasAnySprite ? `
        <div style="margin-bottom:8px">
          <strong style="font-size:0.85rem">Composite preview (chips side-by-side):</strong>
        </div>
        <div id="fi-preview-img" style="background:var(--bg3);display:inline-block;padding:4px;border:1px solid var(--border)">
          <img src="/api/facility-preview?id=${id}&scale=${scale}"
               style="image-rendering:pixelated;display:block"
               onerror="this.alt='No preview';this.style.opacity='0.4'">
        </div>
        <div style="margin-top:12px">
          <strong style="font-size:0.85rem">Individual building sprites:</strong>
          <div id="fi-chip-sprites" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px"></div>
        </div>` : `<p style="color:var(--text-dim)">No building sprites for this facility (chip=0 placeholder).</p>`}`;

    if (hasAnySprite) {
      const container = detail.querySelector("#fi-chip-sprites");
      for (const c of fac.chips) {
        if (!c.exists) continue;
        const div = document.createElement("div");
        div.style.cssText = "text-align:center;background:var(--bg3);padding:4px;border:1px solid var(--border)";
        div.innerHTML = `<img src="/api/building-preview?idx=${c.idx}&scale=${scale}"
                             style="image-rendering:pixelated;display:block;margin:0 auto">
                         <small style="color:var(--text-dim);display:block;font-size:0.7rem;margin-top:2px">[${c.idx}] ${c.file}</small>`;
        container.appendChild(div);
      }
    }
  }
}
