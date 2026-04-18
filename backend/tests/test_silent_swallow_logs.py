"""Tests that silent exception swallows emit DEBUG logs (fix-task-9)."""

from __future__ import annotations

import logging
from unittest.mock import patch

import pytest

from app.core.marker_file import _validate_cwd
from app.core.run_aggregator import RunAggregator

# ---------------------------------------------------------------------------
# 1. plan_watcher._get_interval — invalid env var
# ---------------------------------------------------------------------------


def test_plan_watcher_invalid_interval_logs_debug(monkeypatch, caplog):
    monkeypatch.setenv("PANOPTICA_PLAN_POLL_INTERVAL", "not_a_float")
    from app.core import plan_watcher as pw_mod

    with caplog.at_level(logging.DEBUG, logger="app.core.plan_watcher"):
        result = pw_mod._get_interval()
    assert result == pw_mod.DEFAULT_POLL_INTERVAL_SECONDS
    assert any("PANOPTICA_PLAN_POLL_INTERVAL" in r.message for r in caplog.records), (
        "Expected DEBUG log mentioning PANOPTICA_PLAN_POLL_INTERVAL"
    )


# ---------------------------------------------------------------------------
# 2. marker_watcher._get_interval — invalid env var
# ---------------------------------------------------------------------------


def test_marker_watcher_invalid_interval_logs_debug(monkeypatch, caplog):
    monkeypatch.setenv("PANOPTICA_MARKER_POLL_INTERVAL", "not_a_float")
    from app.core import marker_watcher as mw_mod

    with caplog.at_level(logging.DEBUG, logger="app.core.marker_watcher"):
        result = mw_mod._get_interval()
    assert result == mw_mod.DEFAULT_POLL_INTERVAL_SECONDS
    assert any("PANOPTICA_MARKER_POLL_INTERVAL" in r.message for r in caplog.records), (
        "Expected DEBUG log mentioning PANOPTICA_MARKER_POLL_INTERVAL"
    )


# ---------------------------------------------------------------------------
# 3. event_processor._derive_display_name — OSError/ValueError
# ---------------------------------------------------------------------------


def test_derive_display_name_exception_logs_debug(caplog):
    from app.core.event_processor import _derive_display_name

    with patch("app.core.event_processor.Path") as mock_path_cls:
        mock_path_cls.return_value.resolve.side_effect = OSError("disk failure")
        with caplog.at_level(logging.DEBUG, logger="app.core.event_processor"):
            result = _derive_display_name("/some/working/dir", None)

    assert result is None
    assert any(r.levelno == logging.DEBUG and "working/dir" in r.message for r in caplog.records), (
        "Expected DEBUG log mentioning the working_dir"
    )


# ---------------------------------------------------------------------------
# 4. run_aggregator.remove_member — unknown run_id
# ---------------------------------------------------------------------------


def test_run_aggregator_remove_member_unknown_run_logs_debug(caplog):
    agg = RunAggregator()
    with caplog.at_level(logging.DEBUG, logger="app.core.run_aggregator"):
        agg.remove_member("ral-nonexistent", session_id="s1")
    assert any(
        r.levelno == logging.DEBUG and "ral-nonexistent" in r.message for r in caplog.records
    ), "Expected DEBUG log mentioning the unknown run_id"


# ---------------------------------------------------------------------------
# 5. marker_file._validate_cwd — ValueError continue in root-check loop
# ---------------------------------------------------------------------------


def test_validate_cwd_non_matching_root_logs_debug(tmp_path, caplog):
    """_validate_cwd tries each allowed_root; a non-matching root should DEBUG-log."""
    other_root = tmp_path / "other_root"
    other_root.mkdir()
    cwd = tmp_path / "different_tree" / "subdir"
    cwd.mkdir(parents=True)

    non_matching_root = other_root / "deeper"
    non_matching_root.mkdir(parents=True)

    with (
        caplog.at_level(logging.DEBUG, logger="app.core.marker_file"),
        pytest.raises(ValueError),
    ):
        _validate_cwd(str(cwd), allowed_roots=[non_matching_root])

    assert any(r.levelno == logging.DEBUG for r in caplog.records), (
        "Expected DEBUG log when path is not under any allowed root"
    )
