"""Path compression utilities for UI display."""

from pathlib import Path

DEFAULT_PATH_MAX_LEN = 35
DEFAULT_WORD_MAX_LEN = 30


def compress_path(path: str, max_len: int = DEFAULT_PATH_MAX_LEN) -> str:
    """Compress a file path by replacing home with ~ and truncating from the start."""
    if not path:
        return ""

    # Replace home directory with ~
    home = str(Path.home())
    if path.startswith(home):
        path = "~" + path[len(home) :]

    # If short enough, return as-is
    if len(path) <= max_len:
        return path

    # Truncate from the beginning, preserving filename
    return "..." + path[-(max_len - 3) :]


def compress_paths_in_text(text: str) -> str:
    """Replace home directory paths with ~ throughout the text."""
    if not text:
        return ""
    home = str(Path.home())
    return text.replace(home, "~")


def truncate_long_words(text: str | None, max_len: int = DEFAULT_WORD_MAX_LEN) -> str:
    """Truncate individual words that exceed the maximum length."""
    if not text:
        return ""
    words = text.split()
    truncated_words: list[str] = []
    for word in words:
        if len(word) > max_len:
            truncated_words.append(word[: max_len - 3] + "...")
        else:
            truncated_words.append(word)
    return " ".join(truncated_words)
