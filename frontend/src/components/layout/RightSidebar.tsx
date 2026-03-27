"use client";

import { useState, useCallback } from "react";
import { AgentStatus } from "@/components/game/AgentStatus";
import { EventLog } from "@/components/game/EventLog";
import { ConversationHistory } from "@/components/game/ConversationHistory";

// ============================================================================
// CONSTANTS
// ============================================================================

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 320; // equivalent to w-80
const AGENT_PANEL_MIN_HEIGHT = 60;
const AGENT_PANEL_MAX_HEIGHT = 800;
const AGENT_PANEL_DEFAULT_HEIGHT = 240;

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
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [agentPanelHeight, setAgentPanelHeight] = useState(
    AGENT_PANEL_DEFAULT_HEIGHT,
  );
  const [isDragging, setIsDragging] = useState(false);

  // ==== Horizontal resize (left edge) ========================================================================
  const handleWidthDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      document.body.style.cursor = "ew-resize";
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMouseMove = (ev: MouseEvent) => {
        // Dragging left edge: moving left increases width
        const newWidth = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth - (ev.clientX - startX)),
        );
        setSidebarWidth(newWidth);
      };

      const onMouseUp = () => {
        setIsDragging(false);
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth],
  );

  // ==== Vertical resize (agent status ↕ events divider) ========================================================================
  const handleHeightDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      document.body.style.cursor = "ns-resize";
      const startY = e.clientY;
      const startHeight = agentPanelHeight;

      const onMouseMove = (ev: MouseEvent) => {
        const newHeight = Math.min(
          AGENT_PANEL_MAX_HEIGHT,
          Math.max(AGENT_PANEL_MIN_HEIGHT, startHeight + ev.clientY - startY),
        );
        setAgentPanelHeight(newHeight);
      };

      const onMouseUp = () => {
        setIsDragging(false);
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [agentPanelHeight],
  );

  return (
    <aside
      className={`relative flex flex-col gap-2 flex-shrink-0 overflow-hidden ${
        isDragging ? "select-none" : ""
      }`}
      style={{ width: sidebarWidth }}
    >
      {/* Horizontal Resize Handle (left edge) */}
      <div
        className="absolute left-0 top-0 w-1.5 h-full cursor-ew-resize z-10 hover:bg-purple-500/40 transition-colors"
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
        <div className="w-10 h-1 rounded-full bg-slate-700 group-hover:bg-purple-500 transition-colors" />
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
        <div className="flex-grow min-h-0">
          {activeTab === "events" ? <EventLog /> : <ConversationHistory />}
        </div>
      </div>
    </aside>
  );
}
