"""REST API endpoints for multi-project management."""

from fastapi import APIRouter, HTTPException

from app.core.event_processor import event_processor

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
async def list_projects():
    """List all active projects with session counts."""
    projects = event_processor.project_registry.get_all_projects()
    return [
        {
            "key": p.key,
            "name": p.name,
            "color": p.color,
            "root": p.root,
            "session_count": len(p.session_ids),
        }
        for p in projects
    ]


@router.get("/{key}")
async def get_project(key: str):
    """Get a single project's details."""
    project = event_processor.project_registry.get_project(key)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "key": project.key,
        "name": project.name,
        "color": project.color,
        "root": project.root,
        "session_ids": project.session_ids,
        "session_count": len(project.session_ids),
    }


@router.get("/{key}/sessions")
async def get_project_sessions(key: str):
    """Get all sessions for a project."""
    project = event_processor.project_registry.get_project(key)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project_key": key, "session_ids": project.session_ids}
