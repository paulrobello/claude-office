/**
 * ConversationHistory - Chat-style view of user prompts, Claude responses,
 * thinking blocks, and tool calls.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore, selectConversation } from "@/stores/gameStore";
import { format } from "date-fns";
import {
  MessageSquare,
  Wrench,
  Brain,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ConversationEntry } from "@/types";

// Tool icon mapping
function getToolIcon(toolName?: string): string {
  if (!toolName) return "⚙️";
  const icons: Record<string, string> = {
    Read: "📖",
    Write: "✏️",
    Edit: "✏️",
    Bash: "💻",
    Glob: "🔍",
    Grep: "🔍",
    Task: "👤",
    WebFetch: "🌐",
    WebSearch: "🌐",
    TodoWrite: "📋",
    TodoRead: "📋",
    NotebookEdit: "📓",
    Agent: "🤖",
  };
  return icons[toolName] ?? "⚙️";
}

function ThinkingEntry({ entry }: { entry: ConversationEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.text.length > 200;
  const preview = isLong ? entry.text.slice(0, 200) + "…" : entry.text;

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-indigo-950/30 border border-indigo-800/30">
      <Brain size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-widest text-indigo-500 mb-1 font-bold">
          Thinking
        </div>
        <p className="text-indigo-200/70 text-[11px] italic leading-relaxed whitespace-pre-wrap break-words">
          {expanded ? entry.text : preview}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-indigo-400 text-[10px] mt-1 hover:text-indigo-300 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronDown size={10} /> Collapse
              </>
            ) : (
              <>
                <ChevronRight size={10} /> Show more
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function ToolEntry({ entry }: { entry: ConversationEntry }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/40 border border-slate-700/30">
      <Wrench size={10} className="text-amber-500/70 flex-shrink-0" />
      <span className="text-[10px] text-amber-400/80 font-mono flex-shrink-0">
        {getToolIcon(entry.toolName)} {entry.toolName}
      </span>
      <span className="text-slate-400 text-[10px] truncate">{entry.text}</span>
    </div>
  );
}

function UserEntry({ entry }: { entry: ConversationEntry }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%]">
        <div className="bg-cyan-900/40 border border-cyan-700/40 rounded-xl rounded-tr-sm px-3 py-2">
          <p className="text-cyan-100 text-[11px] whitespace-pre-wrap break-words leading-relaxed">
            {entry.text}
          </p>
        </div>
        <div className="text-slate-600 text-[10px] mt-1 text-right">
          {format(new Date(entry.timestamp), "HH:mm:ss")}
        </div>
      </div>
    </div>
  );
}

function AssistantEntry({ entry }: { entry: ConversationEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.text.length > 600;
  const preview = isLong ? entry.text.slice(0, 600) + "…" : entry.text;

  return (
    <div className="flex flex-col items-start max-w-[90%] w-full">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
          Claude
        </span>
        {entry.agentId && entry.agentId !== "main" && (
          <span className="text-[9px] px-1.5 py-0.5 bg-blue-900/40 border border-blue-700/30 rounded text-blue-400 font-mono">
            @{entry.agentId.slice(0, 12)}
          </span>
        )}
      </div>
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl rounded-tl-sm px-3 py-2 w-full">
        <p className="text-slate-200 text-[11px] whitespace-pre-wrap break-words leading-relaxed">
          {expanded ? entry.text : preview}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-slate-400 text-[10px] mt-2 hover:text-slate-300 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronDown size={10} /> Collapse
              </>
            ) : (
              <>
                <ChevronRight size={10} /> Show full response
              </>
            )}
          </button>
        )}
      </div>
      <div className="text-slate-600 text-[10px] mt-1">
        {format(new Date(entry.timestamp), "HH:mm:ss")}
      </div>
    </div>
  );
}

export function ConversationHistory() {
  const conversation = useGameStore(selectConversation);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showTools, setShowTools] = useState(false);

  const toolCount = conversation.filter((e) => e.role === "tool").length;
  const messageCount = conversation.filter(
    (e) => e.role === "user" || e.role === "assistant",
  ).length;
  const visible = showTools
    ? conversation
    : conversation.filter((e) => e.role !== "tool");

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length]);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-300 font-bold uppercase tracking-wider">
          <MessageSquare size={14} className="text-cyan-500" />
          Conversation
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">
            {messageCount} msgs
          </span>
          <button
            onClick={() => setShowTools(!showTools)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
              showTools
                ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
            }`}
            title={showTools ? "Hide tool calls" : "Show tool calls"}
          >
            <Wrench size={9} />
            {toolCount}
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-3 space-y-2">
        {conversation.length === 0 ? (
          <div className="text-slate-600 italic p-4 text-center">
            No conversation yet. Start a Claude Code session.
          </div>
        ) : (
          visible.map((entry) => {
            switch (entry.role) {
              case "user":
                return <UserEntry key={entry.id} entry={entry} />;
              case "assistant":
                return <AssistantEntry key={entry.id} entry={entry} />;
              case "thinking":
                return <ThinkingEntry key={entry.id} entry={entry} />;
              case "tool":
                return <ToolEntry key={entry.id} entry={entry} />;
              default:
                return null;
            }
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
