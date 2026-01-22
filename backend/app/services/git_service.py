"""Git status polling service."""

import asyncio
import contextlib
import logging
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from app.api.websocket import manager
from app.config import get_settings
from app.models.git import ChangedFile, Commit, FileStatus, GitStatus

logger = logging.getLogger(__name__)


class GitService:
    """Service that polls git status and broadcasts updates to WebSocket clients."""

    def __init__(self, session_id: str | None = None, project_root: str | None = None) -> None:
        """Initialize the GitService."""
        self._task: asyncio.Task[None] | None = None
        self._running = False
        self._last_status: GitStatus | None = None
        self._session_id = session_id
        self._project_root = project_root

    def _run_git(self, args: list[str], cwd: Path) -> str:
        """Run a git command and return stdout."""
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            logger.warning(f"Git command failed: {e}")
            return ""

    def _parse_status(self, output: str) -> list[ChangedFile]:
        """Parse git status --porcelain output into ChangedFile objects."""
        files: list[ChangedFile] = []
        for line in output.splitlines():
            if len(line) < 3:
                continue
            index_status = line[0]
            worktree_status = line[1]
            raw_path = line[3:]

            path = raw_path.replace("\\", "/").rstrip("/")

            if not path:
                continue

            if index_status != " " and index_status != "?":
                # Staged change
                status_char = index_status
                staged = True
            else:
                # Unstaged or untracked
                status_char = worktree_status
                staged = False

            try:
                status = FileStatus(status_char)
            except ValueError:
                status = FileStatus.MODIFIED

            files.append(ChangedFile(path=path, status=status, staged=staged))
        return files

    def _parse_log(self, output: str) -> list[Commit]:
        """Parse git log output into Commit objects."""
        commits: list[Commit] = []
        for line in output.splitlines():
            if not line:
                continue
            parts = line.split("|", 4)
            if len(parts) < 5:
                continue
            hash_short, author, timestamp_str, relative, message = parts
            try:
                timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            except ValueError:
                timestamp = datetime.now(UTC)
            commits.append(
                Commit(
                    hash=hash_short,
                    author=author,
                    timestamp=timestamp,
                    relative_time=relative,
                    message=message,
                )
            )
        return commits

    def _get_branch_info(self, cwd: Path) -> tuple[str, int, int]:
        """Get current branch and ahead/behind counts."""
        branch = self._run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd) or "unknown"

        # Get ahead/behind
        ahead, behind = 0, 0
        upstream = self._run_git(["rev-parse", "--abbrev-ref", "@{u}"], cwd)
        if upstream:
            counts = self._run_git(
                ["rev-list", "--left-right", "--count", f"{upstream}...HEAD"], cwd
            )
            if counts:
                parts = counts.split()
                if len(parts) == 2:
                    behind, ahead = int(parts[0]), int(parts[1])

        return branch, ahead, behind

    def get_status(self, repo_path: str | Path | None = None) -> GitStatus | None:
        """Get current git status synchronously."""
        path_str = repo_path or self._project_root
        if not path_str:
            logger.debug("No git repository path configured")
            return None

        git_path = Path(path_str)

        if not git_path.exists() or not (git_path / ".git").exists():
            logger.debug(f"Not a git repository: {git_path}")
            return None

        repo_path = git_path

        # Get branch info
        branch, ahead, behind = self._get_branch_info(repo_path)

        # Get changed files
        status_output = self._run_git(["status", "--porcelain"], repo_path)
        changed_files = self._parse_status(status_output)

        # Get last 10 commits
        log_output = self._run_git(
            [
                "log",
                "-10",
                "--format=%h|%an|%aI|%ar|%s",
            ],
            repo_path,
        )
        commits = self._parse_log(log_output)

        return GitStatus(
            branch=branch,
            ahead=ahead,
            behind=behind,
            changed_files=changed_files,
            commits=commits,
            last_updated=datetime.now(UTC),
            repo_path=str(repo_path),
        )

    async def _poll_loop(self) -> None:
        """Background loop that polls git status at regular intervals."""
        settings = get_settings()
        interval = settings.GIT_POLL_INTERVAL

        while self._running:
            try:
                loop = asyncio.get_event_loop()
                status = await loop.run_in_executor(None, self.get_status)

                if status and self._status_changed(status):
                    self._last_status = status
                    await self._broadcast_status(status)

            except Exception as e:
                logger.error(f"Git poll error: {e}")

            await asyncio.sleep(interval)

    def _status_changed(self, new_status: GitStatus) -> bool:
        """Check if git status has meaningfully changed from last known state."""
        if self._last_status is None:
            return True

        # Compare key fields
        if new_status.branch != self._last_status.branch:
            return True
        if new_status.ahead != self._last_status.ahead:
            return True
        if new_status.behind != self._last_status.behind:
            return True
        if len(new_status.changed_files) != len(self._last_status.changed_files):
            return True
        if len(new_status.commits) != len(self._last_status.commits):
            return True

        new_hashes = [c.hash for c in new_status.commits]
        old_hashes = [c.hash for c in self._last_status.commits]
        if new_hashes != old_hashes:
            return True

        new_paths = {f.path for f in new_status.changed_files}
        old_paths = {f.path for f in self._last_status.changed_files}
        return new_paths != old_paths

    async def _broadcast_status(self, status: GitStatus) -> None:
        """Broadcast git status to WebSocket clients."""
        message = {
            "type": "git_status",
            "timestamp": status.last_updated.isoformat(),
            "gitStatus": status.model_dump(mode="json"),
        }
        if self._session_id:
            await manager.broadcast(message, self._session_id)
            logger.debug(
                f"Broadcast git status to session {self._session_id}: "
                f"{status.branch}, {len(status.commits)} commits"
            )
        else:
            await manager.broadcast_all(message)
            logger.debug(f"Broadcast git status: {status.branch}, {len(status.commits)} commits")

    def configure(self, session_id: str | None = None, project_root: str | None = None) -> None:
        """Update the service configuration for a specific session and project."""
        self._session_id = session_id
        self._project_root = project_root
        self._last_status = None  # Reset to force fresh broadcast
        logger.info(f"GitService configured: session={session_id}, project_root={project_root}")

    def clear(self) -> None:
        """Clear all cached state to prevent stale data."""
        self._session_id = None
        self._project_root = None
        self._last_status = None
        logger.info("GitService cache cleared")

    def start(self) -> None:
        """Start the polling background task."""
        if self._task is not None:
            return

        if not self._project_root:
            logger.warning(
                "GitService started without project_root - git status will be unavailable"
            )

        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info(f"Git status polling started for: {self._project_root or 'no repo configured'}")

    async def stop(self) -> None:
        """Stop the polling background task."""
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        logger.info("Git status polling stopped")


git_service = GitService()
