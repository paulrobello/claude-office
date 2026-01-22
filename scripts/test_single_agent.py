#!/usr/bin/env python3
"""Test script for a single agent to debug pathfinding.

Tests the complete agent lifecycle:
1. Session start
2. Agent spawns at elevator
3. Agent walks to desk and works
4. Agent completes work and departs
5. Session end

Current coordinates (from frontend/src/systems/queuePositions.ts):
- Elevator spawn: First position is (56, 190)
- Desk 1: (256, 464)
- Boss slots: Left (520, 868), Right (760, 868)
"""

import time
from datetime import datetime, timezone

import requests

API_URL = "http://localhost:8000/api/v1/events"
SESSION_ID = "test_single_agent"


def send_event(event_type: str, data: dict | None = None) -> None:
    """Send an event to the backend API."""
    payload = {
        "event_type": event_type,
        "session_id": SESSION_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data or {},
    }
    try:
        response = requests.post(API_URL, json=payload, timeout=10)
        response.raise_for_status()
        print(f"Sent: {event_type}")
    except Exception as e:
        print(f"Error sending {event_type}: {e}")


def main() -> None:
    """Run single agent pathfinding test."""
    print("=== Single Agent Pathfinding Test ===\n")

    # 1. Session Start
    print("Step 1: Starting session...")
    send_event("session_start")
    time.sleep(2)

    # 2. Spawn one agent
    print("\nStep 2: Spawning agent (should appear at elevator)...")
    send_event(
        "subagent_start",
        {
            "agent_id": "test_agent_1",
            "agent_name": "Test Agent",
            "task_description": "Testing pathfinding from elevator to desk",
        },
    )
    time.sleep(3)
    print("  Agent should spawn in elevator zone (first position: 56, 190)")
    print("  Agent will queue for boss slot at (520, 868)")

    # 3. Wait for agent to reach boss and get assigned desk
    print("\nStep 3: Waiting for agent to reach boss and receive assignment...")
    time.sleep(5)

    # 4. Agent starts working (triggers walk to desk)
    print("\nStep 4: Agent starts working (should walk to desk 1)...")
    send_event(
        "pre_tool_use",
        {
            "tool_name": "Read",
            "tool_input": {"file_path": "test.py"},
            "agent_id": "test_agent_1",
        },
    )
    print("  Path: boss slot -> corridor -> desk 1 (256, 464)")
    time.sleep(5)

    # 5. Agent finishes tool use
    print("\nStep 5: Agent finishes working...")
    send_event(
        "post_tool_use",
        {"tool_name": "Read", "agent_id": "test_agent_1"},
    )
    time.sleep(2)

    # 6. Agent stops (goes to departure queue)
    print("\nStep 6: Agent stops (should walk to departure queue)...")
    send_event(
        "subagent_stop",
        {"agent_id": "test_agent_1", "success": True},
    )
    print("  Path: desk -> corridor -> boss right slot (760, 868) -> elevator (86, 192)")
    time.sleep(8)

    # 7. End session
    print("\nStep 7: Ending session...")
    send_event("session_end")
    print("\n=== Test Complete ===")


if __name__ == "__main__":
    main()
