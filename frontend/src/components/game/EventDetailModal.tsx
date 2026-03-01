/**
 * EventDetailModal - Modal showing full details of a clicked event log entry
 */

"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { format } from "date-fns";
import type { EventLogEntry } from "@/stores/gameStore";

function getEventTypeColor(type: string): string {
  switch (type) {
    case "pre_tool_use":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "post_tool_use":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "user_prompt_submit":
      return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
    case "permission_request":
      return "bg-orange-500/20 text-orange-300 border-orange-500/40";
    case "subagent_start":
      return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    case "subagent_stop":
      return "bg-purple-500/20 text-purple-300 border-purple-500/40";
    case "session_start":
      return "bg-green-500/20 text-green-300 border-green-500/40";
    case "session_end":
      return "bg-slate-500/20 text-slate-300 border-slate-500/40";
    case "stop":
      return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    case "error":
      return "bg-red-500/20 text-red-300 border-red-500/40";
    case "background_task_notification":
      return "bg-teal-500/20 text-teal-300 border-teal-500/40";
    default:
      return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  }
}

interface EventDetailModalProps {
  event: EventLogEntry;
  onClose: () => void;
}

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const detail = event.detail ?? {};
  const hasDetail = Object.keys(detail).length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden font-mono text-xs">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 bg-slate-950 flex-shrink-0">
          <span
            className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${getEventTypeColor(event.type)}`}
          >
            {event.type.replace(/_/g, " ")}
          </span>
          <span className="text-slate-400 text-[11px]">
            {format(event.timestamp, "HH:mm:ss.SSS")}
          </span>
          {event.agentId && (
            <span className="text-blue-400 text-[10px] font-mono">
              @{event.agentId}
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-grow overflow-y-auto p-4 space-y-3">
          {/* Summary */}
          <div>
            <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
              Summary
            </div>
            <div className="text-slate-200 text-[12px]">{event.summary}</div>
          </div>

          {/* Detail fields */}
          {hasDetail ? (
            <>
              {detail.toolName && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    Tool
                  </div>
                  <div className="text-amber-300 text-[12px]">
                    {String(detail.toolName)}
                  </div>
                </div>
              )}

              {detail.agentName && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    Agent Name
                  </div>
                  <div className="text-blue-300 text-[12px]">
                    {String(detail.agentName)}
                  </div>
                </div>
              )}

              {detail.taskDescription && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    Task Description
                  </div>
                  <div className="text-slate-200 text-[12px] whitespace-pre-wrap leading-relaxed">
                    {String(detail.taskDescription)}
                  </div>
                </div>
              )}

              {detail.prompt && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    User Prompt
                  </div>
                  <div className="text-cyan-200 text-[12px] whitespace-pre-wrap leading-relaxed bg-slate-800/50 rounded p-2 border border-slate-700">
                    {String(detail.prompt)}
                  </div>
                </div>
              )}

              {detail.thinking && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    Thinking
                  </div>
                  <div className="text-slate-400 italic text-[12px] whitespace-pre-wrap leading-relaxed bg-slate-800/30 rounded p-2 border border-slate-700/50">
                    {String(detail.thinking)}
                  </div>
                </div>
              )}

              {detail.message && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    Message
                  </div>
                  <div className="text-slate-200 text-[12px] whitespace-pre-wrap leading-relaxed">
                    {String(detail.message)}
                  </div>
                </div>
              )}

              {detail.resultSummary && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    Result Summary
                  </div>
                  <div className="text-emerald-300 text-[12px] whitespace-pre-wrap leading-relaxed">
                    {String(detail.resultSummary)}
                  </div>
                </div>
              )}

              {detail.errorType && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    Error Type
                  </div>
                  <div className="text-red-400 text-[12px]">
                    {String(detail.errorType)}
                  </div>
                </div>
              )}

              {detail.toolInput && (
                <div>
                  <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                    Tool Input
                  </div>
                  <pre className="text-slate-300 text-[11px] bg-slate-800 rounded p-3 border border-slate-700 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
                    {JSON.stringify(detail.toolInput, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="text-slate-600 italic text-center py-4">
              No additional detail available for this event.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-700 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
