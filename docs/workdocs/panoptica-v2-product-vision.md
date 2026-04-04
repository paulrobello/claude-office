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

## Layer 5: Human Testing Gate — "Travel the Journey"

The orchestrators' most important job isn't dispatching agents or reviewing PRs. It's **being the user**.

### The Principle

> "We don't just map journeys. We travel them."

When an agent creates a PR for LEX-38 (add rate limiting to auth), the feature isn't "done" when the PR is merged. It's done when a human:

1. **Opens the app** as the journey's actor (paralegal, admin, client)
2. **Walks the affected journey steps** manually — clicks the buttons, fills the forms, sees the results
3. **Captures proof** — screenshot, screen recording, or a structured "journey test report"
4. **Updates the journey step status** — from "implemented" to "verified" (or flags drift)
5. **Closes the Linear issue** with the proof attached

This is the human gate. No feature ships without a human having traveled the journey it affects.

### Why This Matters Now

Before AI agents, developers tested their own code because they wrote it — they understood the intent. Now agents write the code. The orchestrator who dispatched the agent might not even read the diff. The PR review catches code quality, but nobody catches "this doesn't actually work for the user."

Scheduled testing time must be part of the weekly rhythm:
- **Testing blocks** — dedicated time slots (e.g., Tuesday/Thursday afternoons) where orchestrators are users, not dispatchers
- **Journey coverage** — track which journeys have been manually traveled this sprint, and which haven't
- **Proof-of-closure** — every Linear issue requires a human verification artifact before it moves to "Done"

### In Panoptica

The Daily Ops Board shows a fourth implicit column: **VERIFY**. After DELIVER (PR merged), there's a verification queue:
- "LEX-38 merged → needs journey verification by Aldo"
- "REC-42 merged → auth journey has 3 steps to test"
- Journey health dashboard shows "verified" vs "implemented-but-untested" steps

## The Playbook: How Tesseron Works

The Playbook is Panoptica's built-in teaching system. It's not documentation — it's an interactive, gamified experience that teaches the Tesseron methodology.

### The Manifest

The core rules of how Tesseron operates:

**Planning**
- Initiatives are thematic, not temporal (RECEPTHOR - V1 Launch, not "Sprint 47")
- Minimum 3 projects to justify a new initiative
- Overlap in planning, not in execution
- Every issue has an owner (Cluster A = Seba, Cluster B = Aldo)

**Execution**
- Agents stop after opening a PR (human review gate)
- Small, reviewable slices — multiple PRs, not one mega PR
- Workdocs persist intent — artifacts over chat memory
- No secrets in code or prompts

**Review**
- Review the PR that unblocks the most downstream work first
- Pre-review with GitNexus agent catches obvious issues
- Humans focus on architecture, product decisions, and journey alignment
- Cross-product PRs require PM review

**Testing**
- We travel the journeys, we don't just map them
- Every feature requires human verification with proof
- Testing blocks are sacred weekly time
- Journey step status moves to "verified" only after human travel

**Coordination**
- The Daily Ops Board replaces standups
- Spikes are detected and handled in real-time, not in tomorrow's meeting
- Dependency chains are visible — you never block someone without knowing it
- Capacity is transparent — idle orchestrators pull work forward

### Interactive Scenarios

Using the simulation engine:
- "A spike hits at 2pm" → teaches spike handling
- "5 PRs pending, which first?" → teaches impact-based triage
- "Agent blocked for 20 min" → teaches when to intervene vs wait
- "Journey drift detected" → teaches alignment verification
- "New feature merged — now what?" → teaches the testing gate

### Progression System

- **Observer** — watches the building, reads the manifest, completes tutorials
- **Orchestrator** — can dispatch agents, review PRs, handle spikes
- **Architect** — can modify journeys, restructure initiatives, train others

### Living Nudges

Panoptica observes your behavior and coaches in real-time:
- "3 PRs pending > 1 hour. #138 unblocks 2 agents — review it first?"
- "You haven't tested LEX-55 yet. The auth journey has 3 unverified steps."
- "Aldo is idle. Consider assigning LEX-42."
- "Great job — zero spikes today. All journey steps green."

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
