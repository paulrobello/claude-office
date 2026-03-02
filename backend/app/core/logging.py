"""
Logging utilities for Claude Office backend.

Provides standardized logging helpers used across all backend modules:

- ``get_logger(name)``       Returns a configured logger for a given module name.
- ``log_event(logger, event_type, data)``  Logs a structured event at INFO level.
- ``log_error(logger, error, context)``    Logs an exception with structured context.

Usage::

    from app.core.logging import get_logger, log_event, log_error

    logger = get_logger(__name__)

    log_event(logger, "session_start", {"session_id": sid})

    try:
        ...
    except Exception as exc:
        log_error(logger, exc, {"session_id": sid, "phase": "init"})
"""

from __future__ import annotations

import logging
from typing import Any


def get_logger(name: str) -> logging.Logger:
    """Return a standard Python logger for the given module name.

    This is a thin wrapper over ``logging.getLogger`` that provides a
    consistent call site so future enhancements (e.g. adding a shared
    handler or log-level override) can be applied in one place.

    Args:
        name: Typically ``__name__`` of the calling module.

    Returns:
        A :class:`logging.Logger` instance.
    """
    return logging.getLogger(name)


def log_event(
    logger: logging.Logger,
    event_type: str,
    data: dict[str, Any] | None = None,
) -> None:
    """Log a structured event at INFO level.

    Formats the message so that all event log lines share a consistent
    prefix, making them easy to grep and parse.

    Args:
        logger: The logger to write to (typically from :func:`get_logger`).
        event_type: A short, dot-separated identifier such as
            ``"session.start"`` or ``"subagent.spawn"``.
        data: Optional mapping of key-value pairs to include in the log
            line for structured context (values are converted via ``str``).
    """
    if data:
        pairs = " ".join(f"{k}={v!r}" for k, v in data.items())
        logger.info("EVENT %s %s", event_type, pairs)
    else:
        logger.info("EVENT %s", event_type)


def log_error(
    logger: logging.Logger,
    error: BaseException,
    context: dict[str, Any] | None = None,
) -> None:
    """Log an exception with structured context at ERROR level.

    Calls :meth:`logging.Logger.exception` so the full traceback is
    captured, then appends any context key-value pairs to the message.

    Args:
        logger: The logger to write to (typically from :func:`get_logger`).
        error: The exception instance that was caught.
        context: Optional mapping of key-value pairs that describe the
            execution context at the time of the error (e.g. session ID,
            agent ID, phase).
    """
    if context:
        pairs = " ".join(f"{k}={v!r}" for k, v in context.items())
        logger.exception("ERROR %s: %s context=[%s]", type(error).__name__, error, pairs)
    else:
        logger.exception("ERROR %s: %s", type(error).__name__, error)
