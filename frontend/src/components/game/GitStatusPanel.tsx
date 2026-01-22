/**
 * GitStatusPanel - Git status panel
 *
 * Displays git branch and file status from the unified Zustand store.
 */

"use client";

import { useGameStore, selectGitStatus } from "@/stores/gameStore";
import {
  GitBranch,
  GitCommit,
  FileEdit,
  ArrowUp,
  ArrowDown,
  FilePlus,
  FileX,
  FilePen,
  FileQuestion,
} from "lucide-react";
import { FileStatus } from "@/types";

// Check if sessionId represents a real session (not the placeholder)
const isRealSession = (sessionId: string) =>
  sessionId !== "None" && sessionId !== "sim_session_123";

const getStatusIcon = (status: FileStatus) => {
  switch (status) {
    case "M":
      return <FilePen size={10} />;
    case "A":
      return <FilePlus size={10} />;
    case "D":
      return <FileX size={10} />;
    case "?":
      return <FileQuestion size={10} />;
    default:
      return <FileEdit size={10} />;
  }
};

const getStatusLabel = (status: FileStatus) => {
  switch (status) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "?":
      return "untracked";
    case "!":
      return "ignored";
    default:
      return status;
  }
};

export function GitStatusPanel() {
  const gitStatus = useGameStore(selectGitStatus);
  const sessionId = useGameStore((state) => state.sessionId);
  const hasSession = isRealSession(sessionId);

  if (!gitStatus) {
    return (
      <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
        <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center gap-2">
          <GitBranch size={14} className="text-slate-500" />
          <span className="text-slate-300 font-bold uppercase tracking-wider">
            Git Status
          </span>
        </div>
        <div className="flex-grow flex items-center justify-center text-slate-600 italic p-4 text-center">
          {hasSession ? "Waiting for git status..." : "No session selected"}
        </div>
      </div>
    );
  }

  const stagedCount = gitStatus.changed_files.filter((f) => f.staged).length;

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
      {/* Header */}
      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-300 font-bold uppercase tracking-wider">
          <GitBranch size={14} className="text-emerald-500" />
          Git Status
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {gitStatus.ahead > 0 && (
            <span className="flex items-center gap-0.5 text-emerald-400">
              <ArrowUp size={10} />
              {gitStatus.ahead}
            </span>
          )}
          {gitStatus.behind > 0 && (
            <span className="flex items-center gap-0.5 text-amber-400">
              <ArrowDown size={10} />
              {gitStatus.behind}
            </span>
          )}
        </div>
      </div>

      {/* Branch Info */}
      <div className="px-3 py-2 border-b border-slate-800 flex-shrink-0">
        <span className="text-emerald-400 font-bold">{gitStatus.branch}</span>
      </div>

      {/* Changed Files Section */}
      {gitStatus.changed_files.length > 0 && (
        <div className="flex-shrink-0 max-h-32 flex flex-col border-b border-slate-800">
          <div className="px-3 py-1.5 bg-slate-900/50 flex items-center gap-2 text-slate-400 flex-shrink-0">
            <FileEdit size={12} />
            <span className="font-bold uppercase tracking-wider text-[10px]">
              Changed Files
            </span>
            <span className="text-slate-600 text-[10px]">
              ({gitStatus.changed_files.length})
            </span>
            {stagedCount > 0 && (
              <span className="text-emerald-400 text-[10px]">
                {stagedCount} staged
              </span>
            )}
          </div>
          <div className="flex-grow overflow-y-auto px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {gitStatus.changed_files.map((file) => {
                const normalizedPath = file.path.replace(/[\\/]+$/, "");
                const parts = normalizedPath.split(/[\\/]/);
                const filename = parts.pop() || normalizedPath || file.path;
                return (
                  <span
                    key={file.path}
                    className={`px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 max-w-[140px] ${
                      file.staged
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                    title={`${getStatusLabel(file.status)}: ${file.path}${file.staged ? " (staged)" : ""}`}
                  >
                    {getStatusIcon(file.status)}
                    <span className="truncate">{filename}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Commits Header */}
      <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2 text-slate-400 flex-shrink-0">
        <GitCommit size={12} />
        <span className="font-bold uppercase tracking-wider text-[10px]">
          Recent Commits
        </span>
        <span className="text-slate-600 text-[10px]">
          ({gitStatus.commits.length})
        </span>
      </div>

      {/* Commits List (Scrollable) */}
      <div className="flex-grow overflow-y-auto">
        {gitStatus.commits.length === 0 ? (
          <div className="text-slate-600 italic p-4 text-center">
            No commits found
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {gitStatus.commits.map((commit) => (
              <div
                key={commit.hash}
                className="px-3 py-2 hover:bg-slate-900/50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-cyan-400 font-bold flex-shrink-0 group-hover:text-cyan-300">
                    {commit.hash}
                  </span>
                  <span className="text-slate-500 text-[10px] flex-shrink-0">
                    {commit.relative_time}
                  </span>
                </div>
                <div className="text-slate-300 leading-tight line-clamp-2 group-hover:text-white">
                  {commit.message}
                </div>
                <div className="text-slate-500 text-[10px] mt-1">
                  {commit.author}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
