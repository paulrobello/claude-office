"use client";

import { useEffect, type ReactNode } from "react";
import { useTourStore } from "@/stores/tourStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useGameStore } from "@/stores/gameStore";
import { NarratorBar } from "./NarratorBar";
import { PointerRing } from "./PointerRing";
import { SpotlightDim } from "./SpotlightDim";
import { useTranslation, type TranslationKey } from "@/hooks/useTranslation";

/**
 * Orchestrates the guided tour: handles step advancement conditions
 * and renders the three tour sub-components (spotlight, pointer, narrator).
 */
export function TourOverlay(): ReactNode {
  const isActive = useTourStore((s) => s.isActive);
  const stepIndex = useTourStore((s) => s.currentStepIndex);
  const steps = useTourStore((s) => s.steps);
  const advanceStep = useTourStore((s) => s.advanceStep);
  const skipTour = useTourStore((s) => s.skipTour);

  const { t } = useTranslation();

  const step = isActive && stepIndex < steps.length ? steps[stepIndex] : null;

  // Navigation-based advance
  const view = useNavigationStore((s) => s.view);
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "navigation") return;
    if (view === step.advanceOn.targetView) {
      const timer = setTimeout(advanceStep, 200);
      return () => clearTimeout(timer);
    }
  }, [view, step, advanceStep]);

  // Timer-based advance
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "timer") return;
    const timer = setTimeout(advanceStep, step.advanceOn.durationMs);
    return () => clearTimeout(timer);
  }, [step, advanceStep]);

  // Simulation event advance: watch for first agent reaching idle
  const agents = useGameStore((s) => s.agents);
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "simulation-event") return;
    if (step.advanceOn.event !== "agent-idle") return;
    const hasIdleAgent = Array.from(agents.values()).some(
      (a) => a.phase === "idle",
    );
    if (hasIdleAgent) {
      const timer = setTimeout(advanceStep, 500);
      return () => clearTimeout(timer);
    }
  }, [agents, step, advanceStep]);

  // Click-based advance
  useEffect(() => {
    if (!step || step.advanceOn.kind !== "click") return;
    const targetId = step.advanceOn.targetTourId;
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(
        `[data-tour-id="${targetId}"]`,
      );
      if (target) {
        setTimeout(advanceStep, 100);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [step, advanceStep]);

  // Navigate to step's expected view if needed
  useEffect(() => {
    if (!step) return;
    const currentView = useNavigationStore.getState().view;
    if (step.view !== currentView && step.advanceOn.kind !== "navigation") {
      const store = useNavigationStore.getState();
      if (step.view === "building") store.goToBuilding();
      else if (step.view === "floor" && store.floorId)
        store.goToFloor(store.floorId);
    }
  }, [step]);

  if (!isActive || !step) return null;

  return (
    <>
      <SpotlightDim
        targetTourId={step.targetTourId}
        wide={step.wideSpotlight}
      />
      <PointerRing targetTourId={step.targetTourId} label={step.pointerLabel} />
      <NarratorBar
        title={t(step.titleKey as TranslationKey)}
        description={t(step.descriptionKey as TranslationKey)}
        stepType={step.type}
        stepIndex={stepIndex}
        totalSteps={steps.length}
        onSkip={skipTour}
      />
    </>
  );
}
