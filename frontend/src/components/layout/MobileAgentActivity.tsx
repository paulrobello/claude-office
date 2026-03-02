"use client";

import { Users } from "lucide-react";
import type {
  BossAnimationState,
  AgentAnimationState,
} from "@/stores/gameStore";

// ============================================================================
// TYPES
// ============================================================================

interface MobileAgentActivityProps {
  agents: Map<string, AgentAnimationState>;
  boss: BossAnimationState;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Mobile-only panel that shows the boss state and all active agents with
 * their current tasks and speech bubbles. Displayed below the game canvas
 * in the stacked mobile layout.
 */
export function MobileAgentActivity({
  agents,
  boss,
}: MobileAgentActivityProps): React.ReactNode {
  return (
    <div className="flex-[2] bg-slate-950 border border-slate-800 rounded-lg overflow-hidden min-h-0">
      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center gap-2">
        <Users size={14} className="text-blue-500" />
        <span className="text-slate-300 font-bold uppercase tracking-wider text-xs">
          Agent Activity
        </span>
        <span className="text-slate-600 text-xs">({agents.size})</span>
      </div>

      <div className="overflow-y-auto h-[calc(100%-36px)] p-2">
        {/* Boss Status */}
        <div className="mb-3 p-2 bg-slate-900/50 rounded-lg border border-amber-500/30">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-amber-400 font-bold text-xs">BOSS</span>
            <span className="text-slate-500 text-[10px] font-mono ml-auto">
              {boss.backendState}
            </span>
          </div>
          {boss.currentTask && (
            <p className="text-slate-400 text-[11px] truncate">
              {boss.currentTask}
            </p>
          )}
          {boss.bubble.content && (
            <p className="text-blue-400 text-[11px] mt-1 truncate italic">
              &quot;{boss.bubble.content.text}&quot;
            </p>
          )}
        </div>

        {/* Agent List */}
        {agents.size === 0 ? (
          <div className="text-center text-slate-600 text-xs italic py-4">
            No active agents
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from(agents.values()).map((agent) => (
              <div
                key={agent.id}
                className="p-2 bg-slate-900/50 rounded-lg border border-slate-800"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="text-slate-300 font-bold text-xs">
                    {agent.name}
                  </span>
                  <span className="text-slate-600 text-[10px] font-mono ml-auto">
                    {agent.phase}
                  </span>
                </div>
                {agent.currentTask && (
                  <p className="text-slate-400 text-[11px] truncate">
                    {agent.currentTask}
                  </p>
                )}
                {agent.bubble.content && (
                  <p className="text-emerald-400 text-[11px] mt-1 truncate italic">
                    &quot;{agent.bubble.content.text}&quot;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
