# Departed Agents Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep recently-removed agents in StateMachine for 60 seconds so project_state broadcasts include them, matching the frontend gameStore which retains agents during departure animations.

**Architecture:** Add a `departed_agents` dict to StateMachine that holds removed agents with a timestamp. `remove_agent()` moves agents there instead of deleting. `to_game_state()` merges both dicts. A `_cleanup_departed()` method purges entries older than 60s, called from `remove_agent()` and `to_game_state()`.

**Tech Stack:** Python, Pydantic, pytest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/core/state_machine.py` | Modify | Add departed_agents dict, update remove_agent and to_game_state |
| `backend/tests/test_state_machine_departed.py` | Create | Tests for departed agent retention |

---

### Task 1: Write tests for departed agent retention

**Files:**
- Create: `backend/tests/test_state_machine_departed.py`

- [ ] **Step 1: Write test file**

```python
"""Tests for departed agent retention in StateMachine."""

import time
from unittest.mock import patch

from app.core.state_machine import StateMachine
from app.models.agents import Agent, AgentState


def _make_agent(agent_id: str, state: AgentState = AgentState.WORKING) -> Agent:
    return Agent(id=agent_id, color="#FF0000", number=1, state=state)


class TestDepartedAgentRetention:
    def test_removed_agent_appears_in_game_state(self):
        """After remove_agent, agent should still appear in to_game_state with LEAVING state."""
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.remove_agent("a1")

        state = sm.to_game_state("test-session")
        agent_ids = [a.id for a in state.agents]
        assert "a1" in agent_ids
        a1 = next(a for a in state.agents if a.id == "a1")
        assert a1.state == AgentState.LEAVING

    def test_removed_agent_not_in_active_agents(self):
        """Departed agents should NOT count as active (for MAX_AGENTS checks)."""
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.remove_agent("a1")

        assert "a1" not in sm.agents
        assert "a1" not in sm.get_active_agent_ids()

    def test_departed_agent_expires_after_ttl(self):
        """Departed agents should be purged after DEPARTED_TTL seconds."""
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.remove_agent("a1")

        # Fast-forward past TTL
        with patch("time.monotonic", return_value=time.monotonic() + 61):
            state = sm.to_game_state("test-session")

        agent_ids = [a.id for a in state.agents]
        assert "a1" not in agent_ids

    def test_active_agents_unaffected(self):
        """Active agents should still appear normally alongside departed ones."""
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a2"] = _make_agent("a2")
        sm.remove_agent("a1")

        state = sm.to_game_state("test-session")
        agent_ids = [a.id for a in state.agents]
        assert "a1" in agent_ids  # departed
        assert "a2" in agent_ids  # active

    def test_max_agents_ignores_departed(self):
        """MAX_AGENTS check should only count active agents, not departed."""
        sm = StateMachine()
        # Fill to max
        for i in range(sm.MAX_AGENTS):
            sm.agents[f"a{i}"] = _make_agent(f"a{i}", AgentState.WORKING)
        # Remove one
        sm.remove_agent("a0")
        # Should now have room for a new agent
        assert len(sm.agents) == sm.MAX_AGENTS - 1

    def test_remove_nonexistent_agent(self):
        """Removing a non-existent agent should not raise."""
        sm = StateMachine()
        sm.remove_agent("ghost")  # Should not raise
        assert len(sm.departed_agents) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_state_machine_departed.py -v`
Expected: FAIL — `StateMachine` has no `departed_agents` attribute.

- [ ] **Step 3: Commit test file**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/tests/test_state_machine_departed.py
git commit -m "test: add tests for departed agent retention in StateMachine"
```

---

### Task 2: Implement departed agent retention

**Files:**
- Modify: `backend/app/core/state_machine.py`

Three changes in this file:

- [ ] **Step 1: Add `departed_agents` field to StateMachine dataclass**

After line 155 (`agents: dict[str, Agent] = ...`), add:

```python
departed_agents: dict[str, tuple[Agent, float]] = field(default_factory=dict)
```

- [ ] **Step 2: Add `_cleanup_departed` method and `DEPARTED_TTL` constant**

After `remove_agent` method (after line 345), add:

```python
DEPARTED_TTL = 60.0  # seconds to keep departed agents visible

def _cleanup_departed(self) -> None:
    """Remove agents that departed more than DEPARTED_TTL seconds ago."""
    import time
    now = time.monotonic()
    expired = [
        aid for aid, (_, ts) in self.departed_agents.items()
        if now - ts > self.DEPARTED_TTL
    ]
    for aid in expired:
        del self.departed_agents[aid]
```

- [ ] **Step 3: Update `remove_agent` to move agent to departed_agents**

Change `remove_agent` from:

```python
def remove_agent(self, agent_id: str) -> None:
    """Remove an agent from the office and all queues."""
    if agent_id in self.agents:
        del self.agents[agent_id]
    if agent_id in self.arrival_queue:
        self.arrival_queue.remove(agent_id)
    if agent_id in self.handin_queue:
        self.handin_queue.remove(agent_id)
```

To:

```python
def remove_agent(self, agent_id: str) -> None:
    """Move agent to departed_agents (kept for 60s) and remove from queues."""
    import time
    if agent_id in self.agents:
        agent = self.agents.pop(agent_id)
        agent.state = AgentState.LEAVING
        self.departed_agents[agent_id] = (agent, time.monotonic())
    if agent_id in self.arrival_queue:
        self.arrival_queue.remove(agent_id)
    if agent_id in self.handin_queue:
        self.handin_queue.remove(agent_id)
    self._cleanup_departed()
```

- [ ] **Step 4: Update `to_game_state` to include departed agents**

In `to_game_state`, change line 287:

```python
# FROM:
agents_list: list[Agent] = list(self.agents.values())
# TO:
self._cleanup_departed()
agents_list: list[Agent] = list(self.agents.values()) + [
    a for a, _ in self.departed_agents.values()
]
```

- [ ] **Step 5: Run the new tests**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_state_machine_departed.py -v`
Expected: All 6 tests PASS.

- [ ] **Step 6: Run full test suite**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/ -x -q`
Expected: All tests PASS (252+).

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/core/state_machine.py
git commit -m "fix(backend): retain departed agents for 60s in project_state broadcasts"
```
