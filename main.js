"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function createWindow() {
    const win = new electron_1.BrowserWindow({
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
electron_1.ipcMain.handle('pick-png', async () => {
    const result = await electron_1.dialog.showOpenDialog({
        title: 'Select Tilesheet PNG',
        filters: [{ name: 'PNG Images', extensions: ['png'] }],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0)
        return null;
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
    }
    catch (err) {
        console.error('Failed to read PNG:', err);
        return null;
    }
});
/** Pick a folder path; returns the selected folder path or null. */
electron_1.ipcMain.handle('pick-folder', async (_event, defaultPath) => {
    const opts = {
        title: 'Select Project Folder',
        properties: ['openDirectory', 'createDirectory']
    };
    if (defaultPath)
        opts.defaultPath = defaultPath;
    const result = await electron_1.dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0)
        return null;
    return result.filePaths[0];
});
/**
 * Create a new project: creates a folder at the given path, copies the PNG
 * tilesheet into it, and writes the .project project file.
 * Returns the project folder path on success, null on failure.
 */
electron_1.ipcMain.handle('create-project', async (_event, data) => {
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
    }
    catch (err) {
        console.error('Failed to create project:', err);
        return null;
    }
});
/** Save the project file (.project) at the given folder path. */
electron_1.ipcMain.handle('save-project-file', async (_event, data) => {
    try {
        const projectPath = path.join(data.projectFolder, `${data.projectName}.project`);
        const { projectFolder, projectName, ...projectData } = data;
        const projectJson = JSON.stringify(projectData, null, 2);
        fs.writeFileSync(projectPath, projectJson, 'utf-8');
        return true;
    }
    catch (err) {
        console.error('Failed to save project file:', err);
        return false;
    }
});
/** Export Amiga files (tiles.iff, map.bin, LoadMap.bb) to the project's amiga/ subfolder. */
electron_1.ipcMain.handle('export-amiga', async (_event, data) => {
    try {
        const amigaDir = path.join(data.projectFolder, 'amiga');
        fs.mkdirSync(amigaDir, { recursive: true });
        fs.writeFileSync(path.join(amigaDir, 'tiles.iff'), Buffer.from(data.iffData));
        fs.writeFileSync(path.join(amigaDir, 'map.bin'), Buffer.from(data.mapBinData));
        // Write AB3 source — AmiBlitz3 uses LF (0x0A) line endings on AmigaOS.
        // The .ab3 extension tells the IDE to treat it as AmiBlitz3 source.
        const clean = data.ab3Source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const buf = Buffer.alloc(clean.length);
        for (let i = 0; i < clean.length; i++)
            buf[i] = clean.charCodeAt(i) & 0xFF;
        fs.writeFileSync(path.join(amigaDir, 'LoadMap.ab3'), buf);
        return true;
    }
    catch (err) {
        console.error('Failed to export Amiga files:', err);
        return false;
    }
});
/** Check if the amiga/ subfolder in a project contains exported files. */
electron_1.ipcMain.handle('check-amiga-export', async (_event, projectFolder) => {
    try {
        const amigaDir = path.join(projectFolder, 'amiga');
        if (!fs.existsSync(amigaDir))
            return false;
        const files = ['tiles.iff', 'map.bin', 'LoadMap.ab3'];
        return files.every(f => fs.existsSync(path.join(amigaDir, f)));
    }
    catch {
        return false;
    }
});
/** Read a PNG file from disk and return it as a data URL. */
electron_1.ipcMain.handle('load-png-file', async (_event, filePath) => {
    try {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
    }
    catch (err) {
        console.error('Failed to read PNG file:', err);
        return null;
    }
});
/** List a directory; returns { files, folders } for the custom file browser. */
electron_1.ipcMain.handle('list-directory', async (_event, dirPath) => {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const folders = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
        const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
        return { path: dirPath, folders, files };
    }
    catch {
        return null;
    }
});
/** Load a project file (.project) at the given path. */
electron_1.ipcMain.handle('load-project-file', async (_event, filePath) => {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const projectFolder = path.dirname(filePath);
        const projectName = path.basename(filePath, path.extname(filePath));
        return { projectFolder, projectName, data: JSON.parse(raw) };
    }
    catch (err) {
        console.error('Failed to load project:', err);
        return null;
    }
});
/** Load a project file via native dialog (kept as fallback). */
electron_1.ipcMain.handle('load-project', async (_event, defaultPath) => {
    const opts = {
        title: 'Load Project',
        filters: [{ name: 'RetroMap Project', extensions: ['project'] }],
        properties: ['openFile']
    };
    if (defaultPath)
        opts.defaultPath = defaultPath;
    const result = await electron_1.dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0)
        return null;
    const filePath = result.filePaths[0];
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const projectFolder = path.dirname(filePath);
        const projectName = path.basename(filePath, path.extname(filePath));
        return { projectFolder, projectName, data: JSON.parse(raw) };
    }
    catch (err) {
        console.error('Failed to load project:', err);
        return null;
    }
});
// ─── Legacy IPC (bits config) — kept for export compatibility ────────────────
const bitsConfigPath = path.join(__dirname, 'assets', 'bits.json');
electron_1.ipcMain.handle('load-bits-config', async () => {
    const MAX_TILES = 400;
    try {
        if (fs.existsSync(bitsConfigPath)) {
            const raw = fs.readFileSync(bitsConfigPath, 'utf-8');
            const data = JSON.parse(raw);
            if (!data.tileFlags || !Array.isArray(data.tileFlags)) {
                data.tileFlags = new Array(MAX_TILES).fill(0);
            }
            else {
                while (data.tileFlags.length < MAX_TILES) {
                    data.tileFlags.push(0);
                }
            }
            return data;
        }
    }
    catch (err) {
        console.error('Failed to load bits config:', err);
    }
    return null;
});
electron_1.ipcMain.handle('save-full-config', async (_event, data) => {
    try {
        const dir = path.dirname(bitsConfigPath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(bitsConfigPath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    }
    catch (err) {
        console.error('Failed to save full config:', err);
        return false;
    }
});
electron_1.ipcMain.handle('load-map-json', async () => {
    const result = await electron_1.dialog.showOpenDialog({
        title: 'Load Exported Map JSON',
        filters: [{ name: 'JSON Map', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0)
        return null;
    const filePath = result.filePaths[0];
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (err) {
        console.error('Failed to load map JSON:', err);
        return null;
    }
});
// ─── App lifecycle ────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
//# sourceMappingURL=main.js.map