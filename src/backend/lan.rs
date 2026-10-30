use crate::{lan::PeerScreen, state::AppCore};
use rusqlite::params;

pub fn get_network_peers(core: &AppCore) -> Vec<PeerScreen> {
    core.lan.lock().unwrap().get_peers()
}

pub fn check_screen_online(core: &AppCore, screen_id: String) -> Result<bool, String> {
    let conn = core.pool.get().map_err(|error| error.to_string())?;
    let last_seen: Option<String> = conn
        .query_row(
            "SELECT last_seen FROM screens WHERE id = ?1",
            params![screen_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    Ok(last_seen
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(&value).ok())
        .map(|value| chrono::Utc::now().signed_duration_since(value.with_timezone(&chrono::Utc)).num_seconds() < 45)
        .unwrap_or(false))
}

pub fn check_all_screens_online(core: &AppCore) -> Result<Vec<(String, bool)>, String> {
    let conn = core.pool.get().map_err(|error| error.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, last_seen FROM screens")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)))
        .map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        let (id, last_seen) = row.map_err(|error| error.to_string())?;
        let online = last_seen
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(&value).ok())
            .map(|value| chrono::Utc::now().signed_duration_since(value.with_timezone(&chrono::Utc)).num_seconds() < 45)
            .unwrap_or(false);
        result.push((id, online));
    }
    Ok(result)
}

pub fn get_lan_server_port(core: &AppCore) -> u16 {
    core.server_port.lock().map(|port| *port).unwrap_or(0)
}

pub fn sync_screen_data(core: &AppCore, _screen_id: String) -> Result<i64, String> {
    crate::lan::server::publish_revision(&core.pool, &core.events).map_err(|error| error.to_string())
}
