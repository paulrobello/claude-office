"use client";

import type { ReactNode } from "react";
import type { TourStep } from "@/stores/tourStore";

interface NarratorBarProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onSkip: () => void;
}

export function NarratorBar({
  step,
  stepIndex,
  totalSteps,
  onSkip,
}: NarratorBarProps): ReactNode {
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] pointer-events-auto animate-slide-up">
      <div className="mx-4 mb-4 bg-gradient-to-r from-[#1a0a00] to-[#1c1317] border border-orange-500/40 rounded-lg px-5 py-3 flex items-center gap-4 shadow-2xl shadow-orange-900/20 backdrop-blur-sm">
        <div className="w-8 h-8 bg-orange-500/20 border border-orange-500/40 rounded-full flex items-center justify-center text-orange-500 font-bold text-sm flex-shrink-0">
          {step.type === "interactive" ? "✦" : "▶"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-orange-400 text-xs font-bold font-mono mb-0.5">
            Step {stepIndex + 1} of {totalSteps} — {step.title}
          </div>
          <div className="text-slate-300 text-sm leading-snug">
            {step.description}
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
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}
