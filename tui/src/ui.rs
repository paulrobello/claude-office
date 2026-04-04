use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::app::App;

pub fn draw(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // header
            Constraint::Min(10),   // main area
            Constraint::Length(3), // status bar
        ])
        .split(f.size());

    draw_header(f, app, chunks[0]);
    draw_main(f, app, chunks[1]);
    draw_status(f, app, chunks[2]);
}

fn draw_header(f: &mut Frame, app: &App, area: Rect) {
    let status_color = if app.connected {
        Color::Green
    } else {
        Color::Red
    };
    let status_text = if app.connected { "LIVE" } else { "DISCONNECTED" };

    let header = Paragraph::new(Line::from(vec![
        Span::styled(
            " PANOPTICA ",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
        Span::styled(
            format!(" {status_text} "),
            Style::default().fg(Color::Black).bg(status_color),
        ),
        Span::raw("  session: "),
        Span::styled(
            &app.session_id,
            Style::default().fg(Color::Yellow),
        ),
    ]))
    .block(Block::default().borders(Borders::BOTTOM));

    f.render_widget(header, area);
}

fn draw_main(f: &mut Frame, app: &App, area: Rect) {
    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(50), // agent tree
            Constraint::Percentage(50), // event log
        ])
        .split(area);

    draw_agent_tree(f, app, columns[0]);
    draw_event_log(f, app, columns[1]);
}

fn draw_agent_tree(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = if app.agents.is_empty() {
        vec![ListItem::new(Span::styled(
            "  Waiting for agents...",
            Style::default().fg(Color::DarkGray),
        ))]
    } else {
        app.agents
            .iter()
            .map(|agent| {
                let icon = match agent.status.as_str() {
                    "active" => "▶",
                    "blocked" => "⏸",
                    "completed" => "✓",
                    _ => "○",
                };
                let color = match agent.status.as_str() {
                    "active" => Color::Green,
                    "blocked" => Color::Red,
                    "completed" => Color::DarkGray,
                    _ => Color::White,
                };
                ListItem::new(Line::from(vec![
                    Span::styled(format!("  {icon} "), Style::default().fg(color)),
                    Span::styled(
                        &agent.name,
                        Style::default().fg(color).add_modifier(Modifier::BOLD),
                    ),
                    Span::raw("  "),
                    Span::styled(
                        &agent.current_tool,
                        Style::default().fg(Color::DarkGray),
                    ),
                ]))
            })
            .collect()
    };

    let list = List::new(items).block(
        Block::default()
            .title(" Agents ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan)),
    );

    f.render_widget(list, area);
}

fn draw_event_log(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app
        .event_log
        .iter()
        .rev()
        .take(area.height as usize - 2)
        .map(|entry| {
            let color = match entry.level.as_str() {
                "blocked" => Color::Red,
                "warning" => Color::Yellow,
                "success" => Color::Green,
                _ => Color::White,
            };
            ListItem::new(Line::from(vec![
                Span::styled(
                    format!(" {} ", &entry.time),
                    Style::default().fg(Color::DarkGray),
                ),
                Span::styled(&entry.message, Style::default().fg(color)),
            ]))
        })
        .collect();

    let list = List::new(items).block(
        Block::default()
            .title(" Events ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan)),
    );

    f.render_widget(list, area);
}

fn draw_status(f: &mut Frame, app: &App, area: Rect) {
    let agent_count = app.agents.len();
    let blocked_count = app.agents.iter().filter(|a| a.status == "blocked").count();
    let event_count = app.event_log.len();

    let status = Paragraph::new(Line::from(vec![
        Span::styled(
            format!(" Agents: {agent_count} "),
            Style::default().fg(Color::Cyan),
        ),
        Span::raw(" │ "),
        if blocked_count > 0 {
            Span::styled(
                format!("Blocked: {blocked_count} "),
                Style::default()
                    .fg(Color::Red)
                    .add_modifier(Modifier::BOLD),
            )
        } else {
            Span::styled("Blocked: 0 ", Style::default().fg(Color::DarkGray))
        },
        Span::raw(" │ "),
        Span::styled(
            format!("Events: {event_count} "),
            Style::default().fg(Color::DarkGray),
        ),
        Span::raw("  "),
        Span::styled(
            " q:quit ",
            Style::default().fg(Color::DarkGray),
        ),
    ]))
    .block(Block::default().borders(Borders::TOP));

    f.render_widget(status, area);
}
