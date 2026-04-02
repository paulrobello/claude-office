const en = {
  // App
  "app.title": "Office Visualizer",
  "app.initializingSystems": "Initializing Systems...",

  // Header Controls
  "header.simulate": "SIMULATE",
  "header.reset": "RESET",
  "header.clearDb": "CLEAR DB",
  "header.debugOn": "DEBUG ON",
  "header.debugOff": "DEBUG OFF",
  "header.settings": "SETTINGS",
  "header.help": "HELP",
  "header.status": "Status",
  "header.connected": "CONNECTED",
  "header.disconnected": "DISCONNECTED",
  "header.aiOn": "ON",
  "header.aiOff": "OFF",
  "header.agents": "agents",

  // Modals
  "modal.confirmDbWipe": "Confirm Database Wipe",
  "modal.cancel": "Cancel",
  "modal.wipeAllData": "Wipe All Data",
  "modal.wipeWarning":
    "Are you sure you want to permanently delete all session history and events? This action cannot be undone and will reset the current visualizer state.",
  "modal.keyboardShortcuts": "Keyboard Shortcuts",
  "modal.close": "Close",
  "modal.toggleDebug": "Toggle debug mode",
  "modal.showAgentPaths": "Show agent paths",
  "modal.showQueueSlots": "Show queue slots",
  "modal.showPhaseLabels": "Show phase labels",
  "modal.deleteSession": "Delete Session",
  "modal.delete": "Delete",
  "modal.deleteSessionConfirm": "Are you sure you want to delete session",
  "modal.deleteSessionWarning": "This will permanently remove",
  "modal.events": "events",
  "modal.cannotBeUndone": "This action cannot be undone.",

  // Settings
  "settings.title": "Settings",
  "settings.clockType": "Clock Type",
  "settings.analog": "Analog",
  "settings.digital": "Digital",
  "settings.timeFormat": "Time Format",
  "settings.12hour": "12-hour",
  "settings.24hour": "24-hour",
  "settings.sessionBehavior": "Session Behavior",
  "settings.autoFollow": "Auto-follow new sessions",
  "settings.autoFollowDesc":
    "Automatically switch to new sessions in the current project",
  "settings.clockTip":
    "Tip: Click the clock in the office to quickly cycle between modes.",
  "settings.language": "Language",

  // Sessions
  "sessions.title": "Sessions",
  "sessions.loading": "Loading sessions...",
  "sessions.noSessions": "No sessions found",
  "sessions.unknownProject": "Unknown Project",
  "sessions.deleteSession": "Delete session",
  "sessions.events": "events",
  "sessions.expandSidebar": "Expand sidebar",
  "sessions.collapseSidebar": "Collapse sidebar",
  "sessions.dragToResize": "Drag to resize",

  // Right Sidebar
  "sidebar.events": "Events",
  "sidebar.conversation": "Conversation",

  // Event Log
  "eventLog.title": "Event Log",
  "eventLog.events": "events",
  "eventLog.waiting": "Waiting for events...",

  // Agent Status
  "agentStatus.title": "Agent State",
  "agentStatus.agents": "agents",
  "agentStatus.noAgents": "No agents",
  "agentStatus.agent": "Agent",
  "agentStatus.desk": "Desk",
  "agentStatus.noTaskSummary": "No task summary",
  "agentStatus.noRecentToolCall": "No recent tool call",
  "agentStatus.inQueue": "In {queueType} queue (position {position})",

  // Git Status
  "git.title": "Git Status",
  "git.waitingForStatus": "Waiting for git status...",
  "git.noSession": "No session selected",
  "git.noRepo": "No git repository detected",
  "git.changedFiles": "Changed Files",
  "git.staged": "staged",
  "git.recentCommits": "Recent Commits",
  "git.noCommits": "No commits found",
  "git.modified": "modified",
  "git.added": "added",
  "git.deleted": "deleted",
  "git.renamed": "renamed",
  "git.copied": "copied",
  "git.untracked": "untracked",
  "git.ignored": "ignored",

  // Conversation
  "conversation.title": "Conversation",
  "conversation.msgs": "msgs",
  "conversation.thinking": "Thinking",
  "conversation.showMore": "Show more",
  "conversation.collapse": "Collapse",
  "conversation.claude": "Claude",
  "conversation.showFullResponse": "Show full response",
  "conversation.hideToolCalls": "Hide tool calls",
  "conversation.showToolCalls": "Show tool calls",
  "conversation.expandConversation": "Expand conversation",
  "conversation.close": "Close",
  "conversation.noConversation":
    "No conversation yet. Start a Claude Code session.",

  // Event Detail Modal
  "eventDetail.summary": "Summary",
  "eventDetail.tool": "Tool",
  "eventDetail.agentName": "Agent Name",
  "eventDetail.taskDescription": "Task Description",
  "eventDetail.userPrompt": "User Prompt",
  "eventDetail.thinking": "Thinking",
  "eventDetail.message": "Message",
  "eventDetail.resultSummary": "Result Summary",
  "eventDetail.errorType": "Error Type",
  "eventDetail.toolInput": "Tool Input",
  "eventDetail.noDetail": "No additional detail available for this event.",

  // Loading Screen
  "loading.office": "Loading office...",

  // Mobile
  "mobile.menu": "Menu",
  "mobile.agentActivity": "Agent Activity",
  "mobile.boss": "BOSS",
  "mobile.noActiveAgents": "No active agents",
} as const;

export type TranslationKey = keyof typeof en;
export default en;
