"use client";

import { ReactNode } from "react";
import Modal from "./Modal";
import {
  usePreferencesStore,
  type ClockType,
  type ClockFormat,
} from "@/stores/preferencesStore";
import { useTranslation } from "@/hooks/useTranslation";
import { locales, type Locale } from "@/i18n";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
}: SettingsModalProps): ReactNode {
  const clockType = usePreferencesStore((s) => s.clockType);
  const clockFormat = usePreferencesStore((s) => s.clockFormat);
  const autoFollowNewSessions = usePreferencesStore(
    (s) => s.autoFollowNewSessions,
  );
  const setClockType = usePreferencesStore((s) => s.setClockType);
  const setClockFormat = usePreferencesStore((s) => s.setClockFormat);
  const language = usePreferencesStore((s) => s.language);
  const setLanguage = usePreferencesStore((s) => s.setLanguage);
  const setAutoFollowNewSessions = usePreferencesStore(
    (s) => s.setAutoFollowNewSessions,
  );

  const { t } = useTranslation();

  const handleLanguageChange = (locale: Locale) => {
    setLanguage(locale);
  };

  const handleClockTypeChange = (type: ClockType) => {
    setClockType(type);
  };

  const handleClockFormatChange = (format: ClockFormat) => {
    setClockFormat(format);
  };

  const handleAutoFollowToggle = () => {
    setAutoFollowNewSessions(!autoFollowNewSessions);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.title")}
      footer={
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {t("modal.close")}
        </button>
      }
    >
      <div className="space-y-6">
        {/* Language */}
        <div>
          <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
            {t("settings.language")}
          </label>
          <div className="flex gap-3" role="radiogroup" aria-label={t("settings.language")}>
            {(Object.entries(locales) as [Locale, string][]).map(([locale, label]) => (
              <button
                key={locale}
                type="button"
                role="radio"
                aria-checked={language === locale}
                tabIndex={language === locale ? 0 : -1}
                onClick={() => handleLanguageChange(locale)}
                onKeyDown={(e) => {
                  const items = Object.keys(locales) as Locale[];
                  const idx = items.indexOf(locale);
                  let next: number | null = null;
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    next = (idx + 1) % items.length;
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    next = (idx - 1 + items.length) % items.length;
                  }
                  if (next !== null) {
                    handleLanguageChange(items[next]);
                    const parent = e.currentTarget.parentElement;
                    if (parent) (parent.children[next] as HTMLElement)?.focus();
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-none ${
                  language === locale
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Clock Type */}
        <div>
          <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
            {t("settings.clockType")}
          </label>
          <div className="flex gap-3" role="radiogroup" aria-label={t("settings.clockType")}>
            {(["analog", "digital"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={clockType === type}
                tabIndex={clockType === type ? 0 : -1}
                onClick={() => handleClockTypeChange(type)}
                onKeyDown={(e) => {
                  const values: ClockType[] = ["analog", "digital"];
                  const parent = e.currentTarget.parentElement;
                  if (!parent) return;
                  const buttons = Array.from(parent.children) as HTMLElement[];
                  const idx = buttons.indexOf(e.currentTarget);
                  let nextIdx: number | null = null;
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    nextIdx = (idx + 1) % values.length;
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    nextIdx = (idx - 1 + values.length) % values.length;
                  }
                  if (nextIdx !== null) {
                    handleClockTypeChange(values[nextIdx]);
                    buttons[nextIdx].focus();
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-none ${
                  clockType === type
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                {type === "analog" ? t("settings.analog") : t("settings.digital")}
              </button>
            ))}
          </div>
        </div>

        {/* Time Format - only visible when digital */}
        {clockType === "digital" && (
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
              {t("settings.timeFormat")}
            </label>
            <div className="flex gap-3" role="radiogroup" aria-label={t("settings.timeFormat")}>
              {(["12h", "24h"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  role="radio"
                  aria-checked={clockFormat === fmt}
                  tabIndex={clockFormat === fmt ? 0 : -1}
                  onClick={() => handleClockFormatChange(fmt)}
                  onKeyDown={(e) => {
                    const values: ClockFormat[] = ["12h", "24h"];
                    const parent = e.currentTarget.parentElement;
                    if (!parent) return;
                    const buttons = Array.from(parent.children) as HTMLElement[];
                    const idx = buttons.indexOf(e.currentTarget);
                    let nextIdx: number | null = null;
                    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                      e.preventDefault();
                      nextIdx = (idx + 1) % values.length;
                    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                      e.preventDefault();
                      nextIdx = (idx - 1 + values.length) % values.length;
                    }
                    if (nextIdx !== null) {
                      handleClockFormatChange(values[nextIdx]);
                      buttons[nextIdx].focus();
                    }
                  }}
                  className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-none ${
                    clockFormat === fmt
                      ? "bg-purple-500/20 border-purple-500 text-purple-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {fmt === "12h" ? t("settings.12hour") : t("settings.24hour")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Session Settings */}
        <div className="pt-4 border-t border-slate-800">
          <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
            {t("settings.sessionBehavior")}
          </label>
          <div
            role="switch"
            aria-checked={autoFollowNewSessions}
            aria-label={t("settings.autoFollow")}
            tabIndex={0}
            onClick={handleAutoFollowToggle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleAutoFollowToggle();
              }
            }}
            className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer hover:border-slate-600 transition-colors"
          >
            <div>
              <p className="text-slate-300 text-sm font-medium">
                {t("settings.autoFollow")}
              </p>
              <p className="text-slate-500 text-xs mt-0.5">
                {t("settings.autoFollowDesc")}
              </p>
            </div>
            <div
              className={`w-11 h-6 rounded-full relative transition-colors ${
                autoFollowNewSessions ? "bg-purple-500" : "bg-slate-600"
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                  autoFollowNewSessions ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Tip */}
        <div className="pt-4 border-t border-slate-800">
          <p className="text-slate-500 text-xs">
            {t("settings.clockTip")}
          </p>
        </div>
      </div>
    </Modal>
  );
}
