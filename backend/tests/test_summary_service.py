"""Tests for summary service fallback methods.

These tests focus on the non-AI fallback methods that can be tested without mocking.
"""

# pyright: reportPrivateUsage=false

import pytest

from app.core.summary_service import SummaryService


@pytest.fixture
def service() -> SummaryService:
    """Create a summary service instance with AI disabled."""
    # Service will be disabled since no CLAUDE_CODE_OAUTH_TOKEN is set
    return SummaryService()


class TestExtractFirstSentence:
    """Tests for _extract_first_sentence method."""

    def test_empty_text_returns_empty(self, service: SummaryService) -> None:
        """Empty text should return empty string."""
        assert service._extract_first_sentence("") == ""

    def test_single_sentence_returned(self, service: SummaryService) -> None:
        """Single sentence should be returned with punctuation."""
        text = "This is a test sentence."
        assert service._extract_first_sentence(text) == "This is a test sentence."

    def test_first_sentence_extracted(self, service: SummaryService) -> None:
        """First sentence should be extracted from multi-sentence text."""
        text = "First sentence here. Second sentence follows. Third too."
        assert service._extract_first_sentence(text) == "First sentence here."

    def test_long_sentence_truncated(self, service: SummaryService) -> None:
        """Long sentences should be truncated."""
        text = "This is a very " + "long " * 50 + "sentence."
        result = service._extract_first_sentence(text, max_len=50)
        assert len(result) <= 50
        assert result.endswith("...")

    def test_exclamation_as_sentence_end(self, service: SummaryService) -> None:
        """Exclamation mark should end a sentence."""
        text = "Hello there! More text follows."
        assert service._extract_first_sentence(text) == "Hello there!"

    def test_question_as_sentence_end(self, service: SummaryService) -> None:
        """Question mark should end a sentence."""
        text = "What is this? Here is the answer."
        assert service._extract_first_sentence(text) == "What is this?"

    def test_min_sentence_length(self, service: SummaryService) -> None:
        """Very short sentences (< 10 chars) should not be cut off."""
        text = "Hi. This is the actual first real sentence."
        # "Hi." is only 3 chars, so it should continue to find a proper sentence
        result = service._extract_first_sentence(text)
        # Should include more than just "Hi."
        assert len(result) > 10 or result == text[:50]


class TestGetToolFallback:
    """Tests for _get_tool_fallback method."""

    def test_empty_input_returns_tool_name(self, service: SummaryService) -> None:
        """Empty input should return just the tool name."""
        assert service._get_tool_fallback("Read", None) == "Read"
        assert service._get_tool_fallback("Write", {}) == "Write"

    def test_read_tool_returns_path(self, service: SummaryService) -> None:
        """Read tool should return compressed file path."""
        result = service._get_tool_fallback("Read", {"file_path": "/tmp/test.txt"})
        assert "test.txt" in result

    def test_glob_tool_returns_pattern(self, service: SummaryService) -> None:
        """Glob tool should return pattern."""
        result = service._get_tool_fallback("Glob", {"pattern": "**/*.py"})
        assert "**/*.py" in result

    def test_bash_tool_returns_command(self, service: SummaryService) -> None:
        """Bash tool should return first line of command."""
        result = service._get_tool_fallback("Bash", {"command": "ls -la\necho done"})
        assert result == "ls -la"

    def test_bash_long_command_truncated(self, service: SummaryService) -> None:
        """Long bash commands should be truncated."""
        long_cmd = "a" * 100
        result = service._get_tool_fallback("Bash", {"command": long_cmd})
        assert len(result) <= 40
        assert result.endswith("...")

    def test_task_tool_returns_description(self, service: SummaryService) -> None:
        """Task tool should return task description."""
        result = service._get_tool_fallback(
            "Task", {"prompt": "Run the tests and verify everything works correctly."}
        )
        assert "Run the tests" in result

    def test_websearch_returns_query(self, service: SummaryService) -> None:
        """WebSearch should return search query."""
        result = service._get_tool_fallback("WebSearch", {"query": "python asyncio"})
        assert result == "Search: python asyncio"

    def test_webfetch_returns_domain(self, service: SummaryService) -> None:
        """WebFetch should return domain name."""
        result = service._get_tool_fallback(
            "WebFetch", {"url": "https://docs.python.org/3/library/asyncio.html"}
        )
        assert result == "Fetch: docs.python.org"


class TestGenerateAgentNameFallback:
    """Tests for generate_agent_name_fallback method."""

    def test_empty_description_returns_intern(self, service: SummaryService) -> None:
        """Empty description should return 'The Intern'."""
        assert service.generate_agent_name_fallback("") == "The Intern"

    def test_test_task_gets_test_name(self, service: SummaryService) -> None:
        """Test-related tasks should get test-themed names."""
        result = service.generate_agent_name_fallback("Run the test suite")
        assert result in ["Test Pilot", "Dr. Test", "QA Queen", "Bug Buster", "Test Dummy"]

    def test_review_task_gets_review_name(self, service: SummaryService) -> None:
        """Review/QA tasks should get judge-themed names."""
        result = service.generate_agent_name_fallback("Review the pull request")
        assert result in ["Judge Judy", "The Critic", "Hawkeye", "Inspector G", "The Auditor"]

    def test_clean_task_gets_cleaner_name(self, service: SummaryService) -> None:
        """Cleaning tasks should get cleaner-themed names."""
        result = service.generate_agent_name_fallback("Clean up the code")
        assert result in ["The Cleaner", "Mr. Clean", "Tidy Bot", "Neat Freak"]

    def test_debug_task_gets_debug_name(self, service: SummaryService) -> None:
        """Debug tasks should get detective-themed names."""
        result = service.generate_agent_name_fallback("Debug the authentication issue")
        assert result in ["Bug Hunter", "Dr. Debug", "Sherlock", "The Debugger"]

    def test_fix_task_gets_fixer_name(self, service: SummaryService) -> None:
        """Fix tasks should get fixer-themed names."""
        result = service.generate_agent_name_fallback("Fix the broken authentication")
        assert result in ["The Fixer", "Patch Adams", "Mr. Fixit", "Bug Squasher"]

    def test_doc_task_gets_writer_name(self, service: SummaryService) -> None:
        """Documentation tasks should get writer-themed names."""
        result = service.generate_agent_name_fallback("Update the documentation")
        assert result in ["The Scribe", "Doc Brown", "Word Wizard", "Note Taker"]

    def test_format_task_gets_style_name(self, service: SummaryService) -> None:
        """Formatting tasks should get style-themed names."""
        result = service.generate_agent_name_fallback("Format the code with prettier")
        assert result in ["Style Guru", "Format King", "Lint Lord", "Pretty Boy"]

    def test_research_task_gets_scout_name(self, service: SummaryService) -> None:
        """Research tasks should get explorer-themed names."""
        result = service.generate_agent_name_fallback("Research the best approach")
        assert result in ["The Scout", "Explorer X", "Data Digger", "Researcher R"]

    def test_unknown_task_gets_generic_name(self, service: SummaryService) -> None:
        """Unknown tasks should get a generic fun name."""
        result = service.generate_agent_name_fallback("Do something random")
        generic_names = [
            "Code Cadet",
            "Bit Buddy",
            "Logic Larry",
            "Algo Al",
            "Helper Bot",
            "Task Force",
            "Agent X",
            "The Intern",
            "Worker Bee",
            "Minion",
        ]
        assert result in generic_names

    def test_name_is_not_empty(self, service: SummaryService) -> None:
        """Names should never be empty."""
        result = service.generate_agent_name_fallback("   ")
        assert result == "The Intern"


class TestDetectReportRequestFallback:
    """Tests for detect_report_request keyword fallback."""

    @pytest.mark.asyncio
    async def test_empty_prompt_returns_false(self, service: SummaryService) -> None:
        """Empty prompt should return False."""
        assert await service.detect_report_request("") is False

    @pytest.mark.asyncio
    async def test_report_keyword_detected(self, service: SummaryService) -> None:
        """Report-related keywords should be detected."""
        assert await service.detect_report_request("Create a report") is True
        assert await service.detect_report_request("Update the readme") is True
        assert await service.detect_report_request("Write documentation") is True

    @pytest.mark.asyncio
    async def test_md_file_pattern_detected(self, service: SummaryService) -> None:
        """Patterns like 'create X.md' should be detected."""
        assert await service.detect_report_request("Create README.md") is True
        assert await service.detect_report_request("Update the ARCHITECTURE.md") is True
        assert await service.detect_report_request("Write CHANGELOG.md") is True

    @pytest.mark.asyncio
    async def test_non_report_returns_false(self, service: SummaryService) -> None:
        """Non-report requests should return False."""
        assert await service.detect_report_request("Fix the bug") is False
        assert await service.detect_report_request("Add unit tests") is False
        assert await service.detect_report_request("Refactor the code") is False

    @pytest.mark.asyncio
    async def test_case_insensitive(self, service: SummaryService) -> None:
        """Detection should be case-insensitive."""
        assert await service.detect_report_request("CREATE A REPORT") is True
        assert await service.detect_report_request("Write a README") is True


class TestSummarizeUserPrompt:
    """Tests for summarize_user_prompt method."""

    @pytest.mark.asyncio
    async def test_empty_prompt_returns_empty(self, service: SummaryService) -> None:
        """Empty prompt should return empty string."""
        assert await service.summarize_user_prompt("") == ""

    @pytest.mark.asyncio
    async def test_short_prompt_returned_as_is(self, service: SummaryService) -> None:
        """Short single-sentence prompts should be returned as-is."""
        prompt = "Fix the login bug."
        result = await service.summarize_user_prompt(prompt)
        assert result == prompt

    @pytest.mark.asyncio
    async def test_newlines_normalized(self, service: SummaryService) -> None:
        """Newlines should be collapsed to spaces."""
        prompt = "First line\nSecond line\r\nThird line"
        result = await service.summarize_user_prompt(prompt)
        assert "\n" not in result
        assert "\r" not in result

    @pytest.mark.asyncio
    async def test_whitespace_collapsed(self, service: SummaryService) -> None:
        """Multiple whitespace should be collapsed."""
        prompt = "Too    many     spaces"
        result = await service.summarize_user_prompt(prompt)
        assert "  " not in result
