use futures_util::StreamExt;
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// An event received from the Panoptica backend WebSocket.
#[derive(Debug, Clone, Deserialize)]
pub struct AgentEvent {
    pub event_type: String,
    pub session_id: String,
    pub timestamp: String,
    pub data: serde_json::Value,
}

/// Connect to the Panoptica WebSocket and forward parsed events into `tx`.
/// Reconnects automatically on disconnect.
pub async fn connect(session_id: &str, tx: mpsc::UnboundedSender<AgentEvent>) {
    let url = format!("ws://localhost:3400/ws/session/{session_id}");

    loop {
        match connect_async(&url).await {
            Ok((ws_stream, _)) => {
                let (mut _write, mut read) = ws_stream.split();

                while let Some(msg) = read.next().await {
                    match msg {
                        Ok(Message::Text(text)) => {
                            if let Ok(event) = serde_json::from_str::<AgentEvent>(&text) {
                                if tx.send(event).is_err() {
                                    return; // receiver dropped — app is shutting down
                                }
                            }
                        }
                        Ok(Message::Close(_)) => break,
                        Err(_) => break,
                        _ => {}
                    }
                }
            }
            Err(_) => {
                // Connection failed — wait before retry
            }
        }

        // Reconnect after 3 seconds
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
}
