# RetroMap Editor

A desktop tilemap editor for creating retro game maps, with Amiga IFF/ILBM export and AmiBlitz3 code generation. Built with Electron + TypeScript.

## Features

- **Tile-based map editor** — place tiles from a PNG tilesheet onto a grid-based map canvas
- **Multiple maps per project** — create, rename, reorder, and delete map tabs within a single project
- **Configurable tile size** — adjust the visual tile grid via a slider (8–64 px) without changing the original image
- **Multi-bitplane IFF export** — select 1–8 bitplanes (2–256 colors), tilesheet is color-quantized and exported as standard ILBM
- **Per-tile bit flags** — 16 configurable flag bits per tile with named labels and color-coded dots on the map
- **AmiBlitz3 source generation** — auto-generates a `.ab3` source file that loads the tilesheet, tilemap, and flag data using the AmiBlitz3 BASIC dialect
- **Map binary export** — exports map data and flags as a compact `.bin` file with a simple header (`AB3M` magic)
- **PNG ↔ IFF converter tab** — load any PNG, quantize to a chosen bit depth, preview palette and converted image, and save as `.iff`/`.ilbm`
- **Project save/load** — projects are saved as a `.project` JSON file alongside the PNG tilesheet, with IFF stored at project creation
- **Custom file browser** — built-in file browser for opening `.project` files without OS dialogs
- **Fullscreen editor** — resizable window with a clean dark UI

## Project Structure

```
retro-map-editor/
├── index.html          # Main window HTML
├── style.css           # UI styles
├── src/
│   ├── main.ts         # Electron main process (IPC handlers, file I/O)
│   ├── preload.ts      # Context bridge API exposed to renderer
│   └── renderer.ts     # All editor logic (canvas drawing, IFF build, UI)
├── assets/
│   └── jszip.min.js    # JSZip (loaded via script tag)
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Install & Run

```bash
npm install
npm run build    # compile TypeScript
npm start        # launch the Electron app
```

Or use `npm run dev` to watch TypeScript and restart the app automatically.

## Usage

### Creating a New Project

1. **File → New Project** (or Ctrl+N)
2. **Pick a PNG tilesheet** — your tile graphics laid out in a grid
3. **Choose a target folder** — where the project will be saved
4. **Set bitplanes** — slider (1–8) determines how many colors the tilesheet IFF will have
5. Enter a project name and first map name, then click **Create Project**

The editor creates a folder containing:
- `yourfile.png` — the tilesheet image
- `yourfile.iff` — the quantized IFF/ILBM (generated at project creation)
- `YourProject.project` — JSON project file with maps, flags, and settings

### Editing

- **Left-click** on the tilesheet to select a tile
- **Left-click/drag** on the map canvas to place tiles
- **Right-click** a tile on the tilesheet to toggle the current flag bit on/off
- **Right-click** on the map canvas to zoom/pan (context menu disabled)
- **Mousewheel** to zoom the map view

### Tile Size Slider

The **Tile Size** slider in the toolbar changes the visual grid size. This does **not** modify the original image — it only changes how the grid overlays it. The slider value is saved with the project and used by the Amiga export (AB3 code, tile coordinate math).

### Bit Flags

16 flag bits are available per tile. In the **Flags** panel (right sidebar):
- Click a row to select the active bit
- Enter a **name** to label the flag
- Pick a **color** for the dot indicator
- Check **Show bits on map** to overlay colored dots on placed tiles

### Amiga Export

**File → Export Amiga** generates three files in the `amiga/` subfolder of your project:

| File | Description |
|------|-------------|
| `tiles.iff` | Multi-bitplane ILBM of the full tilesheet image |
| `map.bin` | Binary tilemap + flag data (`AB3M` header format) |
| `LoadMap.ab3` | AmiBlitz3 source code to load & render the map |

The AB3 code creates two bitmaps, loads the IFF tilesheet, reads tilemap/flag data, and renders the map using `GetaShape`/`Blit` per tile.

### PNG → IFF Converter

The **PNG ↔ IFF** tab lets you convert any PNG to IFF/ILBM independently:
1. Pick a PNG file
2. Adjust the bitplanes slider
3. Preview the color-quantized result and palette
4. Click **Convert & Save** to write the IFF file

### Project Settings

**File → Settings** lets you change the project name and bitplane count after creation. The IFF is **not** regenerated from settings changes — create a new project or use the converter tab if you need a new IFF.

## Map Binary Format (map.bin)

```
Offset  Size  Description
0       4     Magic "AB3M"
4       2     Version (1)
6       2     Map columns
8       2     Map rows
10      2     Number of tiles in tilesheet
12      N*2   Tile indices (row-major, uint16 BE)
...     M*2   Tile flags (uint16 BE per tilesheet tile)
```

## IFF/ILBM Format

Exported IFF files use standard ILBM with:
- **BMHD** chunk — image dimensions, bitplane depth (1–8)
- **CMAP** chunk — palette (3 bytes per color, 2^n entries)
- **BODY** chunk — interleaved bitplane data (plane-by-plane per scanline)

Compression is not used (uncompressed BODY). Amiga `camg` in BMHD is set to 0 (no special mode bits).

## License

MIT