# Panoptica V2 — Product Operating System

> Vision document synthesized from brainstorming session 2026-03-29 to 2026-04-01.
> This is the north star, not an implementation plan.

## One-Liner

Panoptica is the operations hub where Tesseron's AI workforce is planned, orchestrated, monitored, and evolved — and where the company's way of working is taught to every new team member.

## The Problem

You build so fast you lose the map. Three orchestrators (Matías, Seba, Aldo) run 10+ AI agents across 4 products. Each person sees only their own Claude sessions. Nobody knows:
- Which Linear issue is each agent actually working on?
- Is another orchestrator blocked because my agent is late?
- Which of the 12 pending PRs should I review first?
- Did the code my agents produced drift from the product journey?
- What should I work on next?

Weekly planning is too slow. Daily standups are too late. You need continuous micro-coordination.

## The Solution: Three Layers

### Layer 1: The Building (Visualization)

A cross-section view of the entire company. Each floor = a product (Herramientas, Recepthor, Lexio, entreperros). All floors visible simultaneously in one zoomable canvas. Agents sit at desks, color-coded by which orchestrator owns them. Each agent shows its Linear issue ID.

- **Zoomed out**: See all floors, agent counts, health indicators per product
- **Zoomed in**: See individual agents typing, their bubbles, tool usage
- **Click any agent**: Focus popup with context resumption + terminal jump

This layer is the "ambient display" — the building on a wall monitor, the standup screen, the investor demo.

### Layer 2: The Daily Ops Board (Coordination)

Three columns representing the lifecycle of daily work:

**PLAN** — Today's agenda from Linear, per orchestrator, with dependency chains. Auto-populated from sprint + yesterday's carryover. Spike alerts when the plan breaks.

**EXECUTE** — Live agent status with Linear issue labels, context utilization, capacity per orchestrator. "Aldo has bandwidth, suggest pulling LEX-42 forward."

**DELIVER** — PR triage ranked by dependency impact. Auto-assigned by cluster ownership. Pre-reviewed by GitNexus agents. Daily scorecard: delivered vs planned.

The day flows without meetings:
- Morning: Open board (2 min async scan)
- During day: Agents run, PRs auto-assigned, spikes flagged in real-time
- End of day: Auto-digest to Telegram via Mush

**Spike detection** — the key intelligence:
- Agent blocked > 15 min → notify + suggest alternatives
- Task taking 2x estimated → show cascading delays, suggest reorder
- PR pending review > 1 hour → escalate, show what's waiting
- Cross-product dependency unresolved → page both orchestrators + PM
- Journey drift post-merge → auto-create Linear issue

### Layer 3: The Command Center (⌘K)

Keyboard-driven access to everything:
- Search across all agents, Linear issues, journey steps
- Jump to any agent in one keystroke
- Urgency-ranked agent list (blocked → waiting → completed → idle)
- Attention toast notifications for critical events
- Works across all team members' agents (on Nemoclaw)

### Layer 4: The Playbook (Onboarding & Culture)

**The Tesseron Manifest** — a living, interactive guide to how Tesseron works. Not a static wiki. A gamified, simulation-based onboarding experience built into Panoptica itself.

**How it works:**
- The demo tour (already built!) is the foundation — extended to teach not just the UI but the entire methodology
- Interactive scenarios using the simulation engine: "Here's a spike. What do you do?" → teaches orchestration thinking
- The "Tesseron Way" manifest: how we use Linear, how we structure initiatives (thematic, not temporal), how we dispatch agents, how we review PRs, how we coordinate across products
- Progression system: new team member starts as "observer" (read-only building), graduates to "orchestrator" (can dispatch agents), eventually "architect" (can modify journeys)
- Tips and nudges: "You have 3 PRs pending > 1 hour. Reviewing PR #138 first would unblock 2 agents."

**Why gamified:**
- The simulation already exists — agents walking, desks, elevator, office metaphor
- New hires learn by watching, then by doing in a sandbox
- The manifest isn't a document to read — it's a world to explore
- Achievements: "First PR reviewed in < 15 min", "Zero spikes today", "All journey steps green"

## The Full Circle

```
📋 Plan (Linear) → 🤖 Execute (Agents) → 👀 Review (PRs) → 🗺️ Validate (Journey) → 📊 Monitor (Apps) → 📋 Plan ...
```

Panoptica shows every stage of this loop, for every product, for every team member, in one screen.

## Integration Points

| Tool | Integration | Data Flow |
|------|------------|-----------|
| **Linear** | API polling | Issues, sprints, dependencies, initiative structure |
| **Journey** | Plugin scan results | Journey health, drift status, step alignment |
| **GitNexus** | Knowledge graph queries | PR blast radius, impact analysis, code intelligence |
| **Claude Code** | Hooks → WebSocket | Agent activity, tool use, context, bubbles |
| **Tux** | Repo health checks | Protocol compliance, workdoc status |
| **Mush** | Telegram/Slack notifications | Spike alerts, daily digests, exception pages |
| **GitHub** | PR API | Review queue, merge status, CI results |

## Multi-User (Nemoclaw Deployment)

- Each orchestrator's Claude hooks point to `nemoclaw.tesseron.cloud:8000`
- Sessions tagged with `user_id` (from API key or auth)
- Building shows all users' agents, color-coded by owner
- ⌘K searches across everyone's agents
- Spike notifications go to relevant orchestrators + PM
- Cluster ownership (A = Seba, B = Aldo) auto-routes PR reviews

## The Business Model

1. **Internal proof**: Tesseron runs as E2E AI company using the full stack
2. **Platform**: Package (Tux + Journey + Panoptica + agent orchestration) as SaaS
3. **Consulting**: "Here's how we run 4 products with 3 people" → teach the methodology

Panoptica is the visible, demonstrable layer. It's what you show investors, customers, and new hires. The building IS the product.

## Priority Order

1. Fix critical UX bugs (canvas drift ✅, sidebar overflow ✅, agent choreography)
2. Remove building view, go office-first with cross-product building canvas
3. Linear integration (issue IDs on agents, dependency chains)
4. Daily Ops Board (Plan / Execute / Deliver columns)
5. Multi-user support (Nemoclaw deployment, user_id tagging)
6. PR triage board with GitNexus pre-review
7. Journey health integration
8. Spike detection engine
9. Playbook / gamified onboarding
10. Mush notification integration
