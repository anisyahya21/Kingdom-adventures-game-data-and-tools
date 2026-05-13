/**
 * search_filter.js — text search + dropdown filters over the in-memory registry.
 * Results table with thumbnail + key fields.
 */

export class SearchFilterPanel {
  static ID    = "search-filter";
  static LABEL = "Search";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <input id="sf-query" type="text" placeholder="asset name / id / category…" style="width:240px">
        <label>Category:</label>
        <select id="sf-cat"><option value="">All</option></select>
        <label>Status:</label>
        <select id="sf-status">
          <option value="">All</option>
          <option value="auto">auto</option>
          <option value="unresolved_res">unresolved_res</option>
          <option value="missing_source">missing_source</option>
          <option value="res_variant_unknown">res_variant_unknown</option>
        </select>
        <button class="btn primary" id="sf-search-btn">Search</button>
        <span id="sf-count" style="color:var(--text-dim);font-size:0.82rem"></span>
      </div>
      <div class="panel-body" style="overflow:auto;padding:8px">
        <table>
          <thead>
            <tr>
              <th>Thumb</th>
              <th>assetId</th>
              <th>category</th>
              <th>spriteName</th>
              <th>status</th>
              <th>rect</th>
              <th>CSV</th>
            </tr>
          </thead>
          <tbody id="sf-tbody"></tbody>
        </table>
      </div>`;

    this._registry = null;
    this.el.querySelector("#sf-search-btn").addEventListener("click", () => this._search());
    this.el.querySelector("#sf-query").addEventListener("keydown", e => { if (e.key === "Enter") this._search(); });
  }

  async onActivate() {
    if (this._registry) return;
    try {
      this._registry = await window.KA.apiFetch("registry");
      const cats = [...new Set(this._registry.map(r => r.category))].sort();
      const sel = this.el.querySelector("#sf-cat");
      cats.forEach(c => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = c;
        sel.appendChild(opt);
      });
    } catch (e) {
      this.el.querySelector("#sf-tbody").innerHTML =
        `<tr><td colspan="7" style="color:var(--err)">${e.message}</td></tr>`;
    }
  }

  _search() {
    if (!this._registry) return;
    const q = this.el.querySelector("#sf-query").value.trim().toLowerCase();
    const cat = this.el.querySelector("#sf-cat").value;
    const status = this.el.querySelector("#sf-status").value;

    let results = this._registry;
    if (cat)    results = results.filter(r => r.category === cat);
    if (status) results = results.filter(r => r.reviewStatus === status);
    if (q) {
      results = results.filter(r =>
        r.assetId?.toLowerCase().includes(q) ||
        r.spriteName?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.subCategory?.toLowerCase().includes(q)
      );
    }

    // Cap display at 200 rows for performance
    const capped = results.slice(0, 200);
    this.el.querySelector("#sf-count").textContent =
      `${results.length} results${results.length > 200 ? " (showing 200)" : ""}`;

    const tbody = this.el.querySelector("#sf-tbody");
    tbody.innerHTML = "";
    for (const ref of capped) {
      const tr = document.createElement("tr");
      const thumbCell = document.createElement("td");

      if (ref.sourcePng && ref.rect) {
        const canvas = document.createElement("canvas");
        const r = ref.rect;
        canvas.width  = Math.min(r.w, 48);
        canvas.height = Math.min(r.h, 48);
        const img = new Image();
        img.src = window.KA.imageUrl(ref.sourcePng);
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
        };
        canvas.title = ref.sourcePng;
        thumbCell.appendChild(canvas);
      } else {
        thumbCell.textContent = "–";
      }

      const nameLink = ref.gameDataLinks?.name ?? ref.spriteName ?? "–";
      const csvCell = ref.gameDataLinks
        ? Object.entries(ref.gameDataLinks).filter(([k]) => k !== "name")
            .map(([k, v]) => `${k}:${v}`).join(" ") || "–"
        : "–";

      const badgeClass = {
        auto: "badge-auto", missing_source: "badge-miss",
        unresolved_res: "badge-unres"
      }[ref.reviewStatus] || "badge-cand";

      tr.innerHTML = `
        <td></td>
        <td style="font-size:0.78rem">${ref.assetId ?? "–"}</td>
        <td style="font-size:0.78rem">${ref.category ?? "–"}</td>
        <td style="font-size:0.78rem">${nameLink}</td>
        <td><span class="badge ${badgeClass}">${ref.reviewStatus ?? "–"}</span></td>
        <td style="font-size:0.78rem">${ref.rect ? `${ref.rect.x},${ref.rect.y} ${ref.rect.w}×${ref.rect.h}` : "–"}</td>
        <td style="font-size:0.78rem">${csvCell}</td>`;
      tr.cells[0].replaceWith(thumbCell);
      tbody.appendChild(tr);
    }
    if (!capped.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-dim)">No results</td></tr>`;
    }
  }
}
