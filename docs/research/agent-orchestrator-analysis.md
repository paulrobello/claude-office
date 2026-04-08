# Agent Orchestrator (ComposioHQ) 调研报告

> 调研时间：2026-04-08

## 项目概览

- **仓库**：https://github.com/ComposioHQ/agent-orchestrator
- **技术栈**：TypeScript, Node.js 20+, pnpm, Next.js 15, React 19, Tailwind CSS v4
- **许可**：MIT
- **NPM**：@composio/ao

## 1. 核心功能

管理并行 AI 编码 agent 的编排平台。支持 Claude Code、Codex、Aider、OpenCode。每个任务在独立 git worktree 中运行，自动创建 PR。

## 2. 任务模型

- **不是层级拆分**：一个 issue → 一个 session → 一个 agent → 一个分支 → 一个 PR
- **批量派发**：`ao batch-spawn 101 102 103`
- **编排 agent**：可以运行一个专门的 orchestrator agent 来决定派发哪些 issue

### Session 状态机

```
spawning → working → pr_open → ci_failed / review_pending → changes_requested / approved → mergeable → merged → cleanup → done
```

### 活动检测（6 种）

- `active` — 30 秒内有活动
- `ready` — 完成，等待输入（30s-5min）
- `idle` — 安静 >5min
- `waiting_input` — 权限提示
- `blocked` — 错误状态
- `exited` — 进程终止

## 3. 多 Repo 支持 ✅

**完全支持多仓库！** 在 `agent-orchestrator.yaml` 中定义：

```yaml
projects:
  integrator:
    repo: ComposioHQ/integrator
    path: ~/repos/integrator
    defaultBranch: main
    tracker:
      plugin: github

  backend:
    repo: ComposioHQ/backend
    path: ~/repos/backend
    defaultBranch: main
    tracker:
      plugin: linear
      teamId: "team-abc123"
```

- 同一个 orchestrator 实例管理所有项目
- 每个项目可独立配置 tracker、agent rules、reaction
- Hash 命名空间防冲突：`~/.agent-orchestrator/{hash}-{projectId}/`

## 4. Git Worktree 管理

- 默认使用 git worktree（也支持 clone）
- 每个 session 独立目录：`~/.agent-orchestrator/{hash}-{projectId}/worktrees/{sessionId}/`
- 自动创建分支（如 `feat/ISSUE-123`）

## 5. PR 自动化

- Agent 写代码 → 提交 → 创建 PR
- Lifecycle manager 轮询 PR 状态和 CI
- 自动响应配置：

```yaml
reactions:
  ci-failed:
    auto: true
    action: send-to-agent    # CI 失败自动发给 agent 修复
    retries: 2
  changes-requested:
    auto: true
    action: send-to-agent    # Review 意见自动发给 agent
  approved-and-green:
    auto: false               # 需要人工确认才合并
    action: notify
```

## 6. CLI 接口

```bash
ao start [repo-url]           # 初始化并启动
ao stop                       # 停止所有
ao status                     # 所有 session 概览
ao dashboard                  # 打开 Web UI (localhost:3000)
ao spawn [issue]              # 派发单个任务
ao batch-spawn 101 102 103    # 批量派发
ao send <session> "message"   # 给运行中的 agent 发消息
ao session ls / kill / restore
ao doctor                     # 健康检查
```

## 7. Web Dashboard

- Next.js 15 App Router
- 实时更新：SSE（5 秒间隔）
- 终端显示：WebSocket + xterm.js
- 无状态：所有状态在文件和配置中

### API 路由

| 路由 | 用途 |
|------|------|
| `GET /api/sessions` | 列出所有 session |
| `GET /api/sessions/[id]` | session 详情 |
| `GET /api/events` (SSE) | 实时事件流 |
| `GET /api/projects` | 项目列表 |
| `GET /api/prs` | 跨项目 PR 状态 |
| `POST /api/spawn` | 派发新 session |
| `POST /api/sessions/[id]/message` | 发送指令 |
| `POST /api/webhooks/[...slug]` | GitHub webhook |

## 8. 插件架构

8 个可插拔槽位：

| 槽位 | 默认 | 可选 |
|------|------|------|
| Runtime | tmux | process, docker, k8s, ssh, e2b |
| Agent | claude-code | codex, aider, opencode |
| Workspace | worktree | clone |
| Tracker | github | linear, gitlab |
| SCM | github | gitlab |
| Notifier | desktop | slack, discord, webhook |
| Terminal | iterm2 | web, none |

## 9. 与可视化工具的集成点

1. **HTTP API**：`/api/sessions`、`/api/events`（SSE）、`/api/prs`
2. **事件系统**：`session.working`、`pr.created`、`ci.failing`、`merge.ready` 等
3. **元数据文件**：`~/.agent-orchestrator/{hash}-{projectId}/sessions/{sessionId}`（key-value 格式）
4. **Webhook**：GitHub/GitLab 事件自动传播
5. **自定义 Notifier 插件**：可写插件向外部工具推送事件

## 10. 对我们项目的价值

- ✅ 多 repo 支持 — 每个项目独立配置
- ✅ 完整 API — 可以从可视化工具调用 spawn/send/kill
- ✅ 事件流 — SSE 实时推送状态变化
- ✅ 插件架构 — 可写 Notifier 对接 Claude Office
- ⚠️ SSE 5 秒间隔 — 不可配置，但够用
- ⚠️ 需要 tmux — 运行时依赖
