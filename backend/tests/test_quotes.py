"""Tests for quotes module."""

from app.core.quotes import (
    JOB_COMPLETION_QUOTES,
    WORK_ACCEPTANCE_QUOTES,
    get_random_job_completion_quote,
    get_random_work_acceptance_quote,
)


class TestWorkAcceptanceQuotes:
    """Tests for work acceptance quotes."""

    def test_quotes_list_not_empty(self) -> None:
        """Work acceptance quotes list should not be empty."""
        assert len(WORK_ACCEPTANCE_QUOTES) > 0

    def test_get_random_returns_from_list(self) -> None:
        """Random quote should be from the quotes list."""
        quote = get_random_work_acceptance_quote()
        assert quote in WORK_ACCEPTANCE_QUOTES

    def test_quotes_are_strings(self) -> None:
        """All quotes should be non-empty strings."""
        for quote in WORK_ACCEPTANCE_QUOTES:
            assert isinstance(quote, str)
            assert len(quote) > 0

    def test_randomness_multiple_calls(self) -> None:
        """Multiple calls should eventually return different quotes."""
        quotes = {get_random_work_acceptance_quote() for _ in range(50)}
        # With 100+ quotes and 50 calls, we should get at least a few unique ones
        assert len(quotes) > 1


class TestJobCompletionQuotes:
    """Tests for job completion quotes."""

    def test_quotes_list_not_empty(self) -> None:
        """Job completion quotes list should not be empty."""
        assert len(JOB_COMPLETION_QUOTES) > 0

    def test_get_random_returns_from_list(self) -> None:
        """Random quote should be from the quotes list."""
        quote = get_random_job_completion_quote()
        assert quote in JOB_COMPLETION_QUOTES

    def test_quotes_are_strings(self) -> None:
        """All quotes should be non-empty strings."""
        for quote in JOB_COMPLETION_QUOTES:
            assert isinstance(quote, str)
            assert len(quote) > 0

    def test_randomness_multiple_calls(self) -> None:
        """Multiple calls should eventually return different quotes."""
        quotes = {get_random_job_completion_quote() for _ in range(50)}
        # With 100+ quotes and 50 calls, we should get at least a few unique ones
        assert len(quotes) > 1
