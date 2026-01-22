"""Tests for JSONL transcript parser."""

from pathlib import Path

from app.core.jsonl_parser import get_last_assistant_response, get_session_messages


class TestGetLastAssistantResponse:
    """Tests for get_last_assistant_response function."""

    def test_returns_last_text_response(self, sample_jsonl_file: Path) -> None:
        """Should return the last assistant text response."""
        result = get_last_assistant_response(sample_jsonl_file)
        assert result == "Final response with text"

    def test_nonexistent_file_returns_none(self, temp_dir: Path) -> None:
        """Nonexistent file should return None."""
        result = get_last_assistant_response(temp_dir / "nonexistent.jsonl")
        assert result is None

    def test_empty_file_returns_none(self, temp_dir: Path) -> None:
        """Empty file should return None."""
        empty_file = temp_dir / "empty.jsonl"
        empty_file.write_text("", encoding="utf-8")
        result = get_last_assistant_response(empty_file)
        assert result is None

    def test_no_assistant_messages_returns_none(self, temp_dir: Path) -> None:
        """File with no assistant messages should return None."""
        jsonl_path = temp_dir / "user_only.jsonl"
        jsonl_path.write_text(
            '{"type": "user", "message": {"role": "user", "content": "Hello"}}\n',
            encoding="utf-8",
        )
        result = get_last_assistant_response(jsonl_path)
        assert result is None

    def test_malformed_json_skipped(self, temp_dir: Path) -> None:
        """Malformed JSON lines should be skipped."""
        jsonl_path = temp_dir / "malformed.jsonl"
        lines = [
            '{"type": "assistant", "message": {"role": "assistant", '
            '"content": [{"type": "text", "text": "Good response"}]}}',
            "{not valid json}",
            '{"type": "assistant", "message": {"role": "assistant", '
            '"content": [{"type": "text", "text": "Last good response"}]}}',
        ]
        jsonl_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        result = get_last_assistant_response(jsonl_path)
        assert result == "Last good response"

    def test_tool_use_without_text_skipped(self, temp_dir: Path) -> None:
        """Assistant messages with only tool_use should not count as text response."""
        jsonl_path = temp_dir / "tool_only.jsonl"
        lines = [
            '{"type": "assistant", "message": {"role": "assistant", '
            '"content": [{"type": "text", "text": "Text response"}]}}',
            '{"type": "assistant", "message": {"role": "assistant", '
            '"content": [{"type": "tool_use", "name": "Read"}]}}',
        ]
        jsonl_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        result = get_last_assistant_response(jsonl_path)
        assert result == "Text response"


class TestGetSessionMessages:
    """Tests for get_session_messages function."""

    def test_returns_all_assistant_messages(self, sample_jsonl_file: Path) -> None:
        """Should return all assistant text messages."""
        result = get_session_messages(sample_jsonl_file)
        # Should have 3 text messages (skips tool_use only)
        texts = [m["text"] for m in result]
        assert "First response" in texts
        assert "Second response" in texts
        assert "Final response with text" in texts

    def test_nonexistent_file_returns_empty(self, temp_dir: Path) -> None:
        """Nonexistent file should return empty list."""
        result = get_session_messages(temp_dir / "nonexistent.jsonl")
        assert result == []

    def test_empty_file_returns_empty(self, temp_dir: Path) -> None:
        """Empty file should return empty list."""
        empty_file = temp_dir / "empty.jsonl"
        empty_file.write_text("", encoding="utf-8")
        result = get_session_messages(empty_file)
        assert result == []

    def test_message_structure(self, sample_jsonl_file: Path) -> None:
        """Each message should have role and text keys."""
        result = get_session_messages(sample_jsonl_file)
        for msg in result:
            assert "role" in msg
            assert "text" in msg
            assert msg["role"] == "assistant"
