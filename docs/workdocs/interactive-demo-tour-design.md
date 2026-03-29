# Interactive Demo Tour — Design Spec

**Goal:** A guided interactive tour that teaches users how to use Panoptica by walking them through the building hierarchy, triggering a simulation, and having them interact with agents — all with smooth zoom transitions between views.

**Architecture:** Four independent components: TourEngine (state), TourOverlay (UI), ViewTransition (zoom animations), and ZoomNavigation (scroll/pinch controls). The transition and zoom systems improve the product permanently; the tour layers on top.

**Tech Stack:** React, Zustand, CSS transforms/transitions, wheel/gesture events, PixiJS coordinate mapping.

---

## 1. Components

### 1.1 TourEngine (Zustand store)

A dedicated Zustand store holding tour state:

- `isActive: boolean` — whether the tour is running
- `currentStepIndex: number` — which step we're on
- `steps: TourStep[]` — the step definitions (see Section 2)
- Actions: `startTour()`, `advanceStep()`, `skipTour()`, `completeTour()`
- Each step defines: `id`, `type` ("interactive" | "narrated"), `view` (which view it expects), `targetTourId` (the `data-tour-id` to highlight), `title`, `description`, `advanceOn` (event that advances — e.g. "click", "navigation", "timer", "simulation-event")

### 1.2 TourOverlay (React component)

Rendered in `page.tsx` above all content when tour is active. Three layers:

**Bottom narrator bar:**
- Fixed at bottom of viewport, `z-50`, full width with horizontal padding
- Dark background with subtle orange gradient border-top
- Left: step icon + title + description
- Right: progress bar (orange fill) + step counter + "Skip tour" link
- Slides up on tour start, slides down on end/skip
- Height: ~56px

**Pointer ring:**
- Absolute-positioned over the target element (found via `document.querySelector('[data-tour-id="..."]')`)
- Orange pulsing ring: `box-shadow: 0 0 0 4px rgba(249,115,22,0.4)` with CSS keyframes
- Small label below: "click here" / "scroll to zoom" depending on step type
- Re-positions on resize (ResizeObserver)
- For PixiJS canvas targets (characters): uses `toCanvasCoords` math from OfficeGame to position over character's DOM-equivalent position

**Spotlight dim:**
- Full-screen overlay `rgba(0,0,0,0.6)` with `clip-path` rectangle cutout around target
- Cutout has rounded corners, soft feathered edge via secondary blur layer
- During narrated simulation-watching steps, spotlight is wider or absent so user sees full office

### 1.3 ViewTransition (React component)

Replaces the current hard-swap view rendering in `page.tsx`. Wraps the view switcher with animated transitions.

**Zoom-in (Building → Floor → Room):**
1. Capture click/cursor position as `transform-origin`
2. 0–200ms: Current view scales to `3x` at that origin, opacity → 0, blur ramps to `4px`
3. 100–400ms (overlapping): New view starts at scale `0.3x` + opacity 0, scales to `1x` + opacity 1, blur sharpens
4. Old view unmounts

**Zoom-out (Room → Floor → Building):**
- Reverse: current view shrinks `1x → 0.3x` + fades, parent view grows `3x → 1x` + fades in. Same blur in/out.

**Details:**
- All CSS `transform: scale()` + `opacity` + `filter: blur()` — GPU-only, no layout thrash
- `transform-origin` set to cursor/click position
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- Duration: 400ms
- Input blocked during transition

### 1.4 ZoomNavigation (scroll/pinch handler)

Continuous zoom layer on the main content area enabling scroll/pinch navigation between views.

**Zoom thresholds:**
- Building view at `1.0x`. Scroll/pinch in → CSS transform scales the view toward cursor. At `2.5x` → snap transition to FloorView for the floor under cursor
- Floor view at `1.0x`. Scroll/pinch in → same scaling. At `2.5x` → snap to RoomView for the room under cursor
- Room view: scroll/pinch controls the existing `react-zoom-pan-pinch` TransformWrapper

**Cursor targeting:**
- BuildingView: tracks which floor row cursor is over via `data-floor-id`. Rubber-band resistance if cursor not on a floor
- FloorView: tracks which room card cursor is over via `data-room-id`. Same rubber-band
- RoomView: delegates to existing zoom controls

**Scroll out from Room:**
- If `react-zoom-pan-pinch` scale > 1.0, scrolling out first zooms canvas back to 1:1
- Once at 1:1 and user keeps scrolling out → triggers transition back to FloorView

**Input handling:**
- `wheel` event with `deltaY` for mousewheel
- Trackpad pinch fires `wheel` with `ctrlKey: true`
- 300ms cooldown after snap to prevent rapid view toggling

**Visual feedback during pre-transition zoom:**
- View scales toward cursor via dynamic `transform-origin`
- Slight blur increase approaching threshold (depth-of-field effect)
- Target element (floor row / room card) gets subtle glow near snap point

---

## 2. Tour Steps

| # | Type | View | Target (`data-tour-id`) | Title | Description | Advance condition |
|---|------|------|------------------------|-------|-------------|-------------------|
| 1 | interactive | building | floor row | Welcome | "Welcome to {building_name}. This is your command center. Scroll in or click a floor to explore." | User zooms/clicks into a floor |
| 2 | narrated | floor | active room card | Rooms | "Each room is a project. Active rooms have live Claude sessions." | 4s timer |
| 3 | interactive | floor | room card | Enter a Room | "Zoom into a room to see your agents at work." | User zooms/clicks into a room |
| 4 | interactive | room | `simulate-btn` | Start Simulation | "Click Simulate to bring the office to life." | User clicks SIMULATE button |
| 5 | narrated | room | (none — wide spotlight) | Agents Arrive | "Agents arrive through the elevator, walk to their desks, and start working." | First agent reaches `idle` phase (~10s) |
| 6 | interactive | room | agent sprite | Inspect an Agent | "Click on any character to inspect them." | User clicks a character (focus popup opens) |
| 7 | narrated | room | focus popup | Focus Popup | "From here you can copy a message to clipboard and jump to your terminal. The office updates in real time as Claude works." | 5s timer |
| 8 | interactive | room | breadcrumb building | Zoom Out | "Try zooming back out to see the big picture." | User scrolls out or clicks breadcrumb to Building view |

---

## 3. Tour Entry Point

- "TOUR" button added to `HeaderControls`, styled like HELP button
- Icon: `Compass` from lucide-react
- On first-ever visit (`localStorage` flag `panoptica-tour-seen` not set), button has a subtle bounce animation
- After tour completion: sets `localStorage` flag, bounce stops, button remains always available for re-runs
- Tour auto-triggers simulation with `quick` scenario at step 4

---

## 4. View Transitions (permanent feature)

The zoom transition system applies to ALL view navigation, not just the tour:

- Clicking a floor in BuildingView → zoom-in transition to FloorView
- Clicking a room in FloorView → zoom-in transition to RoomView
- Breadcrumb clicks → zoom-out transition to parent view
- Scroll/pinch → continuous zoom with threshold snaps

`data-tour-id` attributes are added to key elements for the tour's pointer ring, but they double as `data-floor-id` / `data-room-id` for the zoom targeting system.

---

## 5. Data attributes to add

Existing components need `data-tour-id` attributes for targeting:

| Component | Attribute | Element |
|-----------|-----------|---------|
| HeaderControls | `data-tour-id="simulate-btn"` | SIMULATE button |
| HeaderControls | `data-tour-id="tour-btn"` | TOUR button |
| BuildingView FloorRow | `data-tour-id="floor-{id}"` + `data-floor-id="{id}"` | Floor row div |
| FloorView RoomCard | `data-tour-id="room-{id}"` + `data-room-id="{id}"` | Room card div |
| Breadcrumb | `data-tour-id="breadcrumb-building"` | Building breadcrumb button |
| OfficeGame | `data-tour-id="game-canvas"` | Outer container div |

---

## 6. Smooth transitions (permanent feature)

Currently views swap instantly via conditional rendering:
```tsx
{view === "building" && <BuildingView />}
{view === "floor" && <FloorView />}
<div className={view === "room" ? "contents" : "hidden"}>
  <RoomView />
</div>
```

This changes to a `ViewTransition` wrapper that:
1. Keeps both old and new views mounted during the 400ms transition
2. Applies scale + opacity + blur animations based on direction (in vs out)
3. Unmounts old view after animation completes
4. RoomView remains always-mounted (existing pattern to avoid PixiJS lifecycle issues) — its wrapper gets the scale/opacity animation instead
