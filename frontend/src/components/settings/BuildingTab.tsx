"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { FloorConfig, RoomConfig } from "@/types/navigation";

const API_URL = "http://localhost:8000/api/v1/preferences/building_config";

// ============================================================================
// ICON PICKER
// ============================================================================

const FLOOR_ICONS = [
  "\u{1F3E2}", // 🏢 office
  "\u{1F527}", // 🔧 wrench
  "\u{2696}\u{FE0F}", // ⚖️ scales
  "\u{1F4DA}", // 📚 books
  "\u{1F415}", // 🐕 dog
  "\u{1F6E0}\u{FE0F}", // 🛠️ tools
  "\u{1F310}", // 🌐 globe
  "\u{1F4BB}", // 💻 laptop
  "\u{1F680}", // 🚀 rocket
  "\u{1F3AF}", // 🎯 target
  "\u{1F52C}", // 🔬 microscope
  "\u{1F4CA}", // 📈 chart
  "\u{1F916}", // 🤖 robot
  "\u{26A1}", // ⚡ lightning
  "\u{1F331}", // 🌱 seedling
  "\u{1F517}", // 🔗 link
  "\u{1F4E6}", // 📦 package
  "\u{1F3D7}\u{FE0F}", // 🏗️ construction
  "\u{1F5A5}\u{FE0F}", // 🖥️ desktop
  "\u{1F9D1}\u{200D}\u{1F4BB}", // 🧑‍💻 coder
];

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs font-mono hover:border-purple-500 focus:border-purple-500 focus:outline-none transition-colors flex items-center gap-2"
      >
        <span className="text-base leading-none">{value || "\u{1F3E2}"}</span>
        <span className="text-slate-500 text-[10px]">{"\u25BC"}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 p-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl grid grid-cols-5 gap-1 w-40">
          {FLOOR_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => {
                onChange(icon);
                setOpen(false);
              }}
              className={`p-1.5 rounded text-base leading-none hover:bg-purple-500/20 transition-colors ${
                value === icon ? "bg-purple-500/30 ring-1 ring-purple-500" : ""
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TYPES
// ============================================================================

interface FloorFormData {
  id: string;
  name: string;
  floorNumber: number;
  accent: string;
  icon: string;
  repos: string; // comma-separated, for editing
}

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return `floor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function floorConfigToFormData(floor: FloorConfig): FloorFormData {
  return {
    id: floor.id,
    name: floor.name,
    floorNumber: floor.floorNumber,
    accent: floor.accent,
    icon: floor.icon,
    repos: floor.rooms.map((r) => r.repoName).join(", "),
  };
}

function formDataToFloorConfig(data: FloorFormData): {
  id: string;
  name: string;
  floorNumber: number;
  accent: string;
  icon: string;
  rooms: RoomConfig[];
} {
  const repos = data.repos
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return {
    id: data.id,
    name: data.name || `Floor ${data.floorNumber}`,
    floorNumber: data.floorNumber,
    accent: data.accent || "#6366f1",
    icon: data.icon || "\u{1F3E2}",
    rooms: repos.map((repoName, idx) => ({
      id: `${data.id}_room_${idx}`,
      repoName,
    })),
  };
}

// ============================================================================
// BUILDING TAB COMPONENT
// ============================================================================

export function BuildingTab(): ReactNode {
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const setBuildingConfig = useNavigationStore((s) => s.setBuildingConfig);
  const { t } = useTranslation();

  const [buildingName, setBuildingName] = useState("");
  const [floors, setFloors] = useState<FloorFormData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Initialize form from store config
  useEffect(() => {
    if (buildingConfig) {
      setBuildingName(buildingConfig.buildingName);
      setFloors(buildingConfig.floors.map(floorConfigToFormData));
    }
  }, [buildingConfig]);

  const handleAddFloor = () => {
    const nextFloorNumber =
      floors.length > 0 ? Math.max(...floors.map((f) => f.floorNumber)) + 1 : 1;
    setFloors((prev) => [
      ...prev,
      {
        id: generateId(),
        name: "",
        floorNumber: nextFloorNumber,
        accent: "#6366f1",
        icon: "\u{1F3E2}",
        repos: "",
      },
    ]);
  };

  const handleRemoveFloor = (floorId: string) => {
    setFloors((prev) => prev.filter((f) => f.id !== floorId));
  };

  const handleUpdateFloor = (
    floorId: string,
    updates: Partial<FloorFormData>,
  ) => {
    setFloors((prev) =>
      prev.map((f) => (f.id === floorId ? { ...f, ...updates } : f)),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    const config = {
      building_name: buildingName || "Building",
      floors: floors.map(formDataToFloorConfig),
    };

    try {
      const res = await fetch(API_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(config) }),
      });

      if (res.ok) {
        // Update local navigation store
        setBuildingConfig({
          buildingName: config.building_name,
          floors: config.floors,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.warn("[BuildingTab] Failed to save config:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hint */}
      <p className="text-slate-500 text-xs">
        {t("settings.building.enableHint")}
      </p>

      {/* Building Name */}
      <div>
        <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
          {t("settings.building.name")}
        </label>
        <input
          type="text"
          value={buildingName}
          onChange={(e) => setBuildingName(e.target.value)}
          placeholder={t("settings.building.namePlaceholder")}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
        />
      </div>

      {/* Floors List */}
      <div>
        <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
          {t("settings.building.floors")}
        </label>

        {floors.length === 0 ? (
          <p className="text-slate-600 text-sm font-mono py-4 text-center border border-dashed border-slate-800 rounded-lg">
            {t("settings.building.noFloors")}
          </p>
        ) : (
          <div className="space-y-3">
            {floors.map((floor) => (
              <div
                key={floor.id}
                className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg space-y-3"
              >
                {/* Floor header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500">
                    {t("settings.building.floorNumber")} {floor.floorNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFloor(floor.id)}
                    className="text-xs text-rose-500/70 hover:text-rose-400 font-mono transition-colors"
                  >
                    {t("settings.building.deleteFloor")}
                  </button>
                </div>

                {/* Floor fields */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Name */}
                  <div>
                    <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                      {t("settings.building.floorName")}
                    </label>
                    <input
                      type="text"
                      value={floor.name}
                      onChange={(e) =>
                        handleUpdateFloor(floor.id, { name: e.target.value })
                      }
                      placeholder="Engineering"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs font-mono focus:border-purple-500 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                      {t("settings.building.icon")}
                    </label>
                    <IconPicker
                      value={floor.icon}
                      onChange={(icon) => handleUpdateFloor(floor.id, { icon })}
                    />
                  </div>

                  {/* Accent color */}
                  <div>
                    <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                      {t("settings.building.accentColor")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={floor.accent}
                        onChange={(e) =>
                          handleUpdateFloor(floor.id, {
                            accent: e.target.value,
                          })
                        }
                        className="w-8 h-8 border border-slate-700 rounded cursor-pointer bg-transparent"
                      />
                      <span className="text-xs font-mono text-slate-500">
                        {floor.accent}
                      </span>
                    </div>
                  </div>

                  {/* Repos */}
                  <div className="col-span-2">
                    <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                      {t("settings.building.repos")}
                    </label>
                    <input
                      type="text"
                      value={floor.repos}
                      onChange={(e) =>
                        handleUpdateFloor(floor.id, { repos: e.target.value })
                      }
                      placeholder={t("settings.building.reposPlaceholder")}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs font-mono focus:border-purple-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Floor button */}
        <button
          type="button"
          onClick={handleAddFloor}
          className="mt-3 w-full py-2 border border-dashed border-slate-700 rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 font-mono transition-colors"
        >
          + {t("settings.building.addFloor")}
        </button>
      </div>

      {/* Save button */}
      <div className="pt-4 border-t border-slate-800">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors ${
            saved
              ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
              : saving
                ? "bg-slate-700 border border-slate-600 text-slate-400 cursor-not-allowed"
                : "bg-purple-500/20 border border-purple-500/50 text-purple-300 hover:bg-purple-500/30"
          }`}
        >
          {saved
            ? t("settings.building.saved")
            : saving
              ? t("settings.building.saving")
              : t("settings.building.save")}
        </button>
      </div>
    </div>
  );
}
