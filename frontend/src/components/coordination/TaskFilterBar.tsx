"use client";

/**
 * Barra de filtros multi-seleção (#818, reusada no /tasks e no /dashboard via #828).
 *
 * Renderiza as três facetas (Status / Projeto-Área / Agente) como checkboxes
 * clicáveis — OR dentro de cada faceta, AND entre facetas (a lógica vive em
 * `taskFilters.ts`; aqui só a UI). Componente "burro": recebe o estado e os
 * callbacks de toggle/clear da página dona, pra não duplicar a regra de filtro
 * nem o lazy-fetch das fechadas.
 */

import { useTranslation, type TranslationKey } from "@/hooks/useTranslation";
import {
  STATUS_FACET_ORDER,
  showsClosed,
  type TaskFilters,
  type FacetName,
} from "./taskFilters";

/** Contadores por opção de cada faceta (vindos de `facetCounts`). */
export interface FacetCountMaps {
  status: Record<string, number>;
  area: Record<string, number>;
  agent: Record<string, number>;
}

interface TaskFilterBarProps {
  filters: TaskFilters;
  onToggle: (facet: FacetName, value: string) => void;
  onClear: () => void;
  /** Áreas existentes nos dados (nomes curtos: front, db, …). */
  areaOptions: string[];
  /** Agentes ligados às tasks (claim/run + donos de área). */
  agentOptions: string[];
  counts: FacetCountMaps;
  /** Wrapper extra (ex.: o /dashboard ajusta a margem). */
  className?: string;
}

export function TaskFilterBar({
  filters,
  onToggle,
  onClear,
  areaOptions,
  agentOptions,
  counts,
  className = "",
}: TaskFilterBarProps): React.ReactNode {
  const { t: tr } = useTranslation();
  const filterCount =
    filters.status.size + filters.area.size + filters.agent.size;
  const showClosed = showsClosed(filters);

  // Uma faceta = um bloco de checkboxes (OR dentro; AND entre facetas).
  const renderFacet = (
    facet: FacetName,
    titleKey: TranslationKey,
    options: { value: string; label: string }[],
    selectedSet: Set<string>,
    countMap: Record<string, number>,
  ): React.ReactNode => {
    if (options.length === 0) return null;
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide font-bold text-slate-500">
          {tr(titleKey)}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {options.map(({ value, label }) => {
            const on = selectedSet.has(value);
            const n = countMap[value] ?? 0;
            return (
              <label
                key={value}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold border cursor-pointer transition-colors ${
                  on
                    ? "bg-sky-500/20 text-sky-200 border-sky-500/50"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500"
                }`}
              >
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5"
                  checked={on}
                  onChange={() => onToggle(facet, value)}
                />
                {label}
                <span className="text-slate-500">{n}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`flex flex-col gap-2 p-3 rounded-lg border border-slate-800 bg-slate-900/40 ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-slate-300">
          {tr("tasks.filter.title")}
        </span>
        {filterCount > 0 && (
          <button
            onClick={onClear}
            className="text-xs font-bold text-slate-400 hover:text-white"
          >
            ✕ {tr("tasks.filter.clear")} ({filterCount})
          </button>
        )}
      </div>
      {renderFacet(
        "status",
        "tasks.filter.status",
        STATUS_FACET_ORDER.map((k) => ({
          value: k,
          label: tr(`tasks.facet.${k}` as TranslationKey),
        })),
        filters.status,
        counts.status,
      )}
      {renderFacet(
        "area",
        "tasks.filter.area",
        areaOptions.map((a) => ({ value: a, label: a })),
        filters.area,
        counts.area,
      )}
      {renderFacet(
        "agent",
        "tasks.filter.agent",
        agentOptions.map((a) => ({ value: a, label: a })),
        filters.agent,
        counts.agent,
      )}
      {!showClosed && (
        <p className="text-[11px] text-slate-500">
          {tr("tasks.filter.noClosedHint")}
        </p>
      )}
    </div>
  );
}
