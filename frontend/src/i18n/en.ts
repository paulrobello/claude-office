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
  "header.tour": "TOUR",

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
  "settings.tabs.general": "General",
  "settings.tabs.building": "Building",
  "settings.building.name": "Building Name",
  "settings.building.namePlaceholder": "My Company",
  "settings.building.floors": "Floors",
  "settings.building.addFloor": "Add Floor",
  "settings.building.floorName": "Floor Name",
  "settings.building.floorNumber": "Floor",
  "settings.building.accentColor": "Accent",
  "settings.building.icon": "Icon",
  "settings.building.repos": "Project folders",
  "settings.building.reposPlaceholder": "claude-office, my-api, web-ui",
  "settings.building.save": "Save",
  "settings.building.saving": "Saving...",
  "settings.building.saved": "Saved!",
  "settings.building.deleteFloor": "Remove",
  "settings.building.noFloors": "No floors configured",
  "settings.building.enableHint":
    "Add floors and map project folder names to enable building navigation view",

  // Sessions
  "sessions.title": "Sessions",
  "sessions.loading": "Loading sessions...",
  "sessions.noSessions": "No sessions found",
  "sessions.unknownProject": "Unknown Project",
  "sessions.deleteSession": "Delete session",
  "sessions.events": "events",
  "sessions.events_one": "{count} event",
  "sessions.events_other": "{count} events",
  "sessions.expandSidebar": "Expand sidebar",
  "sessions.collapseSidebar": "Collapse sidebar",
  "sessions.dragToResize": "Drag to resize",

  // Right Sidebar
  "sidebar.events": "Events",
  "sidebar.conversation": "Conversation",

  // Event Log
  "eventLog.title": "Event Log",
  "eventLog.events": "events",
  "eventLog.events_one": "{count} event",
  "eventLog.events_other": "{count} events",
  "eventLog.waiting": "Waiting for events...",

  // Agent Status
  "agentStatus.title": "Agent State",
  "agentStatus.agents": "agents",
  "agentStatus.agents_one": "{count} agent",
  "agentStatus.agents_other": "{count} agents",
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
  "conversation.msgs_one": "{count} msg",
  "conversation.msgs_other": "{count} msgs",
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

  // Zoom Controls
  "zoom.in": "Zoom in",
  "zoom.out": "Zoom out",
  "zoom.reset": "Reset zoom",

  // Mobile
  "mobile.menu": "Menu",
  "mobile.agentActivity": "Agent Activity",
  "mobile.boss": "BOSS",
  "mobile.noActiveAgents": "No active agents",

  // Status Messages
  "status.switchedToSession": "Switched to session {sessionId}...",
  "status.deletingSession": "Deleting session {sessionId}...",
  "status.sessionDeleted": "Session deleted.",
  "status.failedDeleteSession": "Failed to delete session.",
  "status.errorConnecting": "Error connecting to backend.",
  "status.clearingDatabase": "Clearing database...",
  "status.databaseCleared": "Database cleared.",
  "status.failedClearDatabase": "Failed to clear database.",
  "status.triggeringSimulation": "Triggering simulation...",
  "status.simulationStarted": "Simulation started!",
  "status.failedSimulation": "Failed to trigger simulation.",
  "status.storeReset": "Store reset.",
  "status.sessionDeletedSwitched": "Session deleted. Switched to {sessionName}",
  "status.sessionDeletedNoOthers":
    "Session deleted. No other sessions available.",
  "status.connectedTo": "Connected to {sessionName}",
  "status.autoFollowed": "Auto-followed new session: {sessionName}",

  // Navigation
  "navigation.building": "Building",

  // Tour
  "tour.steps.welcome.title": "Welcome",
  "tour.steps.welcome.description":
    "This is your command center. Click a floor to explore.",
  "tour.steps.singleWelcome.title": "Welcome to Claude Office",
  "tour.steps.singleWelcome.description":
    "This pixel art office shows your Claude Code sessions in real time. Let's take a quick look around.",
  "tour.steps.simulate.title": "Start Simulation",
  "tour.steps.simulate.description":
    "Click Simulate to bring the office to life.",
  "tour.steps.agentsArrive.title": "Agents Arrive",
  "tour.steps.agentsArrive.description":
    "Agents arrive through the elevator, walk to their desks, and start working.",
  "tour.steps.inspectAgent.title": "Inspect an Agent",
  "tour.steps.inspectAgent.description":
    "Click on any character to inspect them.",
  "tour.steps.focusPopup.title": "Focus Popup",
  "tour.steps.focusPopup.description":
    "From here you can copy a message to clipboard and jump to your terminal. The office updates in real time as Claude works.",
  "tour.steps.zoomOut.title": "Zoom Out",
  "tour.steps.zoomOut.description":
    "Try zooming back out to see the big picture.",
  "tour.steps.settings.title": "Configure Floors",
  "tour.steps.settings.description":
    "Open Settings to add floors and map project folders for a multi-floor building view.",
  "tour.skip": "Skip tour",
  "tour.next": "Next",
} as const;

export type TranslationKey = keyof typeof en;
export default en;
