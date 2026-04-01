"use client";

import { create } from "zustand";
import { isLocale, type Locale } from "@/i18n";

// ============================================================================
// TYPES
// ============================================================================

export type ClockType = "analog" | "digital";
export type ClockFormat = "12h" | "24h";

interface PreferencesState {
  clockType: ClockType;
  clockFormat: ClockFormat;
  autoFollowNewSessions: boolean;
  language: Locale;
  isLoaded: boolean;

  // Actions
  loadPreferences: () => Promise<void>;
  setClockType: (type: ClockType) => Promise<void>;
  setClockFormat: (format: ClockFormat) => Promise<void>;
  setAutoFollowNewSessions: (enabled: boolean) => Promise<void>;
  setLanguage: (language: Locale) => Promise<void>;
  cycleClockMode: () => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = "http://localhost:8000/api/v1/preferences";

const DEFAULT_CLOCK_TYPE: ClockType = "analog";
const DEFAULT_CLOCK_FORMAT: ClockFormat = "12h";
const DEFAULT_AUTO_FOLLOW_NEW_SESSIONS = true;
const DEFAULT_LANGUAGE: Locale = "en";

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchPreferences(): Promise<Record<string, string>> {
  try {
    const res = await fetch(API_BASE);
    if (res.ok) {
      return (await res.json()) as Record<string, string>;
    }
  } catch {
    // Silently fail - use defaults
  }
  return {};
}

async function setPreference(key: string, value: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  } catch {
    // Silently fail
  }
}

// ============================================================================
// STORE
// ============================================================================

export const usePreferencesStore = create<PreferencesState>()((set, get) => ({
  clockType: DEFAULT_CLOCK_TYPE,
  clockFormat: DEFAULT_CLOCK_FORMAT,
  autoFollowNewSessions: DEFAULT_AUTO_FOLLOW_NEW_SESSIONS,
  language: DEFAULT_LANGUAGE,
  isLoaded: false,

  loadPreferences: async () => {
    const prefs = await fetchPreferences();

    const clockType = (prefs.clock_type as ClockType) || DEFAULT_CLOCK_TYPE;
    const clockFormat =
      (prefs.clock_format as ClockFormat) || DEFAULT_CLOCK_FORMAT;
    const autoFollowRaw = prefs.auto_follow_new_sessions;
    const autoFollowNewSessions =
      autoFollowRaw === undefined
        ? DEFAULT_AUTO_FOLLOW_NEW_SESSIONS
        : autoFollowRaw === "true";
    const language = (prefs.language as Locale) || DEFAULT_LANGUAGE;

    set({
      clockType:
        clockType === "analog" || clockType === "digital"
          ? clockType
          : DEFAULT_CLOCK_TYPE,
      clockFormat:
        clockFormat === "12h" || clockFormat === "24h"
          ? clockFormat
          : DEFAULT_CLOCK_FORMAT,
      autoFollowNewSessions,
      language: isLocale(language) ? language : DEFAULT_LANGUAGE,
      isLoaded: true,
    });
  },

  setClockType: async (clockType) => {
    set({ clockType });
    await setPreference("clock_type", clockType);
  },

  setClockFormat: async (clockFormat) => {
    set({ clockFormat });
    await setPreference("clock_format", clockFormat);
  },

  setAutoFollowNewSessions: async (enabled) => {
    set({ autoFollowNewSessions: enabled });
    await setPreference("auto_follow_new_sessions", String(enabled));
  },

  setLanguage: async (language) => {
    set({ language });
    await setPreference("language", language);
  },

  cycleClockMode: async () => {
    const { clockType, clockFormat } = get();

    // Cycle: analog → digital 12h → digital 24h → analog
    let newClockType: ClockType;
    let newClockFormat: ClockFormat;

    if (clockType === "analog") {
      newClockType = "digital";
      newClockFormat = "12h";
    } else if (clockType === "digital" && clockFormat === "12h") {
      newClockType = "digital";
      newClockFormat = "24h";
    } else {
      newClockType = "analog";
      newClockFormat = "12h";
    }

    set({ clockType: newClockType, clockFormat: newClockFormat });

    // Save both in parallel
    await Promise.all([
      setPreference("clock_type", newClockType),
      setPreference("clock_format", newClockFormat),
    ]);
  },
}));

// ============================================================================
// SELECTORS
// ============================================================================

export const selectClockType = (state: PreferencesState) => state.clockType;
export const selectClockFormat = (state: PreferencesState) => state.clockFormat;
export const selectAutoFollowNewSessions = (state: PreferencesState) =>
  state.autoFollowNewSessions;
export const selectLanguage = (state: PreferencesState) => state.language;
export const selectIsLoaded = (state: PreferencesState) => state.isLoaded;
