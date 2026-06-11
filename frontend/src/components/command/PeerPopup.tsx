"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Terminal, ArrowRight } from "lucide-react";
import { useAttentionStore } from "@/stores/attentionStore";
import { useTranslation } from "@/hooks/useTranslation";
import { ZONE_BY_KEY } from "./layout";
import type { CommandPeer } from "./useCommandCenterPeers";

const POPUP_WIDTH = 260;
const POPUP_MARGIN = 16;

export interface PeerPopupState {
  peer: CommandPeer;
  x: number;
  y: number;
}

interface PeerPopupProps {
  popup: PeerPopupState | null;
  onClose: () => void;
  onDrillIn: (sessionId: string) => void;
}

/**
 * Cross-session peer popover. Unlike the office {@link AgentPopup} (bound to the
 * active session's game store), this takes the peer's own session id, so the
 * "open terminal" action always targets exactly that one agent's terminal.
 */
export function PeerPopup({
  popup,
  onClose,
  onDrillIn,
}: PeerPopupProps): ReactNode {
  const { t } = useTranslation();
  const focusAgentTerminal = useAttentionStore((s) => s.focusAgentTerminal);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!popup) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [popup, handleKeyDown]);

  if (!popup) return null;
  if (typeof document === "undefined") return null;

  const { peer } = popup;
  const zone = ZONE_BY_KEY[peer.bucket];

  // Viewport-clamped positioning.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = popup.x + 16;
  let y = popup.y - 40;
  if (x + POPUP_WIDTH > vw - POPUP_MARGIN) x = popup.x - POPUP_WIDTH - 16;
  if (y + 220 > vh - POPUP_MARGIN) y = vh - 220 - POPUP_MARGIN;
  if (y < POPUP_MARGIN) y = POPUP_MARGIN;

  const handleFocusTerminal = () => {
    // peer.sessionId is this agent's own terminal — focus exactly that one.
    void focusAgentTerminal(peer.sessionId, null);
    onClose();
  };

  const handleDrill = () => {
    onDrillIn(peer.sessionId);
    onClose();
  };

  const content = (
    <div
      className="fixed inset-0 z-[90]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-4"
        style={{ left: x, top: y, width: POPUP_WIDTH }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: zone.cssColor }}
          />
          <span className="text-white font-bold text-sm truncate flex-1">
            {peer.label}
          </span>
        </div>

        <div className="text-[12px] text-neutral-400 space-y-1 mb-3">
          <div>
            <span className="text-neutral-600">
              {t("attention.popup.state")}:
            </span>{" "}
            {`${zone.emoji} ${t(zone.labelKey)}`}
            {peer.state ? ` (${peer.state})` : ""}
          </div>
          {peer.currentTask && (
            <div className="truncate">
              <span className="text-neutral-600">
                {t("attention.popup.task")}:
              </span>{" "}
              {peer.currentTask}
            </div>
          )}
          {peer.todoTotal > 0 && (
            <div>
              <span className="text-neutral-600">
                {t("commandCenter.popup.todos")}:
              </span>{" "}
              {peer.todoDone}/{peer.todoTotal}
            </div>
          )}
          {peer.subagentCount > 0 && (
            <div>
              <span className="text-neutral-600">
                {t("commandCenter.popup.employees")}:
              </span>{" "}
              {peer.subagentCount}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleFocusTerminal}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
          >
            <Terminal size={13} />
            {t("commandCenter.popup.terminal")}
          </button>
          <button
            onClick={handleDrill}
            className="flex-1 flex items-center justify-center gap-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
          >
            <ArrowRight size={13} />
            {t("commandCenter.popup.drillIn")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
