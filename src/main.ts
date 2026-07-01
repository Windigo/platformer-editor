import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    title: 'RetroMapEditor — AmiBlitz3 Map Tool',
    resizable: true,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
  // win.webContents.openDevTools();
}

// ─── IPC: File dialogs for project workflow ──────────────────────────────────

/** Pick a PNG tilesheet file; returns { dataUrl, fileName } or null. */
ipcMain.handle('pick-png', async (): Promise<{ dataUrl: string; fileName: string } | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Select Tilesheet PNG',
    filters: [{ name: 'PNG Images', extensions: ['png'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  try {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/png';
    return {
      dataUrl: `data:${mime};base64,${base64}`,
      fileName: path.basename(filePath)
    };
  } catch (err) {
    console.error('Failed to read PNG:', err);
    return null;
  }
});

/** Pick a folder path; returns the selected folder path or null. */
ipcMain.handle('pick-folder', async (_event: unknown, defaultPath?: string): Promise<string | null> => {
  const opts: Electron.OpenDialogOptions = {
    title: 'Select Project Folder',
    properties: ['openDirectory', 'createDirectory']
  };
  if (defaultPath) opts.defaultPath = defaultPath;
  const result = await dialog.showOpenDialog(opts);

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

/**
 * Create a new project: creates a folder at the given path, copies the PNG
 * tilesheet into it, and writes the .project project file.
 * Returns the project folder path on success, null on failure.
 */
ipcMain.handle('create-project', async (
  _event: unknown,
  data: {
    projectName: string;
    folderPath: string;
    pngDataUrl: string;       // base64 data URL of the tilesheet
    pngFileName: string;
    maps: { name: string; map: number[][]; mapCols: number; mapRows: number }[];
    bits: { name: string; color: string }[];
    tileFlags: number[];
    tilesheetCols: number;
    tilesheetRows: number;
  }
): Promise<string | null> => {
  try {
    const projectDir = path.join(data.folderPath, data.projectName);
    const amigaDir = path.join(projectDir, 'amiga');

    // Create folders
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(amigaDir, { recursive: true });

    // Write tilesheet PNG (extract base64 from data URL)
    const base64Data = data.pngDataUrl.replace(/^data:image\/png;base64,/, '');
    const pngBuffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(path.join(projectDir, data.pngFileName), pngBuffer);

    // Write project file (without the tilesheet DataUrl to keep it small)
    const { pngDataUrl, ...projectData } = data;
    const projectJson = JSON.stringify(projectData, null, 2);
    fs.writeFileSync(path.join(projectDir, `${data.projectName}.project`), projectJson, 'utf-8');

    return projectDir;
  } catch (err) {
    console.error('Failed to create project:', err);
    return null;
  }
});

/** Save the project file (.project) at the given folder path. */
ipcMain.handle('save-project-file', async (
  _event: unknown,
  data: {
    projectFolder: string;
    projectName: string;
    pngFileName: string;
    maps: { name: string; map: number[][]; mapCols: number; mapRows: number }[];
    bits: { name: string; color: string }[];
    tileFlags: number[];
    tilesheetCols: number;
    tilesheetRows: number;
  }
): Promise<boolean> => {
  try {
    const projectPath = path.join(data.projectFolder, `${data.projectName}.project`);
    const { projectFolder, projectName, ...projectData } = data;
    const projectJson = JSON.stringify(projectData, null, 2);
    fs.writeFileSync(projectPath, projectJson, 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save project file:', err);
    return false;
  }
});

/** Export Amiga files (tiles.iff, map.bin, LoadMap.bb) to the project's amiga/ subfolder. */
ipcMain.handle('export-amiga', async (
  _event: unknown,
  data: {
    projectFolder: string;
    iffData: number[];        // Uint8Array as a regular number array
    mapBinData: number[];     // Uint8Array as a regular number array
    ab3Source: string;        // Raw AmiBlitz3 source code (plain text)
  }
): Promise<boolean> => {
  try {
    const amigaDir = path.join(data.projectFolder, 'amiga');
    fs.mkdirSync(amigaDir, { recursive: true });

    fs.writeFileSync(path.join(amigaDir, 'tiles.iff'), Buffer.from(data.iffData));
    fs.writeFileSync(path.join(amigaDir, 'map.bin'), Buffer.from(data.mapBinData));

    // Write AB3 source — AmiBlitz3 uses LF (0x0A) line endings on AmigaOS.
    // The .ab3 extension tells the IDE to treat it as AmiBlitz3 source.
    const clean = data.ab3Source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const buf = Buffer.alloc(clean.length);
    for (let i = 0; i < clean.length; i++) buf[i] = clean.charCodeAt(i) & 0xFF;
    fs.writeFileSync(path.join(amigaDir, 'LoadMap.ab3'), buf);
    return true;
  } catch (err) {
    console.error('Failed to export Amiga files:', err);
    return false;
  }
});

/** Check if the amiga/ subfolder in a project contains exported files. */
ipcMain.handle('check-amiga-export', async (_event: unknown, projectFolder: string): Promise<boolean> => {
  try {
    const amigaDir = path.join(projectFolder, 'amiga');
    if (!fs.existsSync(amigaDir)) return false;
    const files = ['tiles.iff', 'map.bin', 'LoadMap.ab3'];
    return files.every(f => fs.existsSync(path.join(amigaDir, f)));
  } catch {
    return false;
  }
});

/** Read a PNG file from disk and return it as a data URL. */
ipcMain.handle('load-png-file', async (_event: unknown, filePath: string): Promise<string | null> => {
  try {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (err) {
    console.error('Failed to read PNG file:', err);
    return null;
  }
});

/** List a directory; returns { files, folders } for the custom file browser. */
ipcMain.handle('list-directory', async (_event: unknown, dirPath: string): Promise<{ path: string; folders: string[]; files: string[] } | null> => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const folders = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
    return { path: dirPath, folders, files };
  } catch {
    return null;
  }
});

/** Load a project file (.project) at the given path. */
ipcMain.handle('load-project-file', async (_event: unknown, filePath: string): Promise<{ projectFolder: string; projectName: string; data: unknown } | null> => {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const projectFolder = path.dirname(filePath);
    const projectName = path.basename(filePath, path.extname(filePath));
    return { projectFolder, projectName, data: JSON.parse(raw) };
  } catch (err) {
    console.error('Failed to load project:', err);
    return null;
  }
});

/** Load a project file via native dialog (kept as fallback). */
ipcMain.handle('load-project', async (_event: unknown, defaultPath?: string): Promise<{ projectFolder: string; projectName: string; data: unknown } | null> => {
  const opts: Electron.OpenDialogOptions = {
    title: 'Load Project',
    filters: [{ name: 'RetroMap Project', extensions: ['project'] }],
    properties: ['openFile']
  };
  if (defaultPath) opts.defaultPath = defaultPath;
  const result = await dialog.showOpenDialog(opts);

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const projectFolder = path.dirname(filePath);
    const projectName = path.basename(filePath, path.extname(filePath));
    return { projectFolder, projectName, data: JSON.parse(raw) };
  } catch (err) {
    console.error('Failed to load project:', err);
    return null;
  }
});

// ─── Legacy IPC (bits config) — kept for export compatibility ────────────────

const bitsConfigPath = path.join(__dirname, 'assets', 'bits.json');

ipcMain.handle('load-bits-config', async (): Promise<unknown> => {
  const MAX_TILES = 400;
  try {
    if (fs.existsSync(bitsConfigPath)) {
      const raw = fs.readFileSync(bitsConfigPath, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.tileFlags || !Array.isArray(data.tileFlags)) {
        data.tileFlags = new Array(MAX_TILES).fill(0);
      } else {
        while (data.tileFlags.length < MAX_TILES) {
          data.tileFlags.push(0);
        }
      }
      return data;
    }
  } catch (err) {
    console.error('Failed to load bits config:', err);
  }
  return null;
});

ipcMain.handle('save-full-config', async (_event: unknown, data: { bits: unknown; tileFlags: unknown }): Promise<boolean> => {
  try {
    const dir = path.dirname(bitsConfigPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(bitsConfigPath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save full config:', err);
    return false;
  }
});

ipcMain.handle('load-map-json', async (): Promise<unknown> => {
  const result = await dialog.showOpenDialog({
    title: 'Load Exported Map JSON',
    filters: [{ name: 'JSON Map', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load map JSON:', err);
    return null;
  }
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});