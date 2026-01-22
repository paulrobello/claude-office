"use client";

/**
 * Sprite Sheet Builder Tool
 *
 * A comprehensive tool for working with sprite sheets:
 * - Preview: Animate and debug sprite configurations
 * - Builder: Construct aligned sprite sheets with grid snapping
 *
 * Fixes grid alignment issues and provides chroma key removal for clean transparency.
 * Standard sprite sheets use 924x1120 (6 cols × 8 rows = 154x140 cells).
 */

import { useState } from "react";
import { PreviewPanel, BuilderPanel } from "./components";

// ============================================================================
// TAB TYPES
// ============================================================================

type TabId = "preview" | "builder";

interface Tab {
  id: TabId;
  label: string;
  description: string;
}

const TABS: Tab[] = [
  {
    id: "preview",
    label: "Preview",
    description: "Animate and debug sprite configurations",
  },
  {
    id: "builder",
    label: "Builder",
    description: "Construct aligned sprite sheets with grid snapping",
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SpriteDebugPage() {
  const [activeTab, setActiveTab] = useState<TabId>("preview");

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Sprite Sheet Builder</h1>
        <p className="text-gray-400 text-sm">
          Build and debug sprite sheets with grid alignment and chroma key
          removal
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
              activeTab === tab.id
                ? "bg-gray-800 text-white border-t border-l border-r border-gray-700"
                : "text-gray-400 hover:text-white hover:bg-gray-800/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Description */}
      <p className="text-gray-500 text-xs mb-4">
        {TABS.find((t) => t.id === activeTab)?.description}
      </p>

      {/* Tab Content */}
      <div className="min-h-[600px]">
        {activeTab === "preview" && <PreviewPanel />}
        {activeTab === "builder" && <BuilderPanel />}
      </div>
    </div>
  );
}
