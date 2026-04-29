# Contributing to Claude Office Visualizer

Contributions are welcome. This guide covers development setup, code style, and the pull request process.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Style and Linting](#code-style-and-linting)
- [Type Checking](#type-checking)
- [Project Structure](#project-structure)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Code of Conduct](#code-of-conduct)

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Python | 3.13+ | Backend runtime |
| Node.js or Bun | 20+ / 1.0+ | Frontend runtime |
| uv | Latest | Python package management |
| tmux | Any | Recommended development experience |

## Development Setup

1. **Clone and install:**

   ```bash
   git clone https://github.com/paulrobello/claude-office.git
   cd claude-office
   make install-all
   ```

2. **Start development servers:**

   ```bash
   make dev-tmux
   ```

   This creates a tmux session with backend (`:8000`) and frontend (`:3000`) in separate windows.

3. **Install hooks (for live testing):**

   ```bash
   make hooks-install
   ```

4. **Verify everything works:**

   ```bash
   make checkall
   ```

## Running Tests

### Backend

```bash
# From the backend directory
make test

# Run with coverage
uv run pytest --cov=app

# Run a specific test
uv run pytest tests/test_state_machine.py::test_agent_lifecycle
```

### Frontend

```bash
# From the frontend directory
make typecheck
make lint
```

### Full Suite

```bash
# From the project root -- runs format, lint, typecheck, and tests for all components
make checkall
```

## Code Style and Linting

### Backend (Python)

- **Formatter:** ruff (via `make fmt`)
- **Linter:** ruff (via `make lint`)
- **Docstrings:** Google style for all public functions and classes
- **Type annotations:** Required on all public functions

```bash
# Format
make fmt

# Lint
make lint
```

### Frontend (TypeScript/React)

- **Formatter:** Prettier (via `make fmt`)
- **Linter:** ESLint (via `make lint`)
- **Components:** Functional components with hooks
- **State:** Zustand stores with individual selectors

```bash
# Format
make fmt

# Lint
make lint
```

## Type Checking

### Backend

```bash
# From the backend directory
make typecheck
```

Uses pyright for static type analysis.

### Frontend

```bash
# From the frontend directory
make typecheck
```

Uses TypeScript strict mode. Frontend types are auto-generated from backend Pydantic models via `make gen-types`.

## Project Structure

```
claude-office/
├── backend/          # FastAPI backend (Python)
├── frontend/         # Next.js + PixiJS frontend (TypeScript)
├── hooks/            # Claude Code hook integration (Python)
├── opencode-plugin/  # OpenCode integration plugin (TypeScript)
├── scripts/          # Utility scripts
├── docs/             # Documentation
└── Makefile          # Project orchestration
```

See [Architecture](docs/ARCHITECTURE.md) for detailed component documentation.

## Branch Naming

Use descriptive branch names with a prefix indicating the type of change:

| Prefix | Use For |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |
| `refactor/` | Code restructuring without behavior changes |
| `test/` | Adding or updating tests |
| `chore/` | Build, tooling, or dependency changes |

Examples: `feat/floor-navigation`, `fix/websocket-reconnect`, `docs/api-endpoints`

## Commit Messages

Write concise commit messages that explain the "why" rather than the "what":

- Use present tense ("add feature" not "added feature")
- Keep the first line under 72 characters
- Reference issue numbers when applicable

## Pull Request Process

1. **Create a branch** from `main` with an appropriate prefix
2. **Make changes** with tests for new functionality
3. **Run checks** to ensure everything passes:

   ```bash
   make checkall
   ```

4. **Update documentation** if your change affects behavior, configuration, or public APIs
5. **Open a pull request** with:
   - A clear description of the change
   - The motivation or problem being solved
   - Any manual testing steps
6. **Address review feedback** promptly

### PR Checklist

Before submitting:

- [ ] `make checkall` passes without errors
- [ ] New code has appropriate tests
- [ ] Public functions have docstrings
- [ ] Documentation is updated if applicable
- [ ] No debug logging left in production code

## Code of Conduct

Be respectful and constructive in all interactions. Follow the [GitHub Community Guidelines](https://docs.github.com/en/site-policy/github-terms/github-community-guidelines).
