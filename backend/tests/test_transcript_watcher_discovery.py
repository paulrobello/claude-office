import json
import tempfile
from pathlib import Path

import pytest

from app.core.transcript_watcher import TranscriptWatcher, extract_project_name


def test_extract_project_name_standard():
    path = "/Users/apple/.claude/projects/-Users-apple-Projects-others-startups-startups-mono-abc123de/session.jsonl"
    assert extract_project_name(path) == "startups-mono"


def test_extract_project_name_short():
    path = "/Users/apple/.claude/projects/-Users-apple-myproject-def45678/session.jsonl"
    assert extract_project_name(path) == "myproject"


def test_extract_project_name_single_segment():
    path = "/Users/apple/.claude/projects/-Users-apple-x-aaa11122/session.jsonl"
    assert extract_project_name(path) == "x"


def test_extract_project_name_no_hash():
    path = "/Users/apple/.claude/projects/-Users-apple-Projects-myapp/session.jsonl"
    assert extract_project_name(path) == "myapp"


@pytest.mark.asyncio
async def test_scan_discovers_sessions():
    with tempfile.TemporaryDirectory() as tmpdir:
        proj_dir = Path(tmpdir) / "-Users-apple-Projects-myproj-abc12345"
        proj_dir.mkdir()
        jsonl_file = proj_dir / "session.jsonl"
        jsonl_file.write_text(json.dumps({"type": "assistant", "message": "hello"}) + "\n")

        watcher = TranscriptWatcher(
            projects_dir=tmpdir,
            active_threshold=600.0,
            known_session_ids=set(),
        )
        sessions = await watcher.scan()
        assert len(sessions) >= 1
        assert sessions[0].project_name == "myproj"


@pytest.mark.asyncio
async def test_scan_ignores_known_sessions():
    with tempfile.TemporaryDirectory() as tmpdir:
        proj_dir = Path(tmpdir) / "-Users-apple-Projects-myproj-abc12345"
        proj_dir.mkdir()
        jsonl_file = proj_dir / "session.jsonl"
        jsonl_file.write_text(json.dumps({"type": "assistant"}) + "\n")

        watcher = TranscriptWatcher(
            projects_dir=tmpdir,
            active_threshold=600.0,
            known_session_ids={"-Users-apple-Projects-myproj-abc12345"},
        )
        sessions = await watcher.scan()
        assert len(sessions) == 0


@pytest.mark.asyncio
async def test_scan_empty_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        watcher = TranscriptWatcher(
            projects_dir=tmpdir,
            active_threshold=600.0,
            known_session_ids=set(),
        )
        sessions = await watcher.scan()
        assert sessions == []
