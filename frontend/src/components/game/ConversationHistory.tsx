/**
 * ConversationHistory - Chat-style view of user prompts, Claude responses,
 * thinking blocks, and tool calls.
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGameStore, selectConversation } from "@/stores/gameStore";
import { format } from "date-fns";
import {
  MessageSquare,
  Wrench,
  Brain,
  ChevronDown,
  ChevronRight,
  Maximize2,
  X,
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

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="text-slate-200 text-[11px] leading-relaxed mb-1.5 last:mb-0 break-words">
            {children}
          </p>
        ),
        h1: ({ children }) => (
          <h1 className="text-slate-100 text-[13px] font-bold mt-2 mb-1 border-b border-slate-700 pb-0.5">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-slate-100 text-[12px] font-bold mt-2 mb-1">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-slate-200 text-[11px] font-bold mt-1.5 mb-0.5">
            {children}
          </h3>
        ),
        strong: ({ children }) => (
          <strong className="text-slate-100 font-bold">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="text-slate-300 italic">{children}</em>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          return isBlock ? (
            <code className="block bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[10px] font-mono text-emerald-300 overflow-x-auto whitespace-pre my-1">
              {children}
            </code>
          ) : (
            <code className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[10px] font-mono text-emerald-300">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-1 overflow-x-auto">{children}</pre>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside text-[11px] text-slate-200 space-y-0.5 my-1 pl-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside text-[11px] text-slate-200 space-y-0.5 my-1 pl-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-slate-600 pl-2 my-1 text-slate-400 italic">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="border-slate-700 my-2" />,
      }}
    >
      {text}
    </ReactMarkdown>
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
        <MarkdownContent text={expanded ? entry.text : preview} />
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

function ConversationEntries({
  visible,
  bottomRef,
}: {
  visible: ConversationEntry[];
  bottomRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {visible.map((entry) => {
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
      })}
      {bottomRef && <div ref={bottomRef} />}
    </>
  );
}

export function ConversationHistory() {
  const conversation = useGameStore(selectConversation);
  const bottomRef = useRef<HTMLDivElement>(null);
  const modalBottomRef = useRef<HTMLDivElement>(null);
  const [showTools, setShowTools] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  useEffect(() => {
    if (expanded) {
      modalBottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [expanded, visible.length]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded]);

  const header = (onExpand?: () => void) => (
    <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2 text-slate-300 font-bold uppercase tracking-wider">
        <MessageSquare size={14} className="text-cyan-500" />
        Conversation
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500">{messageCount} msgs</span>
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
        {onExpand ? (
          <button
            onClick={onExpand}
            className="p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Expand conversation"
          >
            <Maximize2 size={12} />
          </button>
        ) : (
          <button
            onClick={() => setExpanded(false)}
            className="p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Inline panel */}
      <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
        {header(() => setExpanded(true))}
        <div className="flex-grow overflow-y-auto p-3 space-y-2">
          {conversation.length === 0 ? (
            <div className="text-slate-600 italic p-4 text-center">
              No conversation yet. Start a Claude Code session.
            </div>
          ) : (
            <ConversationEntries visible={visible} bottomRef={bottomRef} />
          )}
        </div>
      </div>

      {/* Expanded modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex flex-col bg-slate-950 border border-slate-700 rounded-xl shadow-2xl font-mono text-xs overflow-hidden"
            style={{ width: "min(900px, 90vw)", height: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {header()}
            <div className="flex-grow overflow-y-auto p-4 space-y-2">
              {conversation.length === 0 ? (
                <div className="text-slate-600 italic p-4 text-center">
                  No conversation yet. Start a Claude Code session.
                </div>
              ) : (
                <ConversationEntries
                  visible={visible}
                  bottomRef={modalBottomRef}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
