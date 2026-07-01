# RetroMapEditor

A desktop tile-map editor for creating 2D retro game levels targeting the **Commodore Amiga**, built with **Electron** and **TypeScript**. Designed to work with **AmiBlitz3** (Blitz Basic), it produces a complete export package (IFF tilesheet, binary map, and AmiBlitz3 loader source).

---

## Features

### Project-based workflow
- **New Project** — Create a project folder with a configurable name and location. Select your PNG tilesheet, set tilesheet dimensions (cols × rows), map dimensions, and an initial map name.
- **Save Project** — Saves the current state (all maps, tilesheet reference, bit flags, tile definitions) into a `.project` file inside the project folder. The original PNG tilesheet is also copied there.
- **Load Project** — Opens an in‑editor file browser showing `.project` files. Double‑click or select + Open to restore a project with all its maps.

### Multi-Map / Level Management
- **Multiple levels** per project — each map has its own name, tile grid, and dimensions.
- **Level list** — a vertical panel between the map editor and tile selector shows all levels.
- **Add maps** — click the **+** button at the bottom of the level list to add a new level.
- **Rename maps** — click the currently active level's name to open the rename dialog.
- **Delete maps** — click the **×** button on a level to delete it (the last map cannot be deleted).
- **Reorder maps** — drag and drop a level tab up or down in the list to reorder. Other tabs slide apart to show the drop position.

### Tile Map Editing
- **Map Canvas** — Configurable grid size (default 20×16 = 320×256 px, matching the classic Amiga PAL low‑resolution screen). Each map in a project can have its own dimensions.
- **Tile Selector** — Pick tiles from the loaded tilesheet. Selected tile is highlighted with a red outline.
- **Ghost Preview** — Hover over the map to see a semi‑transparent preview of the active tile with a gold outline.
- **Paint & Drag** — Click and drag on the map to place tiles.
- **Grid Overlays** — Grid lines on both the map and tilesheet canvases.

### Bit Flags (BTST)
- **16 flags** per tile, each with a configurable name and colour.
- **Flag column** on the right — click a flag to make it active, edit its name or colour inline.
- **Right‑click** a tile on the tilesheet to toggle the active flag on that tile.
- **Show bits on map** toggle — overlay coloured dots on the map to visualise which flags are set per tile.

### Amiga Export
- **Preview** all generated files before exporting:
  - **tiles.iff** — 1‑bitplane IFF/ILBM file of the tilesheet (2 colours, black + foreground). Hover to see a rendered thumbnail.
  - **map.bin** — Binary map data (exported but **not yet used** by the loader; map data is currently embedded in the `.ab3` source as `Data.w` statements).
  - **LoadMap.ab3** — AmiBlitz3 source that loads the tilesheet and renders the map using `GetaShape` + `Blit`.
- Click **Export** to write the files into the `amiga/` subfolder.
- A **Preview Export** button becomes active after the first successful export.
- **Amiga display**: 320×256 PAL, 2 bitplanes, `Slice 0,44,2` copper list setup.

### Loading in AmiBlitz3
The generated `LoadMap.ab3` embeds all map data as `Data.w` statements and loads them at startup with `Restore`/`Read`:

```basic
Dim tilemap.w(mapW * mapH)
Dim tileFlags.w(maxTiles)

Restore MapData
For i = 0 To mapW * mapH - 1
  Read tmp.w
  tilemap(i) = tmp
Next i

Restore FlagData
For i = 0 To maxTiles - 1
  Read tmp.w
  tileFlags(i) = tmp
Next i
```

Tiles are rendered by grabbing shapes from the tilesheet bitmap and blitting them to the screen bitmap:

```basic
For y = 0 To mapH - 1
  For x = 0 To mapW - 1
    tile  = tilemap(y * mapW + x)
    srcX  = (tile MOD tilesheetCols) * 16
    srcY  = tile / tilesheetCols
    srcY  = srcY * 16
    dstX  = x * 16
    dstY  = y * 16
    Use BitMap 0
    GetaShape 0, srcX, srcY, 16, 16
    Use BitMap 1
    Blit 0, dstX, dstY
  Next
Next
```

> **Note**: The `map.bin` file is exported as a binary alternative but is not yet consumed by the AB3 loader. Future versions may switch to loading from `map.bin` for smaller source files.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Electron](https://www.electronjs.org/) |
| Language | [TypeScript](https://www.typescriptlang.org/) 5.9 |
| Rendering | HTML5 Canvas |
| Styling | CSS |

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm (included with Node.js)

## Installation

```bash
# Clone the repository
git clone https://github.com/Windigo/retro-map-editor.git
cd retro-map-editor

# Install dependencies
npm install
```

## Usage

### Run the editor

```bash
npm start
```

This compiles TypeScript and launches the Electron application.

### Compile TypeScript only

```bash
npm run compile
```

---

## Project Structure

```
retro-map-editor/
├── assets/                  # Static assets (tilesheets, JSZip)
│   └── monochrome_tilemap_packed.png
├── src/
│   ├── main.ts              # Electron main process (IPC handlers, file I/O)
│   ├── preload.ts           # Preload script (context bridge)
│   └── renderer.ts          # Canvas editor, UI, multi-map & export logic
├── index.html               # Editor HTML shell (modals, panels)
├── style.css                # Editor styles (incl. level list & drag indicators)
├── package.json             # Project config & dependencies
├── tsconfig.json            # TypeScript configuration
└── README.md
```

---

## License

This project is licensed under the [MIT License](LICENSE).