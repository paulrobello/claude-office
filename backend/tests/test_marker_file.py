import json
from pathlib import Path

import pytest

from app.core.marker_file import (
    MarkerFileReadError,
    marker_path_for_cwd,
    read_marker,
)

VALID = {
    "run_id": "ral-20260418-a7f3",
    "orchestrator_session_id": "01ARZ3NDEK",
    "primary_repo": "/Users/m/dev/athlete-optics",
    "workdocs_dir": "/Users/m/dev/athlete-optics/workdocs",
    "started_at": "2026-04-18T14:32:07Z",
    "ended_at": None,
    "phase": "A",
    "model_config": {"coder": "claude-sonnet-4-6"},
}


def _write(tmp: Path, payload: dict | str) -> Path:
    p = tmp / ".panoptica-run.json"
    if isinstance(payload, dict):
        p.write_text(json.dumps(payload))
    else:
        p.write_text(payload)
    return p


def test_read_marker_valid(tmp_path: Path):
    p = _write(tmp_path, VALID)
    m = read_marker(p)
    assert m.run_id == "ral-20260418-a7f3"
    assert m.phase == "A"
    assert m.ended_at is None
    assert m.model_config_dict == {"coder": "claude-sonnet-4-6"}


def test_read_marker_missing_file_returns_none(tmp_path: Path):
    assert read_marker(tmp_path / ".panoptica-run.json") is None


def test_read_marker_malformed_json_raises(tmp_path: Path):
    p = _write(tmp_path, "{not json")
    with pytest.raises(MarkerFileReadError):
        read_marker(p)


def test_read_marker_missing_required_field_raises(tmp_path: Path):
    bad = {k: v for k, v in VALID.items() if k != "run_id"}
    p = _write(tmp_path, bad)
    with pytest.raises(MarkerFileReadError):
        read_marker(p)


def test_marker_path_for_cwd_appends_workdocs(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    assert marker_path_for_cwd(tmp_path) == tmp_path / "workdocs" / ".panoptica-run.json"


def test_marker_path_rejects_traversal():
    with pytest.raises(ValueError, match="outside allowed"):
        marker_path_for_cwd("/tmp/foo/../../etc/passwd")


def test_marker_path_rejects_relative_path():
    with pytest.raises(ValueError, match="absolute"):
        marker_path_for_cwd("relative/path")


def test_marker_path_accepts_home_subdir(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    subdir = tmp_path / "myproject"
    subdir.mkdir()
    result = marker_path_for_cwd(subdir)
    assert result == subdir / "workdocs" / ".panoptica-run.json"


def test_marker_path_accepts_home_itself(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    result = marker_path_for_cwd(tmp_path)
    assert result == tmp_path / "workdocs" / ".panoptica-run.json"


def test_marker_path_accepts_custom_allowed_root(tmp_path: Path):
    result = marker_path_for_cwd(tmp_path, allowed_roots=[tmp_path])
    assert result == tmp_path / "workdocs" / ".panoptica-run.json"


def test_marker_path_rejects_outside_custom_allowed_root(tmp_path: Path):
    other = tmp_path / "other"
    other.mkdir()
    with pytest.raises(ValueError, match="outside allowed"):
        marker_path_for_cwd(tmp_path, allowed_roots=[other])
