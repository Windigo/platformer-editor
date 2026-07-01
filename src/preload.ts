import { contextBridge, ipcRenderer } from 'electron';

/** One BTST bit definition. */
interface BitDef {
  name: string;
  color: string;
}

/** Full bits config file contents. */
interface BitsConfig {
  bits: BitDef[];
  tileFlags?: number[];
}

/** A single map/level within a project. */
interface MapEntry {
  name: string;
  map: number[][];
  mapCols: number;
  mapRows: number;
}

/** Data for creating a new project. */
interface CreateProjectData {
  projectName: string;
  folderPath: string;
  pngDataUrl: string;
  pngFileName: string;
  maps: MapEntry[];
  bits: BitDef[];
  tileFlags: number[];
  tilesheetCols: number;
  tilesheetRows: number;
  tileSize: number;
  gridTileSize: number;
  iffData?: number[];
  convBitplanes?: number;
}

/** Data for saving a project file (no tilesheet data URL — it's on disk). */
interface SaveProjectFileData {
  projectFolder: string;
  projectName: string;
  pngFileName: string;
  maps: MapEntry[];
  bits: BitDef[];
  tileFlags: number[];
  tilesheetCols: number;
  tilesheetRows: number;
  tileSize: number;
  gridTileSize: number;
  convBitplanes?: number;
}

/** Response from loading a project. */
interface LoadProjectResult {
  projectFolder: string;
  projectName: string;
  data: {
    maps: MapEntry[] | undefined;  // undefined = old single-map format
    map?: number[][];               // legacy single-map fallback
    bits: BitDef[];
    tileFlags: number[];
    mapCols?: number;
    mapRows?: number;
    tilesheetCols: number;
    tilesheetRows: number;
    tileSize: number;
    gridTileSize: number;
    pngFileName: string;
    convBitplanes?: number;
  };
}

const api = {
  tileSize: 16,
  scale: 2,
  tilesheetCols: 20,
  tilesheetRows: 20,
  mapCols: 20,
  mapRows: 16,

  /** Open a file dialog to pick a PNG tilesheet. Returns { dataUrl, fileName } or null. */
  pickPng: (): Promise<{ dataUrl: string; fileName: string } | null> =>
    ipcRenderer.invoke('pick-png'),

  /** Open a folder dialog to pick where to create the project. Returns path or null. */
  pickFolder: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('pick-folder', defaultPath),

  /** Open a save-file dialog for IFF export. Returns path or null. */
  saveIffDialog: (defaultName?: string): Promise<string | null> =>
    ipcRenderer.invoke('save-iff-dialog', defaultName),

  /** Write raw byte array to a file. */
  writeFile: (filePath: string, data: number[]): Promise<boolean> =>
    ipcRenderer.invoke('write-file', filePath, data),

  /** Create a new project: folder + copied PNG + .project file. Returns the project folder path or null. */
  createProject: (data: CreateProjectData): Promise<string | null> =>
    ipcRenderer.invoke('create-project', data),

  /** Save the project file at the known folder path. */
  saveProjectFile: (data: SaveProjectFileData): Promise<boolean> =>
    ipcRenderer.invoke('save-project-file', data),

  /** Check if the amiga/ subfolder contains exported files. */
  checkAmigaExport: (projectFolder: string): Promise<boolean> =>
    ipcRenderer.invoke('check-amiga-export', projectFolder),

  /** Read a PNG file from disk and return it as a data URL. */
  loadPngFile: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('load-png-file', filePath),

  /** Export Amiga files (IFF, map.bin, .ab3) to the amiga/ subfolder. */
  exportAmiga: (data: { projectFolder: string; iffData: number[]; mapBinData: number[]; ab3Source: string }): Promise<boolean> =>
    ipcRenderer.invoke('export-amiga', data),

  /** List a directory for the custom file browser. */
  listDirectory: (dirPath: string): Promise<{ path: string; folders: string[]; files: string[] } | null> =>
    ipcRenderer.invoke('list-directory', dirPath),

  /** Load a project file at a specific path (for custom file browser). */
  loadProjectFile: (filePath: string): Promise<LoadProjectResult | null> =>
    ipcRenderer.invoke('load-project-file', filePath),

  /** Load a .project project file via native dialog. Returns { projectFolder, projectName, data } or null. */
  loadProject: (defaultPath?: string): Promise<LoadProjectResult | null> =>
    ipcRenderer.invoke('load-project', defaultPath),

  /** Load the bits.json config file from the assets folder. */
  loadBitsConfig: (): Promise<BitsConfig> =>
    ipcRenderer.invoke('load-bits-config'),

  /** Save both bits definitions and per-tile flags to bits.json. */
  saveFullConfig: (bits: BitDef[], tileFlags: number[]): Promise<boolean> =>
    ipcRenderer.invoke('save-full-config', { bits, tileFlags }),

  /** Open a dialog to load a previously exported map JSON. */
  loadMapJson: (): Promise<unknown> =>
    ipcRenderer.invoke('load-map-json')
};

contextBridge.exposeInMainWorld('editorApi', api);