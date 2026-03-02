#!/usr/bin/env python3
"""Generate TypeScript types from Pydantic backend models.

Usage:
    cd backend && uv run python ../scripts/gen_types.py

Outputs ../frontend/src/types/generated.ts via json-schema-to-typescript.
"""

import json
import subprocess
import sys
from pathlib import Path

# Must run from backend/ directory so imports resolve
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from pydantic.json_schema import models_json_schema  # noqa: E402

from app.models.agents import Agent, Boss, ElevatorState, OfficeState, PhoneState  # noqa: E402  # type: ignore[import]
from app.models.common import BubbleContent, BubbleType, SpeechContent, TodoItem, TodoStatus  # noqa: E402  # type: ignore[import]
from app.models.events import Event, EventData, EventType  # noqa: E402  # type: ignore[import]
from app.models.git import ChangedFile, Commit, FileStatus, GitStatus  # noqa: E402  # type: ignore[import]
from app.models.sessions import (  # noqa: E402  # type: ignore[import]
    AgentLifespan,
    BackgroundTask,
    FileEdit,
    GameState,
    NewsItem,
    Session,
    WhiteboardData,
)

# All Pydantic BaseModel subclasses to generate types for
# (TypedDict classes like ConversationEntry and HistoryEntry are not BaseModel
# subclasses so they cannot be used with models_json_schema; they are handled
# manually in index.ts)
MODELS = [
    Agent,
    Boss,
    OfficeState,
    BubbleContent,
    SpeechContent,
    TodoItem,
    Event,
    EventData,
    AgentLifespan,
    BackgroundTask,
    FileEdit,
    NewsItem,
    WhiteboardData,
    Session,
    GameState,
    ChangedFile,
    Commit,
    GitStatus,
]

# Generate combined JSON schema with camelCase field names (by_alias=True)
_, full_schema = models_json_schema(
    [(m, "serialization") for m in MODELS],
    title="Claude Office Backend Types",
    by_alias=True,
)

# Write schema to temp file next to this script
schema_path = Path(__file__).parent / ".gen_types_schema.json"
schema_path.write_text(json.dumps(full_schema, indent=2), encoding="utf-8")

# Convert to TypeScript
output_path = Path(__file__).parent.parent / "frontend" / "src" / "types" / "generated.ts"
try:
    result = subprocess.run(
        [
            "bunx",
            "json2ts",
            "--input",
            str(schema_path),
            "--output",
            str(output_path),
            "--unreachableDefinitions",
            "--style.singleQuote",
        ],
        capture_output=True,
        text=True,
        check=True,
        cwd=str(Path(__file__).parent.parent / "frontend"),
    )
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
except subprocess.CalledProcessError as e:
    print(f"Error generating types: {e.stderr}", file=sys.stderr)
    sys.exit(1)
finally:
    schema_path.unlink(missing_ok=True)

print(f"Generated: {output_path}")
