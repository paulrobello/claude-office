from __future__ import annotations

import logging
import re

from app.models.runs import PlanTask, PlanTaskStatus

logger = logging.getLogger(__name__)

__all__ = ["parse_plan_md"]


_LINE_RE = re.compile(r"^\s*-\s*\[(?P<mark>.)\]\s*(?P<id>plan-task-\d+)\s*:\s*(?P<title>.+?)\s*$")
_TASK_LIKE_RE = re.compile(r"^\s*-\s*\[")

_STATUS_MAP = {
    " ": PlanTaskStatus.TODO,
    "x": PlanTaskStatus.DONE,
    "X": PlanTaskStatus.DONE,
    "~": PlanTaskStatus.IN_PROGRESS,
}

_MAX_MALFORMED_LOGS = 20


def parse_plan_md(content: str) -> list[PlanTask]:
    tasks: list[PlanTask] = []
    seen_ids: set[str] = set()
    malformed_count = 0
    for raw_line in content.splitlines():
        m = _LINE_RE.match(raw_line)
        if not m:
            if malformed_count < _MAX_MALFORMED_LOGS and _TASK_LIKE_RE.match(raw_line):
                malformed_count += 1
                logger.debug("malformed task line (ignored): %s", raw_line[:80])
            continue
        task_id = m.group("id")
        if task_id in seen_ids:
            logger.warning("PLAN.md duplicate task id %s — keeping first", task_id)
            continue
        seen_ids.add(task_id)
        status = _STATUS_MAP.get(m.group("mark"), PlanTaskStatus.TODO)
        tasks.append(PlanTask(id=task_id, title=m.group("title"), status=status))
    return tasks
