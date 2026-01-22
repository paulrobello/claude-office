"""Git status models for tracking repository state."""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class FileStatus(StrEnum):
    """Git file status codes."""

    MODIFIED = "M"
    ADDED = "A"
    DELETED = "D"
    RENAMED = "R"
    COPIED = "C"
    UNTRACKED = "?"
    IGNORED = "!"


class ChangedFile(BaseModel):
    """A file with changes in the working tree or index."""

    path: str
    status: FileStatus
    staged: bool = False


class Commit(BaseModel):
    """A git commit summary."""

    hash: str = Field(..., description="Short commit hash (7 chars)")
    message: str = Field(..., description="First line of commit message")
    author: str
    timestamp: datetime
    relative_time: str = Field(
        ..., description="Human-readable relative time (e.g., '2 hours ago')"
    )


def _default_changed_files() -> list[ChangedFile]:
    return []


def _default_commits() -> list[Commit]:
    return []


class GitStatus(BaseModel):
    """Current git repository status."""

    branch: str = Field(..., description="Current branch name")
    ahead: int = Field(0, description="Commits ahead of remote")
    behind: int = Field(0, description="Commits behind remote")
    changed_files: list[ChangedFile] = Field(default_factory=_default_changed_files)
    commits: list[Commit] = Field(default_factory=_default_commits, description="Last 10 commits")
    last_updated: datetime = Field(default_factory=lambda: datetime.now(UTC))
    repo_path: str = Field(..., description="Path to the repository")
