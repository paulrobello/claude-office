from fastapi.testclient import TestClient

from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine
from app.main import app

client = TestClient(app)


def setup_function():
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()


def teardown_function():
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()


def test_list_projects_empty():
    resp = client.get("/api/v1/projects")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_projects_with_data():
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "proj-a", "/a")

    resp = client.get("/api/v1/projects")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["key"] == "proj-a"
    assert data[0]["session_count"] == 1


def test_get_project_not_found():
    resp = client.get("/api/v1/projects/nonexistent")
    assert resp.status_code == 404


def test_get_project_found():
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "proj-b", "/b")

    resp = client.get("/api/v1/projects/proj-b")
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "proj-b"
    assert data["session_ids"] == ["s1"]


def test_get_project_sessions():
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session("s1", "proj-c", "/c")

    resp = client.get("/api/v1/projects/proj-c/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_ids"] == ["s1"]
