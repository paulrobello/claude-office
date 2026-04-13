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

  // Attention settings
  commandBarEnabled: boolean;
  clickToFocusEnabled: boolean;
  toastFilterPermission: boolean;
  toastFilterError: boolean;
  toastFilterTaskComplete: boolean;
  toastFilterArrival: boolean;
  toastAutoDismissLow: number;
  toastAutoDismissInfo: number;

  // Actions
  loadPreferences: () => Promise<void>;
  setClockType: (type: ClockType) => Promise<void>;
  setClockFormat: (format: ClockFormat) => Promise<void>;
  setAutoFollowNewSessions: (enabled: boolean) => Promise<void>;
  setLanguage: (language: Locale) => Promise<void>;
  cycleClockMode: () => Promise<void>;
  setCommandBarEnabled: (enabled: boolean) => Promise<void>;
  setClickToFocusEnabled: (enabled: boolean) => Promise<void>;
  setToastFilterPermission: (enabled: boolean) => Promise<void>;
  setToastFilterError: (enabled: boolean) => Promise<void>;
  setToastFilterTaskComplete: (enabled: boolean) => Promise<void>;
  setToastFilterArrival: (enabled: boolean) => Promise<void>;
  setToastAutoDismissLow: (ms: number) => Promise<void>;
  setToastAutoDismissInfo: (ms: number) => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = "http://localhost:8000/api/v1/preferences";

const DEFAULT_CLOCK_TYPE: ClockType = "analog";
const DEFAULT_CLOCK_FORMAT: ClockFormat = "12h";
const DEFAULT_AUTO_FOLLOW_NEW_SESSIONS = true;
const DEFAULT_LANGUAGE: Locale = "en";
const DEFAULT_COMMAND_BAR_ENABLED = true;
const DEFAULT_CLICK_TO_FOCUS_ENABLED = true;
const DEFAULT_TOAST_FILTER_PERMISSION = true;
const DEFAULT_TOAST_FILTER_ERROR = true;
const DEFAULT_TOAST_FILTER_TASK_COMPLETE = true;
const DEFAULT_TOAST_FILTER_ARRIVAL = true;
const DEFAULT_TOAST_AUTO_DISMISS_LOW = 5000;
const DEFAULT_TOAST_AUTO_DISMISS_INFO = 3000;

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchPreferences(): Promise<Record<string, string>> {
  try {
    const res = await fetch(API_BASE);
    if (res.ok) {
      return (await res.json()) as Record<string, string>;
    }
  } catch (err) {
    console.warn("[preferences] Failed to fetch:", err);
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
  } catch (err) {
    console.warn(`[preferences] Failed to save "${key}":`, err);
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
  commandBarEnabled: DEFAULT_COMMAND_BAR_ENABLED,
  clickToFocusEnabled: DEFAULT_CLICK_TO_FOCUS_ENABLED,
  toastFilterPermission: DEFAULT_TOAST_FILTER_PERMISSION,
  toastFilterError: DEFAULT_TOAST_FILTER_ERROR,
  toastFilterTaskComplete: DEFAULT_TOAST_FILTER_TASK_COMPLETE,
  toastFilterArrival: DEFAULT_TOAST_FILTER_ARRIVAL,
  toastAutoDismissLow: DEFAULT_TOAST_AUTO_DISMISS_LOW,
  toastAutoDismissInfo: DEFAULT_TOAST_AUTO_DISMISS_INFO,
  isLoaded: false,

  loadPreferences: async () => {
    const prefs = await fetchPreferences();

    const clockTypeRaw = prefs.clock_type || DEFAULT_CLOCK_TYPE;
    const clockFormatRaw = prefs.clock_format || DEFAULT_CLOCK_FORMAT;
    const autoFollowRaw = prefs.auto_follow_new_sessions;
    const autoFollowNewSessions =
      autoFollowRaw === undefined
        ? DEFAULT_AUTO_FOLLOW_NEW_SESSIONS
        : autoFollowRaw === "true";
    const language = prefs.language || DEFAULT_LANGUAGE;

    set({
      clockType:
        clockTypeRaw === "analog" || clockTypeRaw === "digital"
          ? clockTypeRaw
          : DEFAULT_CLOCK_TYPE,
      clockFormat:
        clockFormatRaw === "12h" || clockFormatRaw === "24h"
          ? clockFormatRaw
          : DEFAULT_CLOCK_FORMAT,
      autoFollowNewSessions,
      language: isLocale(language) ? language : DEFAULT_LANGUAGE,
      commandBarEnabled: prefs.commandBarEnabled !== "false",
      clickToFocusEnabled: prefs.clickToFocusEnabled !== "false",
      toastFilterPermission: prefs.toastFilterPermission !== "false",
      toastFilterError: prefs.toastFilterError !== "false",
      toastFilterTaskComplete: prefs.toastFilterTaskComplete !== "false",
      toastFilterArrival: prefs.toastFilterArrival !== "false",
      toastAutoDismissLow: prefs.toastAutoDismissLow
        ? Number(prefs.toastAutoDismissLow)
        : DEFAULT_TOAST_AUTO_DISMISS_LOW,
      toastAutoDismissInfo: prefs.toastAutoDismissInfo
        ? Number(prefs.toastAutoDismissInfo)
        : DEFAULT_TOAST_AUTO_DISMISS_INFO,
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

  setCommandBarEnabled: async (enabled) => {
    set({ commandBarEnabled: enabled });
    await setPreference("commandBarEnabled", String(enabled));
  },

  setClickToFocusEnabled: async (enabled) => {
    set({ clickToFocusEnabled: enabled });
    await setPreference("clickToFocusEnabled", String(enabled));
  },

  setToastFilterPermission: async (enabled) => {
    set({ toastFilterPermission: enabled });
    await setPreference("toastFilterPermission", String(enabled));
  },

  setToastFilterError: async (enabled) => {
    set({ toastFilterError: enabled });
    await setPreference("toastFilterError", String(enabled));
  },

  setToastFilterTaskComplete: async (enabled) => {
    set({ toastFilterTaskComplete: enabled });
    await setPreference("toastFilterTaskComplete", String(enabled));
  },

  setToastFilterArrival: async (enabled) => {
    set({ toastFilterArrival: enabled });
    await setPreference("toastFilterArrival", String(enabled));
  },

  setToastAutoDismissLow: async (ms) => {
    set({ toastAutoDismissLow: ms });
    await setPreference("toastAutoDismissLow", String(ms));
  },

  setToastAutoDismissInfo: async (ms) => {
    set({ toastAutoDismissInfo: ms });
    await setPreference("toastAutoDismissInfo", String(ms));
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
export const selectCommandBarEnabled = (state: PreferencesState) =>
  state.commandBarEnabled;
export const selectClickToFocusEnabled = (state: PreferencesState) =>
  state.clickToFocusEnabled;
export const selectToastFilterPermission = (state: PreferencesState) =>
  state.toastFilterPermission;
export const selectToastFilterError = (state: PreferencesState) =>
  state.toastFilterError;
export const selectToastFilterTaskComplete = (state: PreferencesState) =>
  state.toastFilterTaskComplete;
export const selectToastFilterArrival = (state: PreferencesState) =>
  state.toastFilterArrival;
export const selectToastAutoDismissLow = (state: PreferencesState) =>
  state.toastAutoDismissLow;
export const selectToastAutoDismissInfo = (state: PreferencesState) =>
  state.toastAutoDismissInfo;
