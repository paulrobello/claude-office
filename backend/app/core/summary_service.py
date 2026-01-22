"""AI-powered summary generation using Claude Haiku."""

import json
import logging
import re
from typing import Any

from app.config import get_settings
from app.core.path_utils import compress_path, compress_paths_in_text

logger = logging.getLogger(__name__)


class SummaryService:
    """Service for generating AI-powered summaries using Claude Haiku."""

    def __init__(self) -> None:
        """Initialize the summary service with OAuth token if available."""
        settings = get_settings()
        self.enabled = bool(settings.CLAUDE_CODE_OAUTH_TOKEN) and settings.SUMMARY_ENABLED
        self.client: Any | None = None
        self.model = settings.SUMMARY_MODEL

        if self.enabled:
            try:
                from anthropic import AsyncAnthropic

                self.client = AsyncAnthropic(auth_token=settings.CLAUDE_CODE_OAUTH_TOKEN)
                logger.info("=" * 50)
                logger.info("AI SUMMARIES ENABLED")
                logger.info(f"  Model: {self.model}")
                logger.info(f"  Max tokens: {settings.SUMMARY_MAX_TOKENS}")
                logger.info("=" * 50)
            except ImportError:
                logger.warning("anthropic package not installed - summaries disabled")
                self.enabled = False
        else:
            if not settings.SUMMARY_ENABLED:
                logger.info("Summary service disabled via SUMMARY_ENABLED=False")
            else:
                logger.info("CLAUDE_CODE_OAUTH_TOKEN not set - using fallback summaries")

    async def summarize_tool_call(self, tool_name: str, tool_input: dict[str, Any] | None) -> str:
        """Generate a short summary of what a tool call does."""
        fallback = self._get_tool_fallback(tool_name, tool_input)

        if not self.enabled or not self.client:
            return fallback

        input_str = json.dumps(tool_input or {}, indent=2)[:500]

        result = await self._call_with_retry(
            f"In 10 words or less, what does this {tool_name} tool call do?\n{input_str}"
        )
        return result or fallback

    async def summarize_agent_task(self, task_description: str) -> str:
        """Generate a short summary of a subagent's task."""
        fallback = self._extract_first_sentence(task_description, max_len=50)

        if not self.enabled or not self.client:
            return fallback

        desc = task_description[:1000] if len(task_description) > 1000 else task_description

        result = await self._call_with_retry(f"In 10 words or less, summarize this task:\n{desc}")
        return result or fallback

    async def summarize_user_prompt(self, prompt: str) -> str:
        """Generate a summary of the user's prompt for marquee display."""
        if not prompt:
            return ""

        # Normalize newlines and collapse to single line
        prompt_stripped = " ".join(prompt.split())
        is_short = len(prompt_stripped) <= 120
        has_single_sentence = prompt_stripped.count(".") <= 1

        if is_short and has_single_sentence:
            return prompt_stripped

        fallback = self._extract_first_sentence(prompt, max_len=150)

        if not self.enabled or not self.client:
            return fallback

        desc = prompt[:1500] if len(prompt) > 1500 else prompt

        result = await self._call_with_retry(
            f"In one sentence, summarize what this request asks for:\n{desc}"
        )
        if result:
            return " ".join(result.split())
        return fallback

    async def generate_agent_name(self, description: str) -> str:
        """Generate a fun, creative nickname for an agent based on its task."""
        fallback = self.generate_agent_name_fallback(description)

        if not self.enabled or not self.client:
            return fallback

        desc = description[:500] if len(description) > 500 else description

        result = await self._call_with_retry(
            "Create a 1-3 word nickname that DIRECTLY relates to the task below. "
            "Extract the KEY ACTION or SUBJECT from the task and build the name around it. "
            "Examples: 'migrate YAML config' → YAML Yoda or Config King; "
            "'write unit tests' → Test Pilot; 'fix database queries' → Query Queen; "
            "'update documentation' → Doc Holiday; 'debug auth issue' → Bug Bounty. "
            "The name MUST reference the main subject (YAML, tests, database, docs, etc). "
            "Use puns, pop culture, or alliteration. Max 15 chars. "
            f"Task: {desc}\nNickname:"
        )
        if result:
            clean = re.sub(r'["\'\-:.,!?()]', " ", result.strip())
            clean = re.sub(r"\s+", " ", clean).strip()
            words = [w for w in clean.split() if w and len(w) > 1]

            if len(words) > 3 or len(clean) > 20:
                return fallback

            name = " ".join(words[:3])

            if len(name) > 15:
                name = " ".join(words[:2]) if len(words) > 1 else words[0][:15]

            return name if name else fallback
        return fallback

    def generate_agent_name_fallback(self, description: str) -> str:
        """Generate a fun, creative agent name based on task type."""
        import random

        if not description or not description.strip():
            return "The Intern"

        desc_lower = description.strip().lower()

        # Fun name mappings by task category - each has multiple options for variety
        task_names: dict[tuple[str, ...], list[str]] = {
            # QA / Review / Validation
            ("review", "audit", "inspect", "qa", "quality"): [
                "Judge Judy",
                "The Critic",
                "Hawkeye",
                "Inspector G",
                "The Auditor",
            ],
            ("test", "spec", "assert", "expect"): [
                "Test Pilot",
                "Dr. Test",
                "QA Queen",
                "Bug Buster",
                "Test Dummy",
            ],
            ("validate", "verify", "check", "ensure"): [
                "The Checker",
                "Validator V",
                "Fact Checker",
                "Truth Seeker",
            ],
            # Cleaning / Formatting / Refactoring
            ("clean", "cleanup", "tidy", "organize"): [
                "The Cleaner",
                "Mr. Clean",
                "Tidy Bot",
                "Neat Freak",
            ],
            ("format", "prettier", "lint", "style"): [
                "Style Guru",
                "Format King",
                "Lint Lord",
                "Pretty Boy",
            ],
            ("refactor", "restructure", "reorganize"): [
                "The Architect",
                "Refactor Rex",
                "Code Ninja",
                "Dr. Refactor",
            ],
            # Debugging / Fixing
            ("debug", "diagnose", "troubleshoot"): [
                "Bug Hunter",
                "Dr. Debug",
                "Sherlock",
                "The Debugger",
            ],
            ("fix", "repair", "patch", "resolve"): [
                "The Fixer",
                "Patch Adams",
                "Mr. Fixit",
                "Bug Squasher",
            ],
            # Documentation / Writing
            ("doc", "document", "readme", "comment"): [
                "The Scribe",
                "Doc Brown",
                "Word Wizard",
                "Note Taker",
            ],
            ("write", "create", "draft", "compose"): [
                "The Writer",
                "Wordsmith",
                "Pen Pal",
                "Script Kid",
            ],
            # Research / Exploration
            ("research", "investigate", "explore", "analyze"): [
                "The Scout",
                "Explorer X",
                "Data Digger",
                "Researcher R",
            ],
            ("search", "find", "locate", "discover"): [
                "The Seeker",
                "Finder Fred",
                "Search Bot",
                "Tracker T",
            ],
            # Building / Implementation
            ("build", "implement", "create", "develop"): [
                "The Builder",
                "Code Monkey",
                "Dev Dawg",
                "Maker Mike",
            ],
            ("setup", "configure", "install", "init"): [
                "Setup Sam",
                "Config Kid",
                "Init Ian",
                "Boot Boss",
            ],
            # Type checking / Static analysis
            ("type", "typecheck", "typing", "pyright", "mypy"): [
                "Type Tyrant",
                "Type Cop",
                "Type Ninja",
                "Mr. Strict",
            ],
            # Migration / Upgrade
            ("migrate", "upgrade", "update", "convert"): [
                "The Migrator",
                "Upgrade Ulysses",
                "Version Vic",
                "Update Ursula",
            ],
            # Performance / Optimization
            ("optimize", "performance", "speed", "fast"): [
                "Speed Demon",
                "Turbo T",
                "Optimizer O",
                "Fast Freddy",
            ],
            # Security
            ("security", "secure", "vulnerability", "auth"): [
                "Security Sam",
                "Guard Dog",
                "Sec Spec",
                "Lock Smith",
            ],
            # Database
            ("database", "sql", "query", "migration"): [
                "Data Dan",
                "SQL Sally",
                "Query Queen",
                "DB Dude",
            ],
            # API / Backend
            ("api", "endpoint", "route", "backend"): [
                "API Andy",
                "Route Runner",
                "Backend Bob",
                "Endpoint Ed",
            ],
            # Frontend / UI
            ("frontend", "ui", "component", "react", "css"): [
                "UI Ursula",
                "Pixel Pete",
                "Front Fred",
                "Style Steve",
            ],
        }

        # Check each category for keyword matches
        for keywords, names in task_names.items():
            if any(kw in desc_lower for kw in keywords):
                return random.choice(names)

        # Fallback: generic fun names
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
        return random.choice(generic_names)

    async def detect_report_request(self, prompt: str) -> bool:
        """Detect if the user's prompt requests a report or document."""
        if not prompt:
            return False

        prompt_lower = prompt.lower()
        report_keywords = [
            "report",
            "document",
            "documentation",
            "readme",
            "write up",
            "writeup",
            "summary report",
            "create a doc",
            "generate a doc",
            "write a doc",
            "pdf",
            "markdown file",
            "md file",
            ".md",  # Any .md file reference
            "architecture",
            "changelog",
            "contributing",
            "license",
            "guide",
        ]
        keyword_match = any(keyword in prompt_lower for keyword in report_keywords)

        create_md_pattern = re.search(
            r"\b(create|write|generate|update|add)\b.*\.md\b", prompt_lower
        )
        fallback_result = keyword_match or bool(create_md_pattern)

        if not self.enabled or not self.client:
            return fallback_result

        truncated = prompt[:1000] if len(prompt) > 1000 else prompt
        result = await self._call_with_retry(
            "Does this request ask for a report, document, or documentation to be created? "
            "Reply with ONLY 'yes' or 'no':\n" + truncated
        )

        if result:
            return result.strip().lower() == "yes"
        return fallback_result

    async def summarize_response(self, response_text: str) -> str:
        """Generate a short summary of Claude's response."""
        fallback = self._extract_first_sentence(response_text, max_len=100)

        if not self.enabled or not self.client:
            return fallback

        text = response_text[:2000] if len(response_text) > 2000 else response_text

        result = await self._call_with_retry(
            f"In 15 words or less, summarize this response:\n{text}"
        )
        return result or fallback

    def _get_tool_fallback(self, tool_name: str, tool_input: dict[str, Any] | None) -> str:
        """Generate a simple fallback summary for a tool call without AI."""
        if not tool_input:
            return tool_name

        result: str | None = None

        if tool_name in ("Read", "Glob", "Grep", "Write", "Edit"):
            path = tool_input.get("file_path") or tool_input.get("pattern", "")
            if path:
                result = compress_path(path, max_len=35)

        elif tool_name == "Bash":
            cmd = tool_input.get("command", "")
            if cmd:
                cmd_clean = cmd.strip().split("\n")[0]
                if len(cmd_clean) > 40:
                    cmd_clean = f"{cmd_clean[:37]}..."
                result = cmd_clean

        elif tool_name == "Task":
            desc = tool_input.get("prompt") or tool_input.get("description", "")
            if desc:
                result = self._extract_first_sentence(desc, max_len=40)

        elif tool_name == "WebSearch":
            query = tool_input.get("query", "")
            if query:
                if len(query) > 35:
                    query = f"{query[:32]}..."
                result = f"Search: {query}"

        elif tool_name == "WebFetch":
            url = tool_input.get("url", "")
            if url:
                match = re.search(r"https?://([^/]+)", url)
                if match:
                    result = f"Fetch: {match.group(1)}"

        if result:
            return compress_paths_in_text(result)

        return tool_name

    def _extract_first_sentence(self, text: str, max_len: int = 100) -> str:
        """Extract the first sentence as a fallback summary."""
        if not text:
            return ""

        text = text.strip()

        for i, char in enumerate(text[: max_len + 50]):
            if char in ".!?" and i >= 10:  # Ensure minimum sentence length
                result = text[: i + 1].strip()
                if len(result) > max_len:
                    return result[: max_len - 3] + "..."
                return result

        if len(text) > max_len:
            return text[: max_len - 3] + "..."
        return text

    async def _call_with_retry(self, prompt: str, max_retries: int = 1) -> str | None:
        """Call the API with retry on error, returning None on failure."""
        if not self.client:
            return None

        settings = get_settings()

        for attempt in range(max_retries + 1):
            try:
                response = await self.client.messages.create(
                    model=self.model,
                    max_tokens=settings.SUMMARY_MAX_TOKENS,
                    messages=[{"role": "user", "content": prompt}],
                )
                content = response.content
                if content and len(content) > 0:
                    first_block = content[0]
                    if hasattr(first_block, "text"):
                        text = str(first_block.text).strip()
                        if text:
                            return text
                        logger.debug("AI returned empty response, using fallback")
                        return None
                logger.debug("AI response had no content, using fallback")
                return None
            except Exception as e:
                if attempt < max_retries:
                    logger.warning(f"Summary API error, retrying: {e}")
                else:
                    logger.debug(f"Summary API failed after retry, using fallback: {e}")
                    return None

        return None


_summary_service: SummaryService | None = None


def get_summary_service() -> SummaryService:
    """Get the singleton summary service instance."""
    global _summary_service
    if _summary_service is None:
        _summary_service = SummaryService()
    return _summary_service
