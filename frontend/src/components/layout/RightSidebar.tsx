"use client";

import { useState } from "react";
import { AgentStatus } from "@/components/game/AgentStatus";
import { EventLog } from "@/components/game/EventLog";
import { ConversationHistory } from "@/components/game/ConversationHistory";

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Desktop right sidebar containing the AgentStatus panel and a tabbed
 * Events / Conversation panel below it. Manages its own active-tab state
 * since no other component needs that value.
 */
export function RightSidebar(): React.ReactNode {
  const [activeTab, setActiveTab] = useState<"events" | "conversation">(
    "events",
  );

  return (
    <aside className="w-80 flex flex-col gap-2 flex-shrink-0 overflow-hidden">
      {/* Agent Status — 40% of available height */}
      <div className="min-h-0" style={{ flex: "2 1 0" }}>
        <AgentStatus />
      </div>

      {/* Events / Conversation tab panel — 60% of available height */}
      <div className="min-h-0 flex flex-col" style={{ flex: "3 1 0" }}>
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
