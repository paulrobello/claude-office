# Pixel Agents Standalone 架构分析

> 调研时间：2026-04-08

## 项目概览

- **仓库**：rolandal/pixel-agents-standalone（从 VS Code 扩展 fork 出的独立 Web 版）
- **技术栈**：TypeScript, Express, WebSocket, Canvas 2D
- **端口**：localhost:3456
- **本地路径**：/Users/apple/Projects/others/random/pixel-agents-standalone

## 1. Session 发现机制

**文件：`server/watcher.ts`**

- 监听 `~/.claude/projects/` 目录下的 `.jsonl` 文件
- 活跃阈值：10 分钟内有修改
- 启动时扫描 + 每秒轮询文件大小变化
- 项目名提取：从路径 `-Users-alice-Documents-myproject-657` 取最后一段 `657`

```typescript
// watcher.ts:74-78
const sessionId = basename(filePath, ".jsonl");
const projectDirName = basename(dirname(filePath));
const parts = projectDirName.split("-").filter(Boolean);
const projectName = parts[parts.length - 1] || sessionId.slice(0, 8);
```

## 2. Agent 跟踪

**文件：`server/index.ts`, `server/types.ts`**

```typescript
const agents = new Map<string, TrackedAgent>();  // sessionId → agent
let nextAgentId = 1;  // 全局递增 ID
```

TrackedAgent 字段：
- `id: number` — 全局递增数字 ID
- `sessionId: string` — JSONL 文件名
- `projectDir: string`, `projectName: string` — 项目文件夹信息
- `activity: "idle" | "typing" | "reading" | "waiting" | "permission"`
- `activeTools: Map<string, ActiveTool>` — 当前工具调用
- `activeSubagentToolIds/Names` — 子 agent 工具跟踪

## 3. 活动检测

**文件：`server/parser.ts`**

- **工具检测**：解析 JSONL 中 `type: "assistant"` 的 `tool_use` 内容
- **读/写区分**：Read/Grep/Glob = "reading"，其他 = "typing"
- **权限检测**：工具启动 7 秒后仍在运行 → 显示权限气泡
- **空闲检测**：5 秒无工具 → "waiting"；2 分钟无活动 → 清空
- **子 agent**：通过 `progress` 消息的 `parentToolUseID` 跟踪

## 4. WebSocket 协议

| 消息类型 | 载荷 | 用途 |
|---------|------|------|
| `agentCreated` | `id, folderName` | 新 agent 加入 |
| `agentClosed` | `id` | agent 离开 |
| `existingAgents` | `agents[], folderNames, agentMeta` | 初始状态同步 |
| `agentToolStart` | `id, toolId, status` | 工具执行中 |
| `agentToolDone` | `id, toolId` | 工具完成 |
| `agentToolsClear` | `id` | 清空所有工具 |
| `agentStatus` | `id, status` | 活动状态变更 |
| `agentToolPermission` | `id` | 权限请求气泡 |
| `subagentToolStart` | `id, parentToolId, toolId, status` | 子 agent 工具 |
| `subagentClear` | `id, parentToolId` | 子 agent 清理 |
| `layoutLoaded` | `layout` | 办公室布局 |

## 5. 前端渲染

### 5.1 精灵系统
- 6 个基础调色板（`char_0.png` ~ `char_5.png`）
- 每个：3 方向 × 7 帧 × 2 动画（打字/阅读）
- 超过 6 个 agent 后通过色相偏移（≥45°）区分

### 5.2 座位分配
- **文件**：`webview-ui/src/office/engine/officeState.ts`
- 从家具中扫描椅子，匹配相邻桌子
- 首 6 个 agent 各获唯一调色板，之后轮流分配+色相偏移
- 子 agent 用**负数 ID**，座位选最近空位

### 5.3 项目归属显示
- `Character.folderName` 字段存储项目名
- 标签显示在 agent 头顶
- Server 提取：`basename(dirname(file.path))` → 文件夹名

### 5.4 布局系统
- 网格：默认 30×20 tiles
- 瓷砖类型：WALL(0), FLOOR_1-7(1-7), VOID(8)
- 家具放置：`PlacedFurniture { uid, type, col, row, color }`
- A* 寻路
- 持久化：`~/.pixel-agents/layout.json` + `agent-seats.json`

## 6. 与 Claude Office 的关键差异

| 特性 | Pixel Agents | Claude Office |
|------|-------------|---------------|
| 项目感知 | ✅ 每个 agent 带 folderName | ❌ 不知道项目归属 |
| 多 session | ✅ 同时显示所有活跃 session | ⚠️ 默认单 session（我们加了 __all__） |
| 子 agent 跟踪 | ✅ 负数 ID + 双向 Map | ✅ 有，但机制不同 |
| Session 发现 | 文件监听 JSONL | Hooks + transcript polling |
| 布局编辑器 | ✅ 可交互编辑家具 | ❌ 固定布局 |
| 持久化 | 文件系统 | SQLite 数据库 |
| Boss 角色 | ❌ 没有 boss 概念 | ✅ 主 agent 是 boss |
| 白板/TODO | ❌ | ✅ 多模式白板 |
| AI 摘要 | ❌ | ✅ agent 名称 AI 生成 |
