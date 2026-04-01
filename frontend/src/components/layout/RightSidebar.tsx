"use client";

import { useState } from "react";
import { AgentStatus } from "@/components/game/AgentStatus";
import { EventLog } from "@/components/game/EventLog";
import { ConversationHistory } from "@/components/game/ConversationHistory";
import { useDragResize } from "@/hooks/useDragResize";

// ============================================================================
// CONSTANTS
// ============================================================================

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 320; // equivalent to w-80
const AGENT_PANEL_MIN_HEIGHT = 60;
const AGENT_PANEL_DEFAULT_HEIGHT = 240;

/** Max height is 70% of viewport to prevent overflow on smaller screens */
const getMaxPanelHeight = () => Math.floor(window.innerHeight * 0.7);

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Desktop right sidebar containing the AgentStatus panel and a tabbed
 * Events / Conversation panel below it. Supports drag-to-resize both the
 * sidebar width (left edge) and the split between the two panels (divider).
 */
export function RightSidebar(): React.ReactNode {
  const [activeTab, setActiveTab] = useState<"events" | "conversation">(
    "events",
  );

  const {
    size: sidebarWidth,
    isDragging: isWidthDragging,
    handleDragStart: handleWidthDragStart,
  } = useDragResize({
    initialSize: SIDEBAR_DEFAULT_WIDTH,
    minSize: SIDEBAR_MIN_WIDTH,
    maxSize: SIDEBAR_MAX_WIDTH,
    direction: "horizontal",
    edge: "left", // Left edge: dragging left increases width
  });

  const {
    size: agentPanelHeight,
    isDragging: isHeightDragging,
    handleDragStart: handleHeightDragStart,
  } = useDragResize({
    initialSize: AGENT_PANEL_DEFAULT_HEIGHT,
    minSize: AGENT_PANEL_MIN_HEIGHT,
    maxSize: getMaxPanelHeight,
    direction: "vertical",
    edge: "down",
  });

  const isDragging = isWidthDragging || isHeightDragging;

  return (
    <aside
      className={`relative flex flex-col gap-2 flex-shrink-0 h-full overflow-hidden ${
        isDragging ? "select-none" : ""
      }`}
      style={{ width: sidebarWidth }}
    >
      {/* Horizontal Resize Handle (left edge) */}
      <div
        className="absolute left-0 top-0 w-1.5 h-full cursor-ew-resize z-10 hover:bg-purple-500/40 active:bg-purple-500/60 transition-colors"
        onMouseDown={handleWidthDragStart}
        title="Drag to resize"
      />

      {/* Agent Status */}
      <div
        className="min-h-0 flex-shrink-0"
        style={{ height: agentPanelHeight }}
      >
        <AgentStatus />
      </div>

      {/* Vertical Resize Handle (agent status ↕ events) */}
      <div
        className="flex-shrink-0 h-3 cursor-ns-resize flex items-center justify-center group -my-1"
        onMouseDown={handleHeightDragStart}
        title="Drag to resize"
      >
        <div className="w-10 h-1 rounded-full bg-slate-700 group-hover:bg-purple-500 group-active:bg-purple-400 transition-colors" />
      </div>

      {/* Events / Conversation tab panel */}
      <div className="min-h-0 flex flex-col flex-grow">
        {/* Tab header */}
        <div className="flex border-b border-slate-700 bg-slate-900 rounded-t-lg flex-shrink-0">
          <button
            onClick={() => setActiveTab("events")}
            className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors rounded-tl-lg ${
              activeTab === "events"
                ? "text-orange-400 border-b-2 border-orange-500 bg-slate-950/50"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Events
          </button>
          <button
            onClick={() => setActiveTab("conversation")}
            className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors rounded-tr-lg ${
              activeTab === "conversation"
                ? "text-cyan-400 border-b-2 border-cyan-500 bg-slate-950/50"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Conversation
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-grow min-h-0 overflow-hidden">
          {activeTab === "events" ? <EventLog /> : <ConversationHistory />}
        </div>
      </div>
    </aside>
  );
}
