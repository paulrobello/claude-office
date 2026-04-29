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

typecheck:
	uv run pyright .

checkall: fmt lint typecheck test
