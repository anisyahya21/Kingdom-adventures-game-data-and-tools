/**
 * unknown_review.js — Review unresolved_res and missing_source items.
 * Loads discovery JSON and shows candidate thumbnails + copy-paste override snippets.
 */

export class UnknownReviewPanel {
  static ID    = "unknown-review";
  static LABEL = "Unknowns";

  constructor(el) { this.el = el; }

  init() {
    this.el.innerHTML = `
      <div class="panel-toolbar">
        <label>Filter:</label>
        <select id="ur-status">
          <option value="">All unresolved</option>
          <option value="unresolved_res">unresolved_res</option>
          <option value="missing_source">missing_source</option>
          <option value="res_variant_unknown">res_variant_unknown</option>
        </select>
        <button class="btn" id="ur-copy-all">Copy all RES_OVERRIDES snippets</button>
        <span id="ur-count" style="color:var(--text-dim);font-size:0.82rem"></span>
      </div>
      <div class="panel-body" style="display:flex;gap:0;padding:0;overflow:hidden">
        <div style="flex:1;overflow:auto;padding:8px">
          <table id="ur-table" style="font-size:0.8rem">
            <thead>
              <tr>
                <th>rawRes</th>
                <th>assetId</th>
                <th>status</th>
                <th>candidates (top 3)</th>
                <th>confidence</th>
                <th>override snippet</th>
              </tr>
            </thead>
            <tbody id="ur-tbody"></tbody>
          </table>
        </div>
      </div>`;

    this._refs = null;
    this._candidates = null;

    this.el.querySelector("#ur-status").addEventListener("change", () => this._renderTable());
    this.el.querySelector("#ur-copy-all").addEventListener("click", () => this._copyAllSnippets());
  }

  async onActivate() {
    if (this._refs) return;
    try {
      const [registry, discovery] = await Promise.all([
        window.KA.apiFetch("registry"),
        window.KA.apiFetch("discovery/res_directory_candidates").catch(() => ({})),
      ]);
      this._refs = registry.filter(r => r.reviewStatus !== "auto");
      this._candidates = discovery;
      this._renderTable();
    } catch (e) {
      this.el.querySelector("#ur-tbody").innerHTML =
        `<tr><td colspan="6" style="color:var(--err)">${e.message}</td></tr>`;
    }
  }

  _renderTable() {
    if (!this._refs) return;
    const status = this.el.querySelector("#ur-status").value;
    let rows = status ? this._refs.filter(r => r.reviewStatus === status) : this._refs;
    rows = rows.slice(0, 200);

    this.el.querySelector("#ur-count").textContent = `${rows.length} items`;

    const tbody = this.el.querySelector("#ur-tbody");
    tbody.innerHTML = "";

    // Group by rawRes to deduplicate
    const seen = new Map(); // rawRes → first ref
    for (const ref of rows) {
      const key = `${ref.rawRes ?? "null"}_${ref.reviewStatus}`;
      if (!seen.has(key)) seen.set(key, ref);
    }

    const uniqueRows = [...seen.values()];

    for (const ref of uniqueRows) {
      const res = ref.rawRes;
      const cands = this._candidates?.[String(res)]?.candidates?.slice(0, 3) ?? [];
      const conf  = this._candidates?.[String(res)]?.bestConfidence ?? "unknown";

      const snippet = res != null
        ? `<code>${res}: &quot;${cands[0]?.dir ?? "???"}&quot;</code>`
        : `<code>—</code>`;

      const copySnippet = res != null && cands[0]
        ? `RES_OVERRIDES[${res}] = "${cands[0].dir}"`
        : null;

      const candHtml = cands.map(c => `
        <span style="color:var(--text-em)">${c.dir}</span>
        <img src="/api/image?path=${encodeURIComponent(c.previewPng ?? '')}"
             style="height:24px;image-rendering:pixelated;vertical-align:middle;margin:0 4px"
             onerror="this.style.display='none'">`
      ).join(" &nbsp; ") || "<span style='color:var(--text-dim)'>none</span>";

      const confBadge = {
        HIGH:    "badge-auto",
        MEDIUM:  "badge-cand",
        LOW:     "badge-miss",
        UNKNOWN: "badge-unres",
      }[conf?.toUpperCase?.()] ?? "badge-unres";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${res ?? "–"}</td>
        <td style="font-size:0.75rem">${ref.assetId ?? "–"}</td>
        <td><span class="badge badge-miss">${ref.reviewStatus}</span></td>
        <td>${candHtml}</td>
        <td><span class="badge ${confBadge}">${conf ?? "–"}</span></td>
        <td>
          ${snippet}
          ${copySnippet ? `<button class="btn" style="padding:2px 6px;font-size:0.75rem;margin-left:4px" data-snippet="${encodeURIComponent(copySnippet)}">Copy</button>` : ""}
        </td>`;

      tr.querySelector("button[data-snippet]")?.addEventListener("click", e => {
        const text = decodeURIComponent(e.currentTarget.dataset.snippet);
        navigator.clipboard?.writeText(text).then(() => {
          e.currentTarget.textContent = "✓";
          setTimeout(() => { e.currentTarget.textContent = "Copy"; }, 1500);
        });
      });

      tbody.appendChild(tr);
    }

    if (!uniqueRows.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--ok)">All refs resolved! 🎉</td></tr>`;
    }
  }

  _copyAllSnippets() {
    if (!this._refs || !this._candidates) return;
    const lines = [];
    const seen = new Set();
    for (const ref of this._refs) {
      const res = ref.rawRes;
      if (res == null || seen.has(res)) continue;
      seen.add(res);
      const dir = this._candidates[String(res)]?.candidates?.[0]?.dir;
      if (dir) lines.push(`RES_OVERRIDES[${res}] = "${dir}"`);
    }
    if (!lines.length) return;
    navigator.clipboard?.writeText(lines.join("\n")).then(() => {
      const btn = this.el.querySelector("#ur-copy-all");
      btn.textContent = `✓ Copied ${lines.length} snippets`;
      setTimeout(() => { btn.textContent = "Copy all RES_OVERRIDES snippets"; }, 2500);
    });
  }
}
