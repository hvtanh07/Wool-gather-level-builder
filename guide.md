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
    },
    {
      "id": 2,
      "x": -0.8,
      "z": -0.6,
      "angle": 270,
      "numType": "Box4",
      "capacity": 4,
      "color": 6,
      "boxType": "Ice"
    }
  ],
  "tunnels": [
    {
      "id": 1,
      "x": 2.6,
      "z": 0.5,
      "angle": 0,
      "queue": [
        { "id": 101, "x": 2.6, "z": 0.5, "angle": 0, "numType": "Box4", "capacity": 4, "color": 1 }
      ]
    }
  ],
  "conveyors": [
    {
      "id": 1,
      "z": -4.4,
      "startX": -4.5,
      "endX": 4.5,
      "activeZoneMinX": -2.4,
      "activeZoneMaxX": 2.4,
      "direction": "left-to-right",
      "speed": 0.8,
      "boxes": [
        { "id": 201, "x": -1.2, "z": -4.4, "angle": 0, "numType": "Box4", "capacity": 4, "color": 2 }
      ]
    }
  ]
}
```

### 3.2 Legacy Format Support (`LegacyLvMap`) & JSON File Import
The tool includes a built-in bidirectional converter in `src/data/demoLevel.ts`:
- Converts legacy `lvmap_*.json` files (containing `pos: {x, z}`, `hardColor`, `numType`, `boxType`, `infos`) into `CleanLevelData`.
- **JSON File Import Options**:
  - **Direct Top Navbar Button**: Click `"Open JSON File"` in the top navigation bar to choose any `.json` file from your device and load it immediately into the builder.
  - **Drag-and-Drop Dropzone in Data Manager Modal**: Open `"JSON Import / Export"` to drag & drop `.json` or `.txt` files directly into the modal, displaying filename, filesize, Level ID, box count, and auto-conversion status.
  - **Manual Paste & Textarea**: Direct JSON string editing and pasting with auto-format detection.

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

### 4.4 Calibrated Wool Color Palette (`src/utils/colors.ts`)
The 8 official wool color IDs and their hex assignments:
- `1`: **Red** (`#ef4444`)
- `2`: **Blue** (`#2563eb`)
- `3`: **Green** (`#22c55e`)
- `4`: **Yellow** (`#eab308`)
- `5`: **Pink** (`#ec4899`)
- `6`: **Orange** (`#f97316`)
- `7`: **Purple** (`#9333ea`)
- `8`: **Cyan** (`#06b6d4`)

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
  - **Floating Zoom Widget (Bottom-Right)**: Sleek HUD buttons for Zoom In (`+`), Zoom Out (`-`), Zoom Percentage indicator (clickable), and Reset Camera (`Maximize2`), anchored over the right-side board area.
  - **Fixed UI & Visual Clipping**: The left area (road track, dragon, and spool shelf) remains fixed while the board area in the right half is smoothly panned and zoomed. Boxes are strictly clipped to the right half.
  - **Dynamic Cursors**: `cursor-grab` on canvas, `cursor-grabbing` while panning, `cursor-pointer` on clear unblocked boxes, and `cursor-not-allowed` on blocked boxes.
- **Side-by-Side 50/50 Screen Division**:
  - **Left Half (0% to 50% Width)**:
    - Dedicated to the dragon crawl track, Cat checkpoints, and the Spool Shelf (docked bus slots).
    - Features a soft spring meadow green background (`#f0fdf4` to `#dcfce7`).
    - The Spool Shelf is anchored across the bottom of the left half (`shelfY = height - 90`), below the track.
    - Animated Bezier yarn retrieval threads & traveling particles connect dragon segments directly into docked spools within this left area.
  - **Right Half (50% to 100% Width)**:
    - Dedicated entirely to the messy box puzzle layout, conveyors, tunnels, and frozen boxes on a warm sand/cream table background (`#fefce8` to `#fef3c7`).
    - Centered camera (`cx = midX + rightW / 2`, `cy = height / 2`), with smooth zoom and pan controls.
    - Strictly clipped to the right half (`ctx.rect(midX, 0, rightW, height)`), ensuring panned boxes never cross into the dragon or shelf area.
    - Interactive hover cursor and box click detection active only when `mouseX >= midX`.
- **Dragon Wool Visibility & Compact Head**:
  - **Full Color Visibility Across Entire Track**: All dragon wool segments display in 100% full vibrant color (`col.hex`, `col.lightHex`, `col.darkHex`) with 3D spherical knitted texture along the entire path (no grey desaturation, no opacity fading, no obscuring clouds).
  - **Compact Non-Overlapping Dragon Head**: Scaled to 10px radius and anchored forward at `(5, 0)` so it leads at the front tip like a cute dragon mask without extending backward over the first segment. The first and all following segments remain 100% visible.
  - **Start Gate & Boundary Rule**: Checkered cyan-and-white start line across the path at $P = 1/3$. Segments crossing past this line become active for gathering, and dragon head retreats are clamped at this starting point.
- **Segment Retrieval & Backward Reconnect Animation**:
  - When a box docked in a slot matches a dragon section, wool yarn streams from the dragon segment into the spool with animated Bezier threads and traveling particles.
  - Once the segment's wool is retrieved and the segment is removed from the dragon, the back tail remains anchored at its track position.
  - The front part of the dragon (from the removed segment forward to the dragon head) rolls **backward** along the track towards the back tail.
  - While moving backward, forward progress is paused, and the dragon moves away from the cat / checkpoints, providing vital breathing room for the player.
  - Once the front body connects with the back tail (*snap!* audio feedback and visual connection), the body is fully attached and the dragon resumes crawling forward.

### 5.4 Procedural Tight-Fit Layout Generator (`src/utils/layoutGenerator.ts`)
- **1-Click Procedural Randomization**:
  - Activated via the **Randomize** button in the Top Navbar (next to Presets) or in the Left Sidebar.
  - Automatically synthesizes a **49-box near tight-fit puzzle layout** with randomized positions and interlocking geometry, without copying the demo preset.
- **Key Algorithmic Phases**:
  1. **Multi-Band Packing**: Sweeps across 8 horizontal row bands with subtle organic $Z$-jitter, packing horizontal and vertical boxes with snug spacing ($\approx 0.065$ gap).
  2. **Interlocking Geometry**: Randomly chooses horizontal buses (spanning along $X$ within a row) and vertical buses (bridging across rows along $Z$), creating natural jigsaw interlocking patterns and blocking dependencies.
  3. **Capacity Mix**: Balances `Box4` (40%), `Box6` (35%), and `Box10` (25%).
  4. **Reverse-Unpeeling Topological Solver**: Rather than assigning random angles that might cause insoluble circular deadlocks, the generator solves exit orientations in reverse from the outer perimeter inward. This guarantees **100% solvability** on every generated layout.
  5. **Balanced Wool Palette**: Evenly distributes all 8 wool colors across the 49 boxes.
  6. **Automatic Dragon Synchronization**: When randomized, `autoGenerateDragonSections` immediately computes a matching solvable dragon wool sequence so the level is instantly ready for playtesting.

### 5.5 Canvas Editor (`src/components/CanvasEditor.tsx`)
- **Complete Scene Visualization**:
  - The canvas editor now visualizes the entire level environment in a unified coordinate space:
    - **Top ($Z \ge 1.8$)**: Winding Road Track, Fog Area ($0\% - 33\%$), Start Line Gate, Cat Checkpoints, and Dragon wool body & head preview.
    - **Bottom ($Z \le 0$)**: Box Play Area with exit rays and oriented bounding boxes. (Spool shelf is exclusively displayed in Playtest mode to keep the design workspace clean and unobstructed).
  - **Toolbar Controls (Bottom-Left)**:
    - `Fit Scene` button: Centers camera to encompass both the road track and the box board simultaneously (`pan.y = h * 0.52, zoom = 52`).
    - `Dragon Track` toggle: Show or hide track and scene overlays.
    - `Focus Boxes`: Quickly zoom in and center on the box board.
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

### 5.6 Right-Side Dragon Configuration Panel (`src/components/DragonEditor.tsx`)
- **3-Column Workspace Layout**:
  - `[Left Sidebar: Box Tools] | [Center: Full-Height Canvas] | [Right Sidebar: Dragon Config Zone]`
- **Right Sidebar Capabilities**:
  - **Wool Balance Pill**: Compares total dragon wool vs box wool (`Dragon: X / Boxes: Y`), showing instant match status or difference (`+N excess` / `-N needed`).
  - **Auto-Generate Solvable Dragon**: 1-click solver generating guaranteed 100% solvable wool sequences under `Easy`, `Normal`, or `Hard` difficulties.
  - **Collapsible Track & Speed Controls**: Adjust dragon crawl speed (`0.005` to `0.05`), review fog zone bounds, start gate, and cat checkpoints.
  - **Vertical Wool Timeline (Head to Tail)**:
    - Numbered cards from `#1 HEAD` to `#N TAIL`.
    - Real-time swatch with wool color name and unit count adjuster (`-`, number, `+`).
    - Up / Down reordering buttons and Delete button.
    - Click any segment to expand the 8-color swatch palette for instant color replacement.
  - **Collapse / Expand Toggle**: Allows collapsing into a sleek 48px icon strip to maximize canvas space.
  - **Quick Playtest Action**: Direct launch into Playtest mode.

### 5.7 Advanced Gameplay Elements & Gimmicks

#### 1. Tunnel (Warehouse Dispenser)
- **Functional Logic**:
  - **Two-Object Compound Representation**: The tunnel element is visually and functionally shown as two distinct objects:
    1. **The Tunnel Structure Itself**: A metallic capsule (`0.54\text{ width} \times 0.76\text{ length}`) featuring silver side guide rails, a recessed center track, forward chevrons, and a prominent bold counter displaying the remaining number of stored buses in the queue (`tun.queue.length - 1`).
    2. **The Ready Box Object In Front**: A full-sized bus stationed immediately in front of the tunnel mouth.
  - **Opposite Direction Rule**: The ready box's direction is **always** opposite to the tunnel object's orientation:
    $$\text{boxAngle} = (\text{tunnel.angle} + 180^\circ) \pmod{360}$$
    The ready box is positioned in front of the tunnel mouth along this opposite departure vector, ensuring its exit path points directly outward into the board.
  - **Exit Raycasting**: The editor casts exit rays directly from the front edge of the ready box along its exit trajectory, displaying obstruction warnings or targeting frozen boxes.
  - **Dispensing Mechanism**: When the ready bus in front is launched to an empty parking slot, the next stored bus from the queue is instantly dispensed and slides out into the ready position (`sounds.playTunnelDispense()`).
  - **Dual Click Interaction**: Players can click either the ready box or the tunnel structure to launch the bus or trigger unfreezing attacks against blocking ice boxes.
- **Editor & Inspector**:
  - Add tunnels via the `+ Tunnel` button under the Gimmicks section in the left sidebar.
  - Position `(x, z)` and tunnel orientation (`0°`, `90°`, `180°`, `270°`) can be adjusted via inspector sliders or by dragging either object directly on the canvas.
  - Built-in queue manager: Add buses, change color/capacity, delete, or reorder the dispensing sequence.

#### 2. Conveyor (Conveyor Belt)
- **Functional Logic**:
  - Motorized conveyor belt running horizontally across the screen at coordinate `conveyor.z`.
  - Moves continuously at `conveyor.speed` in either `left-to-right` or `right-to-left` direction.
  - **Continuous Looping**: When a bus travels past the end of the belt (`endX`), it despawns and respawns at the beginning (`startX`), maintaining a seamless infinite loop.
  - **Even Box Spreading**: When buses are added or deleted from the conveyor, all buses automatically spread evenly across the belt length ($x_i = minX + (i + 0.5) \cdot \frac{L}{N}$), ensuring optimal pacing and circulation. An explicit `"⚡ Evenly Spread Buses"` button is also available in the inspector.
  - **Preset Active Pickup Zone**: Players can interact with buses on the conveyor **only** while the bus is within the active zone (`[activeZoneMinX, activeZoneMaxX]`).
  - **Narrow-Screen Protection**: The active pickup zone is preset safely inside the play area bounds ($[-2.4, 2.4]$) to prevent screen edge clipping on narrow phone aspect ratios.
  - **Covered Side Hoods**: Both ends of the screen feature metallic tunnel hoods housing the despawn/respawn areas. Clicking buses outside the active zone triggers a warning shake and `"Outside Active Zone!"` feedback.
  - **Counter**: Displays an LED counter badge `[ 🔄 N ]` tracking total remaining buses on the belt.
- **Editor & Inspector**:
  - Add conveyors via the `+ Conveyor` button in the left sidebar.
  - Configure `z` position, movement direction, speed, and active zone bounds (`activeZoneMinX`, `activeZoneMaxX`).
  - Manage circulating buses on the belt (add, adjust capacity, change wool color, or remove).

#### 3. Frozen Box (Ice Gimmick)
- **Functional Logic**:
  - Encased in thick ice (`boxType: 'Ice'` or `'Frozen'`).
  - **Locked State**: Locked in place and cannot be directly selected or moved to a parking slot. Clicking a frozen box triggers a frosty rattle sound (`sounds.playIceShake()`) and shows `"Frozen! ❄️ Launch a bus to break ice"`.
  - **Unfreezing Collision Mechanism**:
    - To shatter the ice, the player must launch an unfrozen bus whose exit path intersects the frozen bus.
    - **Collision Attack**: The unfrozen attacker rushes forward along its exit trajectory until impact.
    - **Impact & Shatter**: Upon impact, ice crystals shatter with glass break audio (`sounds.playIceShatter()`), flying crystal particles erupt, floating feedback `"CRACK! ❄️💥"` appears, and the target bus is instantly unfrozen (`boxType = 'Normal'`).
    - **Bounce-Back**: The attacking bus bounces back smoothly to its exact starting position (`sounds.playBounce()`).
    - Once unfrozen, the newly freed bus behaves like a normal movable bus.
- **Visuals & Solver Integration**:
  - Rendered with crystalline ice gradient overlay, jagged crack lines, and a `❄️` snowflake badge.
  - Editor exit rays hitting frozen targets illuminate with frost cyan and an ice shatter impact reticle.
  - The solver (`solveBoxLayout`) simulates unfreezing moves to guarantee solvability verification.
  - `autoGenerateDragonSections` accepts tunnel and conveyor buses as `extraBoxes`, ensuring total dragon wool strictly equals total level wool across board, tunnels, and conveyor belts.

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
1. **Interactive Dragon Track Editor**:
   - Add spline control points directly draggable on the canvas to design custom track curves visually.
2. **Additional Special Gimmicks**:
   - `Question Box` (mystery color revealed on launch).
   - `Chain Box` (linked pairs of boxes that must be cleared simultaneously).
   - `Key & Lock Box` (requires collecting key box before lock opens).
3. **Mobile Layout Preview**:
   - Add a device frame preview toggle (e.g. iPhone / Android 9:16 aspect ratio overlay) to preview how the level fits on mobile screens.
