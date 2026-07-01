// JSZip is loaded via <script> tag in index.html (renderer has no Node require)
declare var JSZip: any;

// ─── Interfaces ───────────────────────────────────────────────────────────────

/** Constants that define the editor grid, tile sheet, and rendering scale. */
interface EditorConfig {
  tileSize: number;
  scale: number;
  dTile: number;
  tilesheetCols: number;
  tilesheetRows: number;
  mapCols: number;
  mapRows: number;
  mapW: number;
  mapH: number;
  sheetW: number;
  sheetH: number;
}

/** A tile coordinate (row / column) on either the map or the tile sheet. */
interface TileCoord {
  col: number;
  row: number;
}

/** Raw unscaled canvas coordinates from a mouse event. */
interface CanvasPoint {
  x: number;
  y: number;
}

/** One BTST bit definition (from bits.json). */
interface BitDef {
  name: string;
  color: string;
}

/** Full bits config as stored in assets/bits.json. */
interface BitsConfig {
  bits: BitDef[];
  tileFlags: number[];
}

/** A single map/level within a project. */
interface MapEntry {
  name: string;
  map: number[][];
  mapCols: number;
  mapRows: number;
}

/** The export schema written by the "Export Map Data" button. */
interface ExportData {
  cols: number;
  rows: number;
  tiles: number[];
  bits: BitDef[];
  tileFlags: number[];
}

/** IPC bridge exposed via preload. */
declare const editorApi: {
  readonly tileSize: number;
  readonly scale: number;
  readonly tilesheetCols: number;
  readonly tilesheetRows: number;
  readonly mapCols: number;
  readonly mapRows: number;
  loadBitsConfig: () => Promise<BitsConfig>;
  saveBitsConfig: (data: BitsConfig) => Promise<boolean>;
  saveFullConfig: (bits: BitDef[], tileFlags: number[]) => Promise<boolean>;
  loadMapJson: () => Promise<ExportData | null>;
  pickPng: () => Promise<{ dataUrl: string; fileName: string } | null>;
  pickFolder: (defaultPath?: string) => Promise<string | null>;
  loadPngFile: (filePath: string) => Promise<string | null>;
  checkAmigaExport: (projectFolder: string) => Promise<boolean>;
  createProject: (data: {
    projectName: string;
    folderPath: string;
    pngDataUrl: string;
    pngFileName: string;
    maps: { name: string; map: number[][]; mapCols: number; mapRows: number }[];
    bits: BitDef[];
    tileFlags: number[];
    tilesheetCols: number;
    tilesheetRows: number;
  }) => Promise<string | null>;
  saveProjectFile: (data: {
    projectFolder: string;
    projectName: string;
    pngFileName: string;
    maps: { name: string; map: number[][]; mapCols: number; mapRows: number }[];
    bits: BitDef[];
    tileFlags: number[];
    tilesheetCols: number;
    tilesheetRows: number;
  }) => Promise<boolean>;
  exportAmiga: (data: {
    projectFolder: string;
    iffData: number[];
    mapBinData: number[];
    ab3Source: string;
  }) => Promise<boolean>;
  listDirectory: (dirPath: string) => Promise<{ path: string; folders: string[]; files: string[] } | null>;
  loadProjectFile: (filePath: string) => Promise<{
    projectFolder: string;
    projectName: string;
    data: {
      map: number[][];
      bits: BitDef[];
      tileFlags: number[];
      mapCols: number;
      mapRows: number;
      tilesheetCols: number;
      tilesheetRows: number;
      pngFileName: string;
    };
  } | null>;
  loadProject: (defaultPath?: string) => Promise<{
    projectFolder: string;
    projectName: string;
    data: {
      map: number[][];
      bits: BitDef[];
      tileFlags: number[];
      mapCols: number;
      mapRows: number;
      tilesheetCols: number;
      tilesheetRows: number;
      pngFileName: string;
    };
  } | null>;
};

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
const TOTAL_BITS = 16; // fixed 16 BTST flags

const CONFIG: EditorConfig = {
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

const mapCanvas = document.getElementById('map-canvas') as HTMLCanvasElement;
const mapCtx = mapCanvas.getContext('2d')!;
const tilesCanvas = document.getElementById('tiles-canvas') as HTMLCanvasElement;
const tilesCtx = tilesCanvas.getContext('2d')!;
const activeTileSpan = document.getElementById('active-tile-id') as HTMLSpanElement;
const flagsColumn = document.getElementById('flags-column') as HTMLDivElement;
const bitsOnMapCheckbox = document.getElementById('chk-bits-on-map') as HTMLInputElement;

// ─── State ────────────────────────────────────────────────────────────────────

/** All maps/levels in the current project. */
let maps: MapEntry[] = [];
/** Index of the currently displayed map. */
let currentMapIndex = 0;

/** Convenience: returns the current map's grid data. */
function getCurrentMap(): number[][] { return maps[currentMapIndex]?.map ?? []; }
/** Convenience: returns the current map's entry. */
function getCurrentMapEntry(): MapEntry { return maps[currentMapIndex]; }

let activeTile = 0;
let mouseDown = false;
let lastPlaced: string | null = null;

let sheetHover: TileCoord = { col: -1, row: -1 };
let mapHover: TileCoord = { col: -1, row: -1 };

// BTST per‑tile bitmasks (16‑bit mask per tile index, 0–65535)
const tileFlags: number[] = new Array(MAX_TILES).fill(0);

// Currently selected bit index for toggling
let activeBitIndex = 0;

// Bit definitions — always 16 entries
let bitsConfig: BitsConfig = { bits: [], tileFlags: [] };

// Project state
let tilesheet: HTMLImageElement | null = null;
let projectLoaded = false;
let currentProjectPath = '';
let currentProjectName = '— no project —';
let currentPngFileName = '';

// ─── Canvas sizes ─────────────────────────────────────────────────────────────

mapCanvas.width = CONFIG.mapW * CONFIG.scale;
mapCanvas.height = CONFIG.mapH * CONFIG.scale;
tilesCanvas.width = CONFIG.sheetW * CONFIG.scale;
tilesCanvas.height = CONFIG.sheetH * CONFIG.scale;

// ─── Bit helpers ──────────────────────────────────────────────────────────────

/** Check if a specific bit is set in the per‑tile mask (16‑bit). */
function hasBit(tileIdx: number, bitIdx: number): boolean {
  return (tileFlags[tileIdx] & (1 << bitIdx)) !== 0;
}

/** Toggle a specific bit in the per‑tile mask, clamping to 16 bits. */
function toggleBit(tileIdx: number, bitIdx: number): void {
  if (bitIdx < 0 || bitIdx >= TOTAL_BITS) return;
  tileFlags[tileIdx] ^= (1 << bitIdx);
  tileFlags[tileIdx] &= 0xFFFF;
}

// ─── Init map grid ────────────────────────────────────────────────────────────

function createEmptyGrid(cols: number, rows: number): number[][] {
  const grid: number[][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = new Array(cols).fill(0);
  }
  return grid;
}

function initSingleMap(cols: number, rows: number): MapEntry {
  return { name: 'Level 1', map: createEmptyGrid(cols, rows), mapCols: cols, mapRows: rows };
}

// ─── Map tabs UI ──────────────────────────────────────────────────────────────

function renderMapTabs(): void {
  const container = document.getElementById('map-tabs')!;
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

// ─── Map tabs: event delegation for click, right-click, and drag ─────────

const mapTabsContainer = document.getElementById('map-tabs')!;

// Click: switch or rename active tab
mapTabsContainer.addEventListener('click', (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.id === 'btn-add-map') { addNewMap(); return; }
  if (target.classList.contains('map-tab-del')) {
    const idx = parseInt(target.dataset.index!, 10);
    deleteMap(idx);
    return;
  }
  const tab = target.closest('.map-tab') as HTMLElement | null;
  if (!tab) return;
  const idx = parseInt(tab.dataset.index!, 10);
  if (idx === currentMapIndex) {
    startRenameMap(idx);
  } else {
    switchToMap(idx);
  }
});

// Right-click on a map tab → rename
mapTabsContainer.addEventListener('contextmenu', (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('map-tab-del')) return; // ignore on delete btn
  const tab = target.closest('.map-tab') as HTMLElement | null;
  if (!tab) return;
  e.preventDefault();
  const idx = parseInt(tab.dataset.index!, 10);
  startRenameMap(idx);
});

// ─── Drag & Drop for map reorder ────────────────────────────────────────

let dragSrcIndex: number | null = null;

/** Update drop indicator and return the insertion index (vertical layout). */
function updateDropIndicator(clientY: number): number {
  const tabs = mapTabsContainer.querySelectorAll('.map-tab');
  const containerRect = mapTabsContainer.getBoundingClientRect();
  const relativeY = clientY - containerRect.top;

  // Clear all indicators
  tabs.forEach(t => (t as HTMLElement).classList.remove('drop-before', 'drop-after'));

  // Find the closest tab edge to the cursor (skipping the dragged tab)
  let bestTab: HTMLElement | null = null;
  let bestDist = Infinity;
  let insertAfter = false; // false = insert before, true = insert after

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i] as HTMLElement;
    if (tab.dataset.index === String(dragSrcIndex)) continue;
    const r = tab.getBoundingClientRect();
    const top = r.top - containerRect.top;
    const bottom = r.bottom - containerRect.top;
    const mid = top + r.height / 2;

    if (relativeY < mid) {
      // Cursor is on the top half → insert before this tab
      const dist = Math.abs(relativeY - top);
      if (dist < bestDist) {
        bestDist = dist;
        bestTab = tab;
        insertAfter = false;
      }
    } else {
      // Cursor is on the bottom half → insert after this tab
      const dist = Math.abs(relativeY - bottom);
      if (dist < bestDist) {
        bestDist = dist;
        bestTab = tab;
        insertAfter = true;
      }
    }
  }

  if (bestTab) {
    if (insertAfter) {
      bestTab.classList.add('drop-after');
    } else {
      bestTab.classList.add('drop-before');
    }
  }

  // Calculate insertion index among ALL tabs
  if (!bestTab) return maps.length;
  const bestIdx = parseInt(bestTab.dataset.index!, 10);
  return insertAfter ? bestIdx + 1 : bestIdx;
}

function clearDropIndicators(): void {
  mapTabsContainer.querySelectorAll('.map-tab.drop-before, .map-tab.drop-after').forEach(el => {
    el.classList.remove('drop-before', 'drop-after');
  });
}

mapTabsContainer.addEventListener('dragstart', (e: Event) => {
  const tab = (e.target as HTMLElement).closest('.map-tab') as HTMLElement | null;
  if (!tab) return;
  dragSrcIndex = parseInt(tab.dataset.index!, 10);
  (e as DragEvent).dataTransfer!.effectAllowed = 'move';
  // Set the drop gap to match the dragged tab's height
  const gapSize = tab.offsetHeight + 4;
  mapTabsContainer.style.setProperty('--drop-gap', gapSize + 'px');
  // Disable pointer events on children so dragleave doesn't flicker
  tab.querySelectorAll('.map-tab-name, .map-tab-del').forEach(el => (el as HTMLElement).style.pointerEvents = 'none');
});

mapTabsContainer.addEventListener('dragover', (e: Event) => {
  e.preventDefault();
  (e as DragEvent).dataTransfer!.dropEffect = 'move';
  if (dragSrcIndex === null) return;
  updateDropIndicator((e as DragEvent).clientY);
});

mapTabsContainer.addEventListener('dragleave', (e: Event) => {
  const related = (e as DragEvent).relatedTarget as HTMLElement | null;
  if (!related || !mapTabsContainer.contains(related)) {
    clearDropIndicators();
  }
});

mapTabsContainer.addEventListener('drop', (e: Event) => {
  e.preventDefault();
  clearDropIndicators();
  if (dragSrcIndex === null) return;
  // Calculate insert index — same logic as updateDropIndicator but without visual updates
  const clientY = (e as DragEvent).clientY;
  const tabs = mapTabsContainer.querySelectorAll('.map-tab');
  const containerRect = mapTabsContainer.getBoundingClientRect();
  const relativeY = clientY - containerRect.top;
  let bestTab: HTMLElement | null = null;
  let bestDist = Infinity;
  let insertAfter = false;
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i] as HTMLElement;
    if (tab.dataset.index === String(dragSrcIndex)) continue;
    const r = tab.getBoundingClientRect();
    const top = r.top - containerRect.top;
    const bottom = r.bottom - containerRect.top;
    const mid = top + r.height / 2;
    const dist = Math.abs(relativeY - (relativeY < mid ? top : bottom));
    if (dist < bestDist) { bestDist = dist; bestTab = tab; insertAfter = relativeY >= mid; }
  }
  const idx = bestTab ? (insertAfter ? parseInt(bestTab.dataset.index!, 10) + 1 : parseInt(bestTab.dataset.index!, 10)) : maps.length;
  const adjustedTo = idx > dragSrcIndex ? idx - 1 : idx;
  if (adjustedTo === dragSrcIndex) { dragSrcIndex = null; return; }
  const [moved] = maps.splice(dragSrcIndex, 1);
  maps.splice(adjustedTo, 0, moved);
  if (dragSrcIndex === currentMapIndex) {
    currentMapIndex = adjustedTo;
  } else {
    if (dragSrcIndex < currentMapIndex && adjustedTo >= currentMapIndex) currentMapIndex--;
    else if (dragSrcIndex > currentMapIndex && adjustedTo <= currentMapIndex) currentMapIndex++;
  }
  dragSrcIndex = null;
  renderMapTabs();
  drawMap();
  updateProjectUI();
});

mapTabsContainer.addEventListener('dragend', () => {
  clearDropIndicators();
  mapTabsContainer.querySelectorAll('.map-tab').forEach(el => {
    (el as HTMLElement).querySelectorAll('.map-tab-name, .map-tab-del').forEach(c => (c as HTMLElement).style.pointerEvents = '');
  });
  dragSrcIndex = null;
});

function switchToMap(index: number): void {
  if (index < 0 || index >= maps.length) return;
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

function addNewMap(): void {
  const defaultCols = CONFIG.mapCols || 20;
  const defaultRows = CONFIG.mapRows || 16;
  const name = 'Level ' + (maps.length + 1);
  const entry: MapEntry = { name, map: createEmptyGrid(defaultCols, defaultRows), mapCols: defaultCols, mapRows: defaultRows };
  maps.push(entry);
  switchToMap(maps.length - 1);
  showToast('Map added: ' + name, 'success');
}

/** Index of map currently being renamed (or -1 if none). */
let renameMapIndex = -1;

function startRenameMap(index: number): void {
  const entry = maps[index];
  if (!entry) return;
  renameMapIndex = index;
  const input = document.getElementById('input-rename-map') as HTMLInputElement;
  const label = document.getElementById('rename-map-label')!;
  input.value = entry.name;
  label.textContent = 'Rename "' + entry.name + '"';
  document.getElementById('rename-map-overlay')!.classList.remove('hidden');
  input.focus();
  input.select();
}

function finishRenameMap(): void {
  if (renameMapIndex < 0 || renameMapIndex >= maps.length) {
    document.getElementById('rename-map-overlay')!.classList.add('hidden');
    renameMapIndex = -1;
    return;
  }
  const input = document.getElementById('input-rename-map') as HTMLInputElement;
  const newName = input.value.trim();
  if (newName && newName !== maps[renameMapIndex].name) {
    maps[renameMapIndex].name = newName;
    renderMapTabs();
    updateProjectUI();
  }
  document.getElementById('rename-map-overlay')!.classList.add('hidden');
  renameMapIndex = -1;
}

/** Index of map pending deletion (or -1 if none). */
let deleteMapIndex = -1;

function deleteMap(index: number): void {
  if (maps.length <= 1) {
    showToast('Cannot delete the last map', 'error');
    return;
  }
  const entry = maps[index];
  if (!entry) return;
  deleteMapIndex = index;
  document.getElementById('delete-map-message')!.textContent =
    `Delete "${entry.name}"? This cannot be undone.`;
  document.getElementById('delete-map-overlay')!.classList.remove('hidden');
}

function confirmDeleteMap(): void {
  if (deleteMapIndex < 0 || deleteMapIndex >= maps.length) {
    document.getElementById('delete-map-overlay')!.classList.add('hidden');
    deleteMapIndex = -1;
    return;
  }
  const entry = maps[deleteMapIndex];
  maps.splice(deleteMapIndex, 1);
  if (currentMapIndex >= maps.length) currentMapIndex = maps.length - 1;
  if (currentMapIndex === deleteMapIndex && deleteMapIndex > 0) currentMapIndex = deleteMapIndex - 1;
  else if (currentMapIndex === deleteMapIndex) currentMapIndex = 0;
  switchToMap(currentMapIndex);
  showToast('Map deleted: ' + entry.name, 'success');
  document.getElementById('delete-map-overlay')!.classList.add('hidden');
  deleteMapIndex = -1;
}

// ─── DEFAULT BITS ─────────────────────────────────────────────────────────────

/** Ensure bitsConfig has exactly 16 bit definitions. */
function ensureBits(): void {
  while (bitsConfig.bits.length < TOTAL_BITS) {
    bitsConfig.bits.push({ name: '', color: '#888888' });
  }
  // Trim to exactly 16
  bitsConfig.bits = bitsConfig.bits.slice(0, TOTAL_BITS);
}

// ─── Toast / Snackbar ─────────────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string, type: 'success' | 'error' = 'success', durationMs = 2500): void {
  const el = document.getElementById('toast')!;
  if (toastTimer) clearTimeout(toastTimer);

  el.textContent = message;
  el.className = 'toast ' + type;
  // Force reflow so the transition plays
  void el.offsetWidth;
  el.classList.remove('hidden');

  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
    toastTimer = null;
  }, durationMs);
}

// ─── Project management ───────────────────────────────────────────────────────

function updateProjectUI(): void {
  const nameEl = document.getElementById('project-name')!;
  nameEl.textContent = currentProjectName;

  const mapDims = document.getElementById('map-dims')!;
  mapDims.textContent = projectLoaded
    ? `${CONFIG.mapCols}×${CONFIG.mapRows} — ${CONFIG.mapCols * CONFIG.tileSize}×${CONFIG.mapRows * CONFIG.tileSize} px`
    : '—';

  const sheetDims = document.getElementById('tilesheet-dims')!;
  sheetDims.textContent = projectLoaded
    ? `${CONFIG.tilesheetCols}×${CONFIG.tilesheetRows} tiles — ${CONFIG.tileSize}×${CONFIG.tileSize} px each`
    : '—';
}

function loadTilesheetFromDataUrl(dataUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      tilesheet = img;
      projectLoaded = true;
      resolve();
    };
    img.onerror = () => {
      reject(new Error('Failed to load tilesheet image'));
    };
    img.src = dataUrl;
  });
}

function clearEditor(): void {
  setPreviewEnabled(false);
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  tilesCtx.clearRect(0, 0, tilesCanvas.width, tilesCanvas.height);

  maps = [];
  currentMapIndex = 0;
  activeBitIndex = 0;
  bitsConfig = { bits: [], tileFlags: new Array(MAX_TILES).fill(0) };
  for (let i = 0; i < MAX_TILES; i++) tileFlags[i] = 0;

  flagsColumn.innerHTML = '';
  sheetHover = { col: -1, row: -1 };
  mapHover = { col: -1, row: -1 };
  activeTile = 0;
  renderMapTabs();
  updateActiveDisplay();
  updateProjectUI();
}

async function createNewProject(
  projectName: string,
  folderPath: string,
  pngDataUrl: string,
  pngFileName: string,
  sheetCols: number,
  sheetRows: number,
  mapCols: number,
  mapRows: number,
  firstMapName: string
): Promise<boolean> {
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

  // Create the initial map with the user-given name
  const initialMap: MapEntry = {
    name: firstMapName,
    map: createEmptyGrid(mapCols, mapRows),
    mapCols,
    mapRows
  };
  maps = [initialMap];
  currentMapIndex = 0;

  for (let i = 0; i < MAX_TILES; i++) tileFlags[i] = 0;

  bitsConfig = {
    bits: [
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
      { name: '', color: '#888888' },
    ],
    tileFlags: new Array(MAX_TILES).fill(0)
  };
  ensureBits();

  // Create project folder on disk via IPC
  const resultPath = await editorApi.createProject({
    projectName,
    folderPath,
    pngDataUrl,
    pngFileName,
    maps: maps.map(m => ({ ...m, map: m.map.map(row => [...row]) })),
    bits: bitsConfig.bits,
    tileFlags: [...tileFlags],
    tilesheetCols: CONFIG.tilesheetCols,
    tilesheetRows: CONFIG.tilesheetRows
  });

  if (!resultPath) {
    console.error('Failed to create project folder');
    return false;
  }

  try {
    await loadTilesheetFromDataUrl(pngDataUrl);
  } catch (err) {
    console.error(err);
    return false;
  }

  currentProjectPath = resultPath;
  currentProjectName = projectName;
  currentPngFileName = pngFileName;
  // Save parent folder so next New Project starts in the right place
  const parentFolder = folderPath.substring(0, folderPath.lastIndexOf('/'));
  if (parentFolder) localStorage.setItem('lastProjectFolder', parentFolder);
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

async function saveProject(): Promise<void> {
  if (!projectLoaded || !tilesheet || !currentProjectPath) {
    console.warn('No project to save');
    return;
  }

  const projectName = currentProjectName.replace(/\.project$/, '');
  const success = await editorApi.saveProjectFile({
    projectFolder: currentProjectPath,
    projectName,
    pngFileName: currentPngFileName,
    maps: maps.map(m => ({ ...m, map: m.map.map(row => [...row]) })),
    bits: bitsConfig.bits,
    tileFlags: [...tileFlags],
    tilesheetCols: CONFIG.tilesheetCols,
    tilesheetRows: CONFIG.tilesheetRows
  });

  if (success) {
    updateProjectUI();
    showToast('Project saved', 'success');
  } else {
    showToast('Failed to save project', 'error');
  }
}

async function loadProject(): Promise<void> {
  const saved = localStorage.getItem('lastProjectFolder') || undefined;
  const result = await editorApi.loadProject(saved);
  if (!result) {
    showToast('Load cancelled', 'error');
    return;
  }
  await applyLoadedProject(result);
}

async function applyLoadedProject(result: { projectFolder: string; projectName: string; data: any }): Promise<void> {
  const { projectFolder, projectName, data } = result;

  CONFIG.tilesheetCols = data.tilesheetCols;
  CONFIG.tilesheetRows = data.tilesheetRows;
  CONFIG.sheetW = data.tilesheetCols * CONFIG.tileSize;
  CONFIG.sheetH = data.tilesheetRows * CONFIG.tileSize;

  tilesCanvas.width = CONFIG.sheetW * CONFIG.scale;
  tilesCanvas.height = CONFIG.sheetH * CONFIG.scale;

  // ── Load maps (new multi-map format or legacy single-map fallback) ──
  if (data.maps && Array.isArray(data.maps) && data.maps.length > 0) {
    maps = data.maps.map((m: any) => ({
      name: m.name || 'Level',
      map: m.map.map((row: number[]) => [...row]),
      mapCols: m.mapCols,
      mapRows: m.mapRows
    }));
  } else if (data.map && Array.isArray(data.map)) {
    // Legacy: single map at top level
    const mCols = data.mapCols || CONFIG.mapCols;
    const mRows = data.mapRows || CONFIG.mapRows;
    const legacyMap: number[][] = [];
    for (let r = 0; r < Math.min(data.map.length, mRows); r++) {
      legacyMap[r] = [];
      for (let c = 0; c < Math.min(data.map[r].length, mCols); c++) {
        legacyMap[r][c] = data.map[r][c];
      }
    }
    maps = [{ name: 'Level 1', map: legacyMap, mapCols: mCols, mapRows: mRows }];
  } else {
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

  bitsConfig = {
    bits: data.bits,
    tileFlags: data.tileFlags
  };
  ensureBits();
  for (let i = 0; i < Math.min(data.tileFlags.length, MAX_TILES); i++) {
    tileFlags[i] = data.tileFlags[i];
  }

  // Load tilesheet from the PNG file in the project folder
  const pngPath = projectFolder + '/' + data.pngFileName;
  const pngDataUrl = await editorApi.loadPngFile(pngPath);
  if (!pngDataUrl) {
    console.error('Failed to load tilesheet from project folder');
    return;
  }

  try {
    await loadTilesheetFromDataUrl(pngDataUrl);
  } catch (err) {
    console.error('Failed to decode tilesheet:', err);
    return;
  }

  currentProjectPath = projectFolder;
  currentProjectName = projectName;
  currentPngFileName = data.pngFileName || 'tilesheet.png';
  // Save parent folder so next New Project starts here
  const parentFolder = projectFolder.substring(0, projectFolder.lastIndexOf('/'));
  if (parentFolder) localStorage.setItem('lastProjectFolder', parentFolder);
  activeBitIndex = 0;
  renderMapTabs();
  renderFlagsUI();
  drawTilesheet();
  drawMap();
  updateActiveDisplay();
  updateProjectUI();
  // Check if there's already an Amiga export in the project folder
  const hasExport = await editorApi.checkAmigaExport(projectFolder);
  setPreviewEnabled(hasExport);
  showToast('Project loaded: ' + projectName, 'success');
}

// ─── DRAWING ──────────────────────────────────────────────────────────────────

function tileSourceXY(tileIdx: number): { sx: number; sy: number } {
  const sx = (tileIdx % CONFIG.tilesheetCols) * CONFIG.tileSize;
  const sy = Math.floor(tileIdx / CONFIG.tilesheetCols) * CONFIG.tileSize;
  return { sx, sy };
}

function tileDisplayXY(tileIdx: number): { sx: number; sy: number } {
  const base = tileSourceXY(tileIdx);
  return { sx: base.sx * CONFIG.scale, sy: base.sy * CONFIG.scale };
}

function drawMap(): void {
  mapCtx.clearRect(0, 0, CONFIG.mapW * CONFIG.scale, CONFIG.mapH * CONFIG.scale);
  if (!projectLoaded || !tilesheet) return;
  const curMap = getCurrentMap();
  if (!curMap) return;

  for (let r = 0; r < CONFIG.mapRows; r++) {
    for (let c = 0; c < CONFIG.mapCols; c++) {
      const tileIdx = curMap[r]?.[c] ?? 0;
      const { sx, sy } = tileSourceXY(tileIdx);
      mapCtx.drawImage(
        tilesheet,
        sx, sy,
        CONFIG.tileSize, CONFIG.tileSize,
        c * CONFIG.dTile, r * CONFIG.dTile,
        CONFIG.dTile, CONFIG.dTile
      );
    }
  }
  drawMapGrid();
  if (bitsOnMapCheckbox.checked) {
    drawMapFlagDots();
  }
  drawMapGhost();
}

function drawMapGhost(): void {
  if (mapHover.col < 0 || mapHover.row < 0) return;
  if (!tilesheet) return;
  const { sx, sy } = tileSourceXY(activeTile);
  mapCtx.globalAlpha = 0.5;
  mapCtx.drawImage(
    tilesheet,
    sx, sy,
    CONFIG.tileSize, CONFIG.tileSize,
    mapHover.col * CONFIG.dTile,
    mapHover.row * CONFIG.dTile,
    CONFIG.dTile, CONFIG.dTile
  );
  mapCtx.globalAlpha = 1.0;

  mapCtx.strokeStyle = '#ffd700';
  mapCtx.lineWidth = 2;
  mapCtx.strokeRect(
    mapHover.col * CONFIG.dTile + 0.5,
    mapHover.row * CONFIG.dTile + 0.5,
    CONFIG.dTile - 1,
    CONFIG.dTile - 1
  );
}

function drawMapGrid(): void {
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

/** Draw small colored dots on map tiles indicating which flags are set. */
function drawMapFlagDots(): void {
  const curMap = getCurrentMap();
  if (!curMap) return;
  const bits = bitsConfig.bits;
  if (bits.length === 0) return;

  const dotR = Math.max(1.5, CONFIG.dTile * 0.08);
  const pad = dotR + 1;
  const perRow = 4;

  mapCtx.save();

  for (let r = 0; r < CONFIG.mapRows; r++) {
    for (let c = 0; c < CONFIG.mapCols; c++) {
      const tileIdx = curMap[r][c];
      const mask = tileFlags[tileIdx];
      if (mask === 0) continue;

      const cellX = c * CONFIG.dTile;
      const cellY = r * CONFIG.dTile;

      let dotIdx = 0;
      for (let b = 0; b < TOTAL_BITS; b++) {
        if (!hasBit(tileIdx, b)) continue;

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

function drawTilesheet(): void {
  tilesCtx.clearRect(0, 0, tilesCanvas.width, tilesCanvas.height);
  if (!projectLoaded || !tilesheet) return;

  tilesCtx.drawImage(
    tilesheet,
    0, 0,
    CONFIG.sheetW, CONFIG.sheetH,
    0, 0,
    CONFIG.sheetW * CONFIG.scale,
    CONFIG.sheetH * CONFIG.scale
  );
  drawFlagDots();
  drawTilesheetGrid();
  drawSheetHover();
  drawActiveHighlight();
}

/** Draw small colored dots on each tile indicating which flags are set. */
function drawFlagDots(): void {
  const bits = bitsConfig.bits;
  if (bits.length === 0) return;

  const dotR = Math.max(1.5, CONFIG.dTile * 0.08);
  const pad = dotR + 1;
  const perRow = 4;

  tilesCtx.save();

  for (let idx = 0; idx < MAX_TILES; idx++) {
    const mask = tileFlags[idx];
    if (mask === 0) continue;

    const col = idx % CONFIG.tilesheetCols;
    const row = Math.floor(idx / CONFIG.tilesheetCols);
    const cellX = col * CONFIG.dTile;
    const cellY = row * CONFIG.dTile;

    let dotIdx = 0;
    for (let b = 0; b < TOTAL_BITS; b++) {
      if (!hasBit(idx, b)) continue;

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

function drawSheetHover(): void {
  if (sheetHover.col < 0 || sheetHover.row < 0) return;
  const sx = sheetHover.col * CONFIG.dTile;
  const sy = sheetHover.row * CONFIG.dTile;
  tilesCtx.strokeStyle = '#ffd700';
  tilesCtx.lineWidth = 2;
  tilesCtx.strokeRect(sx + 0.5, sy + 0.5, CONFIG.dTile - 1, CONFIG.dTile - 1);
}

function drawTilesheetGrid(): void {
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

function drawActiveHighlight(): void {
  const { sx, sy } = tileDisplayXY(activeTile);
  tilesCtx.strokeStyle = '#e94560';
  tilesCtx.lineWidth = 2.5;
  tilesCtx.strokeRect(sx + 1, sy + 1, CONFIG.dTile - 2, CONFIG.dTile - 2);
}

// ─── Active‑tile display ──────────────────────────────────────────────────────

function updateActiveDisplay(): void {
  const col = activeTile % CONFIG.tilesheetCols;
  const row = Math.floor(activeTile / CONFIG.tilesheetCols);

  // list flags set on this tile
  const setNames: string[] = [];
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

function renderFlagsUI(): void {
  flagsColumn.innerHTML = '';

  for (let i = 0; i < TOTAL_BITS; i++) {
    const bit = bitsConfig.bits[i];
    const isActive = i === activeBitIndex;

    // ── Build row ──────────────────────────────────────────────────────────
    const row = document.createElement('div');
    row.className = 'flag-row' + (isActive ? ' active' : '');
    if (!bit.name) {
      row.classList.add('unused');
    }
    row.dataset.bitIndex = String(i);

    // Bit number label
    const numSpan = document.createElement('span');
    numSpan.className = 'flag-bit-num';
    numSpan.textContent = String(i);
    row.appendChild(numSpan);

    // Color indicator (clickable, wraps a real <input type=color>)
    const colorWrap = document.createElement('label');
    colorWrap.className = 'flag-color';
    colorWrap.style.backgroundColor = bit.color;
    colorWrap.title = `Bit ${i} color`;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = bit.color;
    colorInput.addEventListener('input', (e) => {
      const newColor = (e.target as HTMLInputElement).value;
      bitsConfig.bits[i].color = newColor;
      colorWrap.style.backgroundColor = newColor;
      saveBitsConfig();
      drawTilesheet();
      drawMap();
    });
    // Prevent color picker click from also selecting the flag row
    colorInput.addEventListener('click', (e) => e.stopPropagation());
    colorWrap.appendChild(colorInput);
    row.appendChild(colorWrap);

    // Name text input
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
      // Update row styling
      if (nameInput.value) {
        row.classList.remove('unused');
      } else {
        row.classList.add('unused');
      }
    });
    nameInput.addEventListener('click', (e) => e.stopPropagation());
    row.appendChild(nameInput);

    // Click row to select this bit as active
    row.addEventListener('click', () => {
      activeBitIndex = i;
      renderFlagsUI();
    });

    flagsColumn.appendChild(row);
  }
}

async function saveBitsConfig(): Promise<void> {
  try {
    await editorApi.saveFullConfig(bitsConfig.bits, tileFlags);
  } catch (err) {
    console.error('Failed to save full config:', err);
  }
}

// ─── Tile‑index helpers ───────────────────────────────────────────────────────

function tileIndexFromCoord(col: number, row: number): number {
  return row * CONFIG.tilesheetCols + col;
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────

function canvasCoords(e: MouseEvent, canvas: HTMLCanvasElement): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function cellFromPoint(p: CanvasPoint): TileCoord {
  return {
    col: Math.floor(p.x / CONFIG.dTile),
    row: Math.floor(p.y / CONFIG.dTile)
  };
}

function isCellInBounds(coord: TileCoord, cols: number, rows: number): boolean {
  return coord.col >= 0 && coord.col < cols && coord.row >= 0 && coord.row < rows;
}

// ─── Map editing ──────────────────────────────────────────────────────────────

function placeTileOnMap(p: CanvasPoint): void {
  const curMap = getCurrentMap();
  if (!curMap) return;
  const cell = cellFromPoint(p);
  if (!isCellInBounds(cell, CONFIG.mapCols, CONFIG.mapRows)) return;

  const key = `${cell.row},${cell.col}`;
  if (key === lastPlaced) return;
  lastPlaced = key;

  curMap[cell.row][cell.col] = activeTile;
  drawMap();
}

// ─── EVENT HANDLERS ───────────────────────────────────────────────────────────

tilesCanvas.addEventListener('mousedown', (e: MouseEvent) => {
  const p = canvasCoords(e, tilesCanvas);
  const cell = cellFromPoint(p);

  if (!isCellInBounds(cell, CONFIG.tilesheetCols, CONFIG.tilesheetRows)) return;

  if (e.button === 0) {
    // Left click — select tile
    activeTile = tileIndexFromCoord(cell.col, cell.row);
    updateActiveDisplay();
    drawTilesheet();
  } else if (e.button === 2) {
    // Right click — toggle active bit on this tile
    const idx = tileIndexFromCoord(cell.col, cell.row);
    toggleBit(idx, activeBitIndex);
    saveBitsConfig();
    updateActiveDisplay();
    drawTilesheet();
    drawMap();
  }
});

tilesCanvas.addEventListener('mousemove', (e: MouseEvent) => {
  const p = canvasCoords(e, tilesCanvas);
  const cell = cellFromPoint(p);

  if (isCellInBounds(cell, CONFIG.tilesheetCols, CONFIG.tilesheetRows)) {
    sheetHover = cell;
  } else {
    sheetHover = { col: -1, row: -1 };
  }
  drawTilesheet();
});

tilesCanvas.addEventListener('mouseleave', () => {
  sheetHover = { col: -1, row: -1 };
  drawTilesheet();
});

mapCanvas.addEventListener('mousedown', (e: MouseEvent) => {
  mouseDown = true;
  lastPlaced = null;
  placeTileOnMap(canvasCoords(e, mapCanvas));
});

window.addEventListener('mouseup', () => {
  mouseDown = false;
  lastPlaced = null;
});

mapCanvas.addEventListener('mousemove', (e: MouseEvent) => {
  const p = canvasCoords(e, mapCanvas);
  const cell = cellFromPoint(p);

  if (isCellInBounds(cell, CONFIG.mapCols, CONFIG.mapRows)) {
    mapHover = cell;
  } else {
    mapHover = { col: -1, row: -1 };
  }

  if (mouseDown) {
    placeTileOnMap(p);
  } else {
    drawMap();
  }
});

mapCanvas.addEventListener('mouseleave', () => {
  mapHover = { col: -1, row: -1 };
  drawMap();
});

[mapCanvas, tilesCanvas].forEach((c) => {
  c.addEventListener('contextmenu', (e: Event) => e.preventDefault());
});

// ─── BUTTONS ──────────────────────────────────────────────────────────────────
// (All old buttons removed; only the ZIP export remains via the menu)

// ===== Amiga ZIP export (map + iff tilesheet + AmiBlitz3 loader) =====

/** Write a big‑endian UINT16 into a Uint8Array. */
function putU16BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >> 8) & 0xFF;
  buf[offset + 1] = value & 0xFF;
}

/** Write a big‑endian UINT32 into a Uint8Array. */
function putU32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >> 24) & 0xFF;
  buf[offset + 1] = (value >> 16) & 0xFF;
  buf[offset + 2] = (value >> 8) & 0xFF;
  buf[offset + 3] = value & 0xFF;
}

/** Build the binary .map file (AB3M format). */
function buildMapBinary(): Uint8Array {
  const curMap = getCurrentMap();
  if (!curMap) return new Uint8Array(0);
  const numTiles = MAX_TILES;
  const headerSize = 12;
  const gridSize = CONFIG.mapCols * CONFIG.mapRows * 2;
  const flagsSize = numTiles * 2;
  const totalSize = headerSize + gridSize + flagsSize;

  const buf = new Uint8Array(totalSize);

  // Magic "AB3M"
  buf[0] = 0x41; buf[1] = 0x42; buf[2] = 0x33; buf[3] = 0x4D;
  // Version 1
  putU16BE(buf, 4, 1);
  // Dimensions
  putU16BE(buf, 6, CONFIG.mapCols);
  putU16BE(buf, 8, CONFIG.mapRows);
  // Max tile count
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

/**
 * Encode the tilesheet canvas into a 1‑bitplane IFF/ILBM file (word‑aligned rows).
 * Returns the raw ILBM bytes ready to write to disk or embed in a ZIP.
 */
function buildIffTilesheet(): Uint8Array {
  if (!tilesheet) throw new Error('No tilesheet loaded');
  const w = CONFIG.sheetW;  // 320
  const h = CONFIG.sheetH;  // 320

  // Word‑aligned bytes per row for a single bitplane
  const bytesPerRow = ((w + 15) >> 4) << 1;

  // Read pixel data from the tilesCanvas (which is scaled, so we need the original unscaled 1:1 image).
  // We draw the unscaled tilesheet onto a temporary 1:1 canvas.
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext('2d')!;
  // drawImage with source at 0,0,w,h in tilesheet (the original 320×320 un‑scaled Image),
  // destination at 0,0,w,h in the tmp canvas.
  ctx.drawImage(tilesheet, 0, 0, w, h, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;  // RGBA

  // Build BODY — interleaved bitmap (single bitplane, so just one plane)
  const body = new Uint8Array(h * bytesPerRow);
  for (let y = 0; y < h; y++) {
    const rowOff = y * bytesPerRow;
    for (let x = 0; x < w; x++) {
      const pxOff = (y * w + x) * 4;
      const r = pixels[pxOff];
      const g = pixels[pxOff + 1];
      const b = pixels[pxOff + 2];
      // Treat any non‑black pixel as "set" (white)
      if (r > 127 || g > 127 || b > 127) {
        const byteIdx = x >> 3;
        const bitIdx = 7 - (x & 7);
        body[rowOff + byteIdx] |= (1 << bitIdx);
      }
    }
  }

  // ── Helper: build an IFF chunk ──────────────────────────────────────
  function iffChunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(8 + data.length);
    for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
    putU32BE(out, 4, data.length);
    out.set(data, 8);
    return out;
  }

  // BMHD chunk (20 bytes)
  const bmhd = new Uint8Array(20);
  putU16BE(bmhd, 0, w);           // width
  putU16BE(bmhd, 2, h);           // height
  putU16BE(bmhd, 4, 0);           // x origin
  putU16BE(bmhd, 6, 0);           // y origin
  bmhd[8] = 1;                     // nPlanes = 1
  bmhd[9] = 0;                     // masking = none
  bmhd[10] = 0;                    // compression = none
  bmhd[11] = 0;                    // pad
  putU16BE(bmhd, 12, 0);          // transparent color
  bmhd[14] = 44; bmhd[15] = 52;   // xAspect, yAspect (PAL 320x256)
  putU16BE(bmhd, 16, w);          // page width
  putU16BE(bmhd, 18, h);          // page height

  // CMAP chunk – 2 colours: black (0,0,0) and white (255,255,255)
  const cmap = new Uint8Array([0, 0, 0, 255, 255, 255]);

  const bmhdChunk = iffChunk('BMHD', bmhd);
  const cmapChunk = iffChunk('CMAP', cmap);
  const bodyChunk = iffChunk('BODY', body);

  // FORM = 'FORM' + len(ILBM + chunks) + 'ILBM' + chunks
  const ilbmInner = new Uint8Array(
    4 + bmhdChunk.length + cmapChunk.length + bodyChunk.length
  );
  let p = 0;
  ilbmInner.set([0x49, 0x4C, 0x42, 0x4D], p); p += 4;  // "ILBM"
  ilbmInner.set(bmhdChunk, p); p += bmhdChunk.length;
  ilbmInner.set(cmapChunk, p); p += cmapChunk.length;
  ilbmInner.set(bodyChunk, p); p += bodyChunk.length;

  const form = new Uint8Array(8 + ilbmInner.length);
  form.set([0x46, 0x4F, 0x52, 0x4D], 0);  // "FORM"
  putU32BE(form, 4, ilbmInner.length);
  form.set(ilbmInner, 8);

  return form;
}

/**
 * Generate an AmiBlitz3 (.ab3) source file that:
 *  • Loads the .map file
 *  • Loads & displays the tiles.iff as a bitmap
 *  • Renders the map using Blit operations
 *
 *  IMPORTANT: The output uses only 7‑bit ASCII characters.
 *  AmiBlitz3 does not understand UTF‑8 or Latin‑1 extended chars.
 */
function buildAmiBlitz3Loader(): string {
  const mapW = CONFIG.mapCols;
  const mapH = CONFIG.mapRows;
  const sheetW = CONFIG.sheetW;
  const sheetH = CONFIG.sheetH;
  const tileSize = CONFIG.tileSize;
  const maxTiles = MAX_TILES;
  const tilesheetCols = CONFIG.tilesheetCols;

  // Build bit-name comments for the source
  const bitComments = bitsConfig.bits
    .map((b, i) => `;   Bit ${i}: ${b.name || '(unused)'}`)
    .join('\n');

  const curMap = getCurrentMap();
  // Build tile grid Data.w lines — flatten row‑major, then split into chunks
  // of 16 values per line to avoid AmiBlitz3 "String too long" errors.
  const gridDataLines: string[] = [];
  const allGridVals: number[] = [];
  for (let r = 0; r < mapH; r++) {
    for (let c = 0; c < mapW; c++) {
      allGridVals.push(curMap?.[r]?.[c] ?? 0);
    }
  }
  const gridChunkSize = 16;
  for (let i = 0; i < allGridVals.length; i += gridChunkSize) {
    gridDataLines.push(
      `Data.w ${allGridVals.slice(i, i + gridChunkSize).join(',')}`
    );
  }

  // Build tile flags Data.w lines (split into chunks of 16 to avoid "string too long")
  const flagChunks: string[] = [];
  const flagChunkSize = 16;
  for (let i = 0; i < maxTiles; i += flagChunkSize) {
    const chunk = [];
    for (let j = i; j < Math.min(i + flagChunkSize, maxTiles); j++) {
      chunk.push(tileFlags[j]);
    }
    flagChunks.push(`Data.w ${chunk.join(',')}`);
  }
  const flagDataLines = flagChunks.join('\n');

  return `; --------------------------------------------------------------
; RetroMap Map Loader
; Generated by RetroMapEditor -- AmiBlitz3 source
; --------------------------------------------------------------

; -- Map data -------------------------------------------------
Dim tilemap.w(${mapW * mapH})
Dim tileFlags.w(${maxTiles})

; -- Tile flag bit definitions ---------------------------------
${bitComments}

; -- Init -----------------------------------------------------
BitMap 0, ${sheetW}, ${sheetH}, 2                  ; tilesheet bitmap
BitMap 1, 320, 256, 2                              ; screen bitmap
LoadBitMap 0, "tiles.iff", 0
Use BitMap 0
BLITZ
Slice 0,44,2

; -- Load map data from embedded Data statements ----------------
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

; -- Render map ------------------------------------------------
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

; -- Main loop -------------------------------------------------
While Joyb(0) = 0
  VWait
Wend

End

; -- Embedded map data -----------------------------------------
.MapData:
${gridDataLines.join('\n')}

.FlagData:
${flagDataLines}
`;
}

/**
 * Convert a JS string to Amiga‑compatible raw bytes.
 *
 * AmiBlitz3 expects LF (0x0A) line endings — NOT CR.
 * CR (0x0D) characters cause "garbage" errors.
 *
 * Encoding: Latin‑1 (ISO‑8859‑1), one byte per code unit masked to 0–255.
 * The generated source is pure 7‑bit ASCII so UTF‑8 and Latin‑1 are
 * byte‑identical for all characters used.
 */
function stringToAmigaBytes(str: string): Uint8Array {
  // Normalise any CRLF or bare CR to LF
  const clean = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Encode as Latin‑1 — one byte per code unit
  const buf = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) {
    buf[i] = clean.charCodeAt(i) & 0xFF;
  }
  return buf;
}

// ─── Amiga export preview & export ────────────────────────────

let cachedPreviewIff: Uint8Array | null = null;
let cachedPreviewMapBin: Uint8Array | null = null;
let cachedPreviewAb3Bytes: Uint8Array | null = null;
let hasExportData = false;

const previewBtn = document.getElementById('menu-preview') as HTMLButtonElement;

function setPreviewEnabled(enabled: boolean): void {
  hasExportData = enabled;
  previewBtn.disabled = !enabled;
}

function showAmigaPreview(): void {
  if (!projectLoaded || !tilesheet || !currentProjectPath) {
    showToast('No project loaded', 'error');
    return;
  }

  // Generate all data
  cachedPreviewIff = buildIffTilesheet();
  cachedPreviewMapBin = buildMapBinary();
  const ab3raw = buildAmiBlitz3Loader();
  cachedPreviewAb3Bytes = stringToAmigaBytes(ab3raw);

  // File info
  document.getElementById('iff-info')!.textContent =
    `${CONFIG.sheetW}×${CONFIG.sheetH} px, ${formatSize(cachedPreviewIff.length)}`;
  document.getElementById('map-info')!.textContent =
    `${CONFIG.mapCols}×${CONFIG.mapRows} tiles, ${formatSize(cachedPreviewMapBin.length)}`;

  // ── IFF preview: draw the tilesheet onto a small canvas (for hover popup) ──
  const iffCanvas = document.getElementById('iff-preview-canvas') as HTMLCanvasElement;
  const maxDim = 240;
  const scale = Math.min(maxDim / CONFIG.sheetW, maxDim / CONFIG.sheetH, 1);
  iffCanvas.width = Math.round(CONFIG.sheetW * scale);
  iffCanvas.height = Math.round(CONFIG.sheetH * scale);
  const iffCtx = iffCanvas.getContext('2d')!;
  iffCtx.imageSmoothingEnabled = false;
  iffCtx.drawImage(tilesheet!, 0, 0, iffCanvas.width, iffCanvas.height);

  // AB3 source code
  const ab3Src = buildAmiBlitz3Loader();
  (document.getElementById('ab3-preview') as HTMLTextAreaElement).value = ab3Src;

  document.getElementById('amiga-preview-overlay')!.classList.remove('hidden');
}

function formatHexDump(data: Uint8Array, maxBytes: number): string {
  const len = Math.min(data.length, maxBytes);
  const lines: string[] = [];
  for (let offset = 0; offset < len; offset += 16) {
    const addr = offset.toString(16).padStart(8, '0');
    const bytes: string[] = [];
    const ascii: string[] = [];
    for (let i = 0; i < 16; i++) {
      if (offset + i < len) {
        const b = data[offset + i];
        bytes.push(b.toString(16).padStart(2, '0'));
        ascii.push(b >= 32 && b <= 126 ? String.fromCharCode(b) : '.');
      } else {
        bytes.push('  ');
        ascii.push(' ');
      }
    }
    lines.push(`${addr}  ${bytes.slice(0, 8).join(' ')}  ${bytes.slice(8).join(' ')}  |${ascii.join('')}|`);
  }
  if (data.length > maxBytes) {
    lines.push(`... (${data.length - maxBytes} more bytes)`);
  }
  return lines.join('\n');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  return kb.toFixed(1) + ' KB';
}

async function doExportAmiga(): Promise<void> {
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
    document.getElementById('amiga-preview-overlay')!.classList.add('hidden');
  } else {
    showToast('Export failed', 'error');
  }
}

document.getElementById('menu-export')!.addEventListener('click', () => {
  showAmigaPreview();
});

document.getElementById('menu-preview')!.addEventListener('click', () => {
  if (!hasExportData) return;
  showAmigaPreview();
});

document.getElementById('btn-preview-cancel')!.addEventListener('click', () => {
  document.getElementById('amiga-preview-overlay')!.classList.add('hidden');
});

document.getElementById('btn-preview-export')!.addEventListener('click', () => {
  doExportAmiga();
});

// ─── Bits-on-map toggle ────────────────────────────────────────────────────

bitsOnMapCheckbox.addEventListener('change', () => {
  localStorage.setItem('bitsOnMap', bitsOnMapCheckbox.checked ? '1' : '0');
  drawMap();
});

// ─── Menu & Modal event handlers ──────────────────────────────────────────

let pickedPngDataUrl: string | null = null;
let pickedPngFileName: string = '';
let pickedFolderPath: string | null = null;

document.getElementById('menu-new')!.addEventListener('click', () => {
  // Reset picker state
  pickedPngDataUrl = null;
  pickedPngFileName = '';
  pickedFolderPath = null;
  document.getElementById('png-file-name')!.textContent = 'no file selected';
  document.getElementById('folder-path')!.textContent = 'no folder selected';
  (document.getElementById('input-project-name') as HTMLInputElement).value = 'MyProject';
  (document.getElementById('input-sheet-cols') as HTMLInputElement).value = '20';
  (document.getElementById('input-sheet-rows') as HTMLInputElement).value = '20';
  (document.getElementById('input-map-cols') as HTMLInputElement).value = '20';
  (document.getElementById('input-map-rows') as HTMLInputElement).value = '16';
  document.getElementById('new-project-overlay')!.classList.remove('hidden');
});

document.getElementById('btn-pick-folder')!.addEventListener('click', async () => {
  const saved = localStorage.getItem('lastProjectFolder') || undefined;
  const folder = await editorApi.pickFolder(saved);
  if (folder) {
    pickedFolderPath = folder;
    document.getElementById('folder-path')!.textContent = folder;
  }
});

document.getElementById('btn-pick-png')!.addEventListener('click', async () => {
  const result = await editorApi.pickPng();
  if (result) {
    pickedPngDataUrl = result.dataUrl;
    pickedPngFileName = result.fileName;
    document.getElementById('png-file-name')!.textContent = result.fileName;
  }
});

document.getElementById('btn-modal-cancel')!.addEventListener('click', () => {
  document.getElementById('new-project-overlay')!.classList.add('hidden');
});

document.getElementById('btn-rename-cancel')!.addEventListener('click', () => {
  renameMapIndex = -1;
  document.getElementById('rename-map-overlay')!.classList.add('hidden');
});

document.getElementById('btn-rename-confirm')!.addEventListener('click', () => {
  finishRenameMap();
});

document.getElementById('input-rename-map')!.addEventListener('keydown', (e: Event) => {
  if ((e as KeyboardEvent).key === 'Enter') {
    finishRenameMap();
  } else if ((e as KeyboardEvent).key === 'Escape') {
    renameMapIndex = -1;
    document.getElementById('rename-map-overlay')!.classList.add('hidden');
  }
});

document.getElementById('btn-delete-cancel')!.addEventListener('click', () => {
  deleteMapIndex = -1;
  document.getElementById('delete-map-overlay')!.classList.add('hidden');
});

document.getElementById('btn-delete-confirm')!.addEventListener('click', () => {
  confirmDeleteMap();
});

document.getElementById('btn-modal-create')!.addEventListener('click', async () => {
  if (!pickedPngDataUrl) {
    const btn = document.getElementById('btn-pick-png')!;
    btn.style.borderColor = '#e94560';
    setTimeout(() => { btn.style.borderColor = ''; }, 1000);
    return;
  }
  if (!pickedFolderPath) {
    const btn = document.getElementById('btn-pick-folder')!;
    btn.style.borderColor = '#e94560';
    setTimeout(() => { btn.style.borderColor = ''; }, 1000);
    return;
  }

  const projectName = (document.getElementById('input-project-name') as HTMLInputElement).value.trim() || 'MyProject';
  const firstMapName = (document.getElementById('input-map-name') as HTMLInputElement).value.trim() || 'Level 1';
  const sheetCols = parseInt((document.getElementById('input-sheet-cols') as HTMLInputElement).value) || 20;
  const sheetRows = parseInt((document.getElementById('input-sheet-rows') as HTMLInputElement).value) || 20;
  const mapCols = parseInt((document.getElementById('input-map-cols') as HTMLInputElement).value) || 20;
  const mapRows = parseInt((document.getElementById('input-map-rows') as HTMLInputElement).value) || 16;

  for (let i = 0; i < MAX_TILES; i++) tileFlags[i] = 0;

  document.getElementById('new-project-overlay')!.classList.add('hidden');

  await createNewProject(projectName, pickedFolderPath, pickedPngDataUrl, pickedPngFileName, sheetCols, sheetRows, mapCols, mapRows, firstMapName);
});

document.getElementById('menu-save')!.addEventListener('click', () => {
  saveProject();
});

// ─── Rename project ────────────────────────────────────────

const projectNameSpan = document.getElementById('project-name')!;
const projectNameInput = document.getElementById('project-name-input') as HTMLInputElement;

projectNameSpan.addEventListener('click', () => {
  if (!projectLoaded) return;
  projectNameSpan.classList.add('hidden');
  projectNameInput.value = currentProjectName;
  projectNameInput.classList.remove('hidden');
  projectNameInput.focus();
  projectNameInput.select();
});

function finishRename(): void {
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
  // Auto-save after rename
  saveProject();
}

projectNameInput.addEventListener('blur', finishRename);
projectNameInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') finishRename();
  if (e.key === 'Escape') {
    projectNameInput.classList.add('hidden');
    projectNameSpan.classList.remove('hidden');
  }
});

// ─── Custom file browser ────────────────────────────────────

let fbCurrentPath = '';
let fbSelectedPath = '';

async function fbNavigate(dirPath: string): Promise<void> {
  fbCurrentPath = dirPath;
  fbSelectedPath = '';
  document.getElementById('btn-fb-open')!.setAttribute('disabled', 'true');

  const listing = await editorApi.listDirectory(dirPath);
  if (!listing) {
    document.getElementById('fb-list')!.innerHTML = '<div class="fb-item" style="color:#e94560;cursor:default">Error reading directory</div>';
    return;
  }

  document.getElementById('fb-current-path')!.textContent = dirPath;

  let html = '';
  // Parent folder (..)
  if (dirPath !== '/') {
    const parent = dirPath.substring(0, dirPath.lastIndexOf('/')) || '/';
    html += `<button class="fb-item up" data-path="${parent}"><span class="fb-item-name">..</span></button>`;
  }
  // Folders (skip hidden)
  const visibleFolders = listing.folders.filter(f => !f.startsWith('.'));
  for (const f of visibleFolders) {
    html += `<button class="fb-item folder" data-path="${dirPath}/${f}"><span class="fb-item-name">${f}</span></button>`;
  }
  // All non-hidden files — .project files are clickable, others are disabled
  const visibleFiles = listing.files.filter(f => !f.startsWith('.'));
  for (const f of visibleFiles) {
    const isProj = f.endsWith('.project');
    html += `<button class="fb-item file${isProj ? '' : ' disabled'}" data-path="${dirPath}/${f}"${isProj ? '' : ' disabled'}><span class="fb-item-name">${f}</span></button>`;
  }
  document.getElementById('fb-list')!.innerHTML = html;

  // Bind click events
  document.querySelectorAll('#fb-list .fb-item').forEach(el => {
    el.addEventListener('click', async () => {
      const path = (el as HTMLElement).dataset.path!;
      if (el.classList.contains('folder') || el.classList.contains('up')) {
        // Navigate into folder
        await fbNavigate(path);
      } else {
        // Select file
        document.querySelectorAll('#fb-list .fb-item').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        fbSelectedPath = path;
        document.getElementById('btn-fb-open')!.removeAttribute('disabled');
      }
    });
    // Double-click on file = open
    el.addEventListener('dblclick', async () => {
      const path = (el as HTMLElement).dataset.path!;
      if (el.classList.contains('file')) {
        document.getElementById('file-browser-overlay')!.classList.add('hidden');
        await loadProjectFromPath(path);
      }
    });
  });
}

async function loadProjectFromPath(filePath: string): Promise<void> {
  const result = await editorApi.loadProjectFile(filePath);
  if (!result) {
    showToast('Failed to load project', 'error');
    return;
  }
  await applyLoadedProject(result);
}

document.getElementById('menu-load')!.addEventListener('click', async () => {
  const saved = localStorage.getItem('lastProjectFolder') || (await editorApi.pickFolder());
  if (!saved) return;
  document.getElementById('file-browser-overlay')!.classList.remove('hidden');
  await fbNavigate(saved);
});

document.getElementById('btn-fb-cancel')!.addEventListener('click', () => {
  document.getElementById('file-browser-overlay')!.classList.add('hidden');
});

document.getElementById('btn-fb-open')!.addEventListener('click', async () => {
  if (!fbSelectedPath) return;
  document.getElementById('file-browser-overlay')!.classList.add('hidden');
  await loadProjectFromPath(fbSelectedPath);
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  // Restore bits-on-map toggle state
  if (localStorage.getItem('bitsOnMap') === '1') {
    bitsOnMapCheckbox.checked = true;
  }

  // No auto-loading — start empty
  clearEditor();
  updateProjectUI();
}

boot();