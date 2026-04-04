# Interactive Demo Tour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add smooth zoom transitions between Building/Floor/Room views (permanent feature), scroll/pinch navigation, and an interactive guided tour overlay that teaches users Panoptica's features.

**Architecture:** Four independent components built in order: (1) ViewTransition wrapping the view switcher with zoom animations, (2) ZoomNavigation adding scroll/pinch as a navigation method, (3) TourEngine store holding tour step state, (4) TourOverlay rendering the narrator bar, pointer ring, and spotlight. Components 1-2 are permanent product improvements; 3-4 are the demo layer.

**Tech Stack:** React 18, Zustand, CSS transforms/transitions, wheel events, Next.js 15 (app router), PixiJS 8, lucide-react icons.

---

### Task 1: Extend navigationStore with transition metadata

**Files:**
- Modify: `frontend/src/stores/navigationStore.ts`
- Modify: `frontend/src/types/navigation.ts`

The navigation store needs to track the transition origin (where the user clicked/scrolled) and whether a transition is in-flight, so the ViewTransition component can animate from the right position.

- [ ] **Step 1: Add TransitionDirection type to navigation types**

In `frontend/src/types/navigation.ts`, add after the existing types:

```typescript
/** Direction of the view transition animation */
export type TransitionDirection = "zoom-in" | "zoom-out" | null;
```

- [ ] **Step 2: Add transition fields to navigationStore**

In `frontend/src/stores/navigationStore.ts`, add these fields to the `NavigationState` interface (after `isLoading`):

```typescript
  /** Pixel coordinates of the click/scroll that triggered the transition */
  transitionOrigin: { x: number; y: number } | null;
  /** Direction of the current transition */
  transitionDirection: TransitionDirection;
  /** Whether a transition animation is in progress */
  isTransitioning: boolean;
  /** Set transition origin for the next navigation */
  setTransitionOrigin: (origin: { x: number; y: number } | null) => void;
  /** Mark transition as complete */
  completeTransition: () => void;
```

Add the import for `TransitionDirection`:

```typescript
import type { ViewMode, BuildingConfig, FloorConfig, TransitionDirection } from "@/types/navigation";
```

- [ ] **Step 3: Add initial values and action implementations**

In the `create` call, add initial values:

```typescript
  transitionOrigin: null,
  transitionDirection: null,
  isTransitioning: false,
  setTransitionOrigin: (origin) => set({ transitionOrigin: origin }),
  completeTransition: () =>
    set({ isTransitioning: false, transitionDirection: null, transitionOrigin: null }),
```

- [ ] **Step 4: Update goToFloor, goToRoom, goToBuilding to set transition direction**

Replace the existing navigation actions:

```typescript
  goToBuilding: () =>
    set({
      view: "building",
      floorId: null,
      roomId: null,
      transitionDirection: "zoom-out",
      isTransitioning: true,
    }),

  goToFloor: (floorId) =>
    set((state) => ({
      view: "floor",
      floorId,
      roomId: null,
      transitionDirection: state.view === "building" ? "zoom-in" : "zoom-out",
      isTransitioning: true,
    })),

  goToRoom: (floorId, roomId) =>
    set({
      view: "room",
      floorId,
      roomId,
      transitionDirection: "zoom-in",
      isTransitioning: true,
    }),
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/navigationStore.ts frontend/src/types/navigation.ts
git commit -m "feat: add transition metadata to navigationStore"
```

---

### Task 2: Add data attributes to existing components

**Files:**
- Modify: `frontend/src/components/views/BuildingView.tsx`
- Modify: `frontend/src/components/views/FloorView.tsx`
- Modify: `frontend/src/components/layout/HeaderControls.tsx`
- Modify: `frontend/src/components/navigation/Breadcrumb.tsx`
- Modify: `frontend/src/components/game/OfficeGame.tsx`

Add `data-tour-id` and `data-floor-id`/`data-room-id` attributes to key elements so the tour overlay and zoom navigation can find and target them.

- [ ] **Step 1: Add data attributes to BuildingView FloorRow**

In `frontend/src/components/views/BuildingView.tsx`, on the `<button>` element in `FloorRow` (line 21), add data attributes:

```tsx
    <button
      onClick={onClick}
      data-tour-id={`floor-${floor.id}`}
      data-floor-id={floor.id}
      className={`group flex items-stretch w-full rounded-lg border transition-all duration-200 ${
```

- [ ] **Step 2: Add data attributes to FloorView RoomCard**

In `frontend/src/components/views/FloorView.tsx`, on the `<button>` element in `RoomCard` (line 22), add data attributes:

```tsx
    <button
      onClick={onClick}
      data-tour-id={`room-${room.id}`}
      data-room-id={room.id}
      className="group flex flex-col rounded-lg overflow-hidden w-56 flex-shrink-0 transition-all duration-200"
```

- [ ] **Step 3: Add data attributes to HeaderControls buttons**

In `frontend/src/components/layout/HeaderControls.tsx`, add `data-tour-id` to the SIMULATE button (line 52):

```tsx
      <button
        onClick={onSimulate}
        data-tour-id="simulate-btn"
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded text-xs font-bold transition-colors"
      >
```

- [ ] **Step 4: Add data attribute to Breadcrumb building button**

In `frontend/src/components/navigation/Breadcrumb.tsx`, on the building button (line 14):

```tsx
      <button
        onClick={goToBuilding}
        data-tour-id="breadcrumb-building"
        className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
```

- [ ] **Step 5: Add data attribute to OfficeGame outer div**

In `frontend/src/components/game/OfficeGame.tsx`, on the outer container div (line 339):

```tsx
    <div
      ref={containerRef}
      data-tour-id="game-canvas"
      className="w-full h-full flex items-center justify-center overflow-hidden relative"
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/views/BuildingView.tsx frontend/src/components/views/FloorView.tsx frontend/src/components/layout/HeaderControls.tsx frontend/src/components/navigation/Breadcrumb.tsx frontend/src/components/game/OfficeGame.tsx
git commit -m "feat: add data-tour-id attributes to key UI elements"
```

---

### Task 3: Capture click origin when navigating views

**Files:**
- Modify: `frontend/src/components/views/BuildingView.tsx`
- Modify: `frontend/src/components/views/FloorView.tsx`
- Modify: `frontend/src/components/navigation/Breadcrumb.tsx`

When the user clicks a floor or room, capture the click's viewport position so the zoom animation originates from that point.

- [ ] **Step 1: Update FloorRow click handler in BuildingView**

In `frontend/src/components/views/BuildingView.tsx`, change the `FloorRow` component to capture click position. Replace the `<button>` onClick:

```tsx
function FloorRow({
  floor,
  onClick,
  activeRooms: _activeRooms,
  totalSessions,
}: {
  floor: FloorConfig;
  onClick: (origin: { x: number; y: number }) => void;
  activeRooms: number;
  totalSessions: number;
}): React.ReactNode {
  const roomCount = floor.rooms.length;
  const isPlaceholder = roomCount <= 1;

  return (
    <button
      onClick={(e) => onClick({ x: e.clientX, y: e.clientY })}
      data-tour-id={`floor-${floor.id}`}
      data-floor-id={floor.id}
```

Then update the usage in `BuildingView` where `FloorRow` is rendered:

```tsx
            <FloorRow
              key={floor.id}
              floor={floor}
              onClick={(origin) => {
                useNavigationStore.getState().setTransitionOrigin(origin);
                goToFloor(floor.id);
              }}
              activeRooms={activeRooms}
              totalSessions={
                floorSessions.filter((s) => s.status === "active").length
              }
            />
```

- [ ] **Step 2: Update RoomCard click handler in FloorView**

In `frontend/src/components/views/FloorView.tsx`, change `RoomCard`'s onClick prop type:

```tsx
function RoomCard({
  room,
  floor,
  onClick,
  sessionCount,
  isActive,
}: {
  room: RoomConfig;
  floor: FloorConfig;
  onClick: (origin: { x: number; y: number }) => void;
  sessionCount: number;
  isActive: boolean;
}): React.ReactNode {
```

Update the `<button>` onClick:

```tsx
    <button
      onClick={(e) => onClick({ x: e.clientX, y: e.clientY })}
      data-tour-id={`room-${room.id}`}
      data-room-id={room.id}
```

Update the usage in `FloorView`:

```tsx
            <RoomCard
              key={room.id}
              room={room}
              floor={floor}
              onClick={(origin) => {
                useNavigationStore.getState().setTransitionOrigin(origin);
                goToRoom(floor.id, room.id);
              }}
              sessionCount={stats.count}
              isActive={stats.active}
            />
```

- [ ] **Step 3: Set transition origin on breadcrumb zoom-out**

In `frontend/src/components/navigation/Breadcrumb.tsx`, update building button click:

```tsx
      <button
        onClick={(e) => {
          useNavigationStore.getState().setTransitionOrigin({ x: e.clientX, y: e.clientY });
          goToBuilding();
        }}
        data-tour-id="breadcrumb-building"
```

And floor button click:

```tsx
          <button
            onClick={(e) => {
              useNavigationStore.getState().setTransitionOrigin({ x: e.clientX, y: e.clientY });
              goToFloor(floor.id);
            }}
```

The Breadcrumb component already imports `useNavigationStore`, so `goToBuilding` and `goToFloor` are available. But we need direct store access for `setTransitionOrigin`. Since these are event handlers (not render), calling `useNavigationStore.getState()` is fine.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/views/BuildingView.tsx frontend/src/components/views/FloorView.tsx frontend/src/components/navigation/Breadcrumb.tsx
git commit -m "feat: capture click origin for view transition animations"
```

---

### Task 4: ViewTransition component

**Files:**
- Create: `frontend/src/components/navigation/ViewTransition.tsx`
- Modify: `frontend/src/app/page.tsx`

The core animated wrapper. Replaces the hard-swap conditional rendering with a component that keeps both old and new views mounted during a 400ms zoom animation.

- [ ] **Step 1: Create the ViewTransition component**

Create `frontend/src/components/navigation/ViewTransition.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import type { ViewMode } from "@/types/navigation";

const TRANSITION_DURATION = 400;

interface ViewTransitionProps {
  view: ViewMode;
  children: (view: ViewMode) => ReactNode;
}

/**
 * Animated wrapper for view transitions. Keeps both old and new views
 * mounted during a 400ms zoom animation, then unmounts the old one.
 *
 * Zoom-in:  old view scales up 1→3x + fades out + blurs,
 *           new view scales up 0.3→1x + fades in + sharpens.
 * Zoom-out: reverse.
 */
export function ViewTransition({ view, children }: ViewTransitionProps): ReactNode {
  const transitionOrigin = useNavigationStore((s) => s.transitionOrigin);
  const transitionDirection = useNavigationStore((s) => s.transitionDirection);
  const isTransitioning = useNavigationStore((s) => s.isTransitioning);
  const completeTransition = useNavigationStore((s) => s.completeTransition);

  // Track the outgoing view during a transition
  const [outgoingView, setOutgoingView] = useState<ViewMode | null>(null);
  const [phase, setPhase] = useState<"idle" | "animating">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute transform-origin from the click position relative to viewport
  const originStyle = transitionOrigin
    ? `${transitionOrigin.x}px ${transitionOrigin.y}px`
    : "center center";

  const startTransition = useCallback(() => {
    if (!transitionDirection) return;
    // The "outgoing" is the view that was showing before this render
    setPhase("animating");
    timeoutRef.current = setTimeout(() => {
      setPhase("idle");
      setOutgoingView(null);
      completeTransition();
    }, TRANSITION_DURATION);
  }, [transitionDirection, completeTransition]);

  // When `view` changes while isTransitioning is true, kick off the animation
  useEffect(() => {
    if (isTransitioning && transitionDirection) {
      // Capture what was the previous view
      setOutgoingView((prev) => {
        // On first render, prev is null — we need the last known view
        // which is captured by the parent before setting the new view
        return prev;
      });
      // Use requestAnimationFrame to ensure the outgoing view is painted
      // before we start the animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          startTransition();
        });
      });
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [view, isTransitioning, transitionDirection, startTransition]);

  // Track the previous view to know what to animate out
  const prevViewRef = useRef<ViewMode>(view);
  useEffect(() => {
    if (isTransitioning && view !== prevViewRef.current) {
      setOutgoingView(prevViewRef.current);
    }
    prevViewRef.current = view;
  }, [view, isTransitioning]);

  const isZoomIn = transitionDirection === "zoom-in";

  // CSS for the outgoing layer during animation
  const outgoingStyle: React.CSSProperties =
    phase === "animating"
      ? {
          transformOrigin: originStyle,
          transform: isZoomIn ? "scale(3)" : "scale(0.3)",
          opacity: 0,
          filter: "blur(4px)",
          transition: `transform ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${TRANSITION_DURATION * 0.5}ms ease-out, filter ${TRANSITION_DURATION}ms ease-out`,
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
        }
      : {};

  // CSS for the incoming layer during animation
  const incomingStyle: React.CSSProperties =
    phase === "animating"
      ? {
          transformOrigin: originStyle,
          animation: `${isZoomIn ? "zoomInView" : "zoomOutView"} ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
          position: "relative",
          zIndex: 2,
        }
      : {};

  return (
    <>
      {/* Global keyframes — injected once */}
      <style jsx global>{`
        @keyframes zoomInView {
          from {
            transform: scale(0.3);
            opacity: 0;
            filter: blur(4px);
          }
          to {
            transform: scale(1);
            opacity: 1;
            filter: blur(0px);
          }
        }
        @keyframes zoomOutView {
          from {
            transform: scale(3);
            opacity: 0;
            filter: blur(4px);
          }
          to {
            transform: scale(1);
            opacity: 1;
            filter: blur(0px);
          }
        }
      `}</style>

      <div className="relative flex-grow flex overflow-hidden min-h-0">
        {/* Outgoing view (during animation only) */}
        {phase === "animating" && outgoingView && (
          <div style={outgoingStyle} className="flex gap-2">
            {children(outgoingView)}
          </div>
        )}

        {/* Current (incoming) view */}
        <div
          style={incomingStyle}
          className="flex-grow flex gap-2 overflow-hidden min-h-0"
        >
          {children(view)}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Integrate ViewTransition into page.tsx**

In `frontend/src/app/page.tsx`, add the import:

```typescript
import { ViewTransition } from "@/components/navigation/ViewTransition";
```

Replace the desktop main content block (the `else` branch of `{isMobile ? ...}`). Find this code:

```tsx
        <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
          {view === "building" && <BuildingView />}
          {view === "floor" && <FloorView />}
          {/* Always mount RoomView to avoid PixiJS lifecycle errors on re-mount */}
          <div className={view === "room" ? "contents" : "hidden"}>
            <RoomView />
          </div>
        </div>
```

Replace with:

```tsx
        <ViewTransition view={view}>
          {(activeView) => (
            <>
              {activeView === "building" && <BuildingView />}
              {activeView === "floor" && <FloorView />}
              {/* Always mount RoomView to avoid PixiJS lifecycle errors on re-mount */}
              <div className={activeView === "room" ? "contents" : "hidden"}>
                <RoomView />
              </div>
            </>
          )}
        </ViewTransition>
```

Also add the `ViewTransition` import alongside the existing `BuildingView`, `FloorView`, `RoomView` imports.

- [ ] **Step 3: Verify TypeScript compiles and test manually**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

Manual test: Start the dev server, click a floor in BuildingView — should see zoom animation. Click breadcrumb to go back — should see reverse zoom.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/navigation/ViewTransition.tsx frontend/src/app/page.tsx
git commit -m "feat: add ViewTransition with zoom animations between views"
```

---

### Task 5: ZoomNavigation hook

**Files:**
- Create: `frontend/src/hooks/useZoomNavigation.ts`
- Modify: `frontend/src/app/page.tsx`

Adds scroll/pinch-to-zoom as a continuous navigation method. Scrolling in on a floor/room scales the view toward the cursor, then snaps to the next view at the 2.5x threshold.

- [ ] **Step 1: Create the useZoomNavigation hook**

Create `frontend/src/hooks/useZoomNavigation.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigationStore } from "@/stores/navigationStore";

const SNAP_THRESHOLD = 2.5;
const SNAP_OUT_THRESHOLD = 0.4;
const ZOOM_SPEED = 0.008;
const SNAP_COOLDOWN_MS = 500;

interface ZoomState {
  scale: number;
  originX: number;
  originY: number;
}

/**
 * Adds scroll/pinch-to-zoom navigation between views.
 *
 * In Building/Floor views, scrolling in toward an element scales the view
 * with CSS transforms. When the scale crosses SNAP_THRESHOLD, it triggers
 * a view transition to the element under the cursor.
 *
 * In Room view, this hook is inactive — react-zoom-pan-pinch handles zoom.
 */
export function useZoomNavigation(containerRef: React.RefObject<HTMLDivElement | null>): ZoomState {
  const view = useNavigationStore((s) => s.view);
  const isTransitioning = useNavigationStore((s) => s.isTransitioning);
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, originX: 0, originY: 0 });
  const lastSnapTime = useRef(0);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // In room view, let react-zoom-pan-pinch handle it
      if (view === "room") return;
      // Don't interfere during transitions
      if (isTransitioning) return;
      // Cooldown after snap
      if (Date.now() - lastSnapTime.current < SNAP_COOLDOWN_MS) return;

      e.preventDefault();

      // deltaY: positive = scroll down = zoom in, negative = zoom out
      // Trackpad pinch: ctrlKey is true, deltaY is inverted
      const delta = e.ctrlKey ? -e.deltaY : e.deltaY;
      const zoomDelta = delta * ZOOM_SPEED;

      setZoom((prev) => {
        const newScale = Math.max(0.3, Math.min(4, prev.scale + zoomDelta));

        // Check for snap-in threshold
        if (newScale >= SNAP_THRESHOLD) {
          lastSnapTime.current = Date.now();

          // Find the element under the cursor
          const container = containerRef.current;
          if (!container) return { scale: 1, originX: 0, originY: 0 };

          const target = findTargetUnderCursor(e.clientX, e.clientY, view);
          if (target) {
            const store = useNavigationStore.getState();
            store.setTransitionOrigin({ x: e.clientX, y: e.clientY });

            if (view === "building" && target.floorId) {
              store.goToFloor(target.floorId);
            } else if (view === "floor" && target.floorId && target.roomId) {
              store.goToRoom(target.floorId, target.roomId);
            }
          }

          return { scale: 1, originX: 0, originY: 0 };
        }

        // Check for snap-out threshold
        if (newScale <= SNAP_OUT_THRESHOLD) {
          lastSnapTime.current = Date.now();

          const store = useNavigationStore.getState();
          store.setTransitionOrigin({ x: e.clientX, y: e.clientY });

          if (view === "floor") {
            store.goToBuilding();
          }

          return { scale: 1, originX: 0, originY: 0 };
        }

        return { scale: newScale, originX: e.clientX, originY: e.clientY };
      });
    },
    [view, isTransitioning, containerRef],
  );

  // Reset zoom when view changes
  useEffect(() => {
    setZoom({ scale: 1, originX: 0, originY: 0 });
  }, [view]);

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [containerRef, handleWheel]);

  return zoom;
}

/**
 * Find the floor or room element under the cursor using data attributes.
 */
function findTargetUnderCursor(
  clientX: number,
  clientY: number,
  view: string,
): { floorId?: string; roomId?: string } | null {
  const elements = document.elementsFromPoint(clientX, clientY);

  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;

    if (view === "building" && el.dataset.floorId) {
      return { floorId: el.dataset.floorId };
    }

    if (view === "floor" && el.dataset.roomId) {
      // Need floorId from the navigation store
      const floorId = useNavigationStore.getState().floorId;
      if (floorId) {
        return { floorId, roomId: el.dataset.roomId };
      }
    }
  }

  return null;
}
```

- [ ] **Step 2: Wire the hook into page.tsx**

In `frontend/src/app/page.tsx`, add a ref for the main content area and use the hook. Add the import:

```typescript
import { useZoomNavigation } from "@/hooks/useZoomNavigation";
```

Add a ref and hook call inside the component (after the existing refs/state):

```typescript
  const mainContentRef = useRef<HTMLDivElement>(null);
  const zoomState = useZoomNavigation(mainContentRef);
```

Add `useRef` to the React imports if not already present.

Wrap the desktop content area with the ref and apply the zoom transform. Replace the ViewTransition wrapper with:

```tsx
        <div
          ref={mainContentRef}
          className="flex-grow overflow-hidden min-h-0"
          style={
            zoomState.scale !== 1
              ? {
                  transform: `scale(${zoomState.scale})`,
                  transformOrigin: `${zoomState.originX}px ${zoomState.originY}px`,
                  filter: `blur(${Math.min((zoomState.scale - 1) * 1.5, 3)}px)`,
                  transition: "filter 100ms ease-out",
                }
              : undefined
          }
        >
          <ViewTransition view={view}>
            {(activeView) => (
              <>
                {activeView === "building" && <BuildingView />}
                {activeView === "floor" && <FloorView />}
                <div className={activeView === "room" ? "contents" : "hidden"}>
                  <RoomView />
                </div>
              </>
            )}
          </ViewTransition>
        </div>
```

- [ ] **Step 3: Verify TypeScript compiles and test manually**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

Manual test: Scroll on a floor row in BuildingView — view should scale toward cursor. At 2.5x, should snap to FloorView. Scroll out on FloorView — should snap back to BuildingView at 0.4x.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useZoomNavigation.ts frontend/src/app/page.tsx
git commit -m "feat: add scroll/pinch zoom navigation between views"
```

---

### Task 6: TourEngine Zustand store

**Files:**
- Create: `frontend/src/stores/tourStore.ts`

The tour state store. Defines the 8 tour steps and provides actions to start, advance, skip, and complete the tour.

- [ ] **Step 1: Create the tour store**

Create `frontend/src/stores/tourStore.ts`:

```typescript
"use client";

import { create } from "zustand";
import type { ViewMode } from "@/types/navigation";

// ============================================================================
// TYPES
// ============================================================================

export type TourStepType = "interactive" | "narrated";

export type AdvanceCondition =
  | { kind: "navigation"; targetView: ViewMode }
  | { kind: "click"; targetTourId: string }
  | { kind: "timer"; durationMs: number }
  | { kind: "simulation-event"; event: string }
  | { kind: "focus-popup" };

export interface TourStep {
  id: string;
  type: TourStepType;
  view: ViewMode;
  targetTourId: string | null;
  title: string;
  description: string;
  advanceOn: AdvanceCondition;
  /** Hint label shown near the pointer ring */
  pointerLabel: string | null;
  /** If true, spotlight is wide/absent so user can see the full canvas */
  wideSpotlight: boolean;
}

interface TourState {
  isActive: boolean;
  currentStepIndex: number;
  steps: TourStep[];
  hasSeenTour: boolean;

  startTour: () => void;
  advanceStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  currentStep: () => TourStep | null;
  loadTourSeen: () => void;
}

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    type: "interactive",
    view: "building",
    targetTourId: null,
    title: "Welcome",
    description:
      "This is your command center. Scroll in or click a floor to explore.",
    advanceOn: { kind: "navigation", targetView: "floor" },
    pointerLabel: "scroll or click a floor",
    wideSpotlight: true,
  },
  {
    id: "rooms-overview",
    type: "narrated",
    view: "floor",
    targetTourId: null,
    title: "Rooms",
    description:
      "Each room is a project. Active rooms have live Claude sessions.",
    advanceOn: { kind: "timer", durationMs: 4000 },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "enter-room",
    type: "interactive",
    view: "floor",
    targetTourId: null,
    title: "Enter a Room",
    description: "Zoom into a room to see your agents at work.",
    advanceOn: { kind: "navigation", targetView: "room" },
    pointerLabel: "scroll or click a room",
    wideSpotlight: true,
  },
  {
    id: "start-simulation",
    type: "interactive",
    view: "room",
    targetTourId: "simulate-btn",
    title: "Start Simulation",
    description: "Click Simulate to bring the office to life.",
    advanceOn: { kind: "click", targetTourId: "simulate-btn" },
    pointerLabel: "click here",
    wideSpotlight: false,
  },
  {
    id: "agents-arrive",
    type: "narrated",
    view: "room",
    targetTourId: null,
    title: "Agents Arrive",
    description:
      "Agents arrive through the elevator, walk to their desks, and start working.",
    advanceOn: { kind: "simulation-event", event: "agent-idle" },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "inspect-agent",
    type: "interactive",
    view: "room",
    targetTourId: "game-canvas",
    title: "Inspect an Agent",
    description: "Click on any character to inspect them.",
    advanceOn: { kind: "focus-popup" },
    pointerLabel: "click a character",
    wideSpotlight: true,
  },
  {
    id: "focus-popup",
    type: "narrated",
    view: "room",
    targetTourId: null,
    title: "Focus Popup",
    description:
      "From here you can copy a message to clipboard and jump to your terminal. The office updates in real time as Claude works.",
    advanceOn: { kind: "timer", durationMs: 5000 },
    pointerLabel: null,
    wideSpotlight: true,
  },
  {
    id: "zoom-out",
    type: "interactive",
    view: "room",
    targetTourId: "breadcrumb-building",
    title: "Zoom Out",
    description: "Try zooming back out to see the big picture.",
    advanceOn: { kind: "navigation", targetView: "building" },
    pointerLabel: "scroll out or click breadcrumb",
    wideSpotlight: false,
  },
];

// ============================================================================
// STORE
// ============================================================================

const TOUR_SEEN_KEY = "panoptica-tour-seen";

export const useTourStore = create<TourState>((set, get) => ({
  isActive: false,
  currentStepIndex: 0,
  steps: TOUR_STEPS,
  hasSeenTour: false,

  startTour: () =>
    set({ isActive: true, currentStepIndex: 0 }),

  advanceStep: () => {
    const { currentStepIndex, steps } = get();
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= steps.length) {
      get().completeTour();
    } else {
      set({ currentStepIndex: nextIndex });
    }
  },

  skipTour: () => {
    localStorage.setItem(TOUR_SEEN_KEY, "true");
    set({ isActive: false, currentStepIndex: 0, hasSeenTour: true });
  },

  completeTour: () => {
    localStorage.setItem(TOUR_SEEN_KEY, "true");
    set({ isActive: false, currentStepIndex: 0, hasSeenTour: true });
  },

  currentStep: () => {
    const { isActive, currentStepIndex, steps } = get();
    if (!isActive || currentStepIndex >= steps.length) return null;
    return steps[currentStepIndex];
  },

  loadTourSeen: () => {
    const seen = localStorage.getItem(TOUR_SEEN_KEY) === "true";
    set({ hasSeenTour: seen });
  },
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/tourStore.ts
git commit -m "feat: add TourEngine Zustand store with step definitions"
```

---

### Task 7: TourOverlay component

**Files:**
- Create: `frontend/src/components/tour/TourOverlay.tsx`
- Create: `frontend/src/components/tour/NarratorBar.tsx`
- Create: `frontend/src/components/tour/PointerRing.tsx`
- Create: `frontend/src/components/tour/SpotlightDim.tsx`

The DOM overlay rendered during the tour. Three sub-components: bottom narrator bar, pulsing pointer ring, and dark spotlight dim with cutout.

- [ ] **Step 1: Create NarratorBar component**

Create `frontend/src/components/tour/NarratorBar.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { TourStep } from "@/stores/tourStore";

interface NarratorBarProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onSkip: () => void;
}

export function NarratorBar({ step, stepIndex, totalSteps, onSkip }: NarratorBarProps): ReactNode {
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] pointer-events-auto animate-slide-up">
      <div className="mx-4 mb-4 bg-gradient-to-r from-[#1a0a00] to-[#1c1317] border border-orange-500/40 rounded-lg px-5 py-3 flex items-center gap-4 shadow-2xl shadow-orange-900/20 backdrop-blur-sm">
        {/* Step icon */}
        <div className="w-8 h-8 bg-orange-500/20 border border-orange-500/40 rounded-full flex items-center justify-center text-orange-500 font-bold text-sm flex-shrink-0">
          {step.type === "interactive" ? "✦" : "▶"}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="text-orange-400 text-xs font-bold font-mono mb-0.5">
            Step {stepIndex + 1} of {totalSteps} — {step.title}
          </div>
          <div className="text-slate-300 text-sm leading-snug">
            {step.description}
          </div>
        </div>

        {/* Progress + skip */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="w-20 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            onClick={onSkip}
            className="text-[10px] text-slate-500 hover:text-slate-300 font-mono transition-colors"
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PointerRing component**

Create `frontend/src/components/tour/PointerRing.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";

interface PointerRingProps {
  targetTourId: string | null;
  label: string | null;
}

/**
 * Pulsing orange ring positioned over the target element.
 * Uses data-tour-id attributes to find the element in the DOM.
 */
export function PointerRing({ targetTourId, label }: PointerRingProps): ReactNode {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updatePosition = useCallback(() => {
    if (!targetTourId) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour-id="${targetTourId}"]`);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [targetTourId]);

  useEffect(() => {
    updatePosition();

    // Re-position on resize and scroll
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    // Also poll briefly in case the element isn't in the DOM yet
    const interval = setInterval(updatePosition, 500);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      clearInterval(interval);
    };
  }, [updatePosition]);

  if (!rect || !targetTourId) return null;

  const padding = 6;

  return (
    <div
      className="fixed z-[55] pointer-events-none"
      style={{
        left: rect.left - padding,
        top: rect.top - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }}
    >
      {/* Pulsing ring */}
      <div
        className="absolute inset-0 rounded-lg animate-tour-ring"
        style={{
          boxShadow:
            "0 0 0 3px rgba(249, 115, 22, 0.6), 0 0 20px 4px rgba(249, 115, 22, 0.2)",
        }}
      />

      {/* Label */}
      {label && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-orange-400 text-xs font-mono font-bold">
          👆 {label}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create SpotlightDim component**

Create `frontend/src/components/tour/SpotlightDim.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";

interface SpotlightDimProps {
  targetTourId: string | null;
  wide: boolean;
}

/**
 * Full-screen dark overlay with a rectangular cutout around the target.
 * When `wide` is true, the overlay is lighter and covers less.
 */
export function SpotlightDim({ targetTourId, wide }: SpotlightDimProps): ReactNode {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updatePosition = useCallback(() => {
    if (!targetTourId || wide) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour-id="${targetTourId}"]`);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [targetTourId, wide]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const interval = setInterval(updatePosition, 500);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      clearInterval(interval);
    };
  }, [updatePosition]);

  if (wide) {
    // Light overlay, no cutout — just dims slightly so narrator bar stands out
    return (
      <div
        className="fixed inset-0 z-[50] pointer-events-none"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.25)" }}
      />
    );
  }

  if (!rect) {
    return (
      <div
        className="fixed inset-0 z-[50] pointer-events-none"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      />
    );
  }

  const padding = 10;
  const x = rect.left - padding;
  const y = rect.top - padding;
  const w = rect.width + padding * 2;
  const h = rect.height + padding * 2;
  const r = 8;

  // Clip-path with rounded rectangle cutout using SVG path
  const clipPath = `path('M 0 0 L ${window.innerWidth} 0 L ${window.innerWidth} ${window.innerHeight} L 0 ${window.innerHeight} Z M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z')`;

  return (
    <div
      className="fixed inset-0 z-[50] pointer-events-none"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        clipPath,
      }}
    />
  );
}
```

- [ ] **Step 4: Create TourOverlay composing the three sub-components**

Create `frontend/src/components/tour/TourOverlay.tsx`:

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { useTourStore } from "@/stores/tourStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useGameStore } from "@/stores/gameStore";
import { NarratorBar } from "./NarratorBar";
import { PointerRing } from "./PointerRing";
import { SpotlightDim } from "./SpotlightDim";

export function TourOverlay(): ReactNode {
  const isActive = useTourStore((s) => s.isActive);
  const stepIndex = useTourStore((s) => s.currentStepIndex);
  const steps = useTourStore((s) => s.steps);
  const advanceStep = useTourStore((s) => s.advanceStep);
  const skipTour = useTourStore((s) => s.skipTour);

  const step = isActive && stepIndex < steps.length ? steps[stepIndex] : null;

  // --- Advance listeners ---

  // Navigation-based advance (view changes)
  const view = useNavigationStore((s) => s.view);
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "navigation") return;
    if (view === step.advanceOn.targetView) {
      // Small delay to let transition settle
      const timer = setTimeout(advanceStep, 200);
      return () => clearTimeout(timer);
    }
  }, [view, step, advanceStep]);

  // Timer-based advance
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "timer") return;
    const timer = setTimeout(advanceStep, step.advanceOn.durationMs);
    return () => clearTimeout(timer);
  }, [step, advanceStep]);

  // Simulation event advance: watch for first agent reaching idle
  const agents = useGameStore((s) => s.agents);
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "simulation-event") return;
    if (step.advanceOn.event !== "agent-idle") return;

    const hasIdleAgent = Array.from(agents.values()).some(
      (a) => a.phase === "idle",
    );
    if (hasIdleAgent) {
      const timer = setTimeout(advanceStep, 500);
      return () => clearTimeout(timer);
    }
  }, [agents, step, advanceStep]);

  // Focus popup advance: watch for focusedCharacter being set
  const focusedCharacter = useGameStore((s) => s.focusedCharacter);
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "focus-popup") return;
    if (focusedCharacter) {
      const timer = setTimeout(advanceStep, 300);
      return () => clearTimeout(timer);
    }
  }, [focusedCharacter, step, advanceStep]);

  // Click-based advance: listen for clicks on the target element
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "click") return;
    const targetId = step.advanceOn.targetTourId;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(
        `[data-tour-id="${targetId}"]`,
      );
      if (target) {
        // Let the click handler fire first, then advance
        setTimeout(advanceStep, 100);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [step, advanceStep]);

  // Navigate to the step's expected view if we're not there
  useEffect(() => {
    if (!step) return;
    const currentView = useNavigationStore.getState().view;
    if (step.view !== currentView && step.advanceOn.kind !== "navigation") {
      // The step expects us to be in a specific view — navigate there
      const store = useNavigationStore.getState();
      if (step.view === "building") store.goToBuilding();
      else if (step.view === "floor" && store.floorId) store.goToFloor(store.floorId);
      // Room: don't auto-navigate — user should do it
    }
  }, [step]);

  if (!isActive || !step) return null;

  return (
    <>
      <SpotlightDim
        targetTourId={step.targetTourId}
        wide={step.wideSpotlight}
      />
      <PointerRing
        targetTourId={step.targetTourId}
        label={step.pointerLabel}
      />
      <NarratorBar
        step={step}
        stepIndex={stepIndex}
        totalSteps={steps.length}
        onSkip={skipTour}
      />
    </>
  );
}
```

- [ ] **Step 5: Add CSS keyframe for the tour ring animation and slide-up**

In `frontend/src/app/globals.css` (or wherever Tailwind config extends), add:

```css
@keyframes tour-ring-pulse {
  0%, 100% {
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.6), 0 0 20px 4px rgba(249, 115, 22, 0.2);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(249, 115, 22, 0.4), 0 0 30px 8px rgba(249, 115, 22, 0.3);
  }
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

Add the custom animations to `frontend/tailwind.config.ts` in the `extend.animation` section:

```typescript
animation: {
  "tour-ring": "tour-ring-pulse 1.5s ease-in-out infinite",
  "slide-up": "slide-up 300ms ease-out forwards",
},
```

Check what exists first — there may already be an animation section to extend.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/tour/ frontend/src/app/globals.css frontend/tailwind.config.ts
git commit -m "feat: add TourOverlay with narrator bar, pointer ring, and spotlight"
```

---

### Task 8: Tour button in HeaderControls + wiring in page.tsx

**Files:**
- Modify: `frontend/src/components/layout/HeaderControls.tsx`
- Modify: `frontend/src/app/page.tsx`

Add the TOUR button to the header controls and mount the TourOverlay in the main page.

- [ ] **Step 1: Add TOUR button to HeaderControls**

In `frontend/src/components/layout/HeaderControls.tsx`, add `Compass` to the lucide-react import:

```typescript
import {
  Activity,
  Play,
  RefreshCw,
  Bug,
  Trash2,
  HelpCircle,
  Settings,
  Compass,
} from "lucide-react";
```

Add `onStartTour` and `tourBounce` to the props interface:

```typescript
interface HeaderControlsProps {
  isConnected: boolean;
  debugMode: boolean;
  aiSummaryEnabled: boolean | null;
  onSimulate: () => Promise<void>;
  onReset: () => void;
  onClearDB: () => void;
  onToggleDebug: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onStartTour: () => void;
  tourBounce: boolean;
}
```

Add `onStartTour` and `tourBounce` to the destructured props:

```typescript
export function HeaderControls({
  isConnected,
  debugMode,
  aiSummaryEnabled,
  onSimulate,
  onReset,
  onClearDB,
  onToggleDebug,
  onOpenSettings,
  onOpenHelp,
  onStartTour,
  tourBounce,
}: HeaderControlsProps): React.ReactNode {
```

Add the TOUR button right before the HELP button:

```tsx
      <button
        onClick={onStartTour}
        data-tour-id="tour-btn"
        className={`flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded text-xs font-bold transition-colors ${
          tourBounce ? "animate-bounce" : ""
        }`}
      >
        <Compass size={14} />
        TOUR
      </button>
```

- [ ] **Step 2: Wire TourOverlay and tour button in page.tsx**

In `frontend/src/app/page.tsx`, add imports:

```typescript
import { TourOverlay } from "@/components/tour/TourOverlay";
import { useTourStore } from "@/stores/tourStore";
```

Add store subscriptions (after existing store subscriptions):

```typescript
  const startTour = useTourStore((s) => s.startTour);
  const hasSeenTour = useTourStore((s) => s.hasSeenTour);
  const isTourActive = useTourStore((s) => s.isActive);
  const loadTourSeen = useTourStore((s) => s.loadTourSeen);
```

Add a useEffect to load tour-seen flag (after other init effects):

```typescript
  useEffect(() => {
    loadTourSeen();
  }, [loadTourSeen]);
```

Add handler for starting tour (navigates to building first):

```typescript
  const handleStartTour = () => {
    useNavigationStore.getState().goToBuilding();
    startTour();
  };
```

Import `useNavigationStore` if not already imported at the top.

Update the `<HeaderControls>` usage to pass the new props:

```tsx
          <HeaderControls
            isConnected={isConnected}
            debugMode={debugMode}
            aiSummaryEnabled={aiSummaryEnabled}
            onSimulate={handleSimulate}
            onReset={handleReset}
            onClearDB={() => setIsClearModalOpen(true)}
            onToggleDebug={handleToggleDebug}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onOpenHelp={() => setIsHelpModalOpen(true)}
            onStartTour={handleStartTour}
            tourBounce={!hasSeenTour && !isTourActive}
          />
```

Add the `<TourOverlay />` component right before the closing `</main>` tag (after the StatusToast div):

```tsx
      {/* Tour overlay — rendered above everything when tour is active */}
      <TourOverlay />

      {/* Fixed bottom-right toast — never overlaps header or content */}
      <div className="fixed bottom-5 right-5 z-50 pointer-events-none">
        <StatusToast message={statusMessage} />
      </div>
    </main>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/HeaderControls.tsx frontend/src/app/page.tsx
git commit -m "feat: add TOUR button and wire TourOverlay into main page"
```

---

### Task 9: Tour-simulation integration

**Files:**
- Modify: `frontend/src/components/tour/TourOverlay.tsx`
- Modify: `frontend/src/app/page.tsx`

When the tour reaches step 4 ("Start Simulation") and the user clicks SIMULATE, the tour should auto-trigger the `quick` scenario. Also, ensure the SIMULATE button click during the tour actually fires the simulation.

- [ ] **Step 1: Pass handleSimulate to TourOverlay context**

The SIMULATE button click already calls `handleSimulate` via HeaderControls. The tour's click-based advance listener (in TourOverlay) captures clicks on `[data-tour-id="simulate-btn"]` and advances after the click. Since the button's normal onClick still fires, the simulation starts automatically.

No code change needed — the existing wiring handles this. Verify by manual testing:

1. Start the tour (click TOUR button)
2. Zoom into a floor, then a room
3. At step 4, click SIMULATE
4. The simulation should start AND the tour should advance to step 5

If the spotlight dim blocks clicks on the SIMULATE button, update SpotlightDim to allow pointer events through the cutout. In `frontend/src/components/tour/SpotlightDim.tsx`, the `pointer-events-none` class on the overlay already lets clicks pass through. But the overlay covers everything — we need the cutout area to be clickable.

Change the spotlight approach: instead of a single div with clip-path, use four divs forming the dim border around the cutout. Replace the clip-path return in `SpotlightDim.tsx`:

```tsx
  // Use four divs to create the dim border, leaving the cutout area clickable
  const x = rect.left - padding;
  const y = rect.top - padding;
  const w = rect.width + padding * 2;
  const h = rect.height + padding * 2;

  const dimStyle = "fixed z-[50] bg-black/60 pointer-events-none";

  return (
    <>
      {/* Top */}
      <div className={dimStyle} style={{ top: 0, left: 0, right: 0, height: y }} />
      {/* Bottom */}
      <div className={dimStyle} style={{ top: y + h, left: 0, right: 0, bottom: 0 }} />
      {/* Left */}
      <div className={dimStyle} style={{ top: y, left: 0, width: x, height: h }} />
      {/* Right */}
      <div className={dimStyle} style={{ top: y, left: x + w, right: 0, height: h }} />
    </>
  );
```

Remove the `clipPath` approach entirely — the four-div method leaves the cutout area fully interactive.

- [ ] **Step 2: Verify the full tour flow end-to-end**

Manual test checklist:
1. Click TOUR → navigates to Building view, narrator bar slides up
2. Scroll into a floor or click one → advances to step 2
3. Wait 4s → advances to step 3
4. Scroll into a room or click one → advances to step 4
5. Click SIMULATE → simulation starts, tour advances to step 5
6. Wait for agent to reach desk → advances to step 6
7. Click a character → focus popup opens, advances to step 7
8. Wait 5s → advances to step 8
9. Scroll out or click breadcrumb → tour completes, toast appears

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tour/SpotlightDim.tsx
git commit -m "fix: use four-div spotlight for clickable cutout during tour"
```
