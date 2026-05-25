"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/agents", label: "Agentes" },
  { href: "/tasks", label: "Tasks" },
  { href: "/agent-runs", label: "Histórico" },
  { href: "/dashboard", label: "Dashboard" },
];

/** Sub-navegação (abas) entre as 3 páginas de coordenação. */
export function CoordinationNav(): React.ReactNode {
  const path = usePathname();
  return (
    <nav className="flex gap-2 border-b border-slate-800 mb-4">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
            path === tab.href
              ? "border-sky-400 text-sky-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
