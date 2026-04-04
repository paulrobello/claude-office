use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers};
use std::time::Duration;
use tokio::sync::mpsc;

/// Application-level input events.
#[derive(Debug)]
pub enum AppEvent {
    Key(KeyEvent),
    Tick,
}

/// Polls terminal events and sends them into `tx`.
/// Sends a Tick every 250ms when no key is pressed.
pub async fn poll(tx: mpsc::UnboundedSender<AppEvent>) {
    let tick_rate = Duration::from_millis(250);

    loop {
        let has_event = tokio::task::spawn_blocking(move || {
            event::poll(tick_rate).unwrap_or(false)
        })
        .await
        .unwrap_or(false);

        if has_event {
            if let Ok(Event::Key(key)) = event::read() {
                if tx.send(AppEvent::Key(key)).is_err() {
                    return;
                }
            }
        } else if tx.send(AppEvent::Tick).is_err() {
            return;
        }
    }
}

/// Returns true if the key event is a quit signal (q, Ctrl+C, Esc).
pub fn is_quit(key: &KeyEvent) -> bool {
    matches!(
        key,
        KeyEvent {
            code: KeyCode::Char('q'),
            ..
        } | KeyEvent {
            code: KeyCode::Esc,
            ..
        } | KeyEvent {
            code: KeyCode::Char('c'),
            modifiers: KeyModifiers::CONTROL,
            ..
        }
    )
}
