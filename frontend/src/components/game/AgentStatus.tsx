/**
 * AgentStatus - Active agents panel
 *
 * Shows detailed agent information including name, state, task, last tool call,
 * and internal game state. Designed for 4 agents visible with scrollbar for more.
 */

"use client";

import { useGameStore, selectAgents } from "@/stores/gameStore";
import { useShallow } from "zustand/react/shallow";
import {
  Users,
  Briefcase,
  Terminal,
  Activity,
  MapPin,
  Layers,
} from "lucide-react";

// Backend state colors (work status)
function getBackendStateColor(state: string) {
  switch (state) {
    case "working":
      return "bg-amber-500/20 text-amber-400 border-amber-500/40";
    case "waiting_permission":
      return "bg-orange-500/20 text-orange-400 border-orange-500/40";
    case "reporting":
    case "reporting_done":
      return "bg-blue-500/20 text-blue-400 border-blue-500/40";
    case "walking_to_desk":
    case "leaving":
      return "bg-indigo-500/20 text-indigo-400 border-indigo-500/40";
    case "waiting":
      return "bg-cyan-500/20 text-cyan-400 border-cyan-500/40";
    case "completed":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
    case "thinking":
      return "bg-purple-500/20 text-purple-400 border-purple-500/40";
    case "arriving":
    case "in_elevator":
      return "bg-slate-500/20 text-slate-400 border-slate-500/40";
    default:
      return "bg-slate-800 text-slate-400 border-slate-700";
  }
}

// Frontend phase colors (animation/choreography)
function getPhaseColor(phase: string) {
  switch (phase) {
    case "idle":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
    case "arriving":
    case "in_arrival_queue":
    case "walking_to_ready":
      return "bg-cyan-500/20 text-cyan-400 border-cyan-500/40";
    case "conversing":
    case "walking_to_boss":
    case "at_boss":
      return "bg-blue-500/20 text-blue-400 border-blue-500/40";
    case "walking_to_desk":
      return "bg-indigo-500/20 text-indigo-400 border-indigo-500/40";
    case "departing":
    case "in_departure_queue":
      return "bg-amber-500/20 text-amber-400 border-amber-500/40";
    case "walking_to_elevator":
    case "in_elevator":
      return "bg-rose-500/20 text-rose-400 border-rose-500/40";
    default:
      return "bg-slate-800 text-slate-400 border-slate-700";
  }
}

// Format phase name for display
function formatPhase(phase: string): string {
  return phase.replace(/_/g, " ");
}

// Format backend state for display
function formatState(state: string): string {
  return state.replace(/_/g, " ");
}

export function AgentStatus() {
  const agents = useGameStore(useShallow(selectAgents));
  const agentArray = Array.from(agents.values());

  // Sort by number for consistent ordering
  agentArray.sort((a, b) => a.number - b.number);

  return (
    <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs h-full">
      {/* Header */}
      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
          <Users size={14} className="text-blue-400" />
          Agent State
        </div>
        <div className="flex items-center gap-1">
          <span className="text-2xl font-bold text-slate-200 tabular-nums">
            {agentArray.length}
          </span>
          <span className="text-slate-500 text-[10px]">agents</span>
        </div>
      </div>

      {/* Agent list - scrollable, fills remaining height */}
      <div className="flex-grow overflow-y-auto p-2 space-y-2 min-h-0">
        {agentArray.length === 0 ? (
          <div className="text-slate-600 italic p-4 text-center">No agents</div>
        ) : (
          agentArray.map((agent) => (
            <div
              key={agent.id}
              className="bg-slate-900/60 border border-slate-800 rounded-md overflow-hidden hover:border-slate-700 transition-colors"
            >
              {/* Agent header with name and color */}
              <div
                className="flex items-center justify-between px-2 py-1.5 border-b border-slate-800/50"
                style={{ borderLeftWidth: 3, borderLeftColor: agent.color }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-slate-100 truncate">
                    {agent.name || `Agent #${agent.number}`}
                  </span>
                  <span className="text-slate-600 text-[9px] flex-shrink-0">
                    #{agent.id.slice(0, 7)}
                  </span>
                </div>
                {agent.desk && (
                  <span className="text-slate-500 text-[10px] flex items-center gap-1 flex-shrink-0">
                    <MapPin size={10} />
                    Desk {agent.desk}
                  </span>
                )}
              </div>

              {/* Agent details */}
              <div className="px-2 py-1.5 space-y-1.5">
                {/* Task/Prompt Summary */}
                <div className="flex items-start gap-2">
                  <Briefcase
                    size={11}
                    className="text-slate-500 mt-0.5 flex-shrink-0"
                  />
                  <div className="text-slate-300 text-[11px] leading-tight min-w-0">
                    {agent.currentTask ? (
                      <span className="line-clamp-2">{agent.currentTask}</span>
                    ) : (
                      <span className="text-slate-600 italic">
                        No task summary
                      </span>
                    )}
                  </div>
                </div>

                {/* Last Tool Call */}
                <div className="flex items-start gap-2">
                  <Terminal
                    size={11}
                    className="text-slate-500 mt-0.5 flex-shrink-0"
                  />
                  <div className="text-[11px] leading-tight min-w-0">
                    {agent.bubble.content ? (
                      <span className="text-blue-400 line-clamp-2">
                        <span className="mr-1">
                          {agent.bubble.content.icon}
                        </span>
                        {agent.bubble.content.text}
                      </span>
                    ) : (
                      <span className="text-slate-600 italic">
                        No recent tool call
                      </span>
                    )}
                  </div>
                </div>

                {/* State badges row */}
                <div className="flex items-center gap-2 pt-1">
                  {/* Backend State */}
                  <div className="flex items-center gap-1">
                    <Activity size={10} className="text-slate-500" />
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold border ${getBackendStateColor(agent.backendState)}`}
                    >
                      {formatState(agent.backendState)}
                    </span>
                  </div>

                  {/* Frontend Phase */}
                  <div className="flex items-center gap-1">
                    <Layers size={10} className="text-slate-500" />
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${getPhaseColor(agent.phase)}`}
                    >
                      {formatPhase(agent.phase)}
                    </span>
                  </div>
                </div>

                {/* Queue info (if applicable) */}
                {agent.queueType && agent.queueIndex >= 0 && (
                  <div className="text-[9px] text-slate-500 pt-0.5">
                    In {agent.queueType} queue (position {agent.queueIndex + 1})
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
