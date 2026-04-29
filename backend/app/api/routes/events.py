from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends

from app.core.event_processor import EventProcessor, get_event_processor
from app.models.events import Event

router = APIRouter()


@router.post("/events")
async def receive_event(
    event: Event,
    background_tasks: BackgroundTasks,
    ep: Annotated[EventProcessor, Depends(get_event_processor)],
) -> dict[str, str]:
    background_tasks.add_task(ep.process_event, event)
    return {
        "status": "accepted",
        "event_id": str(event.timestamp),
        "visual_action": "processing",  # Simplified
    }
