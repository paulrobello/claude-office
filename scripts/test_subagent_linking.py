#!/usr/bin/env python3
"""Test subagent linking scenarios for the fallback fix.

Tests two scenarios:
1. Background agents (teams): SubagentStart creates agent with agent_id,
   SubagentStop arrives with only native_agent_id — tests fallback linking
2. Synchronous agents: SubagentStart and SubagentStop both use agent_id — baseline

Usage:
    python scripts/test_subagent_linking.py
"""

import json
import time
from datetime import datetime, timezone

import requests

API_URL = "http://localhost:8000/api/v1/events"
SESSION_ID = "test_subagent_linking"
STATE_URL = f"http://localhost:8000/api/v1/sessions/{SESSION_ID}/replay"


def send_event(event_type: str, data: dict | None = None) -> None:
    payload = {
        "event_type": event_type,
        "session_id": SESSION_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data or {},
    }
    response = requests.post(API_URL, json=payload, timeout=10)
    response.raise_for_status()


def get_state() -> dict:
    response = requests.get(STATE_URL, timeout=10)
    response.raise_for_status()
    events = response.json()
    return events[-1]["state"] if events else {}


def get_agents(state: dict) -> list[dict]:
    return state.get("agents", [])


def print_agents(label: str, agents: list[dict]) -> None:
    if not agents:
        print(f"  {label}: (no agents)")
    for a in agents:
        print(
            f"  {label}: id={a['id'][:40]} name={a.get('name')} "
            f"state={a.get('state')} nativeId={a.get('nativeId')}"
        )


def test_background_agents_fallback() -> bool:
    """Test: Background agents stopped via native_agent_id with no prior SubagentInfo."""
    print("\n" + "=" * 60)
    print("TEST 1: Background agents (fallback linking)")
    print("  Simulates teams: agent created via PreToolUse, stopped via native SubagentStop")
    print("  SubagentInfo is MISSING — tests fallback linking in SubagentStop")
    print("=" * 60)

    # Start session
    send_event("session_start")
    time.sleep(1)

    # Spawn 3 background agents (as PreToolUse -> subagent_start would)
    agents_data = [
        ("bg_agent_1", "Code Scanner", "Scan codebase for issues"),
        ("bg_agent_2", "Fix Proposer", "Propose fixes for found bugs"),
        ("bg_agent_3", "Code Reviewer", "Review and validate proposals"),
    ]
    for agent_id, name, task in agents_data:
        send_event("subagent_start", {
            "agent_id": agent_id,
            "agent_name": name,
            "task_description": task,
        })
    time.sleep(2)

    # Check: 3 agents should exist, all with nativeId=None
    state = get_state()
    agents = get_agents(state)
    print(f"\nAfter spawning 3 agents:")
    print_agents("agent", agents)

    if len(agents) != 3:
        print(f"  FAIL: Expected 3 agents, got {len(agents)}")
        return False

    unlinked = [a for a in agents if a.get("nativeId") is None]
    if len(unlinked) != 3:
        print(f"  FAIL: Expected 3 unlinked agents, got {len(unlinked)}")
        return False
    print("  OK: 3 agents created, all unlinked (nativeId=None)")

    # Simulate agents working
    for agent_id, _, _ in agents_data:
        send_event("pre_tool_use", {
            "tool_name": "Read",
            "tool_input": {"file_path": "src/main.py"},
            "agent_id": agent_id,
        })
    time.sleep(1)

    # Now send SubagentStop with ONLY native_agent_id (no agent_id)
    # This is the bug scenario: native SubagentStop can't find agents
    native_ids = ["native_aaa111", "native_bbb222", "native_ccc333"]
    for i, native_id in enumerate(native_ids):
        print(f"\nSending subagent_stop with native_agent_id={native_id} (no agent_id)...")
        send_event("subagent_stop", {
            "native_agent_id": native_id,
            "success": True,
        })
        time.sleep(2)

        state = get_state()
        agents = get_agents(state)
        remaining = len(agents)
        expected = 3 - (i + 1)
        print(f"  Agents remaining: {remaining} (expected: {expected})")
        print_agents("  remaining", agents)

        # The CLEANUP event removes agents after subagent_stop handler runs
        # Give it a moment
        time.sleep(1)
        state = get_state()
        agents = get_agents(state)
        remaining = len(agents)
        if remaining > expected:
            print(f"  Note: {remaining} agents still present (cleanup may be async)")

    # Final check
    time.sleep(2)
    state = get_state()
    agents = get_agents(state)
    print(f"\nFinal state: {len(agents)} agents remaining")
    print_agents("final", agents)

    if len(agents) == 0:
        print("  PASS: All background agents properly linked and removed!")
        return True
    else:
        print(f"  FAIL: {len(agents)} agents still stuck")
        return False


def test_synchronous_agents_baseline() -> bool:
    """Test: Synchronous agents stopped via direct agent_id (existing behavior)."""
    print("\n" + "=" * 60)
    print("TEST 2: Synchronous agents (baseline — direct agent_id)")
    print("  Agent created and stopped using the same agent_id")
    print("=" * 60)

    send_event("session_start")
    time.sleep(1)

    # Spawn agent
    send_event("subagent_start", {
        "agent_id": "sync_agent_1",
        "agent_name": "Sync Worker",
        "task_description": "Run tests and report results",
    })
    time.sleep(2)

    state = get_state()
    agents = get_agents(state)
    print(f"\nAfter spawning:")
    print_agents("agent", agents)

    if len(agents) != 1:
        print(f"  FAIL: Expected 1 agent, got {len(agents)}")
        return False

    # Agent works
    send_event("pre_tool_use", {
        "tool_name": "Bash",
        "tool_input": {"command": "pytest"},
        "agent_id": "sync_agent_1",
    })
    time.sleep(1)

    # Stop with direct agent_id (synchronous path)
    print("\nSending subagent_stop with agent_id=sync_agent_1...")
    send_event("subagent_stop", {
        "agent_id": "sync_agent_1",
        "success": True,
    })
    time.sleep(3)

    state = get_state()
    agents = get_agents(state)
    print(f"\nFinal state: {len(agents)} agents remaining")
    print_agents("final", agents)

    if len(agents) == 0:
        print("  PASS: Synchronous agent properly stopped and removed!")
        return True
    else:
        print(f"  FAIL: {len(agents)} agents still stuck")
        return False


def main() -> None:
    print("=== Subagent Linking Test Suite ===")
    print(f"Backend: {API_URL}")
    print(f"Session: {SESSION_ID}\n")

    results = []

    # Test 1: Background agents with fallback linking
    try:
        results.append(("Background agents (fallback)", test_background_agents_fallback()))
    except Exception as e:
        print(f"  ERROR: {e}")
        results.append(("Background agents (fallback)", False))

    time.sleep(2)

    # Test 2: Synchronous agents (baseline)
    try:
        results.append(("Synchronous agents (baseline)", test_synchronous_agents_baseline()))
    except Exception as e:
        print(f"  ERROR: {e}")
        results.append(("Synchronous agents (baseline)", False))

    # Summary
    print("\n" + "=" * 60)
    print("RESULTS:")
    for name, passed in results:
        status = "PASS ✓" if passed else "FAIL ✗"
        print(f"  {status}  {name}")
    print("=" * 60)

    all_passed = all(p for _, p in results)
    if not all_passed:
        exit(1)


if __name__ == "__main__":
    main()
