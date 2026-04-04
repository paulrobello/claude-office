use crossterm::{
    event::KeyEvent,
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;
use tokio::sync::mpsc;

use crate::event::{self, AppEvent};
use crate::ui;
use crate::ws::{self, AgentEvent};

/// Tracked state for a single agent in the session.
#[derive(Debug, Clone)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub status: String,
    pub current_tool: String,
}

/// A single entry in the scrolling event log.
#[derive(Debug, Clone)]
pub struct LogEntry {
    pub time: String,
    pub level: String,
    pub message: String,
}

pub struct App {
    pub session_id: String,
    pub connected: bool,
    pub agents: Vec<AgentInfo>,
    pub event_log: Vec<LogEntry>,
}

impl App {
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            connected: false,
            agents: Vec::new(),
            event_log: Vec::new(),
        }
    }

    pub async fn run(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // Setup terminal
        enable_raw_mode()?;
        let mut stdout = io::stdout();
        execute!(stdout, EnterAlternateScreen)?;
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend)?;

        // Channels
        let (ws_tx, mut ws_rx) = mpsc::unbounded_channel::<AgentEvent>();
        let (input_tx, mut input_rx) = mpsc::unbounded_channel::<AppEvent>();

        // Spawn WebSocket listener
        let sid = self.session_id.clone();
        tokio::spawn(async move {
            ws::connect(&sid, ws_tx).await;
        });

        // Spawn terminal event poller
        tokio::spawn(async move {
            event::poll(input_tx).await;
        });

        // Main loop
        loop {
            // Draw
            terminal.draw(|f| ui::draw(f, self))?;

            // Handle events
            tokio::select! {
                Some(agent_event) = ws_rx.recv() => {
                    self.connected = true;
                    self.handle_agent_event(agent_event);
                }
                Some(input_event) = input_rx.recv() => {
                    match input_event {
                        AppEvent::Key(key) => {
                            if event::is_quit(&key) {
                                break;
                            }
                            self.handle_key(key);
                        }
                        AppEvent::Tick => {}
                    }
                }
            }
        }

        // Restore terminal
        disable_raw_mode()?;
        execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
        terminal.show_cursor()?;

        Ok(())
    }

    fn handle_agent_event(&mut self, event: AgentEvent) {
        let data = &event.data;
        let agent_id = data["agent_id"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();
        let agent_name = data["agent_name"]
            .as_str()
            .or_else(|| data["agent_id"].as_str())
            .unwrap_or("agent")
            .to_string();

        // Update agent state
        match event.event_type.as_str() {
            "subagent_start" | "session_start" => {
                if !self.agents.iter().any(|a| a.id == agent_id) {
                    self.agents.push(AgentInfo {
                        id: agent_id,
                        name: agent_name.clone(),
                        status: "active".into(),
                        current_tool: String::new(),
                    });
                }
            }
            "subagent_stop" | "session_end" | "stop" => {
                if let Some(agent) = self.agents.iter_mut().find(|a| a.id == agent_id) {
                    agent.status = "completed".into();
                    agent.current_tool.clear();
                }
            }
            "pre_tool_use" => {
                let tool = data["tool_name"].as_str().unwrap_or("").to_string();
                if let Some(agent) = self.agents.iter_mut().find(|a| a.id == agent_id) {
                    agent.current_tool = tool.clone();
                    agent.status = "active".into();
                }
            }
            "post_tool_use" => {
                if let Some(agent) = self.agents.iter_mut().find(|a| a.id == agent_id) {
                    agent.current_tool.clear();
                }
            }
            "permission_request" => {
                if let Some(agent) = self.agents.iter_mut().find(|a| a.id == agent_id) {
                    agent.status = "blocked".into();
                }
            }
            _ => {}
        }

        // Add to event log
        let time = chrono::Local::now().format("%H:%M:%S").to_string();
        let level = match event.event_type.as_str() {
            "permission_request" => "blocked",
            "stop" | "session_end" | "subagent_stop" => "success",
            _ => "info",
        };
        let summary = data["summary"]
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                format!(
                    "{}: {}",
                    event.event_type,
                    agent_name
                )
            });

        self.event_log.push(LogEntry {
            time,
            level: level.into(),
            message: summary,
        });

        // Cap log at 500 entries
        if self.event_log.len() > 500 {
            self.event_log.drain(..100);
        }
    }

    fn handle_key(&mut self, _key: KeyEvent) {
        // Future: tab switching, scrolling, etc.
    }
}
