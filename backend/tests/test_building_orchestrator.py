"""Tests for building-level aggregation models and orchestrator."""

from app.models.building import (
    AgentLive,
    BuildingState,
    BuildingTotals,
    FloorLive,
    LobbyLive,
    SessionLive,
)


class TestBuildingModels:
    def test_building_state_dumps_camel_case(self) -> None:
        state = BuildingState(
            building_name="HMTrack",
            floors=[
                FloorLive(
                    floor_id="backend",
                    name="Backend",
                    floor_number=4,
                    accent="#0ea5e9",
                    icon="⚙️",
                    sessions=[
                        SessionLive(
                            session_id="s1",
                            display_name="hmtrack-api-py",
                            boss_state="working",
                            boss_task="fix bug",
                            agents=[
                                AgentLive(
                                    id="a1",
                                    name="Helper",
                                    state="working",
                                    task="writing tests",
                                    color="#3b82f6",
                                )
                            ],
                        )
                    ],
                    agent_count=2,
                    is_active=True,
                )
            ],
            lobby=LobbyLive(),
            totals=BuildingTotals(active_agents=2, active_floors=1, active_sessions=1),
        )
        dumped = state.model_dump(mode="json", by_alias=True)
        assert dumped["buildingName"] == "HMTrack"
        assert dumped["floors"][0]["floorNumber"] == 4
        assert dumped["floors"][0]["isActive"] is True
        assert dumped["floors"][0]["agentCount"] == 2
        assert dumped["floors"][0]["sessions"][0]["bossState"] == "working"
        assert dumped["floors"][0]["sessions"][0]["agents"][0]["color"] == "#3b82f6"
        assert dumped["totals"]["activeAgents"] == 2


from app.core.building_orchestrator import BuildingOrchestrator
from app.core.floor_config import BuildingConfig, FloorConfig, RoomConfig
from app.core.state_machine import OfficePhase, StateMachine
from app.models.agents import Agent, AgentState, BossState


def _config() -> BuildingConfig:
    return BuildingConfig(
        building_name="HMTrack",
        floors=[
            FloorConfig(
                id="backend",
                name="Backend",
                floor_number=4,
                accent="#0ea5e9",
                icon="⚙️",
                rooms=[RoomConfig(id="hmtrack-api-py", repo_name="hmtrack-api-py")],
            ),
            FloorConfig(
                id="frontend",
                name="Frontend",
                floor_number=2,
                accent="#7c3aed",
                icon="🖥️",
                rooms=[RoomConfig(id="hmtrack-front", repo_name="hmtrack-front")],
            ),
        ],
    )


def _active_sm(floor_id: str | None) -> StateMachine:
    sm = StateMachine()
    sm.phase = OfficePhase.WORKING
    sm.boss_state = BossState.WORKING
    sm.boss_current_task = "doing work"
    sm.floor_id = floor_id
    return sm


class TestBuildingOrchestrator:
    def test_groups_sessions_by_floor(self) -> None:
        orch = BuildingOrchestrator()
        sessions = {"s1": _active_sm("backend")}
        state = orch.build_state(sessions, _config(), {"s1": "hmtrack-api-py"})
        backend = next(f for f in state.floors if f.floor_id == "backend")
        frontend = next(f for f in state.floors if f.floor_id == "frontend")
        assert backend.is_active is True
        assert len(backend.sessions) == 1
        assert backend.sessions[0].display_name == "hmtrack-api-py"
        assert frontend.is_active is False
        assert frontend.sessions == []

    def test_floors_sorted_top_down(self) -> None:
        orch = BuildingOrchestrator()
        state = orch.build_state({}, _config())
        assert [f.floor_number for f in state.floors] == [4, 2]

    def test_unassigned_session_goes_to_lobby(self) -> None:
        orch = BuildingOrchestrator()
        sessions = {"s1": _active_sm(None)}
        state = orch.build_state(sessions, _config(), {"s1": "scratch"})
        assert len(state.lobby.sessions) == 1
        assert state.lobby.sessions[0].display_name == "scratch"

    def test_ended_session_excluded(self) -> None:
        orch = BuildingOrchestrator()
        sm = _active_sm("backend")
        sm.phase = OfficePhase.ENDED
        state = orch.build_state({"s1": sm}, _config())
        assert all(len(f.sessions) == 0 for f in state.floors)
        assert state.totals.active_sessions == 0

    def test_agent_count_includes_boss_plus_subagents(self) -> None:
        orch = BuildingOrchestrator()
        sm = _active_sm("backend")
        sm.agents = {
            "a1": Agent(id="a1", color="#3b82f6", number=0, state=AgentState.WORKING),
            "a2": Agent(id="a2", color="#22c55e", number=1, state=AgentState.WORKING),
        }
        state = orch.build_state({"s1": sm}, _config())
        backend = next(f for f in state.floors if f.floor_id == "backend")
        assert backend.agent_count == 3  # 1 boss + 2 subagents
        assert state.totals.active_agents == 3
        assert state.totals.active_floors == 1

    def test_task_truncation(self) -> None:
        orch = BuildingOrchestrator()
        sm = _active_sm("backend")
        sm.boss_current_task = "x" * 200
        state = orch.build_state({"s1": sm}, _config())
        backend = next(f for f in state.floors if f.floor_id == "backend")
        assert backend.sessions[0].boss_task is not None
        assert len(backend.sessions[0].boss_task) <= 80

    def test_record_activity_surfaces_on_floor(self) -> None:
        orch = BuildingOrchestrator()
        orch.record_activity("backend", "2026-05-23T10:00:00")
        state = orch.build_state({"s1": _active_sm("backend")}, _config())
        backend = next(f for f in state.floors if f.floor_id == "backend")
        assert backend.last_activity_at == "2026-05-23T10:00:00"


import pytest

from app.api.websocket import ConnectionManager, override_manager


class TestBroadcastBuildingState:
    @pytest.mark.asyncio
    async def test_broadcast_builds_and_sends_when_connected(self) -> None:
        from unittest.mock import AsyncMock
        from starlette.websockets import WebSocketState

        from app.core.broadcast_service import broadcast_building_state

        mgr = ConnectionManager()
        ws = AsyncMock()
        ws.client_state = WebSocketState.CONNECTED
        await mgr.connect_building(ws)
        override_manager(mgr)
        try:
            orch = BuildingOrchestrator()
            await broadcast_building_state(orch, {"s1": _active_sm("backend")}, _config())
            assert ws.send_json.await_count == 1
            payload = ws.send_json.await_args.args[0]
            assert payload["type"] == "building_state"
            assert payload["state"]["buildingName"] == "HMTrack"
        finally:
            override_manager(ConnectionManager())

    @pytest.mark.asyncio
    async def test_broadcast_noop_when_no_connections(self) -> None:
        from app.core.broadcast_service import broadcast_building_state

        override_manager(ConnectionManager())
        orch = BuildingOrchestrator()
        # Must not raise and must not build needlessly — just returns.
        await broadcast_building_state(orch, {"s1": _active_sm("backend")}, _config())


class TestEventProcessorWiring:
    def test_processor_exposes_building_snapshot(self) -> None:
        from app.core.event_processor import EventProcessor

        ep = EventProcessor()
        assert hasattr(ep, "building_orchestrator")
        assert isinstance(ep.build_building_snapshot(), BuildingState)
