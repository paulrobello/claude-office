"""Tests for path compression utilities."""

from pathlib import Path
from unittest.mock import patch

from app.core.path_utils import (
    DEFAULT_PATH_MAX_LEN,
    compress_path,
    compress_paths_in_text,
    truncate_long_words,
)


class TestCompressPath:
    """Tests for compress_path function."""

    def test_empty_path_returns_empty(self) -> None:
        """Empty path should return empty string."""
        assert compress_path("") == ""

    def test_short_path_unchanged(self) -> None:
        """Short paths should be returned as-is after home replacement."""
        with patch.object(Path, "home", return_value=Path("/home/user")):
            result = compress_path("/tmp/short.txt")
            assert result == "/tmp/short.txt"

    def test_home_directory_replaced_with_tilde(self) -> None:
        """Home directory should be replaced with ~."""
        with patch.object(Path, "home", return_value=Path("/home/user")):
            result = compress_path("/home/user/projects/file.txt")
            assert result == "~/projects/file.txt"

    def test_long_path_truncated_from_beginning(self) -> None:
        """Long paths should be truncated from the beginning."""
        long_path = "/very/long/path/to/some/deeply/nested/directory/file.txt"
        result = compress_path(long_path, max_len=25)
        assert result.startswith("...")
        assert result.endswith("file.txt")
        assert len(result) <= 25

    def test_path_exactly_at_max_length(self) -> None:
        """Path exactly at max length should not be truncated."""
        path = "x" * DEFAULT_PATH_MAX_LEN
        result = compress_path(path)
        assert result == path

    def test_custom_max_length(self) -> None:
        """Custom max_len should be respected."""
        path = "/a/very/long/path/to/file.txt"
        result = compress_path(path, max_len=20)
        assert len(result) <= 20


class TestCompressPathsInText:
    """Tests for compress_paths_in_text function."""

    def test_empty_text_returns_empty(self) -> None:
        """Empty text should return empty string."""
        assert compress_paths_in_text("") == ""

    def test_none_returns_empty(self) -> None:
        """None should return empty string."""
        assert compress_paths_in_text(None) == ""  # type: ignore[arg-type]

    def test_text_without_paths_unchanged(self) -> None:
        """Text without home paths should be unchanged."""
        text = "This is some regular text without paths"
        assert compress_paths_in_text(text) == text

    def test_home_path_replaced_in_text(self) -> None:
        """Home directory paths in text should be replaced with ~."""
        with patch.object(Path, "home", return_value=Path("/home/user")):
            text = "Reading file /home/user/projects/test.py"
            result = compress_paths_in_text(text)
            assert result == "Reading file ~/projects/test.py"

    def test_multiple_home_paths_replaced(self) -> None:
        """Multiple home paths should all be replaced."""
        with patch.object(Path, "home", return_value=Path("/home/user")):
            text = "Copying /home/user/a.txt to /home/user/b.txt"
            result = compress_paths_in_text(text)
            assert result == "Copying ~/a.txt to ~/b.txt"


class TestTruncateLongWords:
    """Tests for truncate_long_words function."""

    def test_empty_text_returns_empty(self) -> None:
        """Empty text should return empty string."""
        assert truncate_long_words("") == ""

    def test_none_returns_empty(self) -> None:
        """None should return empty string."""
        assert truncate_long_words(None) == ""

    def test_short_words_unchanged(self) -> None:
        """Short words should not be modified."""
        text = "short words only"
        assert truncate_long_words(text) == text

    def test_long_word_truncated(self) -> None:
        """Long words should be truncated with ellipsis."""
        long_word = "a" * 40
        result = truncate_long_words(long_word, max_len=20)
        assert len(result) == 20
        assert result.endswith("...")

    def test_mixed_words_only_long_truncated(self) -> None:
        """Only long words should be truncated in mixed text."""
        text = "short " + "x" * 40 + " more"
        result = truncate_long_words(text, max_len=20)
        words = result.split()
        assert words[0] == "short"
        assert words[1].endswith("...")
        assert len(words[1]) == 20
        assert words[2] == "more"

    def test_custom_max_length(self) -> None:
        """Custom max_len should be respected per word."""
        word = "a" * 15
        result = truncate_long_words(word, max_len=10)
        assert len(result) == 10
        assert result.endswith("...")
