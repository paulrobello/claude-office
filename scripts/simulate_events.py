#!/usr/bin/env python3
"""Simulation entry point for the Claude Office Visualizer.

Runs one of six pre-built scenarios against the backend API:

  run_lifecycle  Full Ralph run lifecycle on campus view (~90 s) [default]
  quick          All visual elements, no compaction (~45 s)
  basic          Simple agent spawn/complete (~60 s)
  complex        Multi-agent workflow with context compaction (~5-10 min)
  edge_cases     Error handling, permissions, orphan cleanup (~2 min)
  teams          Agent Teams: lead + 3 teammates + subagents + kanban (~4 min)

Usage::

    python scripts/simulate_events.py
    python scripts/simulate_events.py run_lifecycle
    python scripts/simulate_events.py quick
    python scripts/simulate_events.py complex --session my_session_42
    python scripts/simulate_events.py basic --quiet
"""

import argparse
import sys
from pathlib import Path

# Make the scripts/ directory importable so ``scripts.scenarios`` resolves.
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.scenarios._base import SimulationContext
from scripts.scenarios.basic import run as run_basic
from scripts.scenarios.complex import run as run_complex
from scripts.scenarios.edge_cases import run as run_edge_cases
from scripts.scenarios.quick import run as run_quick
from scripts.scenarios.run_lifecycle import run as run_run_lifecycle
from scripts.scenarios.teams import run as run_teams

SCENARIOS: dict[str, object] = {
    "run_lifecycle": run_run_lifecycle,
    "quick": run_quick,
    "basic": run_basic,
    "complex": run_complex,
    "edge_cases": run_edge_cases,
    "teams": run_teams,
}

DEFAULT_SCENARIO = "run_lifecycle"
DEFAULT_SESSION_ID = "sim_session_123"


def build_parser() -> argparse.ArgumentParser:
    """Return the argument parser for the simulation entry point."""
    parser = argparse.ArgumentParser(
        description="Run a Claude Office simulation scenario against the local backend.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "scenario",
        nargs="?",
        default=DEFAULT_SCENARIO,
        choices=list(SCENARIOS.keys()),
        help=f"Scenario to run (default: {DEFAULT_SCENARIO})",
    )
    parser.add_argument(
        "--session",
        default=DEFAULT_SESSION_ID,
        metavar="SESSION_ID",
        help=f"Session ID to use for events (default: {DEFAULT_SESSION_ID})",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress output",
    )
    return parser


def main() -> None:
    """Parse arguments and run the requested scenario."""
    parser = build_parser()
    args = parser.parse_args()

    scenario_fn = SCENARIOS.get(args.scenario)
    if scenario_fn is None:
        parser.error(f"Unknown scenario '{args.scenario}'. Choose from: {', '.join(SCENARIOS)}")

    ctx = SimulationContext(
        session_id=args.session,
        verbose=not args.quiet,
    )

    print(f"Running scenario '{args.scenario}' with session '{args.session}'...")
    scenario_fn(ctx)  # type: ignore[call-arg]
    print("Done.")


if __name__ == "__main__":
    main()
