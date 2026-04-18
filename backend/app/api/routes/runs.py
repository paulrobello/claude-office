import logging

from fastapi import APIRouter

from app.core.event_processor import event_processor
from app.models.runs import Run

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("", response_model=list[Run])
async def list_runs() -> list[Run]:
    """List all active (non-ended) Ralph runs."""
    return event_processor.get_run_aggregator().list_active()
