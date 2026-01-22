"""Pytest fixtures for backend tests."""

import asyncio
import tempfile
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db.database import Base, get_db, override_engine


@pytest.fixture(scope="session", autouse=True)
def setup_test_database() -> Iterator[None]:
    """Set up an in-memory SQLite database for all tests.

    This fixture runs automatically for all tests and ensures that
    test sessions don't pollute the production database.
    """
    # Create in-memory SQLite engine for tests
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )

    # Override the global engine
    override_engine(test_engine)

    # Create all tables using a new event loop
    async def create_tables() -> None:
        # Import models to register them with Base
        import app.db.models  # noqa: F401  # pyright: ignore[reportUnusedImport]

        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(create_tables())

    yield

    # Cleanup
    async def drop_tables() -> None:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await test_engine.dispose()

    asyncio.run(drop_tables())


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Provide a database session for tests that need direct DB access."""
    async for session in get_db():
        yield session


@pytest.fixture
def temp_dir() -> Iterator[Path]:
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def sample_jsonl_content() -> str:
    """Sample JSONL content for testing transcript parsing."""
    lines = [
        '{"type": "user", "message": {"role": "user", "content": "Hello"}}',
        '{"type": "assistant", "message": {"role": "assistant", '
        '"content": [{"type": "text", "text": "First response"}]}}',
        '{"type": "user", "message": {"role": "user", "content": "Another message"}}',
        '{"type": "assistant", "message": {"role": "assistant", '
        '"content": [{"type": "text", "text": "Second response"}]}}',
        '{"type": "assistant", "message": {"role": "assistant", '
        '"content": [{"type": "tool_use", "name": "Read"}]}}',
        '{"type": "assistant", "message": {"role": "assistant", '
        '"content": [{"type": "text", "text": "Final response with text"}]}}',
    ]
    return "\n".join(lines) + "\n"


@pytest.fixture
def sample_jsonl_file(temp_dir: Path, sample_jsonl_content: str) -> Path:
    """Create a sample JSONL file for testing."""
    jsonl_path = temp_dir / "test_transcript.jsonl"
    jsonl_path.write_text(sample_jsonl_content, encoding="utf-8")
    return jsonl_path
