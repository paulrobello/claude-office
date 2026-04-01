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
                onClick={() => handleLanguageChange(locale)}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors ${
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
          <div className="flex gap-3">
            <button
              onClick={() => handleClockTypeChange("analog")}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors ${
                clockType === "analog"
                  ? "bg-purple-500/20 border-purple-500 text-purple-300"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              {t("settings.analog")}
            </button>
            <button
              onClick={() => handleClockTypeChange("digital")}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors ${
                clockType === "digital"
                  ? "bg-purple-500/20 border-purple-500 text-purple-300"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              {t("settings.digital")}
            </button>
          </div>
        </div>

        {/* Time Format - only visible when digital */}
        {clockType === "digital" && (
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
              {t("settings.timeFormat")}
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => handleClockFormatChange("12h")}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors ${
                  clockFormat === "12h"
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                {t("settings.12hour")}
              </button>
              <button
                onClick={() => handleClockFormatChange("24h")}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors ${
                  clockFormat === "24h"
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                {t("settings.24hour")}
              </button>
            </div>
          </div>
        )}

        {/* Session Settings */}
        <div className="pt-4 border-t border-slate-800">
          <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
            {t("settings.sessionBehavior")}
          </label>
          <div
            role="button"
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
