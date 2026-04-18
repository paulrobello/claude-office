from app.core.plan_parser import parse_plan_md
from app.models.runs import PlanTaskStatus

SAMPLE = """\
# PLAN

Some prose.

- [x] plan-task-1: scaffold api
- [x] plan-task-2: auth wiring
- [~] plan-task-3: feed schema
- [ ] plan-task-4: fetcher stub
   not-a-task bullet
- [ ] plan-task-5: rate-limit logic

# notes
misc line
"""


def test_parse_plan_md_basic():
    tasks = parse_plan_md(SAMPLE)
    ids = [t.id for t in tasks]
    assert ids == ["plan-task-1", "plan-task-2", "plan-task-3", "plan-task-4", "plan-task-5"]
    assert tasks[0].status == PlanTaskStatus.DONE
    assert tasks[2].status == PlanTaskStatus.IN_PROGRESS
    assert tasks[3].status == PlanTaskStatus.TODO
    assert tasks[0].title == "scaffold api"


def test_parse_plan_md_empty_returns_empty():
    assert parse_plan_md("") == []


def test_parse_plan_md_ignores_garbage_lines():
    content = "- [ ] not-a-plan-task just a bullet\n- [x] plan-task-9: real\n"
    tasks = parse_plan_md(content)
    assert len(tasks) == 1
    assert tasks[0].id == "plan-task-9"


def test_parse_plan_md_unrecognised_status_char_defaults_todo():
    content = "- [?] plan-task-1: weird\n"
    tasks = parse_plan_md(content)
    assert tasks[0].status == PlanTaskStatus.TODO


def test_parse_plan_md_debug_logs_malformed_task_lines(caplog):
    """Lines starting with '- [' but failing full regex → one DEBUG per line."""
    import logging

    malformed = [
        "- [ ] plan-task-: missing id number",      # id part fails \d+
        "- [ ] plan-task-42",                        # no colon+title
        "- [x] plan-task-99:",                       # empty title (.+? requires ≥1 char)
    ]
    content = (
        "- [x] plan-task-1: valid one\n"
        + "\n".join(malformed)
        + "\n- [ ] plan-task-2: valid two\n"
    )

    with caplog.at_level(logging.DEBUG, logger="app.core.plan_parser"):
        tasks = parse_plan_md(content)

    # Normal parse is unchanged
    assert [t.id for t in tasks] == ["plan-task-1", "plan-task-2"]

    # Exactly 3 DEBUG records for the malformed lines
    debug_records = [r for r in caplog.records if r.levelno == logging.DEBUG]
    assert len(debug_records) == 3
    # Each record should contain the offending line content
    for record, bad_line in zip(debug_records, malformed, strict=True):
        assert bad_line[:40] in record.message
