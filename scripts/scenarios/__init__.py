"""Simulation scenarios for the Claude Office Visualizer.

Each module exposes a single ``run(ctx)`` function that accepts a
:class:`~scripts.scenarios.SimulationContext` and drives the backend
event stream for one scenario.

Available scenarios
-------------------
- ``basic``      — Simple session: boss reads a file, spawns one agent, session ends.
- ``complex``    — Multi-agent workflow with context compaction and background tasks.
- ``edge_cases`` — Error paths, permission requests, and unusual event sequences.
"""

from .basic import run as run_basic
from .complex import run as run_complex
from .edge_cases import run as run_edge_cases

__all__ = ["run_basic", "run_complex", "run_edge_cases"]
