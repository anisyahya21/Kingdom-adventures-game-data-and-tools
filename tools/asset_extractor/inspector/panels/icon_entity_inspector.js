/**
 * icon_entity_inspector.js — Browse items, equipment, and facilities with icon previews.
 *
 * Uses /api/icon-entities to list all entities with icon coordinates.
 * Uses /api/item-icon, /api/equip-icon, /api/facility-icon to show icon previews.
 */

export class IconEntityInspectorPanel {
  static ID    = "icon-entity-inspector";
  static LABEL = "Icon Entities";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar" style="flex-wrap:wrap;gap:8px;align-items:center">
        <div style="display:flex;gap:4px">
          <button id="ie-tab-items" class="tab-btn active">Items</button>
          <button id="ie-tab-equip" class="tab-btn">Equipment</button>
          <button id="ie-tab-fac" class="tab-btn">Facilities</button>
        </div>
        <input id="ie-search" class="search-input" placeholder="Filter..." style="min-width:180px;margin-left:8px">
        <label>Scale:</label>
        <select id="ie-scale">
          <option value="2">2×</option>
          <option value="3">3×</option>
          <option value="4" selected>4×</option>
          <option value="6">6×</option>
          <option value="8">8×</option>
        </select>
        <span id="ie-count" style="color:var(--text-dim);font-size:0.82rem;margin-left:auto"></span>
      </div>
      <div class="panel-body" style="display:flex;gap:0;overflow:hidden;height:100%">
        <!-- Left: entity list -->
        <div id="ie-list" style="width:320px;flex-shrink:0;overflow-y:auto;border-right:1px solid var(--border);padding:4px"></div>
        <!-- Right: detail view -->
        <div id="ie-detail" style="flex:1;overflow:auto;padding:12px">
          <p style="color:var(--text-dim)">Select an entity to preview its icon.</p>
        </div>
      </div>`;

    this._entities = { items: [], equipment: [], facilities: [] };
    this._filtered = [];
    this._scale = 4;
    this._activeTab = "items";
    this._selectedId = null;

    this.el.querySelector("#ie-search").addEventListener("input", () => this._applyFilter());
    this.el.querySelector("#ie-scale").addEventListener("change", e => {
      this._scale = +e.target.value;
      if (this._selectedId != null) this._showDetail(this._selectedId);
    });
    
    this.el.querySelector("#ie-tab-items").addEventListener("click", () => this._switchTab("items"));
    this.el.querySelector("#ie-tab-equip").addEventListener("click", () => this._switchTab("equipment"));
    this.el.querySelector("#ie-tab-fac").addEventListener("click", () => this._switchTab("facilities"));
  }

  async onActivate() {
    if (this._entities.items.length) return;
    try {
      this._entities = await window.KA.apiFetch("icon-entities");
      this._applyFilter();
    } catch (e) {
      this.el.querySelector("#ie-list").innerHTML =
        `<p style="color:#e55;padding:8px">Error: ${e.message}</p>`;
    }
  }

  _switchTab(tab) {
    this._activeTab = tab;
    this._selectedId = null;
    
    // Update tab button states
    this.el.querySelector("#ie-tab-items").classList.toggle("active", tab === "items");
    this.el.querySelector("#ie-tab-equip").classList.toggle("active", tab === "equipment");
    this.el.querySelector("#ie-tab-fac").classList.toggle("active", tab === "facilities");
    
    this._applyFilter();
    this.el.querySelector("#ie-detail").innerHTML = `<p style="color:var(--text-dim)">Select an entity to preview its icon.</p>`;
  }

  _applyFilter() {
    const q = (this.el.querySelector("#ie-search").value || "").toLowerCase().trim();
    const source = this._entities[this._activeTab] || [];
    
    this._filtered = source.filter(e => {
      const name = this._activeTab === "facilities" 
        ? (e.facilityName || e.chipName || "")
        : (e.name || "");
      const idStr = String(this._activeTab === "facilities" ? (e.facilityId || e.chipId) : e.id);
      
      // Hide item IDs 15-25 (diamond packs, shop/social pseudo-items)
      if (this._activeTab === "items" && e.id >= 15 && e.id <= 25) return false;
      
      if (q && !name.toLowerCase().includes(q) && !idStr.includes(q)) return false;
      return true;
    });
    
    this._renderList();
  }

  _renderList() {
    const list = this.el.querySelector("#ie-list");
    const cnt  = this.el.querySelector("#ie-count");
    const total = (this._entities[this._activeTab] || []).length;
    cnt.textContent = `${this._filtered.length} / ${total}`;

    if (this._activeTab === "items") {
      list.innerHTML = this._filtered.map(item => {
        const selected = this._selectedId === item.id;
        return `<div class="list-row${selected ? " selected" : ""}"
                     data-id="${item.id}"
                     style="cursor:pointer;padding:4px 8px;border-radius:3px;
                            display:flex;gap:8px;align-items:center;font-size:0.82rem">
                  <span style="opacity:0.6;min-width:35px;text-align:right">#${item.id}</span>
                  <img src="/api/item-icon?id=${item.id}&scale=1" style="width:16px;height:16px;image-rendering:pixelated" onerror="this.style.opacity='0.3';this.style.border='1px solid #f55'">
                  <span style="flex:1">${item.name || "(unnamed)"}</span>
                  <span style="opacity:0.5;font-size:0.75rem">${item.iconU},${item.iconV}</span>
                </div>`;
      }).join("");
    } else if (this._activeTab === "equipment") {
      list.innerHTML = this._filtered.map(eq => {
        const selected = this._selectedId === eq.id;
        // Equipment with type 12 (body) or 14 (accessory) use fixed-grid (no .opt)
        const fixedGrid = eq.type === 12 || eq.type === 14;
        const badge = fixedGrid ? '<span style="font-size:0.65rem;color:#888;border:1px solid #888;padding:1px 3px;border-radius:2px;margin-left:4px" title="Fixed-grid (no .opt file)">⚐</span>' : '';
        return `<div class="list-row${selected ? " selected" : ""}"
                     data-id="${eq.id}"
                     style="cursor:pointer;padding:4px 8px;border-radius:3px;
                            display:flex;gap:8px;align-items:center;font-size:0.82rem">
                  <span style="opacity:0.6;min-width:35px;text-align:right">#${eq.id}</span>
                  <img src="/api/equip-icon?id=${eq.id}&scale=1" style="width:16px;height:16px;image-rendering:pixelated" onerror="this.style.opacity='0.3';this.style.border='1px solid #f55'">
                  <span style="flex:1">${eq.name || "(unnamed)"}${badge}</span>
                  <span style="opacity:0.5;font-size:0.75rem">${eq.iconU},${eq.iconV}</span>
                </div>`;
      }).join("");
    } else if (this._activeTab === "facilities") {
      list.innerHTML = this._filtered.map(fac => {
        const selected = this._selectedId === fac.chipId;
        const displayName = fac.facilityName || fac.chipName || "(unnamed)";
        return `<div class="list-row${selected ? " selected" : ""}"
                     data-id="${fac.chipId}"
                     style="cursor:pointer;padding:4px 8px;border-radius:3px;
                            display:flex;gap:8px;align-items:center;font-size:0.82rem">
                  <span style="opacity:0.6;min-width:35px;text-align:right">#${fac.chipId}</span>
                  <img src="/api/facility-icon?id=${fac.chipId}&scale=1" style="width:16px;height:16px;image-rendering:pixelated" onerror="this.style.opacity='0.3';this.style.border='1px solid #f55'">
                  <span style="flex:1">${displayName}</span>
                  <span style="opacity:0.5;font-size:0.75rem">${fac.iconU},${fac.iconV}</span>
                </div>`;
      }).join("");
    }

    list.querySelectorAll(".list-row").forEach(row => {
      row.addEventListener("click", () => {
        this._selectedId = +row.dataset.id;
        list.querySelectorAll(".list-row").forEach(r =>
          r.classList.toggle("selected", +r.dataset.id === this._selectedId));
        this._showDetail(this._selectedId);
      });
    });
  }

  async _showDetail(id) {
    const detail = this.el.querySelector("#ie-detail");
    let entity, apiEndpoint;

    if (this._activeTab === "items") {
      entity = this._filtered.find(e => e.id === id);
      apiEndpoint = `/api/item-icon?id=${id}&scale=${this._scale}`;
    } else if (this._activeTab === "equipment") {
      entity = this._filtered.find(e => e.id === id);
      apiEndpoint = `/api/equip-icon?id=${id}&scale=${this._scale}`;
    } else if (this._activeTab === "facilities") {
      entity = this._filtered.find(e => e.chipId === id);
      apiEndpoint = `/api/facility-icon?id=${id}&scale=${this._scale}`;
    }

    if (!entity) return;

    const entityName = this._activeTab === "facilities" 
      ? (entity.facilityName || entity.chipName || "(unnamed)")
      : (entity.name || "(unnamed)");
    
    const entityId = this._activeTab === "facilities" ? entity.chipId : entity.id;

    // Fetch icon to get parser status from headers
    let iconMethod = "unknown", iconStatus = "unknown", iconOptExists = "false", iconSheet = "unknown", iconSourceRect = "";
    let imageUrl = apiEndpoint;
    try {
      const response = await fetch(apiEndpoint);
      if (response.ok) {
        iconMethod = response.headers.get("X-Icon-Method") || "unknown";
        iconStatus = response.headers.get("X-Icon-Status") || "unknown";
        iconOptExists = response.headers.get("X-Icon-Opt-Exists") || "false";
        iconSheet = response.headers.get("X-Icon-Sheet") || "unknown";
        iconSourceRect = response.headers.get("X-Icon-Source-Rect") || "";
        const blob = await response.blob();
        imageUrl = URL.createObjectURL(blob);
      }
    } catch (e) {
      console.warn("Failed to fetch icon metadata:", e);
    }

    // Build status display from actual parser output
    let statusInfo = "";
    let sheetInfo = "";
    let statusColor = "#888", statusSymbol = "⚐", statusText = "Unknown";
    
    if (iconMethod === "material_top_row") {
      statusColor = "#4a4";
      statusSymbol = "✓";
      statusText = `Material resource icon - top row (v14 direct cropping)`;
      if (iconSourceRect) {
        statusText += ` [${iconSourceRect}]`;
      }
      sheetInfo = `<tr>
        <td style="padding:2px 8px;color:var(--text-dim)">Sheet:</td>
        <td style="padding:2px 8px">com/material_icon.png</td>
      </tr>`;
    } else if (iconMethod === "material_seb") {
      statusColor = "#4a4";
      statusSymbol = "✓";
      statusText = "Material resource icon (v13 semantic routing)";
      sheetInfo = `<tr>
        <td style="padding:2px 8px;color:var(--text-dim)">Sheet:</td>
        <td style="padding:2px 8px">com/material_icon.png</td>
      </tr>`;
    } else if (iconMethod === "opt") {
      if (iconStatus === "filled") {
        statusColor = "#4a4";
        statusSymbol = "✓";
        statusText = "Filled slot (v11 sequential parsing)";
      } else if (iconStatus === "short_recovered") {
        statusColor = "#4a4";
        statusSymbol = "✓";
        statusText = "Short recovered slot (v11 sequential parsing)";
      } else if (iconStatus === "empty") {
        statusColor = "#f80";
        statusSymbol = "⚠";
        statusText = "Empty slot (explicit 0x00 flag)";
      } else if (iconStatus === "implicit_empty") {
        statusColor = "#888";
        statusSymbol = "○";
        statusText = "Implicit empty (file ended before slot)";
      } else if (iconStatus === "not_in_grid") {
        statusColor = "#f55";
        statusSymbol = "✗";
        statusText = "Icon coords out of .opt grid range";
      } else if (iconStatus === "unknown_flag" || iconStatus === "corrupt") {
        statusColor = "#f55";
        statusSymbol = "✗";
        statusText = `Corrupt slot (${iconStatus})`;
      }
      // Show sheet from header for .opt method
      if (iconSheet !== "unknown") {
        sheetInfo = `<tr>
          <td style="padding:2px 8px;color:var(--text-dim)">Sheet:</td>
          <td style="padding:2px 8px">${iconSheet}</td>
        </tr>`;
      }
    } else if (iconMethod === "grid") {
      statusColor = "#888";
      statusSymbol = "⚐";
      const optNote = iconOptExists === "true" ? "(.opt decode failed)" : "(no .opt file)";
      statusText = `Fixed-grid fallback ${optNote}`;
      if (iconSheet !== "unknown") {
        sheetInfo = `<tr>
          <td style="padding:2px 8px;color:var(--text-dim)">Sheet:</td>
          <td style="padding:2px 8px">${iconSheet}</td>
        </tr>`;
      }
    } else if (iconMethod === "error") {
      statusColor = "#f55";
      statusSymbol = "✗";
      statusText = "Error: sheet missing or unreadable";
    }
    
    statusInfo = `<tr>
      <td style="padding:2px 8px;color:var(--text-dim)">Parser Status:</td>
      <td style="padding:2px 8px;color:${statusColor}">${statusSymbol} ${statusText}</td>
    </tr>`;

    detail.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:1rem">
        ${entityName} <small style="color:var(--text-dim)">#${entityId}</small>
      </h3>
      <table style="font-size:0.82rem;border-collapse:collapse;margin-bottom:12px">
        ${sheetInfo}
        <tr>
          <td style="padding:2px 8px;color:var(--text-dim)">Type:</td>
          <td style="padding:2px 8px">${this._activeTab}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px;color:var(--text-dim)">Icon UV:</td>
          <td style="padding:2px 8px">(${entity.iconU}, ${entity.iconV})</td>
        </tr>
        ${this._activeTab === "equipment" ? `
        <tr>
          <td style="padding:2px 8px;color:var(--text-dim)">Equip Type:</td>
          <td style="padding:2px 8px">${entity.type}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px;color:var(--text-dim)">Sheet:</td>
          <td style="padding:2px 8px">${entity.sheet}.png</td>
        </tr>` : ""}
        ${this._activeTab === "facilities" ? `
        <tr>
          <td style="padding:2px 8px;color:var(--text-dim)">Facility ID:</td>
          <td style="padding:2px 8px">${entity.facilityId}</td>
        </tr>` : ""}
        ${statusInfo}
      </table>
      <div style="margin-bottom:8px">
        <strong style="font-size:0.85rem">Icon Preview (${this._scale}×):</strong>
      </div>
      <div style="background:var(--bg3);display:inline-block;padding:8px;border:1px solid var(--border)">
        <img src="${imageUrl}" 
             style="image-rendering:pixelated;display:block"
             onerror="this.alt='⚠ Preview failed';this.style.opacity='0.4'">
      </div>
    `;
  }
}