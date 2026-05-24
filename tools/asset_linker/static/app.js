let currentMapping = {};

const sanitizePathForId = (relativePath) => relativePath.replace(/[^a-zA-Z0-9_-]/g, '_');

const buildSummary = (data) => {
  const summaryGrid = document.getElementById('summaryGrid');
  const assetCount = document.getElementById('assetCount');
  const matchedCount = document.getElementById('matchedCount');
  const unmatchedCount = document.getElementById('unmatchedCount');
  const pieceCount = document.getElementById('pieceCount');
  const assetGroupList = document.getElementById('assetGroupList');
  const buildingMatches = document.getElementById('buildingMatches');
  const unmatchedAssets = document.getElementById('unmatchedAssets');
  const pieceGroups = document.getElementById('pieceGroups');
  const summaryStats = document.getElementById('summaryStats');
  const mappedPreview = document.getElementById('mappedPreview');
  const mappedPreviewCount = document.getElementById('mappedPreviewCount');
  const manualMappingList = document.getElementById('manualMappingList');
  const manualMappingCount = document.getElementById('manualMappingCount');

  const unmatchedBuildingsList = document.getElementById('unmatchedBuildings');
  summaryGrid.innerHTML = '';
  assetGroupList.innerHTML = '';
  buildingMatches.innerHTML = '';
  unmatchedAssets.innerHTML = '';
  mappedPreview.innerHTML = '';
  pieceGroups.innerHTML = '';
  unmatchedBuildingsList.innerHTML = '';
  manualMappingList.innerHTML = '';

  summaryGrid.append(createStatCard('Asset folders', Object.keys(data.groups).length));
  summaryGrid.append(createStatCard('Total assets', data.assetCount));
  summaryGrid.append(createStatCard('Linked buildings', data.buildingMatches.length));
  summaryGrid.append(createStatCard('Unmatched assets', data.unmatchedAssets.length));
  summaryGrid.append(createStatCard('Unmatched buildings', data.unmatchedBuildings.length));
  summaryGrid.append(createStatCard('Piece categories', Object.keys(data.pieceCounts).length));

  assetCount.textContent = `${data.assetCount} assets found`;
  matchedCount.textContent = `${data.buildingMatches.length} linked building assets`;
  unmatchedCount.textContent = `${data.unmatchedAssets.length} assets need review`;
  pieceCount.textContent = `${Object.keys(data.pieceCounts).length} categories`;
  const unmatchedBuildingCount = document.getElementById('unmatchedBuildingCount');
  unmatchedBuildingCount.textContent = `${data.unmatchedBuildings.length} not auto-linked`;
  mappedPreviewCount.textContent = `${Math.min(20, data.buildingMatches.length)} buildings previewed`;
  summaryStats.textContent = `Loaded ${data.assetCount} assets from ${Object.keys(data.groups).length} folders.`;
  const buildingAssets = data.assets.filter((asset) => asset.folder === 'building');
  const savedMappingCount = Object.keys(data.savedMapping || {}).length;
  manualMappingCount.textContent = `${Math.min(40, buildingAssets.length)} building assets available; ${savedMappingCount} saved mapping${savedMappingCount === 1 ? '' : 's'} loaded`;

  for (const [folder, count] of Object.entries(data.groups)) {
    assetGroupList.append(createTagCard(folder, count));
  }

  for (const match of data.buildingMatches) {
    buildingMatches.append(createMatchCard(match));
  }

  if (data.unmatchedBuildings.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<p>All buildings have suggested asset matches.</p>';
    unmatchedBuildingsList.append(empty);
  } else {
    for (const building of data.unmatchedBuildings) {
      unmatchedBuildingsList.append(createBuildingRow(building));
    }
  }

  if (data.unmatchedAssets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<p>No unmatched assets found.</p>';
    unmatchedAssets.append(empty);
  } else {
    for (const asset of data.unmatchedAssets.slice(0, 40)) {
      unmatchedAssets.append(createAssetCard(asset, false));
    }
  }

  const manualCandidates = data.assets
    .filter((asset) => asset.folder === 'building')
    .slice(0, 40);
  if (manualCandidates.length === 0) {
    manualMappingList.append(createCard('<p>No manual mapping actions available. Only assets in the building folder are eligible for manual building mapping.</p>'));
    manualMappingCount.textContent = 'No building assets need manual mapping';
  } else {
    const savedMappingNote = savedMappingCount > 0 ? ` ${savedMappingCount} saved mapping${savedMappingCount === 1 ? '' : 's'} were loaded from asset_mapping.json.` : '';
    manualMappingList.append(createCard(`<p>Select the correct building for each asset and click Save or Clear.${savedMappingNote}</p>`));
    manualCandidates.forEach((asset) => {
      manualMappingList.append(createManualMappingCard(asset, data.buildings, savedMappingCount > 0 ? data.savedMapping : {}));
    });
  }

  data.buildingMatches.slice(0, 20).forEach((match) => {
    mappedPreview.append(createMappedPreviewCard(match));
  });

  for (const [group, count] of Object.entries(data.pieceCounts)) {
    pieceGroups.append(createPieceCard(group, count));
  }

  setupManualMappingHandlers();
};

const createCard = (html) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = html;
  return card;
};

const createMappedPreviewCard = (match) => {
  const card = document.createElement('div');
  card.className = 'asset-card';
  card.innerHTML = `
    <h3>${match.buildingName}</h3>
    <p>${match.assets.length} asset${match.assets.length === 1 ? '' : 's'} suggested</p>
    <div class="match-thumbs">
      ${match.assets.slice(0, 4).map(asset => `<img src="${asset.assetUrl}" alt="${asset.filename}" class="match-thumb">`).join('')}
    </div>
  `;
  return card;
};

const createBuildingRow = (building) => {
  const row = document.createElement('div');
  row.className = 'card';
  row.innerHTML = `
    <h3>${building.name}</h3>
    <p>ID: ${building.id}</p>
  `;
  return row;
};

const createStatCard = (title, value) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>${title}</h3>
    <p>${value}</p>
  `;
  return card;
};

const createTagCard = (folder, count) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>${folder}</h3>
    <p>${count} file${count === 1 ? '' : 's'}</p>
  `;
  return card;
};

const createAssetCard = (asset, hasMatch) => {
  const card = document.createElement('div');
  card.className = 'asset-card';
  card.innerHTML = `
    <img src="${asset.assetUrl}" alt="${asset.filename}">
    <h3>${asset.filename}</h3>
    <p>${asset.folder}</p>
    <div class="tag">
      <span class="badge">${asset.folder}</span>
      <span class="badge ${hasMatch ? 'match' : 'unmatched'}">${hasMatch ? 'Matched' : 'Unmatched'}</span>
    </div>
  `;
  return card;
};

const createMatchCard = (match) => {
  const card = document.createElement('div');
  card.className = 'match-card';
  const images = match.assets
    .slice(0, 3)
    .map(asset => `<img src="${asset.assetUrl}" alt="${asset.filename}" class="match-thumb">`)
    .join('');

  card.innerHTML = `
    <h3>${match.buildingName}</h3>
    <p>${match.assets.length} asset${match.assets.length === 1 ? '' : 's'} linked</p>
    <div class="tag">
      <span class="badge match">Suggested</span>
    </div>
    <div class="match-thumbs">${images}</div>
  `;
  return card;
};

const createPieceCard = (group, count) => {
  const card = document.createElement('div');
  card.className = 'piece-card';
  card.innerHTML = `
    <h3>${group}</h3>
    <p>${count} items</p>
  `;
  return card;
};

const createManualMappingCard = (asset, buildings, savedMapping = {}) => {
  const saved = savedMapping[asset.relativePath] !== undefined;
  const selectedBuilding = buildings.find((building) => building.id === asset.match?.buildingId);
  const selectedValue = selectedBuilding ? `${selectedBuilding.name} (${selectedBuilding.id})` : '';
  const matchType = asset.match?.matchType ?? 'unmapped';
  const matchTypeLabel = saved ? `Saved (${matchType})` : matchType === 'unmapped' ? 'Unmapped' : `Auto (${matchType})`;
  const options = buildings.map((building) => `
      <option value="${building.name} (${building.id})"></option>
    `).join('');
  const sanitized = sanitizePathForId(asset.relativePath);
  const card = document.createElement('div');
  card.className = 'asset-card';
  card.innerHTML = `
    <img src="${asset.assetUrl}" alt="${asset.filename}">
    <h3>${asset.filename}</h3>
    <p>${asset.folder}</p>
    <div class="tag">
      <span class="badge">${saved ? 'Saved' : 'Review'}</span>
      <span class="badge ${asset.match ? 'match' : 'unmatched'}">${selectedValue ? selectedValue : matchTypeLabel}</span>
    </div>
    <label>
      Map to building
      <input list="buildings-${sanitized}" class="manual-building-input" data-relative-path="${asset.relativePath}" value="${selectedValue}" placeholder="Type to search" autocomplete="off">
      <datalist id="buildings-${sanitized}">
        ${options}
      </datalist>
    </label>
    <div class="manual-action-row">
      <button class="manual-save-button" data-relative-path="${asset.relativePath}">Save</button>
      <button class="manual-clear-button" data-relative-path="${asset.relativePath}" type="button">Clear</button>
      <span class="manual-save-status" id="status-${sanitized}"></span>
    </div>
  `;
  return card;
};

const setupManualMappingHandlers = () => {
  const manualMappingList = document.getElementById('manualMappingList');
  manualMappingList.querySelectorAll('.manual-save-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const relativePath = button.dataset.relativePath;
      const input = manualMappingList.querySelector(`input[data-relative-path="${relativePath}"]`);
      const value = input.value.trim();
      const buildingIdMatch = value.match(/\((\d+)\)$/);
      const buildingId = buildingIdMatch ? buildingIdMatch[1] : value;
      const status = document.getElementById(`status-${sanitizePathForId(relativePath)}`);
      button.disabled = true;
      status.textContent = 'Saving...';
      try {
        await saveMapping(relativePath, buildingId);
        status.textContent = 'Saved';
        await initialize();
      } catch (error) {
        console.error(error);
        status.textContent = 'Failed';
      } finally {
        button.disabled = false;
      }
    });
  });

  manualMappingList.querySelectorAll('.manual-clear-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const relativePath = button.dataset.relativePath;
      const input = manualMappingList.querySelector(`input[data-relative-path="${relativePath}"]`);
      const status = document.getElementById(`status-${sanitizePathForId(relativePath)}`);
      input.value = '';
      button.disabled = true;
      status.textContent = 'Clearing...';
      try {
        await saveMapping(relativePath, '');
        status.textContent = 'Cleared';
        await initialize();
      } catch (error) {
        console.error(error);
        status.textContent = 'Failed';
      } finally {
        button.disabled = false;
      }
    });
  });

  const clearAllButton = document.getElementById('clearAllManualMappingsButton');
  if (clearAllButton) {
    clearAllButton.addEventListener('click', async () => {
      if (!confirm('Clear all saved manual mappings? This will delete every manual link in asset_mapping.json.')) {
        return;
      }
      clearAllButton.disabled = true;
      clearAllButton.textContent = 'Clearing...';
      try {
        currentMapping = {};
        await fetch('/api/mapping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(currentMapping),
        });
        await initialize();
      } catch (error) {
        console.error(error);
        alert('Failed to clear manual mappings. See console for details.');
      } finally {
        clearAllButton.disabled = false;
        clearAllButton.textContent = 'Clear All Manual Mappings';
      }
    });
  }
};

const saveMapping = async (relativePath, buildingId) => {
  if (buildingId === '') {
    delete currentMapping[relativePath];
  } else {
    currentMapping[relativePath] = Number(buildingId);
  }
  const response = await fetch('/api/mapping', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(currentMapping),
  });
  if (!response.ok) {
    throw new Error(`Failed to save mapping: ${response.status}`);
  }
  const data = await response.json();
  return data;
};

const renderNetworkLinks = (network) => {
  const container = document.getElementById('networkLinks');
  container.innerHTML = `Computer <a href="${network.localUrl}" target="_blank">${network.localUrl}</a>`;
  if (network.lanUrl) {
    const span = document.createElement('span');
    span.className = 'phone-link';
    span.innerHTML = `Phone/iPad <a href="${network.lanUrl}" target="_blank">${network.lanUrl}</a>`;
    container.appendChild(span);
  }
};

const initialize = async () => {
  if (window.__NETWORK__) {
    renderNetworkLinks(window.__NETWORK__);
  }

  const saveState = document.getElementById('saveState');
  const response = await fetch('/api/summary');
  if (!response.ok) {
    saveState.textContent = `Load failed: ${response.status} ${response.statusText}`;
    throw new Error(`Failed to load /api/summary: ${response.status}`);
  }
  const data = await response.json();
  currentMapping = data.savedMapping || {};
  saveState.textContent = 'Loaded';
  buildSummary(data);
};

window.addEventListener('DOMContentLoaded', () => {
  initialize().catch((error) => {
    const saveState = document.getElementById('saveState');
    saveState.textContent = 'Failed to load';
    console.error(error);
  });
});
