"use client";

import type { ReactNode } from "react";
import type { TourStepType } from "@/stores/tourStore";
import { useTranslation } from "@/hooks/useTranslation";

interface NarratorBarProps {
  title: string;
  description: string;
  stepType: TourStepType;
  stepIndex: number;
  totalSteps: number;
  onSkip: () => void;
}

/**
 * Bottom bar showing tour step title, description, progress bar, and skip button.
 */
export function NarratorBar({
  title,
  description,
  stepType,
  stepIndex,
  totalSteps,
  onSkip,
}: NarratorBarProps): ReactNode {
  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] pointer-events-auto">
      <div className="mx-4 mb-4 bg-gradient-to-r from-[#1a0a00] to-[#1c1317] border border-orange-500/40 rounded-lg px-5 py-3 flex items-center gap-4 shadow-2xl shadow-orange-900/20 backdrop-blur-sm">
        <div className="w-8 h-8 bg-orange-500/20 border border-orange-500/40 rounded-full flex items-center justify-center text-orange-500 font-bold text-sm flex-shrink-0">
          {stepType === "interactive" ? "\u2726" : "\u25B6"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-orange-400 text-xs font-bold font-mono mb-0.5">
            {stepIndex + 1} / {totalSteps} &mdash; {title}
          </div>
          <div className="text-slate-300 text-sm leading-snug">
            {description}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="w-20 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            onClick={onSkip}
            className="text-[10px] text-slate-500 hover:text-slate-300 font-mono transition-colors"
          >
            {t("tour.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
