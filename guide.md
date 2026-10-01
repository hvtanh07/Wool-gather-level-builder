# Wool Gather — Level Builder & Playtest Studio Guide

Welcome to the **Wool Gather Level Builder** codebase. This guide is written specifically for developers and AI assistants (Antigravity) continuing work on this project on any machine. It outlines the project's game concept, architecture, key algorithms, calibrated parameters, and roadmap for future features.

---

## 1. Game Concept & Mechanics

The game is a puzzle game where:
1. **The Board ("Mess of Boxes")**:
   - Boxes with different wool capacities (`Box4`, `Box6`, `Box10`), orientations (angles), and wool colors (`1` to `8`) are arranged on a 2D board.
   - An arrow on each box points along its exit direction.
   - **Clear Path Rule**: A box can **only** exit the board if there is a completely unobstructed path in its arrow direction. If any other box intersects its exit corridor, it is blocked.
2. **The Spool Shelf (Top)**:
   - There are active slots (default 4 active slots, expandable).
   - When a free box is clicked, it launches from the board and docks into an empty slot.
3. **The Dragon & Cat**:
   - A serpentine road track winds above the shelf.
   - A **Dragon** composed of knitted wool sections crawls steadily along this track towards the **Cat**.
   - The **Cat** rests at designated checkpoints along the track.
   - When the dragon head reaches the cat, the cat gets startled and leaps backwards to the next checkpoint.
   - **Lose Condition**: If the dragon reaches the cat at its **final safety position**, Game Over triggers.
4. **Wool Retrieval**:
   - While docked in a slot, if the dragon contains a matching color section, wool yarn connects the dragon to the spool.
   - Every tick ($\approx 0.16$s), 1 unit of wool transfers from the dragon to the box until the box is full.
   - Multiple spools of different colors can pull simultaneously from their respective matching dragon sections.
   - When full (e.g. `6/6`), the box completes with a chime, departs upward, and **frees the slot** for the next box.
5. **Win Condition**:
   - All dragon wool gathered and all boxes cleared from the board.

---

## 2. Project Architecture & Directory Structure

```text
Wool-gather-level-builder/
├── docs/                       # Production build output for GitHub Pages hosting
│   ├── index.html
│   ├── assets/
│   └── .nojekyll
├── src/
│   ├── types/
│   │   └── level.ts            # TypeScript schemas (CleanLevelData & LegacyLvMap)
│   ├── utils/
│   │   ├── colors.ts           # Box dimensions, 8 wool colors, capacity mappings
│   │   ├── collision.ts        # 2D OBB math, raycasting, and clear exit path analysis
│   │   ├── dragonSolver.ts     # Topological unblocking solver & guaranteed dragon generator
│   │   └── audio.ts            # Web Audio API procedural sound synthesizer
│   ├── data/
│   │   └── demoLevel.ts        # Pre-loaded Demo Level 110089 (49 boxes), starter & empty presets
│   ├── components/
│   │   ├── TopNavbar.tsx       # Metadata, camera size, 4+ active slots selector, presets
│   │   ├── Sidebar.tsx         # Box adding tools, color palette, direction buttons, alignment
│   │   ├── CanvasEditor.tsx    # Interactive 2D board canvas, real-time solver HUD, drag & drop
│   │   ├── DragonEditor.tsx    # Dragon wool timeline, auto-generate dragon trigger & difficulty
│   │   ├── PlaytestView.tsx    # 60 FPS playable simulation (Dragon, Cat, Slots, Yarn threads)
│   │   └── ImportExportModal.tsx # JSON manager (Clean JSON export & Legacy lvmap auto-converter)
│   ├── App.tsx                 # Root application state, undo/redo stack, hotkeys
│   ├── main.tsx
│   └── index.css               # Tailwind CSS v4 styling
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts              # Configured with base: './' and outDir: 'docs'
└── guide.md                    # This developer guide
```

---

## 3. Data Formats

### 3.1 Clean Level Format (`CleanLevelData`)
A minimal, readable JSON format containing only the essential gameplay data:

```json
{
  "version": "1.0",
  "levelId": 110089,
  "levelType": "Normal",
  "camera": {
    "cameraSize": 7.796,
    "boxRootX": 0.0,
    "boxRootZ": -1.597,
    "boxRootAngle": 0.0,
    "boxRootDisperse": -0.039
  },
  "slots": {
    "count": 5,
    "unlockedCount": 4
  },
  "dragon": {
    "speed": 0.015,
    "track": [
      { "x": -3.4, "y": 7.2 },
      { "x": 1.5, "y": 7.2 },
      { "x": 3.2, "y": 6.2 },
      { "x": -2.8, "y": 4.5 },
      { "x": 3.4, "y": 1.8 }
    ],
    "catPositions": [
      { "id": 1, "progress": 0.35, "name": "Checkpoint 1" },
      { "id": 2, "progress": 0.70, "name": "Checkpoint 2" },
      { "id": 3, "progress": 0.95, "name": "Final Safety Point" }
    ],
    "sections": [
      { "color": 2, "count": 6 },
      { "color": 6, "count": 10 }
    ]
  },
  "boxes": [
    {
      "id": 1,
      "x": 2.636,
      "z": -5.415,
      "angle": 90,
      "numType": "Box6",
      "capacity": 6,
      "color": 2,
      "boxType": "Normal"
    }
  ]
}
```

### 3.2 Legacy Format Support (`LegacyLvMap`)
The tool includes a built-in bidirectional converter in `src/data/demoLevel.ts`:
- Converts legacy `lvmap_*.json` files (containing `pos: {x, z}`, `hardColor`, `numType`, `boxType`, `infos`) into `CleanLevelData`.
- The Import dialog in `ImportExportModal.tsx` automatically detects legacy vs clean format on paste.

---

## 4. Key Calibrated Parameters & Conventions

### 4.1 Coordinate Space & Angles
- **World Coordinate Space**:
  - Horizontal axis: $+X$ (Right), $-X$ (Left)
  - Vertical axis: $+Z$ (Up), $-Z$ (Down)
- **Angles (Degrees)**:
  - $0^\circ$: Points **Up** ($+Z$, vector $[0, +1]$)
  - $90^\circ$: Points **Right** ($+X$, vector $[+1, 0]$)
  - $180^\circ$: Points **Down** ($-Z$, vector $[0, -1]$)
  - $270^\circ$: Points **Left** ($-X$, vector $[-1, 0]$)

### 4.2 Calibrated Non-Clipping Box Dimensions
In `src/utils/colors.ts`, dimensions are calibrated against the real game grid:
- **Width**: `0.54` (for all boxes, ensuring a clean $\approx 0.17$ gap between parallel columns).
- **Box4**: `width: 0.54, length: 0.54` (4 wool capacity).
- **Box6**: `width: 0.54, length: 0.76` (6 wool capacity).
- **Box10**: `width: 0.54, length: 0.98` (10 wool capacity; fits within the $1.12$ pitch without overlapping end-to-end neighbors).

### 4.3 Slot Configuration
- Levels default to **at least 4 active slots** (`slots.unlockedCount: 4`).
- TopNavbar allows toggling 4, 5, 6, or 7 active slots.

---

## 5. Core Systems Explained

### 5.1 Collision & Raycasting (`src/utils/collision.ts`)
- `checkExitPath(sourceBox, allBoxes)`:
  - Computes the oriented bounding box (OBB) corners for all boxes.
  - Casts parallel forward rays spanning the front edge of `sourceBox` along its angle vector.
  - Tests ray intersections against bounding segments of all other boxes.
  - Returns `{ isBlocked, blockingBoxId, distanceToBlocker, hitPoint }`.

### 5.2 Auto-Generate Dragon (`src/utils/dragonSolver.ts`)
- `solveBoxLayout(boxes)`:
  - Simulates removing unobstructed boxes one by one.
  - Detects **circular deadlocks** (if remaining boxes mutually block each other).
  - Returns `solutionOrder` (the exact topological clearance order).
- `autoGenerateDragonSections(boxes, slotCount, difficulty)`:
  - Simulates the slot buffer (size $K=4$).
  - Emits wool chunks matching the boxes currently in slots.
  - Difficulty modes:
    - `'easy'`: Clean, grouped blocks by box.
    - `'normal'`: Interleaved wool chunks of 2–3 units between active slots.
    - `'hard'`: Tighter chunks of 1–2 units requiring fast slot swaps.
  - **Guarantees 100% solvability** without running out of slots.

### 5.3 Playtest Engine (`src/components/PlaytestView.tsx`)
- **Important Design Pattern**:
  - The game simulation loop runs on a persistent `engineRef` inside `requestAnimationFrame`.
  - Continuous variables (`dragonProgress`, `woolGatherTimer`, `yarnParticles`, `slottedBoxes`, `boardZoomScale`, `boardPanOffset`) are updated directly inside the engine loop, **never** in state hooks that trigger component unmount/remount.
  - React state is used strictly for static UI modals (pause, victory, defeat, progress bar throttling, zoom display percentage).
- **Pan & Zoom in Playtest View**:
  - **Scroll to Zoom**: Mouse wheel zoom smoothly scales the board centered around the cursor position (range $0.4\times$ to $3.0\times$).
  - **Drag to Pan**: Dragging anywhere on the board with left-click pans the view. A drag threshold ($>4$px) cleanly differentiates a pan gesture from a box tap/click ($\le 4$px).
  - **Middle & Right Click**: Middle-click and right-click drag also pan the camera.
  - **Keyboard Shortcuts**: `+` / `=` to zoom in, `-` / `_` to zoom out, `0` / `Home` to reset view.
  - **Floating Zoom Widget (Bottom-Left)**: Sleek HUD buttons for Zoom In (`+`), Zoom Out (`-`), Zoom Percentage indicator (clickable), and Reset Camera (`Maximize2`).
  - **Fixed HUD & Visual Clipping**: The top road track and spool shelf remain pinned as fixed UI elements while the board area beneath is smoothly panned and zoomed. Boxes are clipped to remain below the shelf boundary.
  - **Dynamic Cursors**: `cursor-grab` on canvas, `cursor-grabbing` while panning, `cursor-pointer` on clear unblocked boxes, and `cursor-not-allowed` on blocked boxes.
- **Segment Retrieval & Backward Reconnect Animation**:
  - When a box docked in a slot matches a dragon section, wool yarn streams from the dragon segment into the spool with animated Bezier threads and traveling particles.
  - Once the segment's wool is retrieved and the segment is removed from the dragon, the back tail remains anchored at its track position.
  - The front part of the dragon (from the removed segment forward to the dragon head) rolls **backward** along the track towards the back tail.
  - While moving backward, forward progress is paused, and the dragon moves away from the cat / checkpoints, providing vital breathing room for the player.
  - Once the front body connects with the back tail (*snap!* audio feedback and visual connection), the body is fully attached and the dragon resumes crawling forward.
- **Fog Area & Starting Point Rules**:
  - **Fog Area (0.0 to 1/3 track progress)**:
    - Covers the first third of the dragon track ($0.0 \le P \le 1/3$).
    - Boxes **cannot scan or retrieve** any wool segments or knots while they reside inside this fog area.
    - Knots inside the fog are rendered translucent ($35\%$ opacity) with a frosted outline and covered in animated drifting mist puffs.
  - **Starting Point (P = 1/3)**:
    - The dragon begins the level with its head stationed right at the start gate ($P = 1/3$), with its wool body trailing behind in the fog.
    - As the dragon crawls forward, sections emerge from the fog across the start gate and become active for gathering.
    - **Head Boundary Clamping**: When a segment is taken and the dragon head retreats backward, it **cannot go back beyond the starting point**.
    - **Body Forward Catch-Up**: If the head reaches the starting point ($P = 1/3$), the head clamps in place, and the **body (back tail) moves up/forward along the track to connect with the head**. Once attached, the dragon continues forward.
  - **Visual Indicators**:
    - The track features a foggy mist ribbon, animated drifting clouds, and a `🌫️ FOG (LOCKED)` label.
    - A cyan-and-white checkered finish line and `🚩 START` badge mark the boundary at $P = 1/3$.
    - The top HUD progress bar displays the fog region ($0\% - 33\%$) and a cyan start line tick.

### 5.4 Canvas Editor (`src/components/CanvasEditor.tsx`)
- **Move Box Interaction**:
  - Dragging updates box coordinates with grid snapping live on the canvas (`onUpdateBoxes(updated, false)`).
  - History snapshots are **only** committed once on `mouseUp` (`onUpdateBoxes(updated, true)`) to prevent history array bloat and eliminate lag.
  - Hover cursor changes to `cursor-grab`, dragging to `cursor-grabbing`.
- **Keyboard Shortcuts**:
  - `1` – `8`: Set wool color (1 to 8).
  - `C`: Cycle capacity (`Box4` $\rightarrow$ `Box6` $\rightarrow$ `Box10` $\rightarrow$ `Box4`).
  - `Q`, `W`, `E`: Set capacity to `Box4`, `Box6`, `Box10`.
  - `R`: Rotate $90^\circ$ clockwise (`Shift+R` for counter-clockwise).
  - `Ctrl + D`: Duplicate selected.
  - `Del` / `Backspace`: Delete selected.
  - `Middle-click + Drag` / `Alt + Drag`: Pan.
- **Exit Order & Solvability HUD**:
  - Located at **bottom-right** of the canvas.
  - Shows real-time badge: `Solvable (X/X)` or `Deadlock (Y Stuck)`.
  - "Show Exit Order" button displays high-contrast obsidian-and-gold badges (`#1`, `#2`...) on the boxes.
  - "Select Stuck" button immediately grabs deadlocked boxes.

---

## 6. How to Run, Build & Host

### Local Development
```bash
npm install
npm run dev
# Opens at http://localhost:5173/
```

### Production Build & GitHub Pages
The project is configured to output directly to the `/docs` folder for GitHub Pages:
```bash
npm run build
```
To host on GitHub:
1. Commit the repository (including the `/docs` folder).
2. Push to GitHub.
3. In GitHub Repository **Settings** $\rightarrow$ **Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main` (or `master`)
   - Folder: `/docs`
   - Click **Save**.

---

## 7. Roadmap / Future Features to Implement

When continuing this project, consider these next steps:
1. **Gimmicks & Special Boxes**:
   - The original game schema supports `Ice`, `Question`, `Chain`, `Garage`, `Conveyor`, `KeyLock`.
   - Add visual representations and game mechanics for locked boxes (e.g. Ice breaking on match, Garage releasing a queue of boxes).
2. **Interactive Dragon Track Editor**:
   - Add handles on the road track in the editor so designers can drag spline waypoints or add custom curves.
3. **Cat Checkpoint Positioning**:
   - Add visual sliders or path markers to position the cat checkpoints interactively on the canvas.
4. **Mobile Layout Preview**:
   - Add a device frame preview toggle (e.g. iPhone / Android aspect ratio overlay) to preview how the level fits on mobile screens.
