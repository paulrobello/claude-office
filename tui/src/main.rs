mod app;
mod event;
mod ui;
mod ws;

use app::App;
use clap::Parser;

#[derive(Parser)]
#[command(name = "panoptica", about = "Terminal companion for Panoptica agent visualization")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(clap::Subcommand)]
enum Commands {
    /// Watch agent activity in real-time (default)
    Watch {
        /// Session ID to watch (auto-discovers if omitted)
        #[arg(short, long)]
        session: Option<String>,
    },
    /// List active sessions
    Sessions,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Sessions) => {
            list_sessions().await?;
        }
        Some(Commands::Watch { session }) => {
            let session_id = match session {
                Some(id) => id,
                None => discover_session().await?,
            };
            let mut app = App::new(session_id);
            app.run().await?;
        }
        None => {
            let session_id = discover_session().await?;
            let mut app = App::new(session_id);
            app.run().await?;
        }
    }

    Ok(())
}

async fn list_sessions() -> Result<(), Box<dyn std::error::Error>> {
    let url = "http://localhost:8000/api/v1/sessions";
    let resp = reqwest::get(url).await?;
    let sessions: Vec<serde_json::Value> = resp.json().await?;

    if sessions.is_empty() {
        println!("No active sessions.");
        return Ok(());
    }

    println!("{:<40} {:<20} {:<10}", "Session ID", "Project", "Events");
    println!("{}", "-".repeat(70));
    for s in &sessions {
        let id = s["id"].as_str().unwrap_or("?");
        let project = s["project_name"].as_str().unwrap_or("unknown");
        let events = s["event_count"].as_u64().unwrap_or(0);
        let short_id = if id.len() > 38 { &id[..38] } else { id };
        println!("{:<40} {:<20} {:<10}", short_id, project, events);
    }

    Ok(())
}

async fn discover_session() -> Result<String, Box<dyn std::error::Error>> {
    let url = "http://localhost:8000/api/v1/sessions";
    let resp = reqwest::get(url).await?;
    let sessions: Vec<serde_json::Value> = resp.json().await?;

    if sessions.is_empty() {
        return Err("No active sessions. Start a Claude Code session first.".into());
    }

    let session = &sessions[0];
    let id = session["id"]
        .as_str()
        .ok_or("Invalid session data")?;

    Ok(id.to_string())
}
