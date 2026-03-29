# Claude Office Visualizer - Real-Time Pixel Art Visualization of Claude Code Operations

I'm excited to share **Claude Office Visualizer**, a fun project that transforms Claude Code CLI operations into a real-time pixel art office simulation. Watch as Claude delegates work and manages a team of AI employees!

## Screenshots

![Office View](https://raw.githubusercontent.com/paulrobello/claude-office/main/screenshot.png)

## Demo Video

[![Watch the demo](https://img.shields.io/badge/YouTube-Demo-red?logo=youtube)](https://youtu.be/AM2UjKYB8Ew)

## What Is It?

Claude Office Visualizer hooks into the Claude Code CLI and visualizes everything that happens during a coding session:

- **The Boss**: Main Claude agent appears as a boss character who receives tasks and delegates work
- **Employees**: Subagents spawn as employee characters who walk through the office, sit at desks, and work on their assigned tasks
- **Real-time Activity**: Tool usage, file operations, and agent communications appear as thought/speech bubbles
- **Office Life**: Agents queue at the elevator, have conversations when handing in work, and leave when done

## Key Features

**Visual Elements:**
- Animated pixel art office environment
- Simple cartoon characters with multiple animation states (idle, walking, working, etc.)
- Day/night cycle in the city skyline window based on your local time
- Filling trashcan that shows context window utilization
- Compaction animation where the boss stomps on the trashcan

**Multi-Mode Whiteboard** - Click to cycle through 10 display modes:
- Todo list (synced with Claude's TodoWrite)
- Tool usage pie chart
- Org chart showing agent hierarchy
- Timeline of agent lifespans
- News ticker with session events
- Coffee tracker
- File edit heat map
- Safety board (tool uses since last compaction)
- Weather display
- Stonks chart

**Other Features:**
- Git status panel showing repository state
- Printer that animates when Claude produces reports
- Random quotes when agents receive or turn in work
- WebSocket-based real-time updates

## Technical Stack

- **Frontend**: Next.js, PixiJS, TypeScript, Zustand, XState v5
- **Backend**: FastAPI, WebSocket, SQLite, Python 3.13+
- **Hooks**: Python-based Claude Code hooks that intercept events

## How It Works

1. Claude Code hooks intercept events (tool use, subagent spawn/stop, context compaction, etc.)
2. Events are sent via HTTP to the FastAPI backend
3. Backend maintains session state and broadcasts updates via WebSocket
4. Frontend receives updates and animates the office scene accordingly

## Installation

```bash
# Clone and install
git clone https://github.com/paulrobello/claude-office.git
cd claude-office
make install-all

# Start the servers (recommended: uses tmux)
make dev-tmux

# Open http://localhost:3000 and run any Claude Code command
```

Works on **macOS**, **Linux**, and **Windows**. Docker deployment is also available.


## Why I Built This

I wanted a fun way to visualize what Claude Code is actually doing during long coding sessions. It's satisfying to watch the little pixel characters working away while Claude helps me code!

## Links

- **GitHub**: [github.com/paulrobello/claude-office](https://github.com/paulrobello/claude-office)
- **Demo Video**: [youtu.be/AM2UjKYB8Ew](https://youtu.be/AM2UjKYB8Ew)

## Feedback Welcome!

This is a fun side project, and I'd love to hear your thoughts! Feel free to:
- Try it out and share your experience
- Report bugs or request features on GitHub
- Contribute to the project (it's MIT licensed!)

---

*Built with: Next.js, PixiJS, FastAPI, XState, Zustand*
