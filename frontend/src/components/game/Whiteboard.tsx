"use client";

import { Graphics } from "pixi.js";
import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { TodoItem, WhiteboardData, WhiteboardMode, Agent } from "@/types";
import { useGameStore } from "@/stores/gameStore";

/**
 * Whiteboard - Office whiteboard display with multiple modes
 *
 * Click anywhere on the whiteboard to cycle through 10 display modes:
 * 0: Todo List (default)
 * 1: Tool Pizza (pie chart of tool usage)
 * 2: Org Chart (boss + agents hierarchy)
 * 3: Stonks (fake stock tickers)
 * 4: Weather (success rate indicator)
 * 5: Safety Board (days since incident)
 * 6: Timeline (agent lifespans)
 * 7: News Ticker (scrolling headlines)
 * 8: Coffee (coffee cup tracker)
 * 9: Heat Map (file edit frequency)
 */

// ============================================================================
// MODE NAMES AND ICONS
// ============================================================================

const MODE_INFO: Record<WhiteboardMode, { name: string; icon: string }> = {
  0: { name: "TODO", icon: "📋" },
  1: { name: "TOOL USE", icon: "🍕" },
  2: { name: "ORG", icon: "📊" },
  3: { name: "STONKS", icon: "📈" },
  4: { name: "WEATHER", icon: "🌤️" },
  5: { name: "SAFETY", icon: "⚠️" },
  6: { name: "TIMELINE", icon: "📅" },
  7: { name: "NEWS", icon: "📰" },
  8: { name: "COFFEE", icon: "☕" },
  9: { name: "HEATMAP", icon: "🔥" },
};

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

interface WhiteboardFrameProps {
  children: ReactNode;
  onPointerDown: () => void;
  mode: WhiteboardMode;
}

function WhiteboardFrame({
  children,
  onPointerDown,
  mode,
}: WhiteboardFrameProps): ReactNode {
  const drawWhiteboard = useCallback((g: Graphics) => {
    g.clear();

    // Board shadow
    g.roundRect(4, 4, 330, 205, 8);
    g.fill({ color: 0x000000, alpha: 0.2 });

    // Board background
    g.roundRect(0, 0, 330, 205, 8);
    g.fill(0xffffff);
    g.stroke({ width: 4, color: 0x5d4037 });

    // Inner border (silver frame effect)
    g.roundRect(6, 6, 318, 193, 4);
    g.stroke({ width: 2, color: 0x9e9e9e });

    // Header bar
    g.rect(10, 10, 310, 24);
    g.fill(0x2d3748);
    g.roundRect(10, 10, 310, 24, 3);
    g.fill(0x2d3748);

    // Marker tray
    g.rect(115, 203, 100, 8);
    g.fill(0x9e9e9e);
    g.stroke({ width: 1, color: 0x757575 });

    // Markers
    const markerColors = [0xef4444, 0x22c55e, 0x3b82f6];
    markerColors.forEach((color, i) => {
      g.roundRect(125 + i * 25, 197, 18, 12, 2);
      g.fill(color);
    });
  }, []);

  const modeInfo = MODE_INFO[mode];

  return (
    <pixiContainer eventMode="static" onPointerDown={onPointerDown}>
      <pixiGraphics draw={drawWhiteboard} />

      {/* Header - rendered at 2x for sharpness */}
      <pixiContainer x={165} y={22} scale={0.5}>
        <pixiText
          text={`${modeInfo.icon} ${modeInfo.name}`}
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 24,
            fontWeight: "bold",
            fill: "#ffffff",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Mode indicator dots */}
      <pixiContainer x={165} y={193}>
        {Array.from({ length: 10 }).map((_, i) => (
          <pixiGraphics
            key={i}
            x={(i - 4.5) * 10}
            draw={(g: Graphics) => {
              g.clear();
              g.circle(0, 0, i === mode ? 4 : 2);
              g.fill(i === mode ? 0x3b82f6 : 0x9ca3af);
            }}
          />
        ))}
      </pixiContainer>

      {/* Content area */}
      <pixiContainer y={38}>{children}</pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// MODE 0: TODO LIST
// ============================================================================

interface TodoListModeProps {
  todos: TodoItem[];
}

function TodoListMode({ todos }: TodoListModeProps): ReactNode {
  const MAX_VISIBLE = 5;
  const [autoScrollOffset, setAutoScrollOffset] = useState(0);

  const inProgressIndex = todos.findIndex((t) => t.status === "in_progress");

  const baseOffset = useMemo(() => {
    if (inProgressIndex >= 0 && todos.length > MAX_VISIBLE) {
      return Math.max(
        0,
        Math.min(
          inProgressIndex - Math.floor(MAX_VISIBLE / 2),
          todos.length - MAX_VISIBLE,
        ),
      );
    }
    return 0;
  }, [inProgressIndex, todos.length]);

  const allCompleted =
    todos.length > 0 && todos.every((t) => t.status === "completed");

  useEffect(() => {
    if (todos.length <= MAX_VISIBLE || inProgressIndex >= 0 || allCompleted) {
      return;
    }

    const interval = setInterval(() => {
      setAutoScrollOffset((prev) => {
        const maxOffset = todos.length - MAX_VISIBLE;
        return prev >= maxOffset ? 0 : prev + 1;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [todos.length, inProgressIndex, allCompleted]);

  const scrollOffset = inProgressIndex >= 0 ? baseOffset : autoScrollOffset;
  const visibleTodos = todos.slice(scrollOffset, scrollOffset + MAX_VISIBLE);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✓";
      case "in_progress":
        return "▶";
      default:
        return "○";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#22c55e";
      case "in_progress":
        return "#3b82f6";
      default:
        return "#4b5563";
    }
  };

  if (todos.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No tasks yet"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 24,
            fill: "#9ca3af",
          }}
          resolution={2}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer>
      {visibleTodos.map((todo, index) => (
        <pixiContainer key={`todo-${scrollOffset + index}`} y={2 + index * 24}>
          <pixiText
            text={getStatusIcon(todo.status)}
            x={16}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fill: getStatusColor(todo.status),
            }}
            resolution={2}
          />
          <pixiText
            text={
              todo.status === "in_progress" && todo.activeForm
                ? todo.activeForm.slice(0, 42)
                : todo.content.slice(0, 42)
            }
            x={32}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 11,
              fill: todo.status === "completed" ? "#6b7280" : "#1f2937",
              fontWeight: todo.status === "in_progress" ? "bold" : "normal",
            }}
            resolution={2}
          />
        </pixiContainer>
      ))}

      {todos.length > MAX_VISIBLE && (
        <pixiContainer x={165} y={130} scale={0.5}>
          <pixiText
            text={`${scrollOffset + 1}-${Math.min(scrollOffset + MAX_VISIBLE, todos.length)}/${todos.length}`}
            anchor={0.5}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 18,
              fill: "#9ca3af",
            }}
            resolution={2}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
}

// ============================================================================
// MODE 1: TOOL PIZZA CHART
// ============================================================================

interface PizzaChartModeProps {
  toolUsage: Record<string, number>;
}

const PIZZA_COLORS: Record<string, number> = {
  read: 0x3b82f6, // blue
  write: 0x22c55e, // green
  edit: 0xf59e0b, // amber
  bash: 0x8b5cf6, // purple
  task: 0xec4899, // pink
  todo: 0x06b6d4, // cyan
  web: 0xef4444, // red
  other: 0x6b7280, // gray
};

function PizzaChartMode({ toolUsage }: PizzaChartModeProps): ReactNode {
  const total = Object.values(toolUsage).reduce((a, b) => a + b, 0);

  const drawPizza = useCallback(
    (g: Graphics) => {
      g.clear();
      const cx = 80;
      const cy = 55;
      const radius = 45;

      if (total === 0) {
        // Empty pizza base
        g.circle(cx, cy, radius);
        g.fill(0xfcd34d);
        g.stroke({ width: 3, color: 0xb45309 });
        return;
      }

      // Draw pizza slices
      let startAngle = -Math.PI / 2;
      const entries = Object.entries(toolUsage).filter(
        ([, count]) => count > 0,
      );

      entries.forEach(([category, count]) => {
        const sliceAngle = (count / total) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        // Draw slice
        g.moveTo(cx, cy);
        g.arc(cx, cy, radius, startAngle, endAngle);
        g.lineTo(cx, cy);
        g.fill(PIZZA_COLORS[category] ?? 0x6b7280);

        startAngle = endAngle;
      });

      // Pizza crust edge
      g.circle(cx, cy, radius);
      g.stroke({ width: 3, color: 0xb45309 });
    },
    [toolUsage, total],
  );

  // Build legend entries
  const legendEntries = Object.entries(toolUsage)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawPizza} />

      {/* Legend */}
      <pixiContainer x={170} y={5}>
        {legendEntries.map(([category, count], i) => (
          <pixiContainer key={category} y={i * 16}>
            <pixiGraphics
              draw={(g: Graphics) => {
                g.clear();
                g.rect(0, 0, 10, 10);
                g.fill(PIZZA_COLORS[category] ?? 0x6b7280);
              }}
            />
            <pixiText
              text={`${category}: ${count}`}
              x={14}
              y={-1}
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: 10,
                fill: "#374151",
              }}
              resolution={2}
            />
          </pixiContainer>
        ))}
        {total === 0 && (
          <pixiText
            text="No tools used"
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: "#9ca3af",
            }}
            resolution={2}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// MODE 2: ORG CHART
// ============================================================================

const SILLY_TITLES = [
  "VP of Grepping",
  "Chief Byte Wrangler",
  "Senior Code Whisperer",
  "Director of Semicolons",
  "Head of Tab Spaces",
  "Minister of Merge Conflicts",
  "Baron of Bug Fixes",
  "Duke of Documentation",
];

interface OrgChartModeProps {
  agents: Agent[];
  bossTask: string | null;
}

function OrgChartMode({ agents, bossTask }: OrgChartModeProps): ReactNode {
  const drawOrgChart = useCallback(
    (g: Graphics) => {
      g.clear();

      // Boss box
      g.roundRect(125, 5, 80, 35, 4);
      g.fill(0xfef3c7);
      g.stroke({ width: 2, color: 0xf59e0b });

      // Lines to agents
      if (agents.length > 0) {
        const agentCount = Math.min(agents.length, 4);
        const boxWidth = 75;
        const totalWidth = boxWidth * agentCount;
        const startX = (330 - totalWidth) / 2;

        for (let i = 0; i < agentCount; i++) {
          const x = startX + boxWidth * i + boxWidth / 2;
          // Vertical line from boss
          g.moveTo(165, 40);
          g.lineTo(165, 55);
          // Horizontal line
          g.lineTo(x, 55);
          // Down to agent
          g.lineTo(x, 61);
          g.stroke({ width: 1, color: 0x9ca3af });
        }
      }
    },
    [agents.length],
  );

  const displayAgents = agents.slice(0, 4);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawOrgChart} />

      {/* Boss */}
      <pixiText
        text="👔 BOSS"
        x={165}
        y={15}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fontWeight: "bold",
          fill: "#92400e",
        }}
        resolution={2}
      />
      <pixiText
        text={bossTask ? bossTask.slice(0, 12) : "Supervising"}
        x={165}
        y={28}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 8,
          fill: "#b45309",
        }}
        resolution={2}
      />

      {/* Agents */}
      {displayAgents.length > 0 ? (
        displayAgents.map((agent, i) => {
          // Calculate box width and position to fill available space
          const boxWidth = 75;
          const totalBoxes = displayAgents.length;
          const totalWidth = boxWidth * totalBoxes;
          const startX = (330 - totalWidth) / 2; // Center the group
          const x = startX + boxWidth * i + boxWidth / 2; // Center of each box
          return (
            <pixiContainer key={agent.id} x={x} y={66}>
              <pixiGraphics
                draw={(g: Graphics) => {
                  g.clear();
                  g.roundRect(-boxWidth / 2, 0, boxWidth, 40, 3);
                  g.fill(0xffffff);
                  g.stroke({
                    width: 2,
                    color: parseInt(agent.color.replace("#", "0x")),
                  });
                }}
              />
              <pixiText
                text={agent.name?.slice(0, 8) || `Agent ${agent.number}`}
                y={8}
                anchor={0.5}
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: 9,
                  fontWeight: "bold",
                  fill: agent.color,
                }}
                resolution={2}
              />
              <pixiText
                text={SILLY_TITLES[i % SILLY_TITLES.length].slice(0, 15)}
                y={22}
                anchor={0.5}
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: 7,
                  fill: "#6b7280",
                }}
                resolution={2}
              />
            </pixiContainer>
          );
        })
      ) : (
        <pixiText
          text="No employees yet"
          x={165}
          y={85}
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            fill: "#9ca3af",
          }}
          resolution={2}
        />
      )}
    </pixiContainer>
  );
}

// ============================================================================
// MODE 3: STONKS
// ============================================================================

interface StonksModeProps {
  data: WhiteboardData;
}

function StonksMode({ data }: StonksModeProps): ReactNode {
  const [tick, setTick] = useState(0);

  // Update ticker prices every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Generate pseudo-random price fluctuation
  const fluctuate = (base: number, seed: number) => {
    const noise =
      Math.sin(tick * 0.5 + seed) * 5 + Math.cos(tick * 0.3 + seed * 2) * 3;
    return Math.max(1, base * 10 + noise).toFixed(2);
  };

  const stocks = [
    {
      symbol: "$TASK",
      value: data.taskCompletedCount,
      price: fluctuate(data.taskCompletedCount || 1, 1),
      up: data.taskCompletedCount > 0,
    },
    {
      symbol: "$BUG",
      value: data.bugFixedCount,
      price: fluctuate(data.bugFixedCount || 1, 2),
      up: data.bugFixedCount > 0,
    },
    {
      symbol: "$CAFE",
      value: data.coffeeBreakCount,
      price: fluctuate(data.coffeeBreakCount || 1, 3),
      up: data.coffeeBreakCount > 0,
    },
    {
      symbol: "$CODE",
      value: data.codeWrittenCount,
      price: fluctuate(data.codeWrittenCount || 1, 4),
      up: data.codeWrittenCount > 0,
    },
  ];

  return (
    <pixiContainer>
      {stocks.map((stock, i) => (
        <pixiContainer key={stock.symbol} y={i * 27}>
          <pixiText
            text={stock.symbol}
            x={16}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fontWeight: "bold",
              fill: "#1f2937",
            }}
            resolution={2}
          />
          <pixiText
            text={stock.up ? "▲" : "▼"}
            x={85}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fill: stock.up ? "#22c55e" : "#ef4444",
            }}
            resolution={2}
          />
          <pixiText
            text={stock.price}
            x={100}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              fill: stock.up ? "#22c55e" : "#ef4444",
            }}
            resolution={2}
          />
          {/* Mini sparkline */}
          <pixiGraphics
            x={170}
            y={8}
            draw={(g: Graphics) => {
              g.clear();
              g.moveTo(0, 5);
              for (let j = 0; j < 8; j++) {
                const y =
                  5 +
                  Math.sin((tick + j) * 0.5 + i) * 4 +
                  (stock.up ? -j * 0.3 : j * 0.3);
                g.lineTo(j * 10, y);
              }
              g.stroke({ width: 1, color: stock.up ? 0x22c55e : 0xef4444 });
            }}
          />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
}

// ============================================================================
// MODE 4: WEATHER
// ============================================================================

interface WeatherModeProps {
  data: WhiteboardData;
}

function WeatherMode({ data }: WeatherModeProps): ReactNode {
  const totalOps = data.recentSuccessCount + data.recentErrorCount;
  const successRate = totalOps > 0 ? data.recentSuccessCount / totalOps : 1;

  // Determine weather based on success rate and activity
  let weather: { icon: string; label: string; color: string };
  if (data.recentErrorCount > 5) {
    weather = { icon: "⛈️", label: "STORMY", color: "#7c3aed" };
  } else if (successRate < 0.7) {
    weather = { icon: "🌧️", label: "RAINY", color: "#3b82f6" };
  } else if (data.activityLevel < 0.3) {
    weather = { icon: "⛅", label: "CLOUDY", color: "#6b7280" };
  } else {
    weather = { icon: "☀️", label: "SUNNY", color: "#f59e0b" };
  }

  return (
    <pixiContainer>
      {/* Large weather icon */}
      <pixiText
        text={weather.icon}
        x={80}
        y={50}
        anchor={0.5}
        style={{ fontSize: 50 }}
        resolution={2}
      />

      {/* Weather label */}
      <pixiText
        text={weather.label}
        x={80}
        y={95}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 14,
          fontWeight: "bold",
          fill: weather.color,
        }}
        resolution={2}
      />

      {/* Stats */}
      <pixiContainer x={170} y={10}>
        <pixiText
          text={`Success: ${(successRate * 100).toFixed(0)}%`}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: "#22c55e",
          }}
          resolution={2}
        />
        <pixiText
          text={`Errors: ${data.recentErrorCount}`}
          y={16}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: "#ef4444",
          }}
          resolution={2}
        />
        <pixiText
          text={`Activity: ${(data.activityLevel * 100).toFixed(0)}%`}
          y={32}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: "#3b82f6",
          }}
          resolution={2}
        />
        <pixiText
          text={`Total ops: ${totalOps}`}
          y={48}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: "#6b7280",
          }}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// MODE 5: SAFETY BOARD
// ============================================================================

interface SafetyModeProps {
  data: WhiteboardData;
}

function SafetyMode({ data }: SafetyModeProps): ReactNode {
  // Calculate days since last incident
  let daysSinceIncident = "∞";
  if (data.lastIncidentTime) {
    const incidentDate = new Date(data.lastIncidentTime);
    const now = new Date();
    const diffMs = now.getTime() - incidentDate.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 60) {
      daysSinceIncident = `${diffMins}m`;
    } else if (diffMins < 1440) {
      daysSinceIncident = `${Math.floor(diffMins / 60)}h`;
    } else {
      daysSinceIncident = `${Math.floor(diffMins / 1440)}d`;
    }
  }

  return (
    <pixiContainer>
      {/* Big number */}
      <pixiText
        text={String(data.consecutiveSuccesses)}
        x={165}
        y={40}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 40,
          fontWeight: "bold",
          fill: "#22c55e",
        }}
        resolution={2}
      />

      {/* Label */}
      <pixiText
        text="SUCCESSFUL TOOL USES"
        x={165}
        y={70}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fill: "#374151",
        }}
        resolution={2}
      />

      {/* Time since incident */}
      <pixiText
        text={`${daysSinceIncident} since last incident`}
        x={165}
        y={90}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: "#6b7280",
        }}
        resolution={2}
      />
    </pixiContainer>
  );
}

// ============================================================================
// MODE 6: TIMELINE
// ============================================================================

interface TimelineModeProps {
  data: WhiteboardData;
}

function TimelineMode({ data }: TimelineModeProps): ReactNode {
  const lifespans = data.agentLifespans.slice(-5); // Show last 5

  // Get coffee break timestamps from news items
  const coffeeBreaks = data.newsItems
    .filter((n) => n.category === "coffee")
    .map((n) => new Date(n.timestamp).getTime());

  const drawTimeline = useCallback(
    (g: Graphics) => {
      g.clear();

      if (lifespans.length === 0) return;

      // Find time range
      const now = new Date();
      const times = lifespans.map((l) => new Date(l.startTime).getTime());
      const minTime = Math.min(...times);

      // Use current time only if any agent is still active
      // Otherwise use the latest end time to prevent shrinking after session ends
      const hasActiveAgent = lifespans.some((l) => !l.endTime);
      const endTimes = lifespans
        .filter((l) => l.endTime)
        .map((l) => new Date(l.endTime!).getTime());
      const latestEndTime =
        endTimes.length > 0 ? Math.max(...endTimes) : now.getTime();
      const maxTime = hasActiveAgent ? now.getTime() : latestEndTime;
      const range = maxTime - minTime || 1;

      // Draw bars (leave 70px for labels on left)
      const barLeft = 70;
      const barWidth = 210;
      const barAreaHeight = lifespans.length * 22;

      lifespans.forEach((lifespan, i) => {
        const y = 10 + i * 22;
        const startX =
          barLeft +
          ((new Date(lifespan.startTime).getTime() - minTime) / range) *
            barWidth;
        const endTime = lifespan.endTime
          ? new Date(lifespan.endTime).getTime()
          : now.getTime();
        const endX = barLeft + ((endTime - minTime) / range) * barWidth;
        const width = Math.max(5, endX - startX);

        // Bar
        g.roundRect(startX, y, width, 14, 2);
        g.fill(parseInt(lifespan.color.replace("#", "0x")));

        // Active indicator (no end cap)
        if (!lifespan.endTime) {
          g.circle(endX, y + 7, 3);
          g.fill(0x22c55e);
        }
      });

      // Draw coffee break markers as vertical lines
      coffeeBreaks.forEach((timestamp) => {
        if (timestamp >= minTime && timestamp <= maxTime) {
          const x = barLeft + ((timestamp - minTime) / range) * barWidth;
          // Dashed vertical line
          for (let y = 5; y < barAreaHeight + 10; y += 6) {
            g.moveTo(x, y);
            g.lineTo(x, y + 3);
            g.stroke({ width: 2, color: 0x92400e });
          }
        }
      });
    },
    [lifespans, coffeeBreaks],
  );

  // Compute coffee marker positions for rendering icons
  // Must be before early return to satisfy React hooks rules
  const coffeeMarkerPositions = useMemo(() => {
    if (lifespans.length === 0) return [];

    const now = new Date();
    const times = lifespans.map((l) => new Date(l.startTime).getTime());
    const minTime = Math.min(...times);
    const hasActiveAgent = lifespans.some((l) => !l.endTime);
    const endTimes = lifespans
      .filter((l) => l.endTime)
      .map((l) => new Date(l.endTime!).getTime());
    const latestEndTime =
      endTimes.length > 0 ? Math.max(...endTimes) : now.getTime();
    const maxTime = hasActiveAgent ? now.getTime() : latestEndTime;
    const range = maxTime - minTime || 1;
    const barLeft = 70;
    const barWidth = 210;

    return coffeeBreaks
      .filter((t) => t >= minTime && t <= maxTime)
      .map((t) => barLeft + ((t - minTime) / range) * barWidth);
  }, [lifespans, coffeeBreaks]);

  if (lifespans.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No agent activity yet"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 24,
            fill: "#9ca3af",
          }}
          resolution={2}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer>
      <pixiGraphics draw={drawTimeline} />

      {/* Labels */}
      {lifespans.map((lifespan, i) => (
        <pixiText
          key={lifespan.agentId}
          text={lifespan.agentName.slice(0, 8)}
          x={10}
          y={12 + i * 22}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 8,
            fill: lifespan.color,
          }}
          resolution={2}
        />
      ))}

      {/* Coffee break icons */}
      {coffeeMarkerPositions.map((x, i) => (
        <pixiText
          key={`coffee-${i}`}
          text="☕"
          x={x}
          y={2}
          anchor={0.5}
          style={{ fontSize: 10 }}
          resolution={2}
        />
      ))}
    </pixiContainer>
  );
}

// ============================================================================
// MODE 7: NEWS TICKER
// ============================================================================

interface NewsTickerModeProps {
  data: WhiteboardData;
}

function NewsTickerMode({ data }: NewsTickerModeProps): ReactNode {
  const [currentIndex, setCurrentIndex] = useState(0);

  const newsItems = data.newsItems.slice(0, 10);

  // Cycle through news items
  useEffect(() => {
    if (newsItems.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % newsItems.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [newsItems.length]);

  if (newsItems.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No news yet - stay tuned!"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 24,
            fill: "#9ca3af",
          }}
          resolution={2}
        />
      </pixiContainer>
    );
  }

  const currentNews = newsItems[currentIndex];
  const categoryColors: Record<string, string> = {
    tool: "#3b82f6",
    agent: "#22c55e",
    session: "#8b5cf6",
    error: "#ef4444",
    coffee: "#f59e0b",
  };

  return (
    <pixiContainer>
      {/* Breaking banner */}
      <pixiGraphics
        draw={(g: Graphics) => {
          g.clear();
          g.rect(16, 5, 90, 18);
          g.fill(0xef4444);
        }}
      />
      <pixiText
        text="📰 BREAKING"
        x={61}
        y={14}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fontWeight: "bold",
          fill: "#ffffff",
        }}
        resolution={2}
      />

      {/* Current headline */}
      <pixiText
        text={currentNews.headline.slice(0, 45)}
        x={165}
        y={45}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: categoryColors[currentNews.category] ?? "#374151",
        }}
        resolution={2}
      />

      {/* Timestamp */}
      <pixiText
        text={new Date(currentNews.timestamp).toLocaleTimeString()}
        x={165}
        y={65}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: "#9ca3af",
        }}
        resolution={2}
      />

      {/* News index indicator */}
      <pixiText
        text={`${currentIndex + 1}/${newsItems.length}`}
        x={165}
        y={100}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: "#9ca3af",
        }}
        resolution={2}
      />
    </pixiContainer>
  );
}

// ============================================================================
// MODE 8: COFFEE
// ============================================================================

interface CoffeeModeProps {
  data: WhiteboardData;
}

function CoffeeMode({ data }: CoffeeModeProps): ReactNode {
  const cups = data.coffeeCups;
  const maxDisplay = 15;
  const displayCups = Math.min(cups, maxDisplay);

  return (
    <pixiContainer>
      {/* Title */}
      <pixiText
        text="☕ COFFEE TRACKER"
        x={165}
        y={5}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fontWeight: "bold",
          fill: "#78350f",
        }}
        resolution={2}
      />

      {/* Big number */}
      <pixiText
        text={String(cups)}
        x={165}
        y={40}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 30,
          fontWeight: "bold",
          fill: "#92400e",
        }}
        resolution={2}
      />

      <pixiText
        text="cups consumed"
        x={165}
        y={60}
        anchor={0.5}
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: "#a16207",
        }}
        resolution={2}
      />

      {/* Coffee cup grid */}
      <pixiContainer x={55} y={75}>
        {Array.from({ length: displayCups }).map((_, i) => (
          <pixiText
            key={i}
            text="☕"
            x={(i % 5) * 22}
            y={Math.floor(i / 5) * 18}
            style={{ fontSize: 14 }}
            resolution={2}
          />
        ))}
        {cups > maxDisplay && (
          <pixiText
            text={`+${cups - maxDisplay}`}
            x={110}
            y={Math.floor((displayCups - 1) / 5) * 18}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: "#a16207",
            }}
            resolution={2}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// MODE 9: HEAT MAP
// ============================================================================

interface HeatMapModeProps {
  data: WhiteboardData;
}

function HeatMapMode({ data }: HeatMapModeProps): ReactNode {
  const entries = Object.entries(data.fileEdits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxEdits = entries.length > 0 ? entries[0][1] : 1;

  const getHeatColor = (count: number): number => {
    const ratio = count / maxEdits;
    if (ratio > 0.8) return 0xef4444; // red
    if (ratio > 0.6) return 0xf97316; // orange
    if (ratio > 0.4) return 0xf59e0b; // amber
    if (ratio > 0.2) return 0xfbbf24; // yellow
    return 0x60a5fa; // blue
  };

  if (entries.length === 0) {
    return (
      <pixiContainer x={165} y={50} scale={0.5}>
        <pixiText
          text="No file edits yet"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 24,
            fill: "#9ca3af",
          }}
          resolution={2}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer>
      {entries.map(([fileName, count], i) => (
        <pixiContainer key={fileName} y={i * 22}>
          {/* File name */}
          <pixiText
            text={fileName.slice(0, 18)}
            x={16}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: "#374151",
            }}
            resolution={2}
          />

          {/* Heat bar */}
          <pixiGraphics
            x={140}
            y={2}
            draw={(g: Graphics) => {
              g.clear();
              const width = (count / maxEdits) * 120;
              g.roundRect(0, 0, width, 14, 2);
              g.fill(getHeatColor(count));
            }}
          />

          {/* Count */}
          <pixiText
            text={String(count)}
            x={270}
            y={3}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: "#6b7280",
            }}
            resolution={2}
          />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
}

// ============================================================================
// MAIN WHITEBOARD COMPONENT
// ============================================================================

export interface WhiteboardProps {
  todos: TodoItem[];
}

export function Whiteboard({ todos }: WhiteboardProps): ReactNode {
  const whiteboardData = useGameStore((s) => s.whiteboardData);
  const whiteboardMode = useGameStore((s) => s.whiteboardMode);
  const cycleMode = useGameStore((s) => s.cycleWhiteboardMode);
  const agentsMap = useGameStore((s) => s.agents);
  const bossTask = useGameStore((s) => s.boss.currentTask);

  // Convert agent animation state to basic Agent interface for OrgChart
  // Use useMemo to avoid creating new arrays on every render
  const agentList: Agent[] = useMemo(
    () =>
      Array.from(agentsMap.values()).map((a) => ({
        id: a.id,
        name: a.name ?? undefined,
        color: a.color,
        number: a.number,
        state: a.backendState,
        desk: a.desk ?? undefined,
        currentTask: a.currentTask ?? undefined,
        position: a.currentPosition,
      })),
    [agentsMap],
  );

  const handleClick = useCallback(() => {
    cycleMode();
  }, [cycleMode]);

  // Render the appropriate mode
  const renderMode = (): ReactNode => {
    switch (whiteboardMode) {
      case 0:
        return <TodoListMode todos={todos} />;
      case 1:
        return <PizzaChartMode toolUsage={whiteboardData.toolUsage} />;
      case 2:
        return <OrgChartMode agents={agentList} bossTask={bossTask} />;
      case 3:
        return <StonksMode data={whiteboardData} />;
      case 4:
        return <WeatherMode data={whiteboardData} />;
      case 5:
        return <SafetyMode data={whiteboardData} />;
      case 6:
        return <TimelineMode data={whiteboardData} />;
      case 7:
        return <NewsTickerMode data={whiteboardData} />;
      case 8:
        return <CoffeeMode data={whiteboardData} />;
      case 9:
        return <HeatMapMode data={whiteboardData} />;
      default:
        return <TodoListMode todos={todos} />;
    }
  };

  return (
    <WhiteboardFrame onPointerDown={handleClick} mode={whiteboardMode}>
      {renderMode()}
    </WhiteboardFrame>
  );
}
