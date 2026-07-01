"use strict";
// ─── Constants ────────────────────────────────────────────────────────────────
const TILE_SIZE = 16;
const SCALE = 2;
const DTILE = TILE_SIZE * SCALE;
const TILESHEET_COLS = 20;
const TILESHEET_ROWS = 20;
const MAP_COLS = 20;
const MAP_ROWS = 16;
const MAP_W = MAP_COLS * TILE_SIZE;
const MAP_H = MAP_ROWS * TILE_SIZE;
const SHEET_W = TILESHEET_COLS * TILE_SIZE;
const SHEET_H = TILESHEET_ROWS * TILE_SIZE;
const MAX_TILES = TILESHEET_COLS * TILESHEET_ROWS;
const TOTAL_BITS = 16;
const CONFIG = {
    tileSize: TILE_SIZE,
    scale: SCALE,
    dTile: DTILE,
    tilesheetCols: TILESHEET_COLS,
    tilesheetRows: TILESHEET_ROWS,
    mapCols: MAP_COLS,
    mapRows: MAP_ROWS,
    mapW: MAP_W,
    mapH: MAP_H,
    sheetW: SHEET_W,
    sheetH: SHEET_H,
};
// ─── DOM elements ─────────────────────────────────────────────────────────────
const mapCanvas = document.getElementById('map-canvas');
const mapCtx = mapCanvas.getContext('2d');
const tilesCanvas = document.getElementById('tiles-canvas');
const tilesCtx = tilesCanvas.getContext('2d');
const activeTileSpan = document.getElementById('active-tile-id');
const flagsColumn = document.getElementById('flags-column');
const bitsOnMapCheckbox = document.getElementById('chk-bits-on-map');
// ─── State ────────────────────────────────────────────────────────────────────
let maps = [];
let currentMapIndex = 0;
function getCurrentMap() { return maps[currentMapIndex]?.map ?? []; }
function getCurrentMapEntry() { return maps[currentMapIndex]; }
let activeTile = 0;
let mouseDown = false;
let lastPlaced = null;
let sheetHover = { col: -1, row: -1 };
let mapHover = { col: -1, row: -1 };
const tileFlags = new Array(MAX_TILES).fill(0);
let activeBitIndex = 0;
let bitsConfig = { bits: [], tileFlags: [] };
let tilesheet = null;
let projectLoaded = false;
let currentProjectPath = '';
let currentProjectName = '— no project —';
let currentPngFileName = '';
let convBitplanes = 4;
// ─── Canvas sizes ─────────────────────────────────────────────────────────────
mapCanvas.width = CONFIG.mapW * CONFIG.scale;
mapCanvas.height = CONFIG.mapH * CONFIG.scale;
tilesCanvas.width = CONFIG.sheetW * CONFIG.scale;
tilesCanvas.height = CONFIG.sheetH * CONFIG.scale;
// ─── Bit helpers ──────────────────────────────────────────────────────────────
function hasBit(tileIdx, bitIdx) {
    return (tileFlags[tileIdx] & (1 << bitIdx)) !== 0;
}
function toggleBit(tileIdx, bitIdx) {
    if (bitIdx < 0 || bitIdx >= TOTAL_BITS)
        return;
    tileFlags[tileIdx] ^= (1 << bitIdx);
    tileFlags[tileIdx] &= 0xFFFF;
}
// ─── Init map grid ────────────────────────────────────────────────────────────
function createEmptyGrid(cols, rows) {
    const grid = [];
    for (let r = 0; r < rows; r++) {
        grid[r] = new Array(cols).fill(0);
    }
    return grid;
}
function initSingleMap(cols, rows) {
    return { name: 'Level 1', map: createEmptyGrid(cols, rows), mapCols: cols, mapRows: rows };
}
// ─── Map tabs UI ──────────────────────────────────────────────────────────────
let dragSrcIndex = null;
const mapTabsContainer = document.getElementById('map-tabs');
function renderMapTabs() {
    const container = mapTabsContainer;
    let html = '';
    for (let i = 0; i < maps.length; i++) {
        const entry = maps[i];
        const active = i === currentMapIndex ? ' active' : '';
        html += `<div class="map-tab${active}" data-index="${i}" draggable="true">
      <span class="map-tab-name" data-index="${i}">${entry.name}</span>
      <button class="map-tab-del" data-index="${i}" title="Delete map">&times;</button>
    </div>`;
    }
    html += `<button id="btn-add-map" class="map-tab-add" title="Add new map">+</button>`;
    container.innerHTML = html;
}
mapTabsContainer.addEventListener('click', (e) => {
    const target = e.target;
    if (target.id === 'btn-add-map') {
        addNewMap();
        return;
    }
    if (target.classList.contains('map-tab-del')) {
        const idx = parseInt(target.dataset.index, 10);
        deleteMap(idx);
        return;
    }
    const tab = target.closest('.map-tab');
    if (!tab)
        return;
    const idx = parseInt(tab.dataset.index, 10);
    if (idx === currentMapIndex) {
        startRenameMap(idx);
    }
    else {
        switchToMap(idx);
    }
});
mapTabsContainer.addEventListener('contextmenu', (e) => {
    const target = e.target;
    if (target.classList.contains('map-tab-del'))
        return;
    const tab = target.closest('.map-tab');
    if (!tab)
        return;
    e.preventDefault();
    const idx = parseInt(tab.dataset.index, 10);
    startRenameMap(idx);
});
function updateDropIndicator(clientY) {
    const tabs = mapTabsContainer.querySelectorAll('.map-tab');
    const containerRect = mapTabsContainer.getBoundingClientRect();
    const relativeY = clientY - containerRect.top;
    tabs.forEach(t => t.classList.remove('drop-before', 'drop-after'));
    let bestTab = null;
    let bestDist = Infinity;
    let insertAfter = false;
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (tab.dataset.index === String(dragSrcIndex))
            continue;
        const r = tab.getBoundingClientRect();
        const top = r.top - containerRect.top;
        const bottom = r.bottom - containerRect.top;
        const mid = top + r.height / 2;
        if (relativeY < mid) {
            const dist = Math.abs(relativeY - top);
            if (dist < bestDist) {
                bestDist = dist;
                bestTab = tab;
                insertAfter = false;
            }
        }
        else {
            const dist = Math.abs(relativeY - bottom);
            if (dist < bestDist) {
                bestDist = dist;
                bestTab = tab;
                insertAfter = true;
            }
        }
    }
    if (bestTab) {
        if (insertAfter)
            bestTab.classList.add('drop-after');
        else
            bestTab.classList.add('drop-before');
    }
    if (!bestTab)
        return maps.length;
    return insertAfter ? parseInt(bestTab.dataset.index, 10) + 1 : parseInt(bestTab.dataset.index, 10);
}
function clearDropIndicators() {
    mapTabsContainer.querySelectorAll('.map-tab.drop-before, .map-tab.drop-after').forEach(el => {
        el.classList.remove('drop-before', 'drop-after');
    });
}
mapTabsContainer.addEventListener('dragstart', (e) => {
    const tab = e.target.closest('.map-tab');
    if (!tab)
        return;
    dragSrcIndex = parseInt(tab.dataset.index, 10);
    e.dataTransfer.effectAllowed = 'move';
    const gapSize = tab.offsetHeight + 4;
    mapTabsContainer.style.setProperty('--drop-gap', gapSize + 'px');
    tab.querySelectorAll('.map-tab-name, .map-tab-del').forEach(el => el.style.pointerEvents = 'none');
});
mapTabsContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSrcIndex === null)
        return;
    updateDropIndicator(e.clientY);
});
mapTabsContainer.addEventListener('dragleave', (e) => {
    const related = e.relatedTarget;
    if (!related || !mapTabsContainer.contains(related))
        clearDropIndicators();
});
mapTabsContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    clearDropIndicators();
    if (dragSrcIndex === null)
        return;
    const clientY = e.clientY;
    const tabs = mapTabsContainer.querySelectorAll('.map-tab');
    const containerRect = mapTabsContainer.getBoundingClientRect();
    const relativeY = clientY - containerRect.top;
    let bestTab = null;
    let bestDist = Infinity;
    let insertAfter = false;
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (tab.dataset.index === String(dragSrcIndex))
            continue;
        const r = tab.getBoundingClientRect();
        const top = r.top - containerRect.top;
        const bottom = r.bottom - containerRect.top;
        const mid = top + r.height / 2;
        const dist = Math.abs(relativeY - (relativeY < mid ? top : bottom));
        if (dist < bestDist) {
            bestDist = dist;
            bestTab = tab;
            insertAfter = relativeY >= mid;
        }
    }
    const idx = bestTab ? (insertAfter ? parseInt(bestTab.dataset.index, 10) + 1 : parseInt(bestTab.dataset.index, 10)) : maps.length;
    const adjustedTo = idx > dragSrcIndex ? idx - 1 : idx;
    if (adjustedTo === dragSrcIndex) {
        dragSrcIndex = null;
        return;
    }
    const [moved] = maps.splice(dragSrcIndex, 1);
    maps.splice(adjustedTo, 0, moved);
    if (dragSrcIndex === currentMapIndex)
        currentMapIndex = adjustedTo;
    else {
        if (dragSrcIndex < currentMapIndex && adjustedTo >= currentMapIndex)
            currentMapIndex--;
        else if (dragSrcIndex > currentMapIndex && adjustedTo <= currentMapIndex)
            currentMapIndex++;
    }
    dragSrcIndex = null;
    renderMapTabs();
    drawMap();
    updateProjectUI();
});
mapTabsContainer.addEventListener('dragend', () => {
    clearDropIndicators();
    mapTabsContainer.querySelectorAll('.map-tab').forEach(el => {
        el.querySelectorAll('.map-tab-name, .map-tab-del').forEach(c => c.style.pointerEvents = '');
    });
    dragSrcIndex = null;
});
function switchToMap(index) {
    if (index < 0 || index >= maps.length)
        return;
    currentMapIndex = index;
    const entry = getCurrentMapEntry();
    CONFIG.mapCols = entry.mapCols;
    CONFIG.mapRows = entry.mapRows;
    CONFIG.mapW = entry.mapCols * CONFIG.tileSize;
    CONFIG.mapH = entry.mapRows * CONFIG.tileSize;
    mapCanvas.width = CONFIG.mapW * CONFIG.scale;
    mapCanvas.height = CONFIG.mapH * CONFIG.scale;
    renderMapTabs();
    drawMap();
    updateProjectUI();
}
function addNewMap() {
    const defaultCols = CONFIG.mapCols || 20;
    const defaultRows = CONFIG.mapRows || 16;
    const name = 'Level ' + (maps.length + 1);
    const entry = { name, map: createEmptyGrid(defaultCols, defaultRows), mapCols: defaultCols, mapRows: defaultRows };
    maps.push(entry);
    switchToMap(maps.length - 1);
    showToast('Map added: ' + name, 'success');
}
let renameMapIndex = -1;
function startRenameMap(index) {
    const entry = maps[index];
    if (!entry)
        return;
    renameMapIndex = index;
    const input = document.getElementById('input-rename-map');
    const label = document.getElementById('rename-map-label');
    input.value = entry.name;
    label.textContent = 'Rename "' + entry.name + '"';
    document.getElementById('rename-map-overlay').classList.remove('hidden');
    input.focus();
    input.select();
}
function finishRenameMap() {
    if (renameMapIndex < 0 || renameMapIndex >= maps.length) {
        document.getElementById('rename-map-overlay').classList.add('hidden');
        renameMapIndex = -1;
        return;
    }
    const input = document.getElementById('input-rename-map');
    const newName = input.value.trim();
    if (newName && newName !== maps[renameMapIndex].name) {
        maps[renameMapIndex].name = newName;
        renderMapTabs();
        updateProjectUI();
    }
    document.getElementById('rename-map-overlay').classList.add('hidden');
    renameMapIndex = -1;
}
let deleteMapIndex = -1;
function deleteMap(index) {
    if (maps.length <= 1) {
        showToast('Cannot delete the last map', 'error');
        return;
    }
    const entry = maps[index];
    if (!entry)
        return;
    deleteMapIndex = index;
    document.getElementById('delete-map-message').textContent = `Delete "${entry.name}"? This cannot be undone.`;
    document.getElementById('delete-map-overlay').classList.remove('hidden');
}
function confirmDeleteMap() {
    if (deleteMapIndex < 0 || deleteMapIndex >= maps.length) {
        document.getElementById('delete-map-overlay').classList.add('hidden');
        deleteMapIndex = -1;
        return;
    }
    const entry = maps[deleteMapIndex];
    maps.splice(deleteMapIndex, 1);
    if (currentMapIndex >= maps.length)
        currentMapIndex = maps.length - 1;
    if (currentMapIndex === deleteMapIndex && deleteMapIndex > 0)
        currentMapIndex = deleteMapIndex - 1;
    else if (currentMapIndex === deleteMapIndex)
        currentMapIndex = 0;
    switchToMap(currentMapIndex);
    showToast('Map deleted: ' + entry.name, 'success');
    document.getElementById('delete-map-overlay').classList.add('hidden');
    deleteMapIndex = -1;
}
// ─── DEFAULT BITS ─────────────────────────────────────────────────────────────
function ensureBits() {
    while (bitsConfig.bits.length < TOTAL_BITS) {
        bitsConfig.bits.push({ name: '', color: '#888888' });
    }
    bitsConfig.bits = bitsConfig.bits.slice(0, TOTAL_BITS);
}
// ─── Toast ─────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'success', durationMs = 2500) {
    const el = document.getElementById('toast');
    if (toastTimer)
        clearTimeout(toastTimer);
    el.textContent = message;
    el.className = 'toast ' + type;
    void el.offsetWidth;
    el.classList.remove('hidden');
    toastTimer = setTimeout(() => { el.classList.add('hidden'); toastTimer = null; }, durationMs);
}
// ─── Project management ───────────────────────────────────────────────────────
function updateProjectUI() {
    const nameEl = document.getElementById('project-name');
    nameEl.textContent = currentProjectName;
    const mapDims = document.getElementById('map-dims');
    mapDims.textContent = projectLoaded
        ? `${CONFIG.mapCols}×${CONFIG.mapRows} — ${CONFIG.mapCols * CONFIG.tileSize}×${CONFIG.mapRows * CONFIG.tileSize} px`
        : '—';
    const sheetDims = document.getElementById('tilesheet-dims');
    sheetDims.textContent = projectLoaded
        ? `${CONFIG.tilesheetCols}×${CONFIG.tilesheetRows} tiles — ${CONFIG.tileSize}×${CONFIG.tileSize} px each`
        : '—';
}
function loadTilesheetFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { tilesheet = img; projectLoaded = true; resolve(); };
        img.onerror = () => { reject(new Error('Failed to load tilesheet image')); };
        img.src = dataUrl;
    });
}
function clearEditor() {
    setPreviewEnabled(false);
    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    tilesCtx.clearRect(0, 0, tilesCanvas.width, tilesCanvas.height);
    maps = [];
    currentMapIndex = 0;
    activeBitIndex = 0;
    bitsConfig = { bits: [], tileFlags: new Array(MAX_TILES).fill(0) };
    for (let i = 0; i < MAX_TILES; i++)
        tileFlags[i] = 0;
    flagsColumn.innerHTML = '';
    sheetHover = { col: -1, row: -1 };
    mapHover = { col: -1, row: -1 };
    activeTile = 0;
    renderMapTabs();
    updateActiveDisplay();
    updateProjectUI();
}
async function createNewProject(projectName, folderPath, pngDataUrl, pngFileName, sheetCols, sheetRows, mapCols, mapRows, firstMapName, iffData, bitplanes) {
    CONFIG.mapCols = mapCols;
    CONFIG.mapRows = mapRows;
    CONFIG.tilesheetCols = sheetCols;
    CONFIG.tilesheetRows = sheetRows;
    CONFIG.mapW = mapCols * CONFIG.tileSize;
    CONFIG.mapH = mapRows * CONFIG.tileSize;
    CONFIG.sheetW = sheetCols * CONFIG.tileSize;
    CONFIG.sheetH = sheetRows * CONFIG.tileSize;
    mapCanvas.width = CONFIG.mapW * CONFIG.scale;
    mapCanvas.height = CONFIG.mapH * CONFIG.scale;
    tilesCanvas.width = CONFIG.sheetW * CONFIG.scale;
    tilesCanvas.height = CONFIG.sheetH * CONFIG.scale;
    const initialMap = { name: firstMapName, map: createEmptyGrid(mapCols, mapRows), mapCols, mapRows };
    maps = [initialMap];
    currentMapIndex = 0;
    for (let i = 0; i < MAX_TILES; i++)
        tileFlags[i] = 0;
    bitsConfig = {
        bits: [
            { name: '', color: '#888888' }, { name: '', color: '#888888' }, { name: '', color: '#888888' }, { name: '', color: '#888888' },
            { name: '', color: '#888888' }, { name: '', color: '#888888' }, { name: '', color: '#888888' }, { name: '', color: '#888888' },
            { name: '', color: '#888888' }, { name: '', color: '#888888' }, { name: '', color: '#888888' }, { name: '', color: '#888888' },
            { name: '', color: '#888888' }, { name: '', color: '#888888' }, { name: '', color: '#888888' }, { name: '', color: '#888888' },
        ],
        tileFlags: new Array(MAX_TILES).fill(0)
    };
    ensureBits();
    const resultPath = await editorApi.createProject({ projectName, folderPath, pngDataUrl, pngFileName,
        maps: maps.map(m => ({ ...m, map: m.map.map(row => [...row]) })),
        bits: bitsConfig.bits, tileFlags: [...tileFlags],
        tilesheetCols: CONFIG.tilesheetCols, tilesheetRows: CONFIG.tilesheetRows,
        iffData, convBitplanes: bitplanes
    });
    if (!resultPath) {
        console.error('Failed to create project folder');
        return false;
    }
    try {
        await loadTilesheetFromDataUrl(pngDataUrl);
    }
    catch (err) {
        console.error(err);
        return false;
    }
    currentProjectPath = resultPath;
    currentProjectName = projectName;
    currentPngFileName = pngFileName;
    const parentFolder = folderPath.substring(0, folderPath.lastIndexOf('/'));
    if (parentFolder)
        localStorage.setItem('lastProjectFolder', parentFolder);
    activeBitIndex = 0;
    renderMapTabs();
    renderFlagsUI();
    drawTilesheet();
    drawMap();
    updateActiveDisplay();
    updateProjectUI();
    showToast('Project created: ' + projectName, 'success');
    return true;
}
async function saveProject() {
    if (!projectLoaded || !tilesheet || !currentProjectPath) {
        console.warn('No project to save');
        return;
    }
    const projectName = currentProjectName.replace(/\.project$/, '');
    const success = await editorApi.saveProjectFile({
        projectFolder: currentProjectPath, projectName, pngFileName: currentPngFileName,
        maps: maps.map(m => ({ ...m, map: m.map.map(row => [...row]) })),
        bits: bitsConfig.bits, tileFlags: [...tileFlags],
        tilesheetCols: CONFIG.tilesheetCols, tilesheetRows: CONFIG.tilesheetRows,
        convBitplanes
    });
    if (success) {
        updateProjectUI();
        showToast('Project saved', 'success');
    }
    else
        showToast('Failed to save project', 'error');
}
async function loadProject() {
    const saved = localStorage.getItem('lastProjectFolder') || undefined;
    const result = await editorApi.loadProject(saved);
    if (!result) {
        showToast('Load cancelled', 'error');
        return;
    }
    await applyLoadedProject(result);
}
async function applyLoadedProject(result) {
    const { projectFolder, projectName, data } = result;
    CONFIG.tilesheetCols = data.tilesheetCols;
    CONFIG.tilesheetRows = data.tilesheetRows;
    CONFIG.sheetW = data.tilesheetCols * CONFIG.tileSize;
    CONFIG.sheetH = data.tilesheetRows * CONFIG.tileSize;
    tilesCanvas.width = CONFIG.sheetW * CONFIG.scale;
    tilesCanvas.height = CONFIG.sheetH * CONFIG.scale;
    if (data.maps && Array.isArray(data.maps) && data.maps.length > 0) {
        maps = data.maps.map((m) => ({ name: m.name || 'Level', map: m.map.map((row) => [...row]), mapCols: m.mapCols, mapRows: m.mapRows }));
    }
    else if (data.map && Array.isArray(data.map)) {
        const mCols = data.mapCols || CONFIG.mapCols;
        const mRows = data.mapRows || CONFIG.mapRows;
        const legacyMap = [];
        for (let r = 0; r < Math.min(data.map.length, mRows); r++) {
            legacyMap[r] = [];
            for (let c = 0; c < Math.min(data.map[r].length, mCols); c++)
                legacyMap[r][c] = data.map[r][c];
        }
        maps = [{ name: 'Level 1', map: legacyMap, mapCols: mCols, mapRows: mRows }];
    }
    else {
        showToast('Project file has no map data!', 'error');
        return;
    }
    currentMapIndex = 0;
    const entry = getCurrentMapEntry();
    CONFIG.mapCols = entry.mapCols;
    CONFIG.mapRows = entry.mapRows;
    CONFIG.mapW = entry.mapCols * CONFIG.tileSize;
    CONFIG.mapH = entry.mapRows * CONFIG.tileSize;
    mapCanvas.width = CONFIG.mapW * CONFIG.scale;
    mapCanvas.height = CONFIG.mapH * CONFIG.scale;
    bitsConfig = { bits: data.bits, tileFlags: data.tileFlags };
    ensureBits();
    for (let i = 0; i < Math.min(data.tileFlags.length, MAX_TILES); i++)
        tileFlags[i] = data.tileFlags[i];
    const pngPath = projectFolder + '/' + data.pngFileName;
    const pngDataUrl = await editorApi.loadPngFile(pngPath);
    if (!pngDataUrl) {
        console.error('Failed to load tilesheet from project folder');
        return;
    }
    try {
        await loadTilesheetFromDataUrl(pngDataUrl);
    }
    catch (err) {
        console.error('Failed to decode tilesheet:', err);
        return;
    }
    currentProjectPath = projectFolder;
    currentProjectName = projectName;
    currentPngFileName = data.pngFileName || 'tilesheet.png';
    const parentFolder = projectFolder.substring(0, projectFolder.lastIndexOf('/'));
    if (parentFolder)
        localStorage.setItem('lastProjectFolder', parentFolder);
    activeBitIndex = 0;
    renderMapTabs();
    renderFlagsUI();
    drawTilesheet();
    drawMap();
    updateActiveDisplay();
    updateProjectUI();
    if (data.convBitplanes !== undefined) {
        convBitplanes = data.convBitplanes;
    }
    const hasExport = await editorApi.checkAmigaExport(projectFolder);
    setPreviewEnabled(hasExport);
    showToast('Project loaded: ' + projectName, 'success');
}
// ─── DRAWING ──────────────────────────────────────────────────────────────────
function tileSourceXY(tileIdx) {
    const sx = (tileIdx % CONFIG.tilesheetCols) * CONFIG.tileSize;
    const sy = Math.floor(tileIdx / CONFIG.tilesheetCols) * CONFIG.tileSize;
    return { sx, sy };
}
function tileDisplayXY(tileIdx) {
    const base = tileSourceXY(tileIdx);
    return { sx: base.sx * CONFIG.scale, sy: base.sy * CONFIG.scale };
}
function drawMap() {
    mapCtx.clearRect(0, 0, CONFIG.mapW * CONFIG.scale, CONFIG.mapH * CONFIG.scale);
    if (!projectLoaded || !tilesheet)
        return;
    const curMap = getCurrentMap();
    if (!curMap)
        return;
    for (let r = 0; r < CONFIG.mapRows; r++) {
        for (let c = 0; c < CONFIG.mapCols; c++) {
            const tileIdx = curMap[r]?.[c] ?? 0;
            const { sx, sy } = tileSourceXY(tileIdx);
            mapCtx.drawImage(tilesheet, sx, sy, CONFIG.tileSize, CONFIG.tileSize, c * CONFIG.dTile, r * CONFIG.dTile, CONFIG.dTile, CONFIG.dTile);
        }
    }
    drawMapGrid();
    if (bitsOnMapCheckbox.checked)
        drawMapFlagDots();
    drawMapGhost();
}
function drawMapGhost() {
    if (mapHover.col < 0 || mapHover.row < 0)
        return;
    if (!tilesheet)
        return;
    const { sx, sy } = tileSourceXY(activeTile);
    mapCtx.globalAlpha = 0.5;
    mapCtx.drawImage(tilesheet, sx, sy, CONFIG.tileSize, CONFIG.tileSize, mapHover.col * CONFIG.dTile, mapHover.row * CONFIG.dTile, CONFIG.dTile, CONFIG.dTile);
    mapCtx.globalAlpha = 1.0;
    mapCtx.strokeStyle = '#ffd700';
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(mapHover.col * CONFIG.dTile + 0.5, mapHover.row * CONFIG.dTile + 0.5, CONFIG.dTile - 1, CONFIG.dTile - 1);
}
function drawMapGrid() {
    mapCtx.strokeStyle = 'rgba(233, 69, 96, 0.35)';
    mapCtx.lineWidth = 1;
    const dispW = CONFIG.mapW * CONFIG.scale;
    const dispH = CONFIG.mapH * CONFIG.scale;
    for (let x = 0; x <= dispW; x += CONFIG.dTile) {
        mapCtx.beginPath();
        mapCtx.moveTo(x, 0);
        mapCtx.lineTo(x, dispH);
        mapCtx.stroke();
    }
    for (let y = 0; y <= dispH; y += CONFIG.dTile) {
        mapCtx.beginPath();
        mapCtx.moveTo(0, y);
        mapCtx.lineTo(dispW, y);
        mapCtx.stroke();
    }
}
function drawMapFlagDots() {
    const curMap = getCurrentMap();
    if (!curMap)
        return;
    const bits = bitsConfig.bits;
    if (bits.length === 0)
        return;
    const dotR = Math.max(1.5, CONFIG.dTile * 0.08);
    const pad = dotR + 1;
    const perRow = 4;
    mapCtx.save();
    for (let r = 0; r < CONFIG.mapRows; r++) {
        for (let c = 0; c < CONFIG.mapCols; c++) {
            const tileIdx = curMap[r][c];
            const mask = tileFlags[tileIdx];
            if (mask === 0)
                continue;
            const cellX = c * CONFIG.dTile;
            const cellY = r * CONFIG.dTile;
            let dotIdx = 0;
            for (let b = 0; b < TOTAL_BITS; b++) {
                if (!hasBit(tileIdx, b))
                    continue;
                const rx = dotIdx % perRow;
                const ry = Math.floor(dotIdx / perRow);
                const dx = cellX + pad + rx * dotR * 2.5;
                const dy = cellY + pad + ry * dotR * 2.5;
                mapCtx.fillStyle = bits[b].color;
                mapCtx.beginPath();
                mapCtx.arc(dx, dy, dotR, 0, Math.PI * 2);
                mapCtx.fill();
                mapCtx.strokeStyle = '#000';
                mapCtx.lineWidth = 0.5;
                mapCtx.stroke();
                dotIdx++;
            }
        }
    }
    mapCtx.restore();
}
function drawTilesheet() {
    tilesCtx.clearRect(0, 0, tilesCanvas.width, tilesCanvas.height);
    if (!projectLoaded || !tilesheet)
        return;
    tilesCtx.drawImage(tilesheet, 0, 0, CONFIG.sheetW, CONFIG.sheetH, 0, 0, CONFIG.sheetW * CONFIG.scale, CONFIG.sheetH * CONFIG.scale);
    drawFlagDots();
    drawTilesheetGrid();
    drawSheetHover();
    drawActiveHighlight();
}
function drawFlagDots() {
    const bits = bitsConfig.bits;
    if (bits.length === 0)
        return;
    const dotR = Math.max(1.5, CONFIG.dTile * 0.08);
    const pad = dotR + 1;
    const perRow = 4;
    tilesCtx.save();
    for (let idx = 0; idx < MAX_TILES; idx++) {
        const mask = tileFlags[idx];
        if (mask === 0)
            continue;
        const col = idx % CONFIG.tilesheetCols;
        const row = Math.floor(idx / CONFIG.tilesheetCols);
        const cellX = col * CONFIG.dTile;
        const cellY = row * CONFIG.dTile;
        let dotIdx = 0;
        for (let b = 0; b < TOTAL_BITS; b++) {
            if (!hasBit(idx, b))
                continue;
            const rx = dotIdx % perRow;
            const ry = Math.floor(dotIdx / perRow);
            const dx = cellX + pad + rx * dotR * 2.5;
            const dy = cellY + pad + ry * dotR * 2.5;
            tilesCtx.fillStyle = bits[b].color;
            tilesCtx.beginPath();
            tilesCtx.arc(dx, dy, dotR, 0, Math.PI * 2);
            tilesCtx.fill();
            tilesCtx.strokeStyle = '#000';
            tilesCtx.lineWidth = 0.5;
            tilesCtx.stroke();
            dotIdx++;
        }
    }
    tilesCtx.restore();
}
function drawSheetHover() {
    if (sheetHover.col < 0 || sheetHover.row < 0)
        return;
    const sx = sheetHover.col * CONFIG.dTile;
    const sy = sheetHover.row * CONFIG.dTile;
    tilesCtx.strokeStyle = '#ffd700';
    tilesCtx.lineWidth = 2;
    tilesCtx.strokeRect(sx + 0.5, sy + 0.5, CONFIG.dTile - 1, CONFIG.dTile - 1);
}
function drawTilesheetGrid() {
    tilesCtx.strokeStyle = 'rgba(15, 52, 96, 0.7)';
    tilesCtx.lineWidth = 1;
    const dispW = CONFIG.sheetW * CONFIG.scale;
    const dispH = CONFIG.sheetH * CONFIG.scale;
    for (let x = 0; x <= dispW; x += CONFIG.dTile) {
        tilesCtx.beginPath();
        tilesCtx.moveTo(x, 0);
        tilesCtx.lineTo(x, dispH);
        tilesCtx.stroke();
    }
    for (let y = 0; y <= dispH; y += CONFIG.dTile) {
        tilesCtx.beginPath();
        tilesCtx.moveTo(0, y);
        tilesCtx.lineTo(dispW, y);
        tilesCtx.stroke();
    }
}
function drawActiveHighlight() {
    const { sx, sy } = tileDisplayXY(activeTile);
    tilesCtx.strokeStyle = '#e94560';
    tilesCtx.lineWidth = 2.5;
    tilesCtx.strokeRect(sx + 1, sy + 1, CONFIG.dTile - 2, CONFIG.dTile - 2);
}
function updateActiveDisplay() {
    const col = activeTile % CONFIG.tilesheetCols;
    const row = Math.floor(activeTile / CONFIG.tilesheetCols);
    const setNames = [];
    for (let b = 0; b < TOTAL_BITS; b++) {
        if (hasBit(activeTile, b)) {
            const name = bitsConfig.bits[b]?.name || `bit${b}`;
            setNames.push(name);
        }
    }
    const flagStr = setNames.length > 0 ? setNames.join('|') : '-';
    activeTileSpan.textContent = `${activeTile} (${col},${row}) flags:[${flagStr}]`;
}
// ─── Flags UI ─────────────────────────────────────────────────────────────────
function renderFlagsUI() {
    flagsColumn.innerHTML = '';
    for (let i = 0; i < TOTAL_BITS; i++) {
        const bit = bitsConfig.bits[i];
        const isActive = i === activeBitIndex;
        const row = document.createElement('div');
        row.className = 'flag-row' + (isActive ? ' active' : '');
        if (!bit.name)
            row.classList.add('unused');
        row.dataset.bitIndex = String(i);
        const numSpan = document.createElement('span');
        numSpan.className = 'flag-bit-num';
        numSpan.textContent = String(i);
        row.appendChild(numSpan);
        const colorWrap = document.createElement('label');
        colorWrap.className = 'flag-color';
        colorWrap.style.backgroundColor = bit.color;
        colorWrap.title = `Bit ${i} color`;
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = bit.color;
        colorInput.addEventListener('input', (e) => {
            const newColor = e.target.value;
            bitsConfig.bits[i].color = newColor;
            colorWrap.style.backgroundColor = newColor;
            saveBitsConfig();
            drawTilesheet();
            drawMap();
        });
        colorInput.addEventListener('click', (e) => e.stopPropagation());
        colorWrap.appendChild(colorInput);
        row.appendChild(colorWrap);
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'flag-name';
        nameInput.value = bit.name;
        nameInput.placeholder = `bit ${i}`;
        nameInput.maxLength = 30;
        nameInput.addEventListener('input', () => {
            bitsConfig.bits[i].name = nameInput.value;
            saveBitsConfig();
            drawTilesheet();
            drawMap();
            updateActiveDisplay();
            if (nameInput.value)
                row.classList.remove('unused');
            else
                row.classList.add('unused');
        });
        nameInput.addEventListener('click', (e) => e.stopPropagation());
        row.appendChild(nameInput);
        row.addEventListener('click', () => { activeBitIndex = i; renderFlagsUI(); });
        flagsColumn.appendChild(row);
    }
}
async function saveBitsConfig() {
    try {
        await editorApi.saveFullConfig(bitsConfig.bits, tileFlags);
    }
    catch (err) {
        console.error('Failed to save full config:', err);
    }
}
// ─── Tile index helpers ───────────────────────────────────────────────────────
function tileIndexFromCoord(col, row) {
    return row * CONFIG.tilesheetCols + col;
}
function canvasCoords(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}
function cellFromPoint(p) {
    return { col: Math.floor(p.x / CONFIG.dTile), row: Math.floor(p.y / CONFIG.dTile) };
}
function isCellInBounds(coord, cols, rows) {
    return coord.col >= 0 && coord.col < cols && coord.row >= 0 && coord.row < rows;
}
function placeTileOnMap(p) {
    const curMap = getCurrentMap();
    if (!curMap)
        return;
    const cell = cellFromPoint(p);
    if (!isCellInBounds(cell, CONFIG.mapCols, CONFIG.mapRows))
        return;
    const key = `${cell.row},${cell.col}`;
    if (key === lastPlaced)
        return;
    lastPlaced = key;
    curMap[cell.row][cell.col] = activeTile;
    drawMap();
}
// ─── Event handlers ───────────────────────────────────────────────────────────
tilesCanvas.addEventListener('mousedown', (e) => {
    const p = canvasCoords(e, tilesCanvas);
    const cell = cellFromPoint(p);
    if (!isCellInBounds(cell, CONFIG.tilesheetCols, CONFIG.tilesheetRows))
        return;
    if (e.button === 0) {
        activeTile = tileIndexFromCoord(cell.col, cell.row);
        updateActiveDisplay();
        drawTilesheet();
    }
    else if (e.button === 2) {
        const idx = tileIndexFromCoord(cell.col, cell.row);
        toggleBit(idx, activeBitIndex);
        saveBitsConfig();
        updateActiveDisplay();
        drawTilesheet();
        drawMap();
    }
});
tilesCanvas.addEventListener('mousemove', (e) => {
    const p = canvasCoords(e, tilesCanvas);
    const cell = cellFromPoint(p);
    sheetHover = isCellInBounds(cell, CONFIG.tilesheetCols, CONFIG.tilesheetRows) ? cell : { col: -1, row: -1 };
    drawTilesheet();
});
tilesCanvas.addEventListener('mouseleave', () => { sheetHover = { col: -1, row: -1 }; drawTilesheet(); });
mapCanvas.addEventListener('mousedown', (e) => { mouseDown = true; lastPlaced = null; placeTileOnMap(canvasCoords(e, mapCanvas)); });
window.addEventListener('mouseup', () => { mouseDown = false; lastPlaced = null; });
mapCanvas.addEventListener('mousemove', (e) => {
    const p = canvasCoords(e, mapCanvas);
    const cell = cellFromPoint(p);
    mapHover = isCellInBounds(cell, CONFIG.mapCols, CONFIG.mapRows) ? cell : { col: -1, row: -1 };
    if (mouseDown)
        placeTileOnMap(p);
    else
        drawMap();
});
mapCanvas.addEventListener('mouseleave', () => { mapHover = { col: -1, row: -1 }; drawMap(); });
[mapCanvas, tilesCanvas].forEach(c => c.addEventListener('contextmenu', (e) => e.preventDefault()));
// ─── IFF building helpers ─────────────────────────────────────────────────────
function putU16BE(buf, offset, value) {
    buf[offset] = (value >> 8) & 0xFF;
    buf[offset + 1] = value & 0xFF;
}
function putU32BE(buf, offset, value) {
    buf[offset] = (value >> 24) & 0xFF;
    buf[offset + 1] = (value >> 16) & 0xFF;
    buf[offset + 2] = (value >> 8) & 0xFF;
    buf[offset + 3] = value & 0xFF;
}
function buildMapBinary() {
    const curMap = getCurrentMap();
    if (!curMap)
        return new Uint8Array(0);
    const numTiles = MAX_TILES;
    const headerSize = 12;
    const gridSize = CONFIG.mapCols * CONFIG.mapRows * 2;
    const flagsSize = numTiles * 2;
    const totalSize = headerSize + gridSize + flagsSize;
    const buf = new Uint8Array(totalSize);
    buf[0] = 0x41;
    buf[1] = 0x42;
    buf[2] = 0x33;
    buf[3] = 0x4D;
    putU16BE(buf, 4, 1);
    putU16BE(buf, 6, CONFIG.mapCols);
    putU16BE(buf, 8, CONFIG.mapRows);
    putU16BE(buf, 10, numTiles);
    let off = headerSize;
    for (let r = 0; r < CONFIG.mapRows; r++) {
        for (let c = 0; c < CONFIG.mapCols; c++) {
            putU16BE(buf, off, curMap[r]?.[c] ?? 0);
            off += 2;
        }
    }
    for (let i = 0; i < numTiles; i++) {
        putU16BE(buf, off, tileFlags[i]);
        off += 2;
    }
    return buf;
}
function buildIffTilesheet() {
    if (!tilesheet)
        throw new Error('No tilesheet loaded');
    const w = CONFIG.sheetW;
    const h = CONFIG.sheetH;
    const bytesPerRow = ((w + 15) >> 4) << 1;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(tilesheet, 0, 0, w, h, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const pixels = imgData.data;
    const body = new Uint8Array(h * bytesPerRow);
    for (let y = 0; y < h; y++) {
        const rowOff = y * bytesPerRow;
        for (let x = 0; x < w; x++) {
            const pxOff = (y * w + x) * 4;
            const r = pixels[pxOff], g = pixels[pxOff + 1], b = pixels[pxOff + 2];
            if (r > 127 || g > 127 || b > 127) {
                const byteIdx = x >> 3;
                const bitIdx = 7 - (x & 7);
                body[rowOff + byteIdx] |= (1 << bitIdx);
            }
        }
    }
    function iffChunk(type, data) {
        const out = new Uint8Array(8 + data.length);
        for (let i = 0; i < 4; i++)
            out[i] = type.charCodeAt(i);
        putU32BE(out, 4, data.length);
        out.set(data, 8);
        return out;
    }
    const bmhd = new Uint8Array(20);
    putU16BE(bmhd, 0, w);
    putU16BE(bmhd, 2, h);
    putU16BE(bmhd, 4, 0);
    putU16BE(bmhd, 6, 0);
    bmhd[8] = 1;
    bmhd[9] = 0;
    bmhd[10] = 0;
    bmhd[11] = 0;
    putU16BE(bmhd, 12, 0);
    bmhd[14] = 44;
    bmhd[15] = 52;
    putU16BE(bmhd, 16, w);
    putU16BE(bmhd, 18, h);
    const cmap = new Uint8Array([0, 0, 0, 255, 255, 255]);
    const bmhdChunk = iffChunk('BMHD', bmhd);
    const cmapChunk = iffChunk('CMAP', cmap);
    const bodyChunk = iffChunk('BODY', body);
    const ilbmInner = new Uint8Array(4 + bmhdChunk.length + cmapChunk.length + bodyChunk.length);
    let p = 0;
    ilbmInner.set([0x49, 0x4C, 0x42, 0x4D], p);
    p += 4;
    ilbmInner.set(bmhdChunk, p);
    p += bmhdChunk.length;
    ilbmInner.set(cmapChunk, p);
    p += cmapChunk.length;
    ilbmInner.set(bodyChunk, p);
    p += bodyChunk.length;
    const form = new Uint8Array(8 + ilbmInner.length);
    form.set([0x46, 0x4F, 0x52, 0x4D], 0);
    putU32BE(form, 4, ilbmInner.length);
    form.set(ilbmInner, 8);
    return form;
}
function buildAmiBlitz3Loader() {
    const mapW = CONFIG.mapCols;
    const mapH = CONFIG.mapRows;
    const sheetW = CONFIG.sheetW;
    const sheetH = CONFIG.sheetH;
    const tileSize = CONFIG.tileSize;
    const maxTiles = MAX_TILES;
    const tilesheetCols = CONFIG.tilesheetCols;
    const bitComments = bitsConfig.bits.map((b, i) => `;   Bit ${i}: ${b.name || '(unused)'}`).join('\n');
    const curMap = getCurrentMap();
    const gridDataLines = [];
    const allGridVals = [];
    for (let r = 0; r < mapH; r++) {
        for (let c = 0; c < mapW; c++) {
            allGridVals.push(curMap?.[r]?.[c] ?? 0);
        }
    }
    for (let i = 0; i < allGridVals.length; i += 16) {
        gridDataLines.push(`Data.w ${allGridVals.slice(i, i + 16).join(',')}`);
    }
    const flagChunks = [];
    for (let i = 0; i < maxTiles; i += 16) {
        const chunk = [];
        for (let j = i; j < Math.min(i + 16, maxTiles); j++)
            chunk.push(tileFlags[j]);
        flagChunks.push(`Data.w ${chunk.join(',')}`);
    }
    return `; --------------------------------------------------------------
; RetroMap Map Loader
; Generated by RetroMapEditor -- AmiBlitz3 source
; --------------------------------------------------------------

Dim tilemap.w(${mapW * mapH})
Dim tileFlags.w(${maxTiles})

${bitComments}

BitMap 0, ${sheetW}, ${sheetH}, 2
BitMap 1, 320, 256, 2
LoadBitMap 0, "tiles.iff", 0
Use BitMap 0
BLITZ
Slice 0,44,2

Restore MapData
For i = 0 To ${mapW * mapH - 1}
  Read tmp.w
  tilemap(i) = tmp
Next i

Restore FlagData
For i = 0 To ${maxTiles - 1}
  Read tmp.w
  tileFlags(i) = tmp
Next i

Use Palette 0
Show 1

Use BitMap 1
Cls 0

For y = 0 To ${mapH - 1}
  For x = 0 To ${mapW - 1}
    idx   = y * ${mapW} + x
    tile.w  = tilemap(idx)
    srcX.w  = (tile MOD ${tilesheetCols}) * ${tileSize}
    srcY.w  = tile / ${tilesheetCols}
    srcY  = srcY * ${tileSize}
    dstX  = x * ${tileSize}
    dstY  = y * ${tileSize}
    Use BitMap 0
    GetaShape 0, srcX, srcY, ${tileSize}, ${tileSize}
    Use BitMap 1
    Blit 0, dstX, dstY
  Next x
Next y

While Joyb(0) = 0
  VWait
Wend

End

.MapData:
${gridDataLines.join('\n')}

.FlagData:
${flagChunks.join('\n')}
`;
}
function stringToAmigaBytes(str) {
    const clean = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const buf = new Uint8Array(clean.length);
    for (let i = 0; i < clean.length; i++)
        buf[i] = clean.charCodeAt(i) & 0xFF;
    return buf;
}
// ─── Amiga export preview & export ────────────────────────────────────────────
let cachedPreviewIff = null;
let cachedPreviewMapBin = null;
let cachedPreviewAb3Bytes = null;
let hasExportData = false;
const previewBtn = document.getElementById('tab-level-editor');
function setPreviewEnabled(enabled) {
    hasExportData = enabled;
}
function showAmigaPreview() {
    if (!projectLoaded || !tilesheet || !currentProjectPath) {
        showToast('No project loaded', 'error');
        return;
    }
    cachedPreviewIff = buildIffTilesheet();
    cachedPreviewMapBin = buildMapBinary();
    const ab3raw = buildAmiBlitz3Loader();
    cachedPreviewAb3Bytes = stringToAmigaBytes(ab3raw);
    document.getElementById('iff-info').textContent = `${CONFIG.sheetW}×${CONFIG.sheetH} px, ${formatSize(cachedPreviewIff.length)}`;
    document.getElementById('map-info').textContent = `${CONFIG.mapCols}×${CONFIG.mapRows} tiles, ${formatSize(cachedPreviewMapBin.length)}`;
    const iffCanvas = document.getElementById('iff-preview-canvas');
    const maxDim = 240;
    const scale = Math.min(maxDim / CONFIG.sheetW, maxDim / CONFIG.sheetH, 1);
    iffCanvas.width = Math.round(CONFIG.sheetW * scale);
    iffCanvas.height = Math.round(CONFIG.sheetH * scale);
    const iffCtx = iffCanvas.getContext('2d');
    iffCtx.imageSmoothingEnabled = false;
    iffCtx.drawImage(tilesheet, 0, 0, iffCanvas.width, iffCanvas.height);
    document.getElementById('ab3-preview').value = buildAmiBlitz3Loader();
    document.getElementById('amiga-preview-overlay').classList.remove('hidden');
}
function formatSize(bytes) { return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB'; }
async function doExportAmiga() {
    if (!cachedPreviewIff || !cachedPreviewMapBin || !cachedPreviewAb3Bytes) {
        showToast('Nothing to export', 'error');
        return;
    }
    const success = await editorApi.exportAmiga({
        projectFolder: currentProjectPath,
        iffData: Array.from(cachedPreviewIff),
        mapBinData: Array.from(cachedPreviewMapBin),
        ab3Source: buildAmiBlitz3Loader()
    });
    if (success) {
        setPreviewEnabled(true);
        showToast('Exported to amiga', 'success');
        document.getElementById('amiga-preview-overlay').classList.add('hidden');
    }
    else
        showToast('Export failed', 'error');
}
// ─── Bits-on-map toggle ────────────────────────────────────────────────────
bitsOnMapCheckbox.addEventListener('change', () => {
    localStorage.setItem('bitsOnMap', bitsOnMapCheckbox.checked ? '1' : '0');
    drawMap();
});
// ─── Modal event handlers ──────────────────────────────────────────────────
let pickedPngDataUrl = null;
let pickedPngFileName = '';
let pickedFolderPath = null;
let modalIffBytes = null;
let modalBp = 4;
let projectModalMode = 'create';
const modalBpSlider = document.getElementById('modal-bitplanes');
const modalBpLabel = document.getElementById('modal-bp-label');
const modalColorsLabel = document.getElementById('modal-colors-label');
const modalIffPreviewRow = document.getElementById('modal-iff-preview-row');
const modalPngPreviewCanvas = document.getElementById('modal-png-preview-canvas');
const modalIffPreviewCanvas = document.getElementById('modal-iff-preview-canvas');
modalBpSlider.addEventListener('input', () => {
    modalBp = parseInt(modalBpSlider.value);
    const colors = 1 << modalBp;
    modalBpLabel.textContent = String(modalBp);
    modalColorsLabel.textContent = `${colors} color${modalBp !== 1 ? 's' : ''}`;
    if (pickedPngDataUrl)
        updateModalIffPreview();
});
function updateModalIffPreview() {
    if (!pickedPngDataUrl)
        return;
    const img = new Image();
    img.onload = () => {
        const result = pngToIffMulti(img, modalBp);
        modalIffBytes = result.iff;
        const { palette, indexMap } = result;
        const w = img.width;
        const h = img.height;
        // Build full-resolution quantized image on a temp canvas
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const tctx = tmp.getContext('2d');
        const imageData = tctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            const idx = indexMap[i];
            const colOff = idx * 3;
            const pxOff = i * 4;
            imageData.data[pxOff] = palette[colOff];
            imageData.data[pxOff + 1] = palette[colOff + 1];
            imageData.data[pxOff + 2] = palette[colOff + 2];
            imageData.data[pxOff + 3] = 255;
        }
        tctx.putImageData(imageData, 0, 0);
        // Scale to fit 200px
        const maxDim = 200;
        const scale = Math.min(maxDim / w, maxDim / h, 1);
        const dw = Math.round(w * scale);
        const dh = Math.round(h * scale);
        modalIffPreviewCanvas.width = dw;
        modalIffPreviewCanvas.height = dh;
        const ctx = modalIffPreviewCanvas.getContext('2d');
        ctx.clearRect(0, 0, dw, dh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, w, h, 0, 0, dw, dh);
        modalIffPreviewCanvas.style.display = 'block';
        // Also draw original PNG for comparison
        modalPngPreviewCanvas.width = dw;
        modalPngPreviewCanvas.height = dh;
        const pngCtx = modalPngPreviewCanvas.getContext('2d');
        pngCtx.clearRect(0, 0, dw, dh);
        pngCtx.imageSmoothingEnabled = false;
        pngCtx.drawImage(img, 0, 0, w, h, 0, 0, dw, dh);
        modalPngPreviewCanvas.style.display = 'block';
    };
    img.src = pickedPngDataUrl;
}
document.getElementById('btn-pick-folder').addEventListener('click', async () => {
    const saved = localStorage.getItem('lastProjectFolder') || undefined;
    const folder = await editorApi.pickFolder(saved);
    if (folder) {
        pickedFolderPath = folder;
        document.getElementById('folder-path').textContent = folder;
    }
});
document.getElementById('btn-pick-png').addEventListener('click', async () => {
    const result = await editorApi.pickPng();
    if (!result)
        return;
    pickedPngDataUrl = result.dataUrl;
    pickedPngFileName = result.fileName;
    document.getElementById('png-file-name').textContent = result.fileName;
    modalIffPreviewRow.style.display = 'block';
    updateModalIffPreview();
});
document.getElementById('btn-modal-cancel').addEventListener('click', () => document.getElementById('new-project-overlay').classList.add('hidden'));
document.getElementById('btn-rename-cancel').addEventListener('click', () => { renameMapIndex = -1; document.getElementById('rename-map-overlay').classList.add('hidden'); });
document.getElementById('btn-rename-confirm').addEventListener('click', () => finishRenameMap());
document.getElementById('input-rename-map').addEventListener('keydown', (e) => {
    if (e.key === 'Enter')
        finishRenameMap();
    else if (e.key === 'Escape') {
        renameMapIndex = -1;
        document.getElementById('rename-map-overlay').classList.add('hidden');
    }
});
document.getElementById('btn-delete-cancel').addEventListener('click', () => { deleteMapIndex = -1; document.getElementById('delete-map-overlay').classList.add('hidden'); });
document.getElementById('btn-delete-confirm').addEventListener('click', () => confirmDeleteMap());
document.getElementById('btn-modal-create').addEventListener('click', async () => {
    if (!pickedPngDataUrl) {
        const btn = document.getElementById('btn-pick-png');
        btn.style.borderColor = '#e94560';
        setTimeout(() => { btn.style.borderColor = ''; }, 1000);
        return;
    }
    if (!pickedFolderPath) {
        const btn = document.getElementById('btn-pick-folder');
        btn.style.borderColor = '#e94560';
        setTimeout(() => { btn.style.borderColor = ''; }, 1000);
        return;
    }
    const projectName = document.getElementById('input-project-name').value.trim() || 'MyProject';
    const firstMapName = document.getElementById('input-map-name').value.trim() || 'Level 1';
    const sheetCols = parseInt(document.getElementById('input-sheet-cols').value) || 20;
    const sheetRows = parseInt(document.getElementById('input-sheet-rows').value) || 20;
    const mapCols = parseInt(document.getElementById('input-map-cols').value) || 20;
    const mapRows = parseInt(document.getElementById('input-map-rows').value) || 16;
    for (let i = 0; i < MAX_TILES; i++)
        tileFlags[i] = 0;
    document.getElementById('new-project-overlay').classList.add('hidden');
    await createNewProject(projectName, pickedFolderPath, pickedPngDataUrl, pickedPngFileName, sheetCols, sheetRows, mapCols, mapRows, firstMapName, modalIffBytes ? Array.from(modalIffBytes) : undefined, modalBp);
});
// ─── Rename project ────────────────────────────────────────────────────────
const projectNameSpan = document.getElementById('project-name');
const projectNameInput = document.getElementById('project-name-input');
projectNameSpan.addEventListener('click', () => {
    if (!projectLoaded)
        return;
    projectNameSpan.classList.add('hidden');
    projectNameInput.value = currentProjectName;
    projectNameInput.classList.remove('hidden');
    projectNameInput.focus();
    projectNameInput.select();
});
function finishRename() {
    const newName = projectNameInput.value.trim();
    if (!newName || !projectLoaded) {
        projectNameInput.classList.add('hidden');
        projectNameSpan.classList.remove('hidden');
        return;
    }
    currentProjectName = newName;
    projectNameInput.classList.add('hidden');
    projectNameSpan.classList.remove('hidden');
    updateProjectUI();
    saveProject();
}
projectNameInput.addEventListener('blur', finishRename);
projectNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')
        finishRename();
    if (e.key === 'Escape') {
        projectNameInput.classList.add('hidden');
        projectNameSpan.classList.remove('hidden');
    }
});
// ─── Custom file browser ──────────────────────────────────────────────────
let fbCurrentPath = '';
let fbSelectedPath = '';
async function fbNavigate(dirPath) {
    fbCurrentPath = dirPath;
    fbSelectedPath = '';
    document.getElementById('btn-fb-open').setAttribute('disabled', 'true');
    const listing = await editorApi.listDirectory(dirPath);
    if (!listing) {
        document.getElementById('fb-list').innerHTML = '<div class="fb-item" style="color:#e94560;cursor:default">Error reading directory</div>';
        return;
    }
    document.getElementById('fb-current-path').textContent = dirPath;
    let html = '';
    if (dirPath !== '/') {
        const parent = dirPath.substring(0, dirPath.lastIndexOf('/')) || '/';
        html += `<button class="fb-item up" data-path="${parent}"><span class="fb-item-name">..</span></button>`;
    }
    const visibleFolders = listing.folders.filter(f => !f.startsWith('.'));
    for (const f of visibleFolders)
        html += `<button class="fb-item folder" data-path="${dirPath}/${f}"><span class="fb-item-name">${f}</span></button>`;
    const visibleFiles = listing.files.filter(f => !f.startsWith('.'));
    for (const f of visibleFiles) {
        const isProj = f.endsWith('.project');
        html += `<button class="fb-item file${isProj ? '' : ' disabled'}" data-path="${dirPath}/${f}"${isProj ? '' : ' disabled'}><span class="fb-item-name">${f}</span></button>`;
    }
    document.getElementById('fb-list').innerHTML = html;
    document.querySelectorAll('#fb-list .fb-item').forEach(el => {
        el.addEventListener('click', async () => {
            const path = el.dataset.path;
            if (el.classList.contains('folder') || el.classList.contains('up'))
                await fbNavigate(path);
            else {
                document.querySelectorAll('#fb-list .fb-item').forEach(e => e.classList.remove('selected'));
                el.classList.add('selected');
                fbSelectedPath = path;
                document.getElementById('btn-fb-open').removeAttribute('disabled');
            }
        });
        el.addEventListener('dblclick', async () => {
            const path = el.dataset.path;
            if (el.classList.contains('file')) {
                document.getElementById('file-browser-overlay').classList.add('hidden');
                await loadProjectFromPath(path);
            }
        });
    });
}
async function loadProjectFromPath(filePath) {
    const result = await editorApi.loadProjectFile(filePath);
    if (!result) {
        showToast('Failed to load project', 'error');
        return;
    }
    await applyLoadedProject(result);
}
document.getElementById('btn-fb-cancel').addEventListener('click', () => document.getElementById('file-browser-overlay').classList.add('hidden'));
document.getElementById('btn-fb-open').addEventListener('click', async () => {
    if (!fbSelectedPath)
        return;
    document.getElementById('file-browser-overlay').classList.add('hidden');
    await loadProjectFromPath(fbSelectedPath);
});
document.getElementById('btn-preview-cancel').addEventListener('click', () => document.getElementById('amiga-preview-overlay').classList.add('hidden'));
document.getElementById('btn-preview-export').addEventListener('click', () => doExportAmiga());
// ─── TAB SWITCHING ────────────────────────────────────────────────────────
const tabLevelEditor = document.getElementById('tab-level-editor');
const tabPngIff = document.getElementById('tab-png-iff');
const contentLevelEditor = document.getElementById('tab-content-level-editor');
const contentPngIff = document.getElementById('tab-content-png-iff');
function switchTab(tabName) {
    if (tabName === 'png-iff') {
        tabLevelEditor.classList.remove('active');
        tabPngIff.classList.add('active');
        contentLevelEditor.classList.remove('active');
        contentPngIff.classList.add('active');
    }
    else {
        tabLevelEditor.classList.add('active');
        tabPngIff.classList.remove('active');
        contentLevelEditor.classList.add('active');
        contentPngIff.classList.remove('active');
    }
}
tabLevelEditor.addEventListener('click', () => switchTab('level-editor'));
tabPngIff.addEventListener('click', () => switchTab('png-iff'));
// ─── CUSTOM MENU BAR (HTML dropdowns inside the window) ───────────────────
document.querySelectorAll('#menu-bar .menu-item').forEach(el => {
    el.addEventListener('click', () => {
        const action = el.dataset.action;
        handleMenuAction(action);
    });
});
function handleMenuAction(action) {
    switch (action) {
        case 'new':
            switchTab('level-editor');
            document.getElementById('new-project-title').textContent = 'New Project';
            document.getElementById('btn-modal-create').classList.remove('hidden');
            document.getElementById('btn-modal-save-settings').classList.add('hidden');
            pickedPngDataUrl = null;
            pickedPngFileName = '';
            pickedFolderPath = null;
            modalIffBytes = null;
            modalBp = 4;
            modalBpSlider.value = '4';
            modalBpLabel.textContent = '4';
            modalColorsLabel.textContent = '16 colors';
            modalIffPreviewRow.style.display = 'none';
            document.getElementById('png-file-name').textContent = 'no file selected';
            document.getElementById('folder-path').textContent = 'no folder selected';
            document.getElementById('input-project-name').value = 'MyProject';
            document.getElementById('input-sheet-cols').value = '20';
            document.getElementById('input-sheet-rows').value = '20';
            document.getElementById('input-map-cols').value = '20';
            document.getElementById('input-map-rows').value = '16';
            document.getElementById('new-project-overlay').classList.remove('hidden');
            break;
        case 'load':
            switchTab('level-editor');
            showLoadProjectBrowser();
            break;
        case 'save':
            switchTab('level-editor');
            saveProject();
            break;
        case 'settings':
            if (!projectLoaded) {
                showToast('No project loaded', 'error');
                return;
            }
            showProjectSettings();
            break;
        case 'export':
            switchTab('level-editor');
            showAmigaPreview();
            break;
        case 'preview':
            switchTab('level-editor');
            if (hasExportData)
                showAmigaPreview();
            else
                showToast('No export data yet. Export first.', 'error');
            break;
        case 'tab-level-editor':
            switchTab('level-editor');
            break;
        case 'tab-png-iff':
            switchTab('png-iff');
            break;
    }
}
function showProjectSettings() {
    switchTab('level-editor');
    projectModalMode = 'settings';
    const titleEl = document.getElementById('new-project-title');
    titleEl.textContent = 'Project Settings';
    document.getElementById('btn-modal-create').classList.add('hidden');
    document.getElementById('btn-modal-save-settings').classList.remove('hidden');
    document.getElementById('input-project-name').value = currentProjectName;
    document.getElementById('input-sheet-cols').value = String(CONFIG.tilesheetCols);
    document.getElementById('input-sheet-rows').value = String(CONFIG.tilesheetRows);
    document.getElementById('input-map-cols').value = String(CONFIG.mapCols);
    document.getElementById('input-map-rows').value = String(CONFIG.mapRows);
    modalBp = convBitplanes;
    modalBpSlider.value = String(convBitplanes);
    modalBpLabel.textContent = String(convBitplanes);
    modalColorsLabel.textContent = `${1 << convBitplanes} color${convBitplanes !== 1 ? 's' : ''}`;
    // load current tilesheet png for preview
    if (tilesheet) {
        pickedPngDataUrl = tilesheet.src;
        pickedPngFileName = currentPngFileName;
        document.getElementById('png-file-name').textContent = currentPngFileName;
        document.getElementById('folder-path').textContent = currentProjectPath;
        modalIffPreviewRow.style.display = 'block';
        updateModalIffPreview();
    }
    document.getElementById('new-project-overlay').classList.remove('hidden');
}
document.getElementById('btn-modal-save-settings').addEventListener('click', async () => {
    const newSheetCols = parseInt(document.getElementById('input-sheet-cols').value) || 20;
    const newSheetRows = parseInt(document.getElementById('input-sheet-rows').value) || 20;
    const newMapCols = parseInt(document.getElementById('input-map-cols').value) || 20;
    const newMapRows = parseInt(document.getElementById('input-map-rows').value) || 16;
    const newName = document.getElementById('input-project-name').value.trim() || currentProjectName;
    CONFIG.tilesheetCols = newSheetCols;
    CONFIG.tilesheetRows = newSheetRows;
    CONFIG.mapCols = newMapCols;
    CONFIG.mapRows = newMapRows;
    CONFIG.sheetW = newSheetCols * CONFIG.tileSize;
    CONFIG.sheetH = newSheetRows * CONFIG.tileSize;
    CONFIG.mapW = newMapCols * CONFIG.tileSize;
    CONFIG.mapH = newMapRows * CONFIG.tileSize;
    convBitplanes = modalBp;
    currentProjectName = newName;
    mapCanvas.width = CONFIG.mapW * CONFIG.scale;
    mapCanvas.height = CONFIG.mapH * CONFIG.scale;
    tilesCanvas.width = CONFIG.sheetW * CONFIG.scale;
    tilesCanvas.height = CONFIG.sheetH * CONFIG.scale;
    drawTilesheet();
    drawMap();
    updateProjectUI();
    document.getElementById('new-project-overlay').classList.add('hidden');
    saveProject();
    showToast('Settings saved', 'success');
});
async function showLoadProjectBrowser() {
    const saved = localStorage.getItem('lastProjectFolder') || (await editorApi.pickFolder());
    if (!saved)
        return;
    document.getElementById('file-browser-overlay').classList.remove('hidden');
    await fbNavigate(saved);
}
// ─── PNG → IFF CONVERTER (multi-bitplane with color quantization) ─────────
let convPngDataUrl = null;
let convPngFileName = '';
let convIffBytes = null;
let convPalette = null; // RGB triplets
let convIndexMap = null; // per-pixel palette index
let convImgWidth = 0;
let convImgHeight = 0;
const btnPickPngConv = document.getElementById('btn-pick-png-conv');
const pngFileNameConv = document.getElementById('png-file-name-conv');
const convPngCanvas = document.getElementById('conv-png-canvas');
const convIffCanvas = document.getElementById('conv-iff-canvas');
const convPreviewRow = document.getElementById('conv-png-preview-row');
const convFileInfo = document.getElementById('conv-file-info');
const convPngDim = document.getElementById('conv-png-dim');
const convIffSize = document.getElementById('conv-iff-size');
const convIffColors = document.getElementById('conv-iff-colors');
const convBpSlider = document.getElementById('conv-bitplanes');
const convBpLabel = document.getElementById('conv-bp-label');
const convColorsLabel = document.getElementById('conv-colors-label');
const convPaletteDiv = document.getElementById('conv-palette');
const convPaletteSwatches = document.getElementById('conv-palette-swatches');
const btnConvertIff = document.getElementById('btn-convert-iff');
let convLoadedImg = null;
convBpSlider.addEventListener('input', () => {
    convBitplanes = parseInt(convBpSlider.value);
    const colors = 1 << convBitplanes;
    convBpLabel.textContent = String(convBitplanes);
    convColorsLabel.textContent = `${colors} color${convBitplanes !== 1 ? 's' : ''}`;
    if (convLoadedImg)
        reconvert();
});
btnPickPngConv.addEventListener('click', async () => {
    const result = await editorApi.pickPng();
    if (!result)
        return;
    convPngDataUrl = result.dataUrl;
    convPngFileName = result.fileName;
    pngFileNameConv.textContent = result.fileName;
    const img = new Image();
    img.onload = () => {
        convLoadedImg = img;
        convPngCanvas.width = img.width;
        convPngCanvas.height = img.height;
        const ctx = convPngCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        convPngDim.textContent = `${img.width}×${img.height} px`;
        convImgWidth = img.width;
        convImgHeight = img.height;
        reconvert();
        convPreviewRow.style.display = 'flex';
        convFileInfo.style.display = 'flex';
        btnConvertIff.disabled = false;
    };
    img.src = result.dataUrl;
});
function reconvert() {
    if (!convLoadedImg)
        return;
    const bp = parseInt(convBpSlider.value);
    const result = pngToIffMulti(convLoadedImg, bp);
    convIffBytes = result.iff;
    convPalette = result.palette;
    convIndexMap = result.indexMap;
    // Draw IFF preview using palette
    drawIffPreview(convPalette, convIndexMap);
    // Draw palette swatches
    drawPaletteSwatches(convPalette, bp);
    // Update info
    convIffSize.textContent = formatSize(convIffBytes.length);
    convIffColors.textContent = `${1 << bp} colors`;
    convPaletteDiv.style.display = 'block';
}
function drawIffPreview(palette, indexMap) {
    const w = convImgWidth;
    const h = convImgHeight;
    convIffCanvas.width = w;
    convIffCanvas.height = h;
    const iffCtx = convIffCanvas.getContext('2d');
    iffCtx.imageSmoothingEnabled = false;
    const imageData = iffCtx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = indexMap[y * w + x];
            const colOff = idx * 3;
            const pxOff = (y * w + x) * 4;
            imageData.data[pxOff] = palette[colOff];
            imageData.data[pxOff + 1] = palette[colOff + 1];
            imageData.data[pxOff + 2] = palette[colOff + 2];
            imageData.data[pxOff + 3] = 255;
        }
    }
    iffCtx.putImageData(imageData, 0, 0);
}
function drawPaletteSwatches(palette, nPlanes) {
    const numColors = 1 << nPlanes;
    let html = '';
    for (let i = 0; i < numColors; i++) {
        const off = i * 3;
        const r = palette[off];
        const g = palette[off + 1];
        const b = palette[off + 2];
        html += `<span class="conv-swatch" style="background:rgb(${r},${g},${b})" title="#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}"></span>`;
    }
    convPaletteSwatches.innerHTML = html;
}
// ─── Color quantization: Frequency-based (uses exact image colors) ───────
function frequencyQuantize(rgb, maxColors) {
    const numPixels = rgb.length / 4;
    if (numPixels === 0 || maxColors === 0) {
        return { palette: new Uint8Array(0), indexMap: new Uint8Array(0) };
    }
    // Count frequency of each unique RGB color
    // Key = packed 24-bit integer: (R << 16) | (G << 8) | B
    const colorFreq = new Map();
    const colorRGB = new Map();
    for (let i = 0; i < numPixels; i++) {
        const off = i * 4;
        const r = rgb[off], g = rgb[off + 1], b = rgb[off + 2];
        const key = (r << 16) | (g << 8) | b;
        colorFreq.set(key, (colorFreq.get(key) || 0) + 1);
        if (!colorRGB.has(key))
            colorRGB.set(key, [r, g, b]);
    }
    // Sort colors by frequency (most common first)
    const sorted = [...colorFreq.entries()].sort((a, b) => b[1] - a[1]);
    // Take top N colors — but never exceed the actual count
    const paletteSize = Math.min(sorted.length, maxColors);
    const topColors = sorted.slice(0, paletteSize);
    // Build color → index lookup map
    const colorToIndex = new Map();
    const palette = new Uint8Array(paletteSize * 3);
    for (let i = 0; i < paletteSize; i++) {
        const key = topColors[i][0];
        const [r1, g1, b1] = colorRGB.get(key);
        palette[i * 3] = r1;
        palette[i * 3 + 1] = g1;
        palette[i * 3 + 2] = b1;
        colorToIndex.set(key, i);
    }
    // Build index map: exact match for palette colors, nearest-neighbor for others
    const indexMap = new Uint8Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
        const off = i * 4;
        const r = rgb[off], g = rgb[off + 1], b = rgb[off + 2];
        const key = (r << 16) | (g << 8) | b;
        const exact = colorToIndex.get(key);
        if (exact !== undefined) {
            indexMap[i] = exact;
            continue;
        }
        // Nearest-neighbor fallback (only needed when #unique > maxColors)
        let bestDist = Infinity;
        let bestIdx = 0;
        for (let c = 0; c < paletteSize; c++) {
            const pr = palette[c * 3], pg = palette[c * 3 + 1], pb = palette[c * 3 + 2];
            const dr = r - pr, dg = g - pg, db = b - pb;
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = c;
            }
        }
        indexMap[i] = bestIdx;
    }
    return { palette, indexMap };
}
// ─── Multi-bitplane IFF encoder ───────────────────────────────────────────
function pngToIffMulti(img, nPlanes) {
    const w = img.width;
    const h = img.height;
    const bytesPerRow = ((w + 15) >> 4) << 1;
    const maxColors = 1 << nPlanes;
    // Read RGBA pixels
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const rgb = imageData.data; // RGBA
    // Quantize
    const quant = frequencyQuantize(rgb, maxColors);
    const palette = quant.palette;
    const indexMap = quant.indexMap;
    // Build interleaved BODY: for each row, for each plane, pack bits
    const body = new Uint8Array(h * nPlanes * bytesPerRow);
    for (let y = 0; y < h; y++) {
        for (let plane = 0; plane < nPlanes; plane++) {
            const planeRowOff = (y * nPlanes + plane) * bytesPerRow;
            for (let x = 0; x < w; x++) {
                const idx = indexMap[y * w + x];
                if (idx & (1 << plane)) {
                    const byteIdx = x >> 3;
                    const bitIdx = 7 - (x & 7);
                    body[planeRowOff + byteIdx] |= (1 << bitIdx);
                }
            }
        }
    }
    // Build CMAP: 2^nPlanes entries, 3 bytes each (RGB). Pad with black if needed.
    const cmapLen = maxColors * 3;
    const cmap = new Uint8Array(cmapLen);
    cmap.set(palette); // may be shorter if fewer colors; rest stays 0 (black)
    function iffChunk(type, data) {
        const out = new Uint8Array(8 + data.length);
        for (let i = 0; i < 4; i++)
            out[i] = type.charCodeAt(i);
        putU32BE(out, 4, data.length);
        out.set(data, 8);
        return out;
    }
    const bmhd = new Uint8Array(20);
    putU16BE(bmhd, 0, w);
    putU16BE(bmhd, 2, h);
    putU16BE(bmhd, 4, 0); // x origin
    putU16BE(bmhd, 6, 0); // y origin
    bmhd[8] = nPlanes;
    bmhd[9] = 0; // masking = none
    bmhd[10] = 0; // compression = none
    bmhd[11] = 0; // pad
    putU16BE(bmhd, 12, 0); // transparent color
    bmhd[14] = 44;
    bmhd[15] = 52; // aspect (PAL default)
    putU16BE(bmhd, 16, w); // page width
    putU16BE(bmhd, 18, h); // page height
    const bmhdChunk = iffChunk('BMHD', bmhd);
    const cmapChunk = iffChunk('CMAP', cmap);
    const bodyChunk = iffChunk('BODY', body);
    const ilbmInner = new Uint8Array(4 + bmhdChunk.length + cmapChunk.length + bodyChunk.length);
    let p = 0;
    ilbmInner.set([0x49, 0x4C, 0x42, 0x4D], p);
    p += 4; // "ILBM"
    ilbmInner.set(bmhdChunk, p);
    p += bmhdChunk.length;
    ilbmInner.set(cmapChunk, p);
    p += cmapChunk.length;
    ilbmInner.set(bodyChunk, p);
    const form = new Uint8Array(8 + ilbmInner.length);
    form.set([0x46, 0x4F, 0x52, 0x4D], 0); // "FORM"
    putU32BE(form, 4, ilbmInner.length);
    form.set(ilbmInner, 8);
    return { iff: form, palette, indexMap };
}
btnConvertIff.addEventListener('click', async () => {
    if (!convIffBytes)
        return;
    const defaultName = convPngFileName.replace(/\.png$/i, '.iff');
    const filePath = await editorApi.saveIffDialog(defaultName);
    if (!filePath)
        return;
    const success = await editorApi.writeFile(filePath, Array.from(convIffBytes));
    if (success)
        showToast('IFF saved: ' + filePath, 'success');
    else
        showToast('Failed to save IFF', 'error');
});
// ─── BOOT ─────────────────────────────────────────────────────────────────────
async function boot() {
    if (localStorage.getItem('bitsOnMap') === '1')
        bitsOnMapCheckbox.checked = true;
    clearEditor();
    updateProjectUI();
}
boot();
//# sourceMappingURL=renderer.js.map