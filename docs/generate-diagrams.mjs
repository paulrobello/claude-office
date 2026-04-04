#!/usr/bin/env node
/**
 * Renders Mermaid diagrams to SVG using beautiful-mermaid.
 * Run: node docs/generate-diagrams.mjs
 * Output: docs/diagrams/*.svg
 */
import { writeFileSync } from "fs";
import { renderMermaidSVG } from "beautiful-mermaid";

const THEME = { bg: "#0a0a0a", fg: "#e0e0e0", accent: "#7aa2f7", muted: "#565f89" };
const OUT = "docs/diagrams";

const diagrams = {
  "system-architecture": `graph TD
    subgraph CC["Claude Code Session"]
      CLI["Claude CLI"]
      Hooks["Lifecycle Hooks"]
    end

    subgraph Plugin["tesseron-tools Plugin"]
      HookSh["panoptica-hook.sh"]
      Skill["/panoptica skill"]
    end

    subgraph Backend["FastAPI Backend :3400"]
      API["REST API"]
      SM["State Machine"]
      WS["WebSocket Hub"]
      DB[("SQLite")]
    end

    subgraph Clients["Visualization Clients"]
      Browser["Browser :3401"]
      Electron["Electron Desktop"]
      TUI["Terminal TUI"]
      Notify["OS Notifications"]
    end

    CLI --> Hooks
    Hooks --> HookSh
    HookSh -->|"HTTP POST"| API
    Skill -->|"curl"| API
    API --> SM
    SM --> DB
    SM --> WS
    WS -->|"WebSocket"| Browser
    WS -->|"WebSocket"| Electron
    WS -->|"WebSocket"| TUI
    WS -->|"WebSocket"| Notify`,

  "event-flow": `sequenceDiagram
    participant CC as Claude Code
    participant Hook as Plugin Hook
    participant API as Backend API
    participant SM as State Machine
    participant DB as SQLite
    participant WS as WebSocket
    participant UI as Client (Browser/TUI/Electron)

    CC->>Hook: SessionStart (stdin JSON)
    Hook->>API: POST /api/v1/events
    API->>SM: process_event()
    SM->>DB: persist session + event
    SM->>WS: broadcast state
    WS->>UI: real-time update

    CC->>Hook: PreToolUse
    Hook->>API: POST /api/v1/events
    API->>SM: update agent status
    SM->>WS: broadcast
    WS->>UI: agent now "active"

    CC->>Hook: SubagentStart
    Hook->>API: POST /api/v1/events
    API->>SM: spawn agent
    SM->>WS: broadcast
    WS->>UI: new agent appears

    CC->>Hook: Stop
    Hook->>API: POST /api/v1/events
    API->>SM: mark completed
    SM->>WS: broadcast
    WS->>UI: session ends`,

  "hook-pipeline": `graph LR
    subgraph Input
      Stdin["stdin JSON"]
      Env["Env Vars"]
      Config["~/.claude/config"]
    end

    subgraph Detection
      Git["Git Branch"]
      Tux["Tux Workdoc?"]
    end

    subgraph Strategy
      S1["CLI Available?"]
      S2["claude-office-hook"]
      S3["curl fallback"]
    end

    subgraph Output
      POST["HTTP POST"]
      Backend["Backend :3400"]
    end

    Stdin --> S1
    Env --> S1
    Config --> S1
    Git --> Tux
    Tux --> S3
    S1 -->|"yes"| S2
    S1 -->|"no"| S3
    S2 --> POST
    S3 --> POST
    POST --> Backend`,

  "client-modes": `graph TD
    subgraph Backend["Panoptica Backend :3400"]
      API["REST API"]
      WS["WebSocket"]
    end

    subgraph Mode1["Mode 1: Browser Window"]
      Next["Next.js :3401"]
      Pixi["PixiJS Canvas"]
      Zustand["Zustand Store"]
    end

    subgraph Mode2["Mode 2: Electron Desktop"]
      Main["Main Process"]
      Tray["System Tray"]
      BW["BrowserWindow"]
      NM["NotificationManager"]
    end

    subgraph Mode3["Mode 3: Terminal TUI"]
      Ratatui["Ratatui"]
      Crossterm["Crossterm"]
      Tokio["Tokio Runtime"]
    end

    subgraph Mode4["Mode 4: Notifications Only"]
      Headless["--headless mode"]
      OSNotify["Native OS Alerts"]
    end

    WS --> Zustand
    WS --> NM
    WS --> Tokio
    WS --> Headless
    Zustand --> Next --> Pixi
    NM --> OSNotify
    NM --> BW
    Main --> Tray
    Main --> BW
    Tokio --> Ratatui
    Ratatui --> Crossterm
    Headless --> OSNotify`,

  "plugin-structure": `graph TD
    subgraph Marketplace["tesseron-tools Marketplace"]
      MJ[".claude-plugin/marketplace.json"]
    end

    subgraph Panoptica["plugins/panoptica/"]
      PJ[".claude-plugin/plugin.json"]
      HJ["hooks/hooks.json"]
      HS["hooks/panoptica-hook.sh"]
      SK["skills/panoptica/SKILL.md"]
    end

    subgraph Events["Hook Events"]
      E1["SessionStart"]
      E2["PreToolUse"]
      E3["PostToolUse"]
      E4["UserPromptSubmit"]
      E5["Stop"]
      E6["SubagentStart"]
      E7["SubagentStop"]
      E8["Notification"]
    end

    MJ --> PJ
    PJ --> HJ
    HJ --> HS
    PJ --> SK
    E1 --> HS
    E2 --> HS
    E3 --> HS
    E4 --> HS
    E5 --> HS
    E6 --> HS
    E7 --> HS
    E8 --> HS`,
};

for (const [name, definition] of Object.entries(diagrams)) {
  const svg = renderMermaidSVG(definition, THEME);
  writeFileSync(`${OUT}/${name}.svg`, svg);
  console.log(`  ${name}.svg`);
}

console.log(`\nGenerated ${Object.keys(diagrams).length} diagrams in ${OUT}/`);
