/**
 * mapping_inspector.js — Full AssetRef JSON browser.
 * Table of all refs; unresolved rows highlighted. Click row → full JSON panel.
 */

export class MappingInspectorPanel {
  static ID    = "mapping-inspector";
  static LABEL = "Mappings";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <label>Show:</label>
        <select id="mi-filter">
          <option value="">All</option>
          <option value="unresolved">Unresolved only</option>
          <option value="auto">Auto only</option>
        </select>
        <button class="btn" id="mi-export-btn">Export CSV</button>
        <span id="mi-count" style="color:var(--text-dim);font-size:0.82rem"></span>
      </div>
      <div style="display:flex;flex:1;overflow:hidden">
        <div style="flex:1;overflow:auto;padding:8px;min-width:0">
          <table id="mi-table" style="font-size:0.8rem">
            <thead>
              <tr>
                <th>assetId</th>
                <th>category</th>
                <th>subCategory</th>
                <th>spriteName</th>
                <th>status</th>
                <th>sourcePng</th>
                <th>rect</th>
              </tr>
            </thead>
            <tbody id="mi-tbody"></tbody>
          </table>
        </div>
        <div id="mi-detail" style="width:320px;flex-shrink:0;border-left:1px solid var(--border);overflow:auto;padding:12px;font-size:0.8rem">
          <p style="color:var(--text-dim)">Click a row to inspect</p>
        </div>
      </div>`;

    this._registry = null;
    this._filtered = [];

    this.el.querySelector("#mi-filter").addEventListener("change", () => this._renderTable());
    this.el.querySelector("#mi-export-btn").addEventListener("click", () => this._exportCsv());
  }

  async onActivate() {
    if (this._registry) return;
    try {
      this._registry = await window.KA.apiFetch("registry");
      this._renderTable();
    } catch (e) {
      this.el.querySelector("#mi-tbody").innerHTML =
        `<tr><td colspan="7" style="color:var(--err)">${e.message}</td></tr>`;
    }
  }

  _renderTable() {
    if (!this._registry) return;
    const mode = this.el.querySelector("#mi-filter").value;

    let rows = this._registry;
    if (mode === "unresolved") rows = rows.filter(r => r.reviewStatus !== "auto");
    if (mode === "auto")       rows = rows.filter(r => r.reviewStatus === "auto");

    this._filtered = rows.slice(0, 500);
    this.el.querySelector("#mi-count").textContent =
      `${rows.length} refs${rows.length > 500 ? " (capped 500)" : ""}`;

    const tbody = this.el.querySelector("#mi-tbody");
    tbody.innerHTML = "";
    const isErr = r => r.reviewStatus !== "auto";

    for (const ref of this._filtered) {
      const tr = document.createElement("tr");
      if (isErr(ref)) tr.style.background = "rgba(248,113,113,0.07)";
      const badgeClass = {
        auto: "badge-auto", missing_source: "badge-miss",
        unresolved_res: "badge-unres"
      }[ref.reviewStatus] || "badge-cand";

      tr.innerHTML = `
        <td>${ref.assetId ?? "–"}</td>
        <td>${ref.category ?? "–"}</td>
        <td>${ref.subCategory ?? "–"}</td>
        <td>${ref.spriteName ?? "–"}</td>
        <td><span class="badge ${badgeClass}">${ref.reviewStatus ?? "–"}</span></td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${ref.sourcePng ?? "–"}</td>
        <td>${ref.rect ? `${ref.rect.x},${ref.rect.y} ${ref.rect.w}×${ref.rect.h}` : "–"}</td>`;

      tr.style.cursor = "pointer";
      tr.addEventListener("click", () => {
        const detail = this.el.querySelector("#mi-detail");
        detail.innerHTML = `<pre class="json-viewer" style="white-space:pre-wrap">${JSON.stringify(ref, null, 2)}</pre>`;
      });
      tbody.appendChild(tr);
    }
    if (!this._filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-dim)">No refs loaded</td></tr>`;
    }
  }

  _exportCsv() {
    if (!this._filtered.length) return;
    const header = ["assetId","category","subCategory","spriteName","reviewStatus","sourcePng"];
    const rows = this._filtered.map(r =>
      header.map(h => JSON.stringify(r[h] ?? "")).join(",")
    );
    const blob = new Blob([header.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "asset_export.csv";
    a.click();
  }
}
