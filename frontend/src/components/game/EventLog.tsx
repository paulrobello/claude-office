/**
 * EventLog - Event log panel
 *
 * Displays event history from the unified Zustand store.
 */

"use client";

import { useGameStore, selectEventLog } from "@/stores/gameStore";
import { format } from "date-fns";
import { Terminal } from "lucide-react";

function getEventTypeColor(type: string) {
  switch (type) {
    case "pre_tool_use":
      return "text-amber-400";
    case "post_tool_use":
      return "text-emerald-400";
    case "user_prompt_submit":
      return "text-cyan-400";
    case "permission_request":
      return "text-orange-400";
    case "subagent_start":
      return "text-blue-400";
    case "subagent_stop":
      return "text-purple-400";
    case "session_start":
      return "text-green-400";
    case "session_end":
      return "text-slate-500";
    case "stop":
      return "text-rose-400";
    case "error":
      return "text-red-500";
    default:
      return "text-slate-400";
  }
}

export function EventLog() {
  const eventLog = useGameStore(selectEventLog);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-300 font-bold uppercase tracking-wider">
          <Terminal size={14} className="text-orange-500" />
          Event Log
        </div>
        <div className="text-slate-500">{eventLog.length} events</div>
      </div>

      <div className="flex-grow overflow-y-auto p-2 space-y-1">
        {eventLog.length === 0 ? (
          <div className="text-slate-600 italic p-4 text-center">
            Waiting for events...
          </div>
        ) : (
          eventLog.map((event, index) => (
            <div
              key={`${event.id}-${index}`}
              className="hover:bg-white/5 px-2 py-1.5 rounded transition-colors group border-l-2 border-slate-700"
            >
              {/* Line 1: Time, Event Type, Agent */}
              <div className="flex gap-2 items-center">
                <span className="text-slate-500 flex-shrink-0">
                  {format(event.timestamp, "HH:mm:ss")}
                </span>
                <span
                  className={`flex-shrink-0 font-bold text-[10px] ${getEventTypeColor(event.type)}`}
                >
                  [{event.type.replace(/_/g, " ").toUpperCase()}]
                </span>
                {event.agentId && (
                  <span className="text-blue-400 text-[10px]">
                    @{event.agentId.slice(0, 8)}...
                  </span>
                )}
              </div>
              {/* Line 2: Details/Summary */}
              <div
                className="text-slate-300 truncate text-[11px]"
                title={event.summary}
              >
                {event.summary}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
