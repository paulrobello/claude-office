"use client";

import { useEffect, type ReactNode } from "react";
import {
  useAttentionStore,
  type AttentionCategory,
} from "@/stores/attentionStore";

const DOT_COLOR: Record<AttentionCategory, string> = {
  blocked: "bg-rose-500",
  waiting: "bg-amber-500",
  completed: "bg-emerald-500",
  idle: "bg-slate-500",
};

interface AttentionToastsProps {
  onOpenCommandBar: (agentId?: string) => void;
}

export function AttentionToasts({
  onOpenCommandBar,
}: AttentionToastsProps): ReactNode {
  const pendingToasts = useAttentionStore((s) => s.pendingToasts);
  const dismissToast = useAttentionStore((s) => s.dismissToast);

  // Auto-dismiss toasts after 8 seconds
  useEffect(() => {
    if (pendingToasts.length === 0) return;
    const timers = pendingToasts.map((toast) =>
      setTimeout(() => dismissToast(toast.agentId), 8000),
    );
    return () => timers.forEach(clearTimeout);
  }, [pendingToasts, dismissToast]);

  if (pendingToasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-5 z-[65] flex flex-col gap-2 pointer-events-auto">
      {pendingToasts.map((toast) => (
        <button
          key={toast.agentId}
          onClick={() => {
            dismissToast(toast.agentId);
            onOpenCommandBar(toast.agentId);
          }}
          className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl backdrop-blur-sm animate-slide-up hover:bg-slate-800 transition-colors max-w-xs"
        >
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLOR[toast.category]}`}
          />
          <div className="min-w-0 text-left">
            <div className="text-white text-xs font-mono font-bold truncate">
              {toast.agentName}
            </div>
            <div className="text-slate-400 text-[10px] truncate">
              {toast.summary}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
