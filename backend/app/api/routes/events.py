import logging
import os
import time
from collections import deque
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from app.core.event_processor import EventProcessor, get_event_processor
from app.models.events import Event

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory rate limiter for event ingestion
# ---------------------------------------------------------------------------

_MAX_REQUESTS = int(os.environ.get("EVENT_RATE_LIMIT", "300"))
_WINDOW = 60.0  # seconds

_request_times: deque[float] = deque()


def reset_rate_limiter() -> None:
    """Clear the rate limiter state.  Intended for use between test runs."""
    _request_times.clear()


def _check_rate_limit() -> None:
    """Raise HTTP 429 if the global request rate exceeds the limit.

    Uses a simple sliding-window counter stored in a module-level deque.
    This is adequate for the single-process, localhost-only deployment model.
    """
    now = time.monotonic()
    cutoff = now - _WINDOW
    while _request_times and _request_times[0] < cutoff:
        _request_times.popleft()

    if len(_request_times) >= _MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again later.",
        )

    _request_times.append(now)


@router.post("/events")
async def receive_event(
    request: Request,
    event: Event,
    background_tasks: BackgroundTasks,
    ep: Annotated[EventProcessor, Depends(get_event_processor)],
) -> dict[str, str]:
    """Receive a Claude Code hook event and queue it for background processing.

    Events are processed asynchronously via FastAPI BackgroundTasks.
    The response is returned immediately so hooks never block.
    Subject to a global rate limit (default 300 requests per 60 seconds,
    configurable via EVENT_RATE_LIMIT env var).

    Args:
        request: The incoming HTTP request (used for rate-limit tracking).
        event: The event payload from Claude Code hooks.
        background_tasks: FastAPI background task runner.
        ep: EventProcessor dependency.

    Returns:
        A status payload with event_id and processing state.
    """
    _check_rate_limit()
    background_tasks.add_task(ep.process_event, event)
    return {
        "status": "accepted",
        "event_id": str(event.timestamp),
        "visual_action": "processing",  # Simplified
    }
