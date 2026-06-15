use crate::{db::DbPool, lan::{LanDiscoveryState, LanServerPort, PeerScreen}, lan::server::SyncEventBus};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub async fn get_network_peers(lan_state: State<'_, LanDiscoveryState>) -> Result<Vec<PeerScreen>, String> {
    Ok(lan_state.read().await.get_peers().await)
}

#[tauri::command]
pub async fn check_screen_online(screen_id: String, pool: State<'_, DbPool>) -> Result<bool, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|error| error.to_string())?;
        let last_seen: Option<String> = conn.query_row(
            "SELECT last_seen FROM screens WHERE id = ?1",
            params![screen_id],
            |row| row.get(0),
        ).map_err(|error| error.to_string())?;
        Ok(last_seen.and_then(|value| chrono::DateTime::parse_from_rfc3339(&value).ok())
            .map(|value| chrono::Utc::now().signed_duration_since(value.with_timezone(&chrono::Utc)).num_seconds() < 45)
            .unwrap_or(false))
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn check_all_screens_online(pool: State<'_, DbPool>) -> Result<Vec<(String, bool)>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|error| error.to_string())?;
        let mut stmt = conn.prepare("SELECT id, last_seen FROM screens").map_err(|error| error.to_string())?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)))
            .map_err(|error| error.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            let (id, last_seen) = row.map_err(|error| error.to_string())?;
            let online = last_seen.and_then(|value| chrono::DateTime::parse_from_rfc3339(&value).ok())
                .map(|value| chrono::Utc::now().signed_duration_since(value.with_timezone(&chrono::Utc)).num_seconds() < 45)
                .unwrap_or(false);
            result.push((id, online));
        }
        Ok(result)
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn get_lan_server_port(port: State<'_, LanServerPort>) -> u16 {
    port.0
}

#[tauri::command]
pub async fn sync_screen_data(
    _screen_id: String,
    pool: State<'_, DbPool>,
    events: State<'_, SyncEventBus>,
) -> Result<i64, String> {
    let pool = pool.inner().clone();
    let event_bus = events.inner().clone();
    tokio::task::spawn_blocking(move || {
        crate::lan::server::publish_revision(&pool, &event_bus).map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
}
