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
    let url = "http://localhost:3400/api/v1/sessions";
    let resp = reqwest::get(url).await?;
    let sessions: Vec<serde_json::Value> = resp.json().await?;

    if sessions.is_empty() {
        println!("No active sessions.");
        return Ok(());
    }

    println!("{:<40} {:<20} {:>6}  {}", "Session ID", "Name", "Events", "Status");
    println!("{}", "-".repeat(78));
    for s in &sessions {
        let id = s["id"].as_str().unwrap_or("?");
        let display = s["displayName"].as_str();
        let project = s["projectName"].as_str().unwrap_or("unknown");
        let name = display.unwrap_or(project);
        let events = s["eventCount"].as_u64().unwrap_or(0);
        let status = s["status"].as_str().unwrap_or("");
        let short_id = if id.len() > 38 { &id[..38] } else { id };
        println!("{:<40} {:<20} {:>6}  {}", short_id, name, events, status);
    }

    Ok(())
}

async fn discover_session() -> Result<String, Box<dyn std::error::Error>> {
    let url = "http://localhost:3400/api/v1/sessions";
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
