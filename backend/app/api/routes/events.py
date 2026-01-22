from fastapi import APIRouter, BackgroundTasks

from app.core.event_processor import event_processor
from app.models.events import Event

router = APIRouter()


@router.post("/events")
async def receive_event(event: Event, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(event_processor.process_event, event)
    return {
        "status": "accepted",
        "event_id": str(event.timestamp),
        "visual_action": "processing",  # Simplified
    }
