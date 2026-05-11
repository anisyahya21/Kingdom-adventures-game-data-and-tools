const state = {
  screenshots: [],
  processedScreenshots: [],
  crops: [],
  names: [],
  equipmentNamesBySlot: {},
  nameSources: [],
  captureLog: [],
  equipmentGoals: {},
  skippedEquipmentGoals: [],
  equipmentProgress: null,
  mapping: {},
  duplicateNames: [],
  filter: "all",
  search: "",
  missingSearch: "",
  missingSlot: "",
  dirty: false,
  activePicker: null,
  equipmentConfig: null,
  calibrationPreview: "",
  calibrationScale: 1,
  draggedBox: null,
  autosaveTimer: null,
  pollTimer: null,
  eventSource: null,
  lastStateSignature: "",
  network: null,
};

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const screenshotCount = document.getElementById("screenshotCount");
const cropCount = document.getElementById("cropCount");
const duplicateCount = document.getElementById("duplicateCount");
const equipmentGoalGrid = document.getElementById("equipmentGoalGrid");
const equipmentProgress = document.getElementById("equipmentProgress");
const goalScreenshotInput = document.getElementById("goalScreenshotInput");
const cropGrid = document.getElementById("cropGrid");
const searchInput = document.getElementById("searchInput");
const saveState = document.getElementById("saveState");
const networkLinks = document.getElementById("networkLinks");
const logOutput = document.getElementById("logOutput");
const captureNameInput = document.getElementById("captureNameInput");
const captureSlotInput = document.getElementById("captureSlotInput");
const captureNoteInput = document.getElementById("captureNoteInput");
const captureLogList = document.getElementById("captureLogList");
const captureLogCount = document.getElementById("captureLogCount");
const missingSearchInput = document.getElementById("missingSearchInput");
const missingList = document.getElementById("missingList");
const missingCount = document.getElementById("missingCount");

function setDirty(value) {
  state.dirty = value;
  saveState.textContent = value ? "Unsaved" : "Saved";
  saveState.classList.toggle("dirty", value);
}

function scheduleAutosave() {
  setDirty(true);
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => {
    saveMapping({ quiet: true }).catch((error) => appendLog(error.message));
  }, 450);
}

function captureLogHasName(name) {
  const key = displaySearchKey(name);
  return state.captureLog.some((entry) => displaySearchKey(entry.name) === key);
}

function autoAddCaptureLogFromMapping(name, slotKind = "") {
  if (!name || captureLogHasName(name)) return;
  state.captureLog.unshift({
    id: `capture_${Date.now()}`,
    name,
    slotKind,
    note: "auto from mapping",
  });
  saveCaptureLog()
    .then(() => appendLog(`Auto-added screenshot note from mapping: ${name}`))
    .catch((error) => appendLog(error.message));
}

function appendLog(message) {
  const stamp = new Date().toLocaleTimeString();
  logOutput.textContent += `[${stamp}] ${message}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

async function loadState() {
  const data = await fetchJson("/api/state");
  const signature = JSON.stringify({
    screenshots: data.screenshots,
    processedScreenshots: data.processedScreenshots,
    crops: data.crops.map((crop) => [
      crop.filename,
      crop.mappedName,
      crop.slotKind,
      crop.duplicateImages,
    ]),
    mapping: data.mapping,
    captureLog: data.captureLog,
    equipmentGoals: data.equipmentGoals,
    skippedEquipmentGoals: data.skippedEquipmentGoals,
    equipmentProgress: data.equipmentProgress,
  });
  state.lastStateSignature = signature;
  state.screenshots = data.screenshots;
  state.processedScreenshots = data.processedScreenshots || [];
  state.crops = data.crops;
  state.names = data.names;
  state.equipmentNamesBySlot = data.equipmentNamesBySlot || {};
  state.nameSources = data.nameSources || [];
  state.captureLog = data.captureLog || [];
  state.equipmentGoals = data.equipmentGoals || {};
  state.skippedEquipmentGoals = data.skippedEquipmentGoals || [];
  state.equipmentProgress = data.equipmentProgress || null;
  state.network = data.network || null;
  state.mapping = { ...data.mapping };
  state.duplicateNames = data.duplicateNames;
  render();
  await loadEquipmentConfig();
}

async function pollState() {
  if (state.dirty) return;
  try {
    const data = await fetchJson("/api/state");
    const signature = JSON.stringify({
      screenshots: data.screenshots,
      processedScreenshots: data.processedScreenshots,
      crops: data.crops.map((crop) => [
        crop.filename,
        crop.mappedName,
        crop.slotKind,
        crop.duplicateImages,
      ]),
      mapping: data.mapping,
      captureLog: data.captureLog,
      equipmentGoals: data.equipmentGoals,
      skippedEquipmentGoals: data.skippedEquipmentGoals,
      equipmentProgress: data.equipmentProgress,
    });
    if (signature === state.lastStateSignature) return;

    state.lastStateSignature = signature;
    state.screenshots = data.screenshots;
    state.processedScreenshots = data.processedScreenshots || [];
    state.crops = data.crops;
    state.names = data.names;
    state.equipmentNamesBySlot = data.equipmentNamesBySlot || {};
    state.nameSources = data.nameSources || [];
    state.captureLog = data.captureLog || [];
    state.equipmentGoals = data.equipmentGoals || {};
    state.skippedEquipmentGoals = data.skippedEquipmentGoals || [];
    state.equipmentProgress = data.equipmentProgress || null;
    state.network = data.network || null;
    state.mapping = { ...data.mapping };
    state.duplicateNames = data.duplicateNames;
    render();
    await loadEquipmentConfig();
    appendLog("Synced updates from another device.");
  } catch (error) {
    appendLog(`Sync check failed: ${error.message}`);
  }
}

function connectLiveEvents() {
  if (!window.EventSource) {
    appendLog("Live sync unavailable in this browser; using fallback polling.");
    return;
  }

  state.eventSource = new EventSource("/api/events");
  state.eventSource.addEventListener("connected", () => {
    appendLog("Live sync connected.");
  });
  state.eventSource.addEventListener("state-changed", () => {
    if (state.dirty) return;
    pollState();
  });
  state.eventSource.onerror = () => {
    appendLog("Live sync disconnected; fallback polling is still running.");
  };
}

async function loadEquipmentConfig() {
  const data = await fetchJson("/api/equipment-config");
  state.equipmentConfig = data.config;
  state.calibrationPreview = data.preview;
  renderCalibration();
}

function mappingStatus(filename) {
  const mappedName = state.mapping[filename] || "";
  if (!mappedName) return "unmapped";
  if (state.duplicateNames.includes(mappedName)) return "duplicate";
  return "mapped";
}

function filteredCrops() {
  const query = state.search.trim().toLowerCase();
  return state.crops.filter((crop) => {
    const mappedName = state.mapping[crop.filename] || "";
    const status = mappingStatus(crop.filename);
    const matchesFilter =
      state.filter === "all" ||
      (state.filter === "mapped" && mappedName) ||
      (state.filter === "unmapped" && !mappedName) ||
      (state.filter === "duplicates" && status === "duplicate") ||
      (state.filter === "image-duplicates" && crop.duplicateImages?.length);
    const matchesSearch =
      !query ||
      crop.filename.toLowerCase().includes(query) ||
      mappedName.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
}

function updateDuplicateNames() {
  const counts = {};
  Object.values(state.mapping).forEach((name) => {
    if (!name) return;
    counts[name] = (counts[name] || 0) + 1;
  });
  state.duplicateNames = Object.entries(counts)
    .filter((entry) => entry[1] > 1)
    .map((entry) => entry[0]);
}

function renderCounts() {
  screenshotCount.textContent = `${state.screenshots.length} screenshot${state.screenshots.length === 1 ? "" : "s"}`;
  cropCount.textContent = `${state.crops.length} crop${state.crops.length === 1 ? "" : "s"}`;
  duplicateCount.textContent = `${state.duplicateNames.length} duplicate${state.duplicateNames.length === 1 ? "" : "s"}`;
}

function render() {
  updateDuplicateNames();
  renderCounts();
  renderNetworkLinks();
  renderNameSources();
  renderEquipmentProgress();
  renderEquipmentGoals();
  renderCaptureLog();
  renderCropGrid();
}

function renderNetworkLinks() {
  if (!networkLinks) return;
  const localUrl = state.network?.localUrl || window.location.origin;
  const lanUrl = state.network?.lanUrl || "";
  networkLinks.innerHTML = `
    <span>Computer <a href="${escapeHtml(localUrl)}">${escapeHtml(localUrl)}</a></span>
    ${lanUrl ? `<span class="phone-link">Phone/iPad <a href="${escapeHtml(lanUrl)}">${escapeHtml(lanUrl)}</a></span>` : ""}
  `;
}

function renderEquipmentProgress() {
  if (!equipmentProgress) return;
  const progress = state.equipmentProgress;
  if (!progress) {
    equipmentProgress.innerHTML = "";
    return;
  }
  equipmentProgress.innerHTML = `
    <span class="progress-pill"><strong>${progress.total}</strong> total equipment</span>
    <span class="progress-pill"><strong>${progress.fulfilled}</strong> fulfilled</span>
    <span class="progress-pill"><strong>${progress.skipped}</strong> skipped</span>
    <span class="progress-pill"><strong>${progress.neitherMappedNorSkipped}</strong> neither mapped nor skipped</span>
  `;
}

function renderEquipmentGoals() {
  if (!equipmentGoalGrid) return;
  const slots = [
    ["head", "1 Head"],
    ["weapon", "2 Weapon"],
    ["shield", "3 Shield"],
    ["armor", "4 Armor"],
    ["accessory", "5 Accessory"],
  ];
  equipmentGoalGrid.innerHTML = slots.map(([slot, label]) => {
    const hasTarget = Boolean(state.equipmentGoals[slot]);
    const name = state.equipmentGoals[slot] || "No remaining target";
    const skippedForSlot = state.skippedEquipmentGoals.filter((item) => item.slotKind === slot);
    const restoreButtons = skippedForSlot.length
      ? `<div class="restore-list">${skippedForSlot.map((item) => `
          <button type="button" data-restore-slot="${escapeHtml(slot)}" data-restore-name="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>
        `).join("")}</div>`
      : "";
    return `
      <div class="goal-card">
        <div class="goal-slot">${escapeHtml(label)}</div>
        <div class="goal-name">${escapeHtml(name)}</div>
        <button type="button" data-skip-slot="${escapeHtml(slot)}" ${hasTarget ? "" : "disabled"}>Skip This Slot Item</button>
        ${restoreButtons}
      </div>
    `;
  }).join("");
}

function defaultEquipmentConfig() {
  return {
    expectedScreenSize: [1668, 2388],
    boxes: [
      { label: "slot_1", left: 833, top: 1610, right: 974, bottom: 1751 },
      { label: "slot_2", left: 981, top: 1610, right: 1122, bottom: 1751 },
      { label: "slot_3", left: 1128, top: 1610, right: 1269, bottom: 1751 },
      { label: "slot_4", left: 1275, top: 1610, right: 1416, bottom: 1751 },
      { label: "slot_5", left: 1422, top: 1610, right: 1563, bottom: 1751 },
    ],
  };
}

function renderCalibration() {
  const empty = document.getElementById("calibrationEmpty");
  const tool = document.getElementById("calibrationTool");
  const image = document.getElementById("calibrationImage");
  const stage = document.getElementById("calibrationStage");
  if (!empty || !tool || !image || !stage) return;

  empty.hidden = Boolean(state.calibrationPreview);
  tool.hidden = !state.calibrationPreview;
  if (!state.calibrationPreview || !state.equipmentConfig) return;

  if (!image.src.endsWith(state.calibrationPreview)) {
    image.src = state.calibrationPreview;
  }

  image.onload = () => renderCalibrationBoxes();
  renderCalibrationBoxes();
}

function renderCalibrationBoxes() {
  const image = document.getElementById("calibrationImage");
  const stage = document.getElementById("calibrationStage");
  if (!image || !stage || !state.equipmentConfig || !image.naturalWidth) return;

  stage.querySelectorAll(".calibration-box").forEach((box) => box.remove());
  state.calibrationScale = image.clientWidth / image.naturalWidth;
  state.equipmentConfig.boxes.forEach((cropBox, index) => {
    const box = document.createElement("div");
    box.className = "calibration-box";
    box.dataset.index = String(index);
    box.dataset.label = String(index + 1);
    box.style.left = `${cropBox.left * state.calibrationScale}px`;
    box.style.top = `${cropBox.top * state.calibrationScale}px`;
    box.style.width = `${(cropBox.right - cropBox.left) * state.calibrationScale}px`;
    box.style.height = `${(cropBox.bottom - cropBox.top) * state.calibrationScale}px`;
    stage.appendChild(box);
  });
}

function renderNameSources() {
  const container = document.getElementById("nameSourceStatus");
  if (!container) return;
  if (!state.nameSources.length) {
    container.innerHTML = '<span class="source-pill missing">No database sources loaded</span>';
    return;
  }
  container.innerHTML = state.nameSources
    .map((source) => {
      const count = source.exists ? `${source.unique} unique / ${source.rows} rows` : "missing";
      return `<span class="source-pill ${source.exists ? "" : "missing"}">${escapeHtml(source.label)}: ${escapeHtml(count)}</span>`;
    })
    .join("");
}

function renderCropGrid() {
  const crops = filteredCrops();
  cropGrid.innerHTML = "";
  if (!crops.length) {
    cropGrid.innerHTML = '<div class="empty">No crops match the current filter.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  crops.forEach((crop) => {
    const mappedName = state.mapping[crop.filename] || "";
    const status = mappingStatus(crop.filename);
    const duplicateNote = status === "duplicate" ? '<div class="duplicate-note">This name is already used.</div>' : "";
    const duplicateImageNote = crop.duplicateImages?.length
      ? `<div class="duplicate-note image-dupe-note">Same-looking crop as ${escapeHtml(crop.duplicateImages.join(", "))}</div>`
      : "";
    const card = document.createElement("article");
    card.className = `crop-card ${status === "duplicate" || crop.duplicateImages?.length ? "duplicate" : ""}`;
    card.dataset.filename = crop.filename;
    card.dataset.slotKind = crop.slotKind || "";
    const slotLabel = crop.slotKind ? `${crop.slotIndex || ""} ${crop.slotKind}`.trim() : "unknown slot";
    card.innerHTML = `
      <img class="icon-preview" src="${crop.url}?v=${encodeURIComponent(crop.filename)}" alt="${crop.filename}">
      <div class="filename">${crop.filename}</div>
      <div class="slot-badge">${escapeHtml(slotLabel)}</div>
      <div class="status ${status}">${status}</div>
      ${duplicateNote}
      ${duplicateImageNote}
      <div class="name-picker">
        <input
          type="text"
          value="${escapeHtml(mappedName)}"
          placeholder="${escapeHtml(crop.slotKind ? `Search ${crop.slotKind}` : "Search equipment or item")}"
          autocomplete="off"
          role="combobox"
          aria-expanded="false"
          aria-autocomplete="list"
        >
        <div class="suggestions" role="listbox" hidden></div>
      </div>
      <div class="card-actions">
        <button type="button" data-action="clear">Clear</button>
        <button type="button" data-action="delete">Delete Crop</button>
      </div>
    `;
    fragment.appendChild(card);
  });
  cropGrid.appendChild(fragment);
}

function renderCaptureLog() {
  if (!captureLogList || !captureLogCount) return;
  captureLogCount.textContent = `${state.captureLog.length} planned`;
  captureLogList.innerHTML = "";
  if (!state.captureLog.length) {
    captureLogList.innerHTML = '<div class="empty">No screenshot notes yet.</div>';
    renderMissingList();
    return;
  }

  const fragment = document.createDocumentFragment();
  state.captureLog.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "capture-entry";
    item.innerHTML = `
      <strong>${escapeHtml(entry.name)}</strong>
      ${entry.slotKind ? `<span>${escapeHtml(entry.slotKind)}</span>` : ""}
      ${entry.note ? `<span>${escapeHtml(entry.note)}</span>` : ""}
      <button type="button" data-id="${escapeHtml(entry.id)}" aria-label="Remove capture note">x</button>
    `;
    fragment.appendChild(item);
  });
  captureLogList.appendChild(fragment);
  renderMissingList();
}

function searchKey(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "");
}

function displaySearchKey(value) {
  return searchKey(String(value).replace(/^([a-z])\s+(.+)/i, "$1-$2"));
}

function allEquipmentTargets() {
  const targets = [];
  Object.entries(state.equipmentNamesBySlot).forEach(([slotKind, names]) => {
    names.forEach((name) => targets.push({ name, slotKind }));
  });
  return targets;
}

function completedNameKeys() {
  const keys = new Set();
  Object.values(state.mapping).forEach((name) => keys.add(displaySearchKey(name)));
  return keys;
}

function mappedNameKeysExcept(filename = "") {
  const keys = new Set();
  Object.entries(state.mapping).forEach(([rawFilename, name]) => {
    if (rawFilename !== filename) keys.add(displaySearchKey(name));
  });
  return keys;
}

function missingTargets() {
  const done = completedNameKeys();
  const query = displaySearchKey(state.missingSearch);
  return allEquipmentTargets().filter((target) => {
    if (done.has(displaySearchKey(target.name))) return false;
    if (state.missingSlot && target.slotKind !== state.missingSlot) return false;
    if (query && !displaySearchKey(target.name).includes(query)) return false;
    return true;
  });
}

function renderMissingList() {
  if (!missingList || !missingCount) return;
  const missing = missingTargets();
  missingCount.textContent = `${missing.length} missing`;
  missingList.innerHTML = "";
  if (!missing.length) {
    missingList.innerHTML = '<div class="empty">Nothing missing for this filter.</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  missing.slice(0, 250).forEach((target) => {
    const item = document.createElement("div");
    item.className = "missing-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(target.name)}</strong>
        <span>${escapeHtml(target.slotKind)}</span>
      </div>
      <button type="button" data-name="${escapeHtml(target.name)}" data-slot="${escapeHtml(target.slotKind)}">Log</button>
    `;
    fragment.appendChild(item);
  });
  missingList.appendChild(fragment);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function namesForSlot(slotKind) {
  if (slotKind && state.equipmentNamesBySlot[slotKind]?.length) {
    return state.equipmentNamesBySlot[slotKind];
  }
  return state.names;
}

function canonicalNameForInput(value, slotKind = "") {
  const raw = value.trim();
  if (!raw) return "";
  const key = displaySearchKey(raw);
  const pool = namesForSlot(slotKind);
  return pool.find((name) => displaySearchKey(name) === key) || raw;
}

function suggestionsFor(query, slotKind = "", currentFilename = "") {
  const pool = namesForSlot(slotKind);
  const lowered = displaySearchKey(query);
  const alreadyMapped = mappedNameKeysExcept(currentFilename);
  const unused = [];
  const used = [];

  pool.forEach((name) => {
    const candidate = displaySearchKey(name);
    if (lowered && !candidate.includes(lowered)) {
      return;
    }
    if (alreadyMapped.has(candidate)) {
      used.push(name);
    } else {
      unused.push(name);
    }
  });

  const sortMatches = (names) => names.sort((a, b) => {
    const aKey = displaySearchKey(a);
    const bKey = displaySearchKey(b);
    const aStarts = lowered && aKey.startsWith(lowered);
    const bStarts = lowered && bKey.startsWith(lowered);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return a.localeCompare(b);
  });

  return [...sortMatches(unused), ...sortMatches(used)].slice(0, 50).map((name) => ({
    name,
    alreadyMapped: alreadyMapped.has(displaySearchKey(name)),
  }));
}

function showSuggestions(input) {
  const picker = input.closest(".name-picker");
  const card = input.closest(".crop-card");
  const box = picker.querySelector(".suggestions");
  const slotKind = card?.dataset.slotKind || "";
  const currentFilename = card?.dataset.filename || "";
  const captureSlot = input.id === "captureNameInput" ? captureSlotInput.value : "";
  const matches = suggestionsFor(input.value, slotKind || captureSlot, currentFilename);
  box.innerHTML = "";
  state.activePicker = picker;

  matches.forEach((match) => {
    const item = document.createElement("div");
    item.className = `suggestion ${match.alreadyMapped ? "already-used" : ""}`;
    item.setAttribute("role", "option");
    item.tabIndex = -1;
    item.textContent = match.alreadyMapped ? `${match.name} - already mapped` : match.name;
    item.dataset.value = match.name;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectSuggestion(input, item);
      closeSuggestions(input);
    });
    box.appendChild(item);
  });

  if (!matches.length) {
    const item = document.createElement("div");
    item.className = "suggestion empty-option";
    item.textContent = slotKind
      ? `No ${slotKind} match. Press Enter to keep typed name.`
      : "No database match. Press Enter to keep typed name.";
    box.appendChild(item);
  }

  box.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

async function saveCaptureLog() {
  const data = await fetchJson("/api/capture-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: state.captureLog }),
  });
  state.captureLog = data.entries;
  renderCaptureLog();
}

async function addCaptureEntry() {
  const name = canonicalNameForInput(captureNameInput.value, captureSlotInput.value);
  if (!name) return;
  state.captureLog.unshift({
    id: `capture_${Date.now()}`,
    name,
    slotKind: captureSlotInput.value,
    note: captureNoteInput.value.trim(),
  });
  captureNameInput.value = "";
  captureNoteInput.value = "";
  await saveCaptureLog();
  appendLog(`Added screenshot note: ${name}`);
}

function commitInput(input) {
  const card = input.closest(".crop-card");
  if (!card) return;
  const filename = card.dataset.filename;
  const value = canonicalNameForInput(input.value, card.dataset.slotKind || "");
  const previous = state.mapping[filename] || "";
  if (previous === value) return;
  if (value) {
    state.mapping[filename] = value;
    autoAddCaptureLogFromMapping(value, card.dataset.slotKind || "");
  } else {
    delete state.mapping[filename];
  }
  scheduleAutosave();
  render();
}

async function saveMapping(options = {}) {
  const data = await fetchJson("/api/mapping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapping: state.mapping, publish: !options.quiet }),
  });
  state.mapping = { ...data.mapping };
  state.duplicateNames = data.duplicateNames;
  setDirty(false);
  if (!options.quiet) {
    appendLog("Mapping saved to icon_mapping.json and icon_mapping.csv.");
    if (data.publish) {
      const apiText = data.publish.apiUpdated ? "API updated" : "shared file updated; refresh site if API was already cached";
      appendLog(`Published ${data.publish.published} equipment icon(s) to website (${apiText}).`);
      if (data.publish.missingSources?.length) {
        appendLog(`Skipped missing raw crop(s): ${data.publish.missingSources.join(", ")}`);
      }
    }
    if (data.requeued?.length) {
      appendLog(`Put corrected requested item(s) back into the request pool: ${data.requeued.join(", ")}`);
    }
  }
  render();
}

function closeSuggestions(input) {
  const picker = input.closest(".name-picker");
  const box = picker.querySelector(".suggestions");
  box.hidden = true;
  input.setAttribute("aria-expanded", "false");
  state.activePicker = null;
}

function selectSuggestion(input, suggestion) {
  if (!suggestion || suggestion.classList.contains("empty-option")) return;
  input.value = suggestion.dataset.value || suggestion.textContent;
  commitInput(input);
}

function moveSuggestion(input, direction) {
  const picker = input.closest(".name-picker");
  const box = picker.querySelector(".suggestions");
  if (box.hidden) {
    showSuggestions(input);
    return;
  }

  const options = [...box.querySelectorAll(".suggestion:not(.empty-option)")];
  if (!options.length) return;

  const currentIndex = options.findIndex((option) => option.classList.contains("active"));
  const nextIndex = currentIndex === -1
    ? (direction > 0 ? 0 : options.length - 1)
    : (currentIndex + direction + options.length) % options.length;

  options.forEach((option) => option.classList.remove("active"));
  options[nextIndex].classList.add("active");
  options[nextIndex].scrollIntoView({ block: "nearest" });
}

async function uploadFiles(files) {
  if (!files.length) return;
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("screenshots", file));
  const data = await fetchJson("/api/upload", { method: "POST", body: formData });
  appendLog(`Uploaded ${data.saved} screenshot(s). ${data.skipped.length ? `Skipped: ${data.skipped.join(", ")}` : ""}`);
  await loadState();
  await loadEquipmentConfig();
}

async function runCropper(kind) {
  setBusy(true);
  appendLog(`Running ${kind} cropper...`);
  try {
    const data = await fetchJson(`/api/run/${kind}`, { method: "POST" });
    appendLog(data.log || `${kind} cropper finished with no output.`);
    if (!data.ok) appendLog(`${kind} cropper exited with code ${data.exitCode}.`);
    await loadState();
  } catch (error) {
    appendLog(error.message);
  } finally {
    setBusy(false);
  }
}

function setBusy(value) {
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = value;
  });
}

dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  await uploadFiles(event.dataTransfer.files);
});

fileInput.addEventListener("change", async () => {
  await uploadFiles(fileInput.files);
  fileInput.value = "";
});

document.getElementById("clearUploadsButton").addEventListener("click", async () => {
  const data = await fetchJson("/api/uploads", { method: "DELETE" });
  appendLog(`Removed ${data.removed} uploaded screenshot(s).`);
  await loadState();
  await loadEquipmentConfig();
});

document.getElementById("runEquipmentButton").addEventListener("click", () => runCropper("equipment"));
document.getElementById("runInventoryButton").addEventListener("click", () => runCropper("inventory"));

equipmentGoalGrid.addEventListener("click", (event) => {
  const restoreButton = event.target.closest("button[data-restore-name]");
  if (restoreButton) {
    fetchJson("/api/equipment-goals/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: restoreButton.dataset.restoreName,
        slotKind: restoreButton.dataset.restoreSlot,
      }),
    })
      .then((data) => {
        state.equipmentGoals = data.goals || {};
        state.skippedEquipmentGoals = data.skipped || [];
        appendLog(`Restored ${restoreButton.dataset.restoreName} to ${restoreButton.dataset.restoreSlot}.`);
        renderEquipmentGoals();
      })
      .catch((error) => appendLog(error.message));
    return;
  }

  const button = event.target.closest("button[data-skip-slot]");
  if (!button) return;
  fetchJson(`/api/equipment-goals/skip/${encodeURIComponent(button.dataset.skipSlot)}`, { method: "POST" })
    .then(async (data) => {
      state.equipmentGoals = data.goals || {};
      state.skippedEquipmentGoals = data.skipped || state.skippedEquipmentGoals;
      appendLog(`Skipped ${button.dataset.skipSlot} target.`);
      renderEquipmentGoals();
    })
    .catch((error) => appendLog(error.message));
});

document.getElementById("processGoalButton").addEventListener("click", async () => {
  setBusy(true);
  appendLog("Processing requested equipment screenshot...");
  try {
    const data = await fetchJson("/api/equipment-goals/process", { method: "POST" });
    appendLog(data.log || "Goal screenshot processed.");
    appendLog(`Auto-mapped ${data.mapped} crop(s) from requested slots.`);
    if (data.publish) {
      appendLog(`Published ${data.publish.published} equipment icon(s) to website.`);
    }
    await loadState();
  } catch (error) {
    appendLog(error.message);
  } finally {
    setBusy(false);
  }
});

document.getElementById("uploadProcessGoalButton").addEventListener("click", async () => {
  if (!goalScreenshotInput.files.length) {
    appendLog("Choose the requested-items screenshot first.");
    return;
  }
  setBusy(true);
  appendLog("Uploading and processing requested equipment screenshot...");
  try {
    const formData = new FormData();
    formData.append("screenshot", goalScreenshotInput.files[0]);
    const data = await fetchJson("/api/equipment-goals/upload-process", { method: "POST", body: formData });
    goalScreenshotInput.value = "";
    appendLog(data.log || "Goal screenshot processed.");
    appendLog(`Auto-mapped ${data.mapped} crop(s), moved screenshot to processed screenshots, and advanced goals.`);
    if (data.publish) {
      appendLog(`Published ${data.publish.published} equipment icon(s) to website.`);
    }
    await loadState();
  } catch (error) {
    appendLog(error.message);
  } finally {
    setBusy(false);
  }
});

document.getElementById("clearRawCropsButton").addEventListener("click", async () => {
  const confirmed = window.confirm("Delete all raw crop PNGs and remove their mappings? Originals screenshots stay untouched.");
  if (!confirmed) return;
  const data = await fetchJson("/api/raw-crops", { method: "DELETE" });
  state.mapping = {};
  setDirty(false);
  appendLog(`Removed ${data.removed} raw crop(s). Uploaded screenshots were kept.`);
  await loadState();
});

document.getElementById("saveMappingButton").addEventListener("click", async () => {
  await saveMapping();
});

document.getElementById("finalizeButton").addEventListener("click", async () => {
  if (state.dirty) {
    await saveMapping({ quiet: true });
  }
  setBusy(true);
  try {
    const data = await fetchJson("/api/finalize", { method: "POST" });
    appendLog(data.log || "Finalize finished with no output.");
  } catch (error) {
    appendLog(error.message);
  } finally {
    setBusy(false);
  }
});

document.getElementById("backupButton").addEventListener("click", async () => {
  try {
    const data = await fetchJson("/api/backup", { method: "POST" });
    appendLog(`Backup snapshot created: ${data.backup}`);
  } catch (error) {
    appendLog(error.message);
  }
});

document.getElementById("cleanupFulfilledButton").addEventListener("click", async () => {
  try {
    const data = await fetchJson("/api/cleanup-fulfilled", { method: "POST" });
    appendLog(`Cleaned done items from planning UI: ${data.removedCaptureLog} capture log, ${data.removedGoals} active goals, ${data.removedSkipped} skipped.`);
    await loadState();
  } catch (error) {
    appendLog(error.message);
  }
});

document.getElementById("clearMappedButton").addEventListener("click", async () => {
  const data = await fetchJson("/api/mapped-icons", { method: "DELETE" });
  appendLog(`Removed ${data.removed} exported icon(s).`);
});

document.getElementById("clearLogButton").addEventListener("click", () => {
  logOutput.textContent = "";
});

document.getElementById("addCaptureButton").addEventListener("click", () => {
  addCaptureEntry().catch((error) => appendLog(error.message));
});

captureNameInput.addEventListener("input", () => showSuggestions(captureNameInput));
captureNameInput.addEventListener("focusin", () => showSuggestions(captureNameInput));
captureNameInput.addEventListener("focusout", () => {
  window.setTimeout(() => closeSuggestions(captureNameInput), 120);
});
captureNameInput.addEventListener("keydown", (event) => {
  const picker = captureNameInput.closest(".name-picker");
  const box = picker.querySelector(".suggestions");
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSuggestion(captureNameInput, 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSuggestion(captureNameInput, -1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const active = box.querySelector(".suggestion.active");
    if (active) selectSuggestion(captureNameInput, active);
    closeSuggestions(captureNameInput);
    addCaptureEntry().catch((error) => appendLog(error.message));
  } else if (event.key === "Escape") {
    closeSuggestions(captureNameInput);
  }
});

captureLogList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  state.captureLog = state.captureLog.filter((entry) => entry.id !== button.dataset.id);
  saveCaptureLog().catch((error) => appendLog(error.message));
});

missingSearchInput.addEventListener("input", () => {
  state.missingSearch = missingSearchInput.value;
  renderMissingList();
});

document.querySelector(".missing-slots").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-slot]");
  if (!button) return;
  state.missingSlot = button.dataset.slot;
  document.querySelectorAll(".missing-slots button").forEach((item) => item.classList.toggle("active", item === button));
  renderMissingList();
});

missingList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-name]");
  if (!button) return;
  state.captureLog.unshift({
    id: `capture_${Date.now()}`,
    name: button.dataset.name,
    slotKind: button.dataset.slot,
    note: "",
  });
  saveCaptureLog()
    .then(() => appendLog(`Added screenshot note: ${button.dataset.name}`))
    .catch((error) => appendLog(error.message));
});

document.getElementById("saveCalibrationButton").addEventListener("click", async () => {
  const data = await fetchJson("/api/equipment-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.equipmentConfig),
  });
  state.equipmentConfig = data.config;
  appendLog("Saved equipment crop calibration. Future equipment crops will use these 5 boxes.");
  renderCalibration();
});

document.getElementById("resetCalibrationButton").addEventListener("click", () => {
  state.equipmentConfig = defaultEquipmentConfig();
  appendLog("Reset calibration preview to default 5 equipment slots. Save if it looks correct.");
  renderCalibration();
});

document.getElementById("calibrationStage").addEventListener("pointerdown", (event) => {
  const box = event.target.closest(".calibration-box");
  if (!box || !state.equipmentConfig) return;
  event.preventDefault();
  const index = Number(box.dataset.index);
  const cropBox = state.equipmentConfig.boxes[index];
  state.draggedBox = {
    index,
    startX: event.clientX,
    startY: event.clientY,
    left: cropBox.left,
    top: cropBox.top,
    right: cropBox.right,
    bottom: cropBox.bottom,
  };
  box.classList.add("active");
  box.setPointerCapture(event.pointerId);
});

document.getElementById("calibrationStage").addEventListener("pointermove", (event) => {
  if (!state.draggedBox || !state.equipmentConfig) return;
  const scale = state.calibrationScale || 1;
  const dx = Math.round((event.clientX - state.draggedBox.startX) / scale);
  const dy = Math.round((event.clientY - state.draggedBox.startY) / scale);
  const cropBox = state.equipmentConfig.boxes[state.draggedBox.index];
  cropBox.left = state.draggedBox.left + dx;
  cropBox.right = state.draggedBox.right + dx;
  cropBox.top = state.draggedBox.top + dy;
  cropBox.bottom = state.draggedBox.bottom + dy;
  renderCalibrationBoxes();
});

document.getElementById("calibrationStage").addEventListener("pointerup", () => {
  document.querySelectorAll(".calibration-box").forEach((box) => box.classList.remove("active"));
  state.draggedBox = null;
});

document.getElementById("mappingFilterButtons").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  document.querySelectorAll("#mappingFilterButtons button").forEach((item) => item.classList.toggle("active", item === button));
  renderCropGrid();
});

searchInput.addEventListener("input", () => {
  state.search = searchInput.value;
  renderCropGrid();
});

cropGrid.addEventListener("input", (event) => {
  if (!event.target.matches(".name-picker input")) return;
  showSuggestions(event.target);
});

cropGrid.addEventListener("focusin", (event) => {
  if (!event.target.matches(".name-picker input")) return;
  showSuggestions(event.target);
});

cropGrid.addEventListener("focusout", (event) => {
  if (!event.target.matches(".name-picker input")) return;
  const input = event.target;
  window.setTimeout(() => {
    closeSuggestions(input);
    commitInput(input);
  }, 120);
});

cropGrid.addEventListener("keydown", (event) => {
  if (!event.target.matches(".name-picker input")) return;
  const input = event.target;
  const picker = input.closest(".name-picker");
  const box = picker.querySelector(".suggestions");

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSuggestion(input, 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSuggestion(input, -1);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const active = box.querySelector(".suggestion.active");
    if (active) {
      selectSuggestion(input, active);
    } else {
      commitInput(input);
    }
    closeSuggestions(input);
    input.blur();
  }

  if (event.key === "Escape") {
    closeSuggestions(input);
    input.blur();
  }
});

cropGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest(".crop-card");
  const filename = card.dataset.filename;

  if (button.dataset.action === "clear") {
    delete state.mapping[filename];
    scheduleAutosave();
    render();
    return;
  }

  if (button.dataset.action === "delete") {
    fetchJson(`/api/raw-crops/${encodeURIComponent(filename)}`, { method: "DELETE" })
      .then(async () => {
        delete state.mapping[filename];
        setDirty(false);
        appendLog(`Deleted raw crop ${filename}.`);
        await loadState();
      })
      .catch((error) => appendLog(error.message));
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

loadState().catch((error) => appendLog(error.message));
connectLiveEvents();
state.pollTimer = window.setInterval(pollState, 15000);
