# Claude Office 架构分析

> 调研时间：2026-04-08

## 项目概览

- **仓库**：paulrobello/claude-office
- **技术栈**：FastAPI (Python), Next.js/React, PixiJS, Zustand, XState, SQLite
- **端口**：backend :8000, frontend :3000
- **本地路径**：/Users/apple/Projects/others/random/claude-office

## 1. 后端架构

### 1.1 事件处理管线

**文件**：`backend/app/core/event_processor.py`

```
Claude Code Hook → HTTP POST /api/v1/events → EventProcessor.process_event()
  → persist to SQLite → create/restore StateMachine → sm.transition()
  → delegate to handlers → broadcast_state (WebSocket) → broadcast_event
```

- 内存中维护 `sessions: dict[str, StateMachine]`
- 每个 session 一个 StateMachine 实例
- 支持从 DB 事件重放恢复（`_restore_session()`）

### 1.2 StateMachine（每 session 一个）

**文件**：`backend/app/core/state_machine.py`

核心状态：
- `phase`: EMPTY → STARTING → IDLE → WORKING → DELEGATING → BUSY → COMPLETING → ENDED
- `boss_state`: IDLE, PHONE_RINGING, ON_PHONE, RECEIVING, WORKING, DELEGATING, WAITING_PERMISSION, REVIEWING
- `agents: dict[str, Agent]` — 所有活跃子 agent
- `arrival_queue / handin_queue` — 到达/离开队列
- `todos: list[TodoItem]` — 任务列表
- `conversation: list[ConversationEntry]` — 对话历史
- `whiteboard: WhiteboardTracker` — 工具使用、agent 生命周期等跟踪

Agent 创建：
- 从 8 色调色板分配颜色
- AI 生成短名称（SummaryService）
- 分配桌号（当前 agent 数 + 1）
- 初始状态 ARRIVING

### 1.3 WebSocket 协议

**文件**：`backend/app/api/websocket.py`

- `ConnectionManager` 按 session_id 分组管理连接
- `/ws/{session_id}` — 单 session 视图
- `/ws/all` — 合并多 session 视图（我们新加的）
- 消息格式：`{ type: "state_update" | "event" | "git_status", state: GameState }`

### 1.4 Session 发现

- **Hooks 层**：Claude Code hook 触发时 POST 事件到后端
- **Transcript Poller**：轮询 `~/.claude/projects/{PROJECT}/{SESSION}/subagents/agent-*.jsonl`
- **Task File Poller**：轮询任务文件
- **Beads Poller**：`.beads/` 目录集成

### 1.5 数据库模型

**文件**：`backend/app/db/models.py`

| 表 | 字段 |
|---|------|
| SessionRecord | id, project_name, project_root, created_at, updated_at, status, label |
| EventRecord | id, session_id, timestamp, event_type, data (JSON) |
| TaskRecord | session_id, task_id, content, status, blocks, blocked_by, owner |
| UserPreference | key, value |

### 1.6 AI 摘要服务

**文件**：`backend/app/core/summary_service.py`

- 用 Claude Haiku 生成简短摘要
- `summarize_tool_call()` — 10 字以内工具描述
- `generate_agent_name()` — 1-3 词创意昵称
- 无 API key 时退化为正则提取

### 1.7 Git 服务

**文件**：`backend/app/services/git_service.py`

- 异步轮询 git status
- 解析 `git status --porcelain`、`git log`
- 广播分支、dirty files、commits 到前端

## 2. 前端架构

### 2.1 Zustand Store

**文件**：`frontend/src/stores/gameStore.ts`

AgentAnimationState 字段：
- 身份：id, name, color, number, desk, backendState, currentTask
- 阶段：phase (arrival/departure 编排)
- 位置：currentPosition, targetPosition, path
- 气泡：content + displayStartTime + queue
- 动画：isTyping

AgentPhase 枚举：
```
idle → arriving → in_arrival_queue → walking_to_ready → conversing
→ walking_to_boss → at_boss → walking_to_desk → idle
```

### 2.2 XState 状态机

**文件**：`frontend/src/machines/`

- `agentMachine.ts` — agent 生命周期：waiting → arrival flow → idle → departure flow
- `agentMachineService.ts` — 管理所有 actor 实例
- Arrival 子流程：arriving → in_queue → walking_to_ready → conversing → walking_to_boss → at_boss → walking_to_desk
- Departure 子流程：reverse

### 2.3 渲染层级（Z-order）

**文件**：`frontend/src/components/game/OfficeGame.tsx`

1. OfficeBackground（地板、墙壁）
2. DeskSurfacesBase（桌面 + 键盘）
3. BossSprite + AgentSprite（角色）
4. DeskSurfacesTop（显示器、配件）
5. 家具层（电梯、打印机、时钟、白板、垃圾桶、城市窗户）
6. Debug/UI 叠加层

### 2.4 工位布局

**文件**：`frontend/src/components/game/DeskGrid.tsx`

- 4 列布局
- 起始 X=256, Y=408
- 间距 X=256, Y=192
- desk_count = min(MAX, max(8, ceil(agents/4)*4))

### 2.5 动画系统

**文件**：`frontend/src/systems/animationSystem.ts`

- 单 RAF 循环驱动所有动画
- A* 寻路
- 移动速度 200px/秒
- 气泡队列：每个显示最少 3 秒

### 2.6 白板模式（11 种）

TODO, REMOTE, TOOL USE, ORG, STONKS, WEATHER, SAFETY, TIMELINE, NEWS, COFFEE, HEATMAP

### 2.7 侧边栏

- **左侧**：Session 列表 + Git 状态
- **右侧**：Agent 详情 + Events/Conversation 标签页

## 3. Hooks 层

**文件**：`hooks/src/claude_office_hooks/`

### 捕获的事件类型

| 事件 | 说明 |
|------|------|
| session_start | 会话开始 |
| pre_tool_use | 工具调用前（Task/Agent 重映射为 subagent_start） |
| post_tool_use | 工具调用后 |
| user_prompt_submit | 用户输入 |
| subagent_info | 子 agent 信息（native_id 映射） |
| subagent_stop | 子 agent 停止 |
| context_compaction | 上下文压缩 |
| error | 错误 |

### 安全保证

- stdout/stderr 被抑制，不干扰 Claude 对话
- 始终 exit 0，不阻塞 Claude 执行
- HTTP 超时后静默忽略

## 4. 项目感知能力（与 Pixel Agents 对比）

### 已有的

- ✅ `project_name`：从 transcript 路径提取
- ✅ `project_root`：git 树向上查找
- ✅ Session 列表显示项目名
- ✅ Git 状态面板

### 缺失的

- ❌ **没有项目分组**：session 列表是扁平的，无按项目折叠
- ❌ **Agent 不知道自己属于哪个项目**：Agent model 没有 project 字段
- ❌ **合并视图无项目区分**：__all__ 模式下所有 agent 混在一起
- ❌ **无项目级统计**：没有跨 session 的项目汇总
- ❌ **无工作空间上下文**：不支持 monorepo 多项目场景
- ❌ **无文件夹级跟踪**：文件编辑有路径但无层级分组

### 需要增加的

1. Agent model 加 `session_id` 和 `project_name` 字段
2. 合并视图按项目分组（不同房间或颜色区分）
3. Session 列表按项目折叠
4. 项目级聚合 API（`/api/projects/{name}/stats`）
5. 扫描 `~/.claude/projects/` 预填充项目列表
