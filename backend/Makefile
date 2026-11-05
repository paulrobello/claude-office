.PHONY: dev start test lint fmt typecheck checkall

dev:
	uv run uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000

start:
	uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

test:
	uv run pytest

lint:
	uv run ruff check .

fmt:
	uv run ruff format .

# No positional path: `pyright .` overrides the declared include list (app
# only) and trips over backend/tests' import of the out-of-tree scripts/
# package, which is unresolvable from this config root.
typecheck:
	uv run pyright

checkall: fmt lint typecheck test
