"""Agent Orchestrator (@composio/ao) adapter."""

from __future__ import annotations

import logging

import httpx

from app.services.adapters import ExternalSession

logger = logging.getLogger(__name__)

# Map AO statuses to our TaskStatus values
_AO_STATUS_MAP: dict[str, str] = {
    "spawning": "spawning",
    "working": "working",
    "ready": "working",
    "active": "working",
    "idle": "working",
    "pr_open": "pr_open",
    "pr-open": "pr_open",
    "review": "review_pending",
    "approved": "approved",
    "merged": "merged",
    "done": "done",
    "killed": "done",
    "exited": "done",
    "error": "error",
    "failed": "error",
}


class AOAdapter:
    """Adapter for Agent Orchestrator HTTP API."""

    adapter_type = "ao"

    def __init__(self, ao_url: str) -> None:
        self.ao_url = ao_url.rstrip("/")
        self.connected = False

    async def connect(self) -> bool:
        """Probe AO connectivity by hitting GET /api/sessions."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.ao_url}/api/sessions")
                resp.raise_for_status()
                self.connected = True
                logger.info(f"Connected to Agent Orchestrator at {self.ao_url}")
                return True
        except Exception as e:
            self.connected = False
            logger.warning(f"Failed to connect to AO at {self.ao_url}: {e}")
            return False

    async def spawn(self, project_id: str, issue: str) -> ExternalSession:
        """POST /api/spawn to dispatch a new task."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.ao_url}/api/spawn",
                json={"projectId": project_id, "issue": issue},
            )
            resp.raise_for_status()
            data = resp.json()
            # AO returns {"session": {...}}
            session_data = data.get("session", data) if isinstance(data, dict) else data
            return self._to_external_session(session_data)

    async def poll(self) -> list[ExternalSession]:
        """GET /api/sessions and convert to ExternalSession list."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.ao_url}/api/sessions")
            resp.raise_for_status()
            data = resp.json()
            # AO returns {"sessions": [...], ...} not a bare array
            sessions = data.get("sessions", []) if isinstance(data, dict) else data
            return [self._to_external_session(s) for s in sessions]

    async def get_projects(self) -> list[dict]:
        """GET /api/projects from AO."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.ao_url}/api/projects")
            resp.raise_for_status()
            data = resp.json()
            return data.get("projects", []) if isinstance(data, dict) else data

    @staticmethod
    def _to_external_session(data: dict) -> ExternalSession:
        """Convert AO session JSON to ExternalSession."""
        pr = data.get("pr") or {}
        metadata = data.get("metadata") or {}
        # AO uses projectId, issueId, metadata.worktree
        return ExternalSession(
            session_id=data["id"],
            project_id=data.get("projectId") or data.get("project", ""),
            worktree_path=metadata.get("worktree") or data.get("worktreePath"),
            issue=data.get("issueId") or data.get("issue"),
            status=_AO_STATUS_MAP.get(data.get("status", ""), "working"),
            pr_url=pr.get("url"),
            pr_number=pr.get("number"),
            ci_status=pr.get("ciStatus"),
            review_status=pr.get("reviewStatus"),
        )
