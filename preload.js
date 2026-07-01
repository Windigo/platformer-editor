"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    tileSize: 16,
    scale: 2,
    tilesheetCols: 20,
    tilesheetRows: 20,
    mapCols: 20,
    mapRows: 16,
    /** Open a file dialog to pick a PNG tilesheet. Returns { dataUrl, fileName } or null. */
    pickPng: () => electron_1.ipcRenderer.invoke('pick-png'),
    /** Open a folder dialog to pick where to create the project. Returns path or null. */
    pickFolder: (defaultPath) => electron_1.ipcRenderer.invoke('pick-folder', defaultPath),
    /** Create a new project: folder + copied PNG + .project file. Returns the project folder path or null. */
    createProject: (data) => electron_1.ipcRenderer.invoke('create-project', data),
    /** Save the project file at the known folder path. */
    saveProjectFile: (data) => electron_1.ipcRenderer.invoke('save-project-file', data),
    /** Check if the amiga/ subfolder contains exported files. */
    checkAmigaExport: (projectFolder) => electron_1.ipcRenderer.invoke('check-amiga-export', projectFolder),
    /** Read a PNG file from disk and return it as a data URL. */
    loadPngFile: (filePath) => electron_1.ipcRenderer.invoke('load-png-file', filePath),
    /** Export Amiga files (IFF, map.bin, .ab3) to the amiga/ subfolder. */
    exportAmiga: (data) => electron_1.ipcRenderer.invoke('export-amiga', data),
    /** List a directory for the custom file browser. */
    listDirectory: (dirPath) => electron_1.ipcRenderer.invoke('list-directory', dirPath),
    /** Load a project file at a specific path (for custom file browser). */
    loadProjectFile: (filePath) => electron_1.ipcRenderer.invoke('load-project-file', filePath),
    /** Load a .project project file via native dialog. Returns { projectFolder, projectName, data } or null. */
    loadProject: (defaultPath) => electron_1.ipcRenderer.invoke('load-project', defaultPath),
    /** Load the bits.json config file from the assets folder. */
    loadBitsConfig: () => electron_1.ipcRenderer.invoke('load-bits-config'),
    /** Save both bits definitions and per-tile flags to bits.json. */
    saveFullConfig: (bits, tileFlags) => electron_1.ipcRenderer.invoke('save-full-config', { bits, tileFlags }),
    /** Open a dialog to load a previously exported map JSON. */
    loadMapJson: () => electron_1.ipcRenderer.invoke('load-map-json')
};
electron_1.contextBridge.exposeInMainWorld('editorApi', api);
//# sourceMappingURL=preload.js.map