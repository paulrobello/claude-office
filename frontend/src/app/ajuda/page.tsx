"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { CoordinationNav } from "@/components/coordination/CoordinationNav";

// Página de referência: como iniciar agentes (novo fluxo via roster/start-agent).
// Estática — um "cartão de memória" pro CEO. Cada comando tem botão de copiar.

const ROSTER: { nome: string; funcao: string; abre: string }[] = [
  { nome: "OFFICE-MANAGER-1", funcao: "gerente / coordenador (#368)", abre: "Agents/gerente" },
  { nome: "TRIADOR-1", funcao: "triagem de issues", abre: "Agents/triador" },
  { nome: "DEV-FRONT-1", funcao: "frontend", abre: "hmtrack-front" },
  { nome: "DEV-API-1", funcao: "API Python", abre: "hmtrack-api-py" },
  { nome: "DEV-TRACKERS-1", funcao: "rastreadores GPS", abre: "hmtrack-trackers" },
  { nome: "DEV-ALERT-1", funcao: "sistema de alertas", abre: "hmtrack-alert-system" },
  { nome: "DBA-1", funcao: "banco de dados", abre: "BANCO-DADOS" },
];

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="bg-[#0a0e1a] border border-[#232a40] rounded px-3 py-2 pr-20 text-[13px] font-mono text-[#4ade80] overflow-x-auto whitespace-pre-wrap">
        {children}
      </pre>
      <button
        onClick={copy}
        className={`absolute top-2 right-2 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${
          copied
            ? "border-[#4ade80]/40 text-[#4ade80] bg-[#4ade80]/10"
            : "border-[#2e3653] bg-[#131826] text-[#7e89a3] hover:text-[#c7d0e0]"
        }`}
        title="copiar"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? "copiado" : "copiar"}
      </button>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-[#232a40] rounded-lg bg-[#131826] p-4">
      <h2 className="text-sm font-bold text-[#f1f5fb] mb-2">
        <span className="text-[#fb923c] font-mono mr-2">{n}</span>
        {title}
      </h2>
      <div className="text-sm text-[#c7d0e0] space-y-2">{children}</div>
    </section>
  );
}

export default function AjudaPage(): React.ReactNode {
  return (
    <main className="min-h-screen bg-neutral-950 text-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-orange-500">Claude</span> Coordenação
        </h1>
        <Link href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
          <ArrowLeft size={14} /> Voltar ao escritório
        </Link>
      </div>

      <CoordinationNav />

      <div className="max-w-3xl space-y-3">
        <p className="text-sm text-[#7e89a3]">
          Como iniciar agentes no fluxo atual (roster + <code className="text-[#c7d0e0]">start-agent</code>).
          Um comando só, vale pra qualquer agente. Clique em <b>copiar</b> e cole no terminal.
        </p>

        <Section n="1." title="Abrir um terminal e ativar os aliases (1ª vez)">
          <Code>{"source ~/.bashrc   # ou: source ~/.zshrc — ou abra um terminal novo"}</Code>
        </Section>

        <Section n="2." title="Iniciar um agente">
          <p>Nome como argumento (minúsculo, <b>sem</b> <code>--</code>):</p>
          <Code>{"start-agent DEV-FRONT-1"}</Code>
          <p className="text-[#7e89a3] text-xs">
            O script lê o roster, <b>entra no repo certo</b> e carimba a identidade no cockpit. Ele aparece como mesa aqui.
          </p>
        </Section>

        <Section n="3." title="Quem posso iniciar (roster)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[#7e89a3] text-left">
                <tr>
                  <th className="py-1 pr-3 font-bold">start-agent …</th>
                  <th className="py-1 pr-3 font-bold">função</th>
                  <th className="py-1 font-bold">abre em</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {ROSTER.map((a) => (
                  <tr key={a.nome} className="border-t border-[#232a40]">
                    <td className="py-1 pr-3 text-[#c7d0e0]">{a.nome}</td>
                    <td className="py-1 pr-3 text-[#7e89a3] font-sans">{a.funcao}</td>
                    <td className="py-1 text-[#4b5573]">{a.abre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section n="4." title="Atalho do gerente (continuar o #368)">
          <Code>{"gerente-boss   # = start-agent OFFICE-MANAGER-1"}</Code>
          <p className="text-[#7e89a3] text-xs">
            No 1º prompt:{" "}
            <span className="text-[#c7d0e0]">
              &quot;continuar #368 — leia Agents/gerente/HANDOFF_368_cockpit_2026-05-25.md e o REVIEW&quot;
            </span>
          </p>
        </Section>

        <Section n="5." title="Flags úteis">
          <Code>{`start-agent DEV-API-1 --print                  # mostra o que vai fazer (não abre)
start-agent DEV-API-1 --task "faz a issue 123" # one-off (claude -p)`}</Code>
        </Section>

        <Section n="6." title="Ver este cockpit de pé">
          <Code>{"claude-office   # sobe backend :8000 + frontend :5000"}</Code>
          <p className="text-[#7e89a3] text-xs">Abra http://localhost:5000 — as sessões aparecem como mesas.</p>
        </Section>
      </div>
    </main>
  );
}
