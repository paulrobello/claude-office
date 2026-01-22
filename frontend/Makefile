.PHONY: dev build build-static start lint typecheck test format checkall

BACKEND_STATIC_DIR := ../backend/static

# Detect package manager: prefer bun if available, otherwise use npm
PKG_MGR := $(shell command -v bun >/dev/null 2>&1 && echo "bun" || echo "npm")

dev:
	$(PKG_MGR) run dev

build:
	$(PKG_MGR) run build

# Build static export and copy to backend for serving
build-static:
	$(PKG_MGR) run build
	rm -rf $(BACKEND_STATIC_DIR)
	cp -r out $(BACKEND_STATIC_DIR)
	@echo "Static build copied to $(BACKEND_STATIC_DIR)"

start:
	$(PKG_MGR) run start

lint:
	$(PKG_MGR) run lint

typecheck:
	$(PKG_MGR) run typecheck

test:
	$(PKG_MGR) run test

fmt:
	$(PKG_MGR) run format

checkall: fmt lint typecheck build
	# Run tests after linting and formatting to ensure coverage
	$(PKG_MGR) run test
