.PHONY: install install-all dev backend frontend simulate checkall lint fmt test typecheck gen-types \
	hooks-install hooks-uninstall hooks-reinstall hooks-status hooks-logs hooks-logs-follow hooks-logs-clear \
	hooks-debug-on hooks-debug-off clean clean-db clean-all \
	opencode-install opencode-uninstall opencode-reinstall opencode-build \
	dev-tmux dev-tmux-kill dev-tmux-backend dev-tmux-frontend \
	build-static frontend-build-static \
	docker-build docker-up docker-down docker-logs docker-shell docker-config \
	pre-commit pre-commit-update depsupdate depsshow uv-lock uv-sync setup resetup remove-venv \
	bump-version version-check help

# Detect package manager: prefer bun if available, otherwise use npm
PKG_MGR := $(shell command -v bun >/dev/null 2>&1 && echo "bun" || echo "npm")
PKG_INSTALL := $(shell command -v bun >/dev/null 2>&1 && echo "bun install" || echo "npm install")

install:			# Install all component dependencies
	cd backend && uv sync
	cd frontend && $(PKG_INSTALL)
	cd hooks && uv sync
	cd opencode-plugin && $(PKG_INSTALL)

install-all: install hooks-install opencode-install		# Install everything including hooks and plugins
	@echo "All components installed including hooks and OpenCode plugin"

dev:			# Start backend and frontend in parallel
	@make -j 2 backend frontend

backend:			# Start backend dev server
	make -C backend dev

frontend:			# Start frontend dev server
	make -C frontend dev

# Build static frontend and copy to backend for serving
build-static frontend-build-static:
	make -C frontend build-static
	@echo "Frontend built and copied to backend/static"
	@echo "Start backend with 'make backend' to serve at http://localhost:8000"

simulate:			# Run event simulation
	uv run python scripts/simulate_events.py

test-agent:			# Run single agent test
	uv run python scripts/test_single_agent.py

lint:			# Run lint on all components
	make -C backend lint
	make -C frontend lint
	make -C hooks lint
	make -C opencode-plugin lint
	cd backend && uv run ruff check ../scripts

fmt:			# Reformat code
	make -C backend fmt
	make -C frontend fmt
	make -C hooks fmt

test:			# Run all tests
	make -C backend test
	make -C frontend test
	make -C hooks test
	make -C opencode-plugin test

typecheck:			# Run static type checks
	make -C backend typecheck
	make -C frontend typecheck
	make -C hooks typecheck
	make -C opencode-plugin typecheck

checkall: fmt lint typecheck test		# Run all checks including tests

gen-types:			# Regenerate TypeScript types from Pydantic models
	cd backend && uv run python ../scripts/gen_types.py

# Hook management targets
hooks-install:
	cd hooks && ./install.sh

hooks-uninstall:
	cd hooks && ./uninstall.sh

hooks-reinstall: hooks-uninstall hooks-install
	@echo "Hooks reinstalled"

hooks-status:
	@echo "=== Installed Claude Code Hooks ==="
	@cat ~/.claude/settings.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin).get('hooks',{}); [print(f'  {k}: {len(v)} hook(s)') for k,v in d.items()]" 2>/dev/null || echo "  No hooks configured"
	@echo ""
	@echo "=== Hook Config ==="
	@cat ~/.claude/claude-office-config.env 2>/dev/null || echo "  No config file found"

hooks-logs:
	@echo "=== Recent Hook Logs ==="
	@tail -100 ~/.claude/claude-office-hooks.log 2>/dev/null || echo "  No log file found"

hooks-logs-follow:
	@tail -f ~/.claude/claude-office-hooks.log

hooks-logs-clear:
	@rm -f ~/.claude/claude-office-hooks.log
	@echo "Hook logs cleared"

hooks-debug-on:
	@sed -i '' 's/CLAUDE_OFFICE_DEBUG=0/CLAUDE_OFFICE_DEBUG=1/' ~/.claude/claude-office-config.env 2>/dev/null || true
	@grep -q "CLAUDE_OFFICE_DEBUG" ~/.claude/claude-office-config.env || echo "CLAUDE_OFFICE_DEBUG=1" >> ~/.claude/claude-office-config.env
	@echo "Hook debug logging enabled"

hooks-debug-off:
	@sed -i '' 's/CLAUDE_OFFICE_DEBUG=1/CLAUDE_OFFICE_DEBUG=0/' ~/.claude/claude-office-config.env 2>/dev/null || true
	@echo "Hook debug logging disabled"

# OpenCode plugin management targets
opencode-install:
	cd opencode-plugin && ./install.sh

opencode-uninstall:
	cd opencode-plugin && ./uninstall.sh

opencode-reinstall: opencode-uninstall opencode-install
	@echo "OpenCode plugin reinstalled"

opencode-build:
	cd opencode-plugin && $(PKG_INSTALL) && $(PKG_MGR) run build

# tmux-based dev targets for better monitoring
TMUX_SESSION=claude-office-dev

dev-tmux:
	@if tmux has-session -t $(TMUX_SESSION) 2>/dev/null; then \
		echo "Session $(TMUX_SESSION) already exists. Use 'make dev-tmux-kill' first or attach with 'tmux attach -t $(TMUX_SESSION)'"; \
	else \
		tmux new-session -d -s $(TMUX_SESSION) -n backend; \
		tmux send-keys -t $(TMUX_SESSION):backend "cd $(CURDIR)/backend && make dev" Enter; \
		tmux new-window -t $(TMUX_SESSION) -n frontend; \
		tmux send-keys -t $(TMUX_SESSION):frontend "cd $(CURDIR)/frontend && make dev" Enter; \
		tmux select-window -t $(TMUX_SESSION):backend; \
		echo "Started tmux session '$(TMUX_SESSION)' with backend and frontend windows"; \
		echo "Attach with: tmux attach -t $(TMUX_SESSION)"; \
	fi

dev-tmux-kill:
	@tmux kill-session -t $(TMUX_SESSION) 2>/dev/null && echo "Killed tmux session $(TMUX_SESSION)" || echo "No session to kill"

dev-tmux-backend:
	@tmux send-keys -t $(TMUX_SESSION):backend C-c 2>/dev/null || true
	@sleep 1
	@tmux send-keys -t $(TMUX_SESSION):backend "make dev" Enter 2>/dev/null || echo "Session not found"

dev-tmux-frontend:
	@tmux send-keys -t $(TMUX_SESSION):frontend C-c 2>/dev/null || true
	@sleep 1
	@tmux send-keys -t $(TMUX_SESSION):frontend "make dev" Enter 2>/dev/null || echo "Session not found"

# Cleanup targets
clean-db:			# Remove SQLite database
	rm -f backend/visualizer.db
	@echo "Database removed"

clean:			# Remove build artifacts
	rm -rf frontend/.next
	rm -rf opencode-plugin/dist

clean-all: clean clean-db hooks-logs-clear		# Remove everything
	@echo "All build artifacts and data cleaned"

# Docker targets
docker-build:
	docker compose build

docker-up:
	docker compose up -d
	@echo "Claude Office running at http://localhost:8050"

# Point the host hooks/plugin at the Docker-published port. Idempotent: the
# grep guard keeps it from appending a second line on re-runs.
docker-config:
	@mkdir -p $(HOME)/.claude
	@grep -q 'CLAUDE_OFFICE_API_URL' $(HOME)/.claude/claude-office-config.env 2>/dev/null \
		&& echo "claude-office-config.env already sets CLAUDE_OFFICE_API_URL" \
		|| (printf 'CLAUDE_OFFICE_API_URL=http://localhost:8050/api/v1/events\n' >> $(HOME)/.claude/claude-office-config.env \
			&& echo "Wrote CLAUDE_OFFICE_API_URL=http://localhost:8050/api/v1/events to ~/.claude/claude-office-config.env")

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-shell:
	docker compose exec claude-office /bin/bash

# Dependency management
uv-lock:			# Lock dependencies
	cd backend && uv lock
	cd hooks && uv lock

uv-sync:			# Sync dependencies
	cd backend && uv sync
	cd hooks && uv sync

setup: uv-sync install		# First-time setup

resetup: remove-venv setup		# Recreate virtual environments from scratch

remove-venv:			# Remove virtual environments
	rm -rf backend/.venv hooks/.venv

depsupdate:			# Update all dependencies
	cd backend && uv sync -U
	cd hooks && uv sync -U
	cd frontend && $(PKG_MGR) update

depsshow:			# Show dependency tree
	cd backend && uv tree

# Version management (ARC-021 / QA-010): rewrite or verify all version locations.
bump-version:			# Bump version everywhere: make bump-version VERSION=x.y.z
ifndef VERSION
	$(error VERSION is required: make bump-version VERSION=x.y.z)
endif
	uv run --no-project python scripts/bump_version.py $(VERSION)

version-check:			# Verify all version locations agree (CI-friendly)
	uv run --no-project python scripts/bump_version.py --check

# Pre-commit
pre-commit:			# Run pre-commit on all files
	pre-commit run --all-files

pre-commit-update:			# Update pre-commit hooks
	pre-commit autoupdate

# Help
help:				# Display this help
	@grep -Eh "^[a-z][-a-z]+:.+# " $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.+# "}; {printf "%-20s %s\n", $$1, $$2}'
