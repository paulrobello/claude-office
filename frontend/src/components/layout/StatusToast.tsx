"use client";

import { Activity } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

export interface StatusMessage {
  text: string;
  type: "info" | "error" | "success";
}

interface StatusToastProps {
  message: StatusMessage | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Displays a transient status message toast in the header, centered between
 * the title and the controls. Renders nothing when message is null.
 */
export function StatusToast({ message }: StatusToastProps): React.ReactNode {
  if (!message) return null;

  return (
    <div
      className={`px-4 py-1.5 rounded-full border shadow-lg flex items-center gap-3 text-[11px] font-bold tracking-wide uppercase whitespace-nowrap animate-in slide-in-from-top-2 duration-300
        ${
          message.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : message.type === "error"
              ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
              : "bg-blue-500/10 border-blue-500/20 text-blue-400"
        }`}
    >
      <Activity
        size={12}
        className={message.type === "info" ? "animate-pulse" : ""}
      />
      {message.text}
    </div>
  );
}
