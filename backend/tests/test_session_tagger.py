# backend/tests/test_session_tagger.py
from datetime import UTC, datetime
from pathlib import Path

from app.core.marker_file import MarkerFile
from app.core.session_tagger import SessionTag, classify_session
from app.models.runs import Role


def _marker(tmp_path: Path, run_id: str = "ral-1") -> MarkerFile:
    return MarkerFile(
        run_id=run_id,
        orchestrator_session_id="orc-1",
        primary_repo=str(tmp_path),
        workdocs_dir=str(tmp_path / "workdocs"),
        started_at=datetime.now(UTC),
        ended_at=None,
        phase="A",
        model_config_dict={},
        source_path=tmp_path / "workdocs" / ".panoptica-run.json",
    )


def test_env_and_marker_agree(tmp_path: Path):
    env = {"RALPH_RUN_ID": "ral-1", "RALPH_ROLE": "coder", "RALPH_TASK_ID": "plan-task-5"}
    tag = classify_session(session_id="s1", cwd=tmp_path, env=env, marker=_marker(tmp_path))
    assert tag == SessionTag(
        run_id="ral-1", role=Role.CODER, task_id="plan-task-5", is_orchestrator=False
    )


def test_env_only_still_tags(tmp_path: Path):
    env = {"RALPH_RUN_ID": "ral-2", "RALPH_ROLE": "designer"}
    tag = classify_session(session_id="s1", cwd=tmp_path, env=env, marker=None)
    assert tag.run_id == "ral-2"
    assert tag.role == Role.DESIGNER
    assert tag.is_orchestrator is False


def test_marker_only_tags_as_orchestrator(tmp_path: Path):
    tag = classify_session(session_id="orc-1", cwd=tmp_path, env={}, marker=_marker(tmp_path))
    assert tag.run_id == "ral-1"
    assert tag.role is None
    assert tag.is_orchestrator is True


def test_neither_returns_none(tmp_path: Path):
    assert classify_session(session_id="s1", cwd=tmp_path, env={}, marker=None) is None


def test_env_marker_run_id_mismatch_prefers_env_logs_warning(tmp_path: Path, caplog):
    env = {"RALPH_RUN_ID": "ral-MISMATCH", "RALPH_ROLE": "coder"}
    marker = _marker(tmp_path, run_id="ral-1")
    tag = classify_session(session_id="s1", cwd=tmp_path, env=env, marker=marker)
    assert tag.run_id == "ral-MISMATCH"
    assert any("mismatch" in r.message.lower() for r in caplog.records)


def test_unknown_role_returns_none_role(tmp_path: Path):
    env = {"RALPH_RUN_ID": "ral-1", "RALPH_ROLE": "nonsense"}
    tag = classify_session(session_id="s1", cwd=tmp_path, env=env, marker=None)
    assert tag.run_id == "ral-1"
    assert tag.role is None
