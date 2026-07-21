"""Shared utilities used by all simulation scenarios.

Not part of the public API — import from ``scripts.scenarios`` instead.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime

import requests

API_URL = os.environ.get("CLAUDE_OFFICE_API_URL", "http://localhost:8000/api/v1/events")

# Context window constants
MAX_CONTEXT_TOKENS = 200_000
COMPACTION_THRESHOLD = 0.80  # Trigger compaction at 80%
COMPACTION_ANIMATION_DURATION = 10  # seconds

# Creative agent display names
AGENT_NAMES = [
    "Scout",
    "Fixer",
    "Builder",
    "Tester",
    "Validator",
    "Researcher",
    "Debugger",
    "Optimizer",
    "Refactorer",
    "Doc Writer",
    "Type Ninja",
    "Bug Hunter",
    "Code Sage",
    "Test Wizard",
    "Lint Master",
]

# Realistic task descriptions for marquee display
TASK_DESCRIPTIONS = [
    "Analyze authentication flow and identify security vulnerabilities in login module",
    "Refactor database queries to improve performance and reduce N+1 query issues",
    "Implement comprehensive unit tests for the payment processing service",
    "Review and update API documentation to match current implementation",
    "Migrate legacy configuration files to new YAML-based format",
    "Investigate memory leak in background job processor and apply fix",
    "Add TypeScript type annotations to frontend utility functions",
    "Optimize bundle size by implementing code splitting for large modules",
    "Set up end-to-end testing framework with Playwright for critical flows",
    "Create database migration scripts for new user preferences schema",
    "Implement rate limiting middleware to prevent API abuse",
    "Add observability with structured logging and OpenTelemetry traces",
]


@dataclass
class SimulationContext:
    """Shared mutable state for a single simulation run.

    Passed to each scenario's ``run()`` function so they can share
    context-token state and coordinate compaction timing.

    Args:
        session_id: The session identifier sent with every event.
        verbose: When True, print progress messages to stdout.
    """

    session_id: str = "sim_session_123"
    verbose: bool = True

    # Token counters (protected by ``lock``)
    input_tokens: int = 0
    output_tokens: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)
    compaction_triggered: bool = False
    compaction_in_progress: bool = False

    def reset(self, initial_fraction: float = 0.0) -> None:
        """Reset context counters for the start of a scenario.

        Args:
            initial_fraction: Fraction of MAX_CONTEXT_TOKENS to pre-load
                              (e.g. 0.35 starts at 35 % full).
        """
        self.input_tokens = int(MAX_CONTEXT_TOKENS * initial_fraction)
        self.output_tokens = 0
        self.compaction_triggered = False
        self.compaction_in_progress = False

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def log(self, message: str) -> None:
        """Print *message* when verbose mode is active."""
        if self.verbose:
            print(message)

    def send_event(self, event_type: str, data: dict | None = None) -> None:
        """POST an event to the backend API.

        Args:
            event_type: The event type string (e.g. ``"session_start"``).
            data: Optional event-specific payload dict.
        """
        payload = {
            "event_type": event_type,
            "session_id": self.session_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "data": data or {},
        }
        try:
            response = requests.post(API_URL, json=payload, timeout=10)
            response.raise_for_status()
        except Exception as e:
            self.log(f"Error sending {event_type}: {e}")

    def increment_context(self, input_delta: int = 0, output_delta: int = 0) -> dict[str, int]:
        """Thread-safely increment token counters and return current values.

        Args:
            input_delta: Tokens to add to the input counter.
            output_delta: Tokens to add to the output counter.

        Returns:
            Dict with ``input_tokens`` and ``output_tokens`` keys.
        """
        with self.lock:
            self.input_tokens += input_delta
            self.output_tokens += output_delta
            return {
                "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens,
            }

    def get_context_utilization(self) -> float:
        """Return current context utilisation in the range [0.0, 1.0]."""
        with self.lock:
            total = self.input_tokens + self.output_tokens
            return total / MAX_CONTEXT_TOKENS

    def is_compaction_in_progress(self) -> bool:
        """Return True while the compaction animation is playing."""
        with self.lock:
            return self.compaction_in_progress

    def check_and_trigger_compaction(self) -> bool:
        """Trigger a context_compaction event if the threshold has been reached.

        Returns:
            True if compaction was triggered; False otherwise.
        """
        should_trigger = False
        tokens: dict[str, int] = {}
        utilization = 0.0

        with self.lock:
            if self.compaction_triggered:
                return False
            total = self.input_tokens + self.output_tokens
            utilization = total / MAX_CONTEXT_TOKENS
            if utilization >= COMPACTION_THRESHOLD:
                self.compaction_triggered = True
                self.compaction_in_progress = True
                tokens = {
                    "input_tokens": self.input_tokens,
                    "output_tokens": self.output_tokens,
                }
                should_trigger = True
                # Simulate context reduction after compaction (~30% retained)
                self.input_tokens = int(self.input_tokens * 0.3)
                self.output_tokens = int(self.output_tokens * 0.3)

        if should_trigger:
            self.log(
                f"*** COMPACTION TRIGGERED at {utilization:.1%} "
                f"(>= {COMPACTION_THRESHOLD:.0%}) ***"
            )
            self.send_event("context_compaction", tokens)
            self.log(
                f"*** Compaction event sent, context reduced "
                f"to {self.get_context_utilization():.1%} ***"
            )
            return True

        return False

    def finish_compaction(self) -> None:
        """Mark the compaction animation as complete."""
        with self.lock:
            self.compaction_in_progress = False


@dataclass
class TeamSimulationContext:
    """Groups one lead and N teammate ``SimulationContext``s for team scenarios.

    The room-orchestrator merge path is only exercised when multiple sessions
    share a ``team_name``; this context owns the member contexts so the
    ``teams`` scenario can drive that path without re-implementing event
    plumbing.

    Args:
        team_name: Identifier shared by every member's ``team_name`` field.
        project_name: Shared ``project_name`` sent on ``session_start``.
        verbose: Forwarded to each member ``SimulationContext``.
        members: Member contexts in creation order (lead first).
    """

    team_name: str
    project_name: str = "TeamProject"
    verbose: bool = True
    members: list[SimulationContext] = field(default_factory=list)

    def _add(self, session_id: str) -> SimulationContext:
        """Create a member context, register it, and return it."""
        ctx = SimulationContext(session_id=session_id, verbose=self.verbose)
        self.members.append(ctx)
        return ctx

    def add_lead(self, session_id: str) -> SimulationContext:
        """Create and register the lead session context."""
        return self._add(session_id)

    def add_teammate(self, name: str, session_id: str) -> SimulationContext:
        """Create and register a teammate session context.

        ``name`` is accepted for API symmetry with :meth:`add_lead`; the
        teammate's display name is carried per-event via ``teammate_name``.
        """
        return self._add(session_id)

    def log(self, msg: str) -> None:
        """Print *msg* when verbose mode is active."""
        if self.verbose:
            print(msg)
