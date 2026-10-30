use crate::{db::DbPool, models::{Screen, Orientation, ScreenResolution}, state::AppCore};
use rusqlite::params;

pub fn get_screens(pool: &DbPool) -> Result<Vec<Screen>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, location, ip_address, mac_address,
                    resolution_w, resolution_h, brightness, power_on,
                    orientation, group_id, created_at, operating_hours, playlist_id,
                    device_id, endpoint, pairing_status, last_seen, last_sync_revision,
                    force_sync, is_fullscreen, purpose, gate, production_dashboard_id, default_content_id
             FROM screens ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let orientation_str: String = row.get(9)?;
            let orientation = match orientation_str.as_str() {
                "Portrait" => Orientation::Portrait,
                "LandscapeFlipped" => Orientation::LandscapeFlipped,
                "PortraitFlipped" => Orientation::PortraitFlipped,
                _ => Orientation::Landscape,
            };

            let created_at_str: String = row.get(11)?;
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            let operating_hours_str: String = row.get(12).unwrap_or_else(|_| "{}".to_string());
            let operating_hours: serde_json::Value = serde_json::from_str(&operating_hours_str)
                .unwrap_or(serde_json::Value::Null);

            Ok(Screen {
                id: row.get(0)?,
                name: row.get(1)?,
                location: row.get(2)?,
                ip_address: row.get(3)?,
                mac_address: row.get(4)?,
                resolution: ScreenResolution {
                    width: row.get::<_, i32>(5)? as u32,
                    height: row.get::<_, i32>(6)? as u32,
                },
                is_online: false,
                brightness: row.get::<_, i32>(7)? as u8,
                power_on: row.get(8)?,
                orientation,
                group_id: row.get(10)?,
                created_at,
                operating_hours: Some(operating_hours),
                playlist_id: row.get(13)?,
                device_id: row.get(14)?,
                endpoint: row.get(15)?,
                pairing_status: row.get(16)?,
                last_seen: row.get(17)?,
                last_sync_revision: row.get(18)?,
                force_sync: row.get(19)?,
                is_fullscreen: row.get(20)?,
                purpose: row.get(21)?,
                gate: row.get(22)?,
                production_dashboard_id: row.get(23)?,
                default_content_id: row.get(24)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut screens = Vec::new();
    for screen_res in rows {
        screens.push(screen_res.map_err(|e| e.to_string())?);
    }

    Ok(screens)
}

pub fn add_screen(
    core: &AppCore,
    name: String,
    location: String,
    ip_address: Option<String>,
    orientation: Option<String>,
    resolution_w: Option<i32>,
    resolution_h: Option<i32>,
    playlist_id: Option<String>,
    purpose: Option<String>,
    gate: Option<String>,
    production_dashboard_id: Option<String>,
    default_content_id: Option<String>,
) -> Result<Screen, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let conn = core.pool.get().map_err(|e| e.to_string())?;

    let orientation_val = orientation.unwrap_or_else(|| "Landscape".to_string());
    let w_val = resolution_w.unwrap_or(1920);
    let h_val = resolution_h.unwrap_or(1080);
    let purpose_val = normalize_purpose(purpose.as_deref());
    let gate_val = normalize_gate(gate);

    conn.execute(
        "INSERT INTO screens (id, name, location, ip_address, orientation, resolution_w, resolution_h, playlist_id, purpose, gate, production_dashboard_id, default_content_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![id, name, location, ip_address, orientation_val, w_val, h_val, playlist_id, purpose_val, gate_val, production_dashboard_id, default_content_id, now.to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;

    let orientation_parsed = match orientation_val.as_str() {
        "Portrait" => Orientation::Portrait,
        "LandscapeFlipped" => Orientation::LandscapeFlipped,
        "PortraitFlipped" => Orientation::PortraitFlipped,
        _ => Orientation::Landscape,
    };

    Ok(Screen {
        id,
        name,
        location,
        ip_address,
        orientation: orientation_parsed,
        resolution: ScreenResolution {
            width: w_val as u32,
            height: h_val as u32,
        },
        playlist_id,
        purpose: purpose_val,
        gate: gate_val,
        production_dashboard_id,
        default_content_id,
        created_at: now,
        ..Default::default()
    })
}

pub fn edit_screen(
    core: &AppCore,
    id: String,
    name: String,
    location: String,
    ip_address: Option<String>,
    orientation: Option<String>,
    resolution_w: Option<i32>,
    resolution_h: Option<i32>,
    playlist_id: Option<String>,
    purpose: Option<String>,
    gate: Option<String>,
    production_dashboard_id: Option<String>,
    default_content_id: Option<String>,
) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    let orientation_val = orientation.unwrap_or_else(|| "Landscape".to_string());
    let w_val = resolution_w.unwrap_or(1920);
    let h_val = resolution_h.unwrap_or(1080);
    let purpose_val = normalize_purpose(purpose.as_deref());
    let gate_val = normalize_gate(gate);
    conn.execute(
        "UPDATE screens SET name = ?1, location = ?2, ip_address = ?3, orientation = ?4, resolution_w = ?5, resolution_h = ?6, playlist_id = ?7, purpose = ?8, gate = ?9, production_dashboard_id = ?10, default_content_id = ?11 WHERE id = ?12",
        params![name, location, ip_address, orientation_val, w_val, h_val, playlist_id, purpose_val, gate_val, production_dashboard_id, default_content_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_screen_power(core: &AppCore, id: String, on: bool) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE screens SET power_on = ?1 WHERE id = ?2", params![on, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_screen_brightness(core: &AppCore, id: String, brightness: u8) -> Result<(), String> {
    let brightness_val = brightness.min(100) as i32;
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE screens SET brightness = ?1 WHERE id = ?2",
        params![brightness_val, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_screen(core: &AppCore, id: String) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM screens WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_screen_display_options(
    core: &AppCore,
    id: String,
    purpose: String,
    gate: Option<String>,
    production_dashboard_id: Option<String>,
    default_content_id: Option<String>,
) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    let purpose_val = normalize_purpose(Some(&purpose));
    let gate_val = normalize_gate(gate);
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE screens SET purpose = ?1, gate = ?2, production_dashboard_id = ?3, default_content_id = ?4 WHERE id = ?5",
        params![purpose_val, gate_val, production_dashboard_id, default_content_id, id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO screen_defaults (screen_id, default_content_id, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(screen_id) DO UPDATE SET default_content_id = excluded.default_content_id, updated_at = excluded.updated_at",
        params![id, default_content_id, now],
    )
    .map_err(|e| e.to_string())?;
    let _ = crate::lan::server::publish_revision(&core.pool, &core.events);
    Ok(())
}

fn normalize_purpose(value: Option<&str>) -> String {
    match value.unwrap_or("playlist") {
        "truck_gate" => "truck_gate".to_string(),
        "production_dashboard" => "production_dashboard".to_string(),
        _ => "playlist".to_string(),
    }
}

fn normalize_gate(value: Option<String>) -> Option<String> {
    let gate = value.unwrap_or_default().trim().to_lowercase();
    // Allow any gate format: letter prefix + digits (e.g., d1, d4, g10)
    if gate.is_empty() {
        None
    } else {
        Some(gate)
    }
}

pub fn update_screen_operating_hours(
    core: &AppCore,
    id: String,
    operating_hours: serde_json::Value,
) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    let operating_hours_str = serde_json::to_string(&operating_hours).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE screens SET operating_hours = ?1 WHERE id = ?2",
        params![operating_hours_str, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn force_sync_screen(core: &AppCore, id: String) -> Result<i64, String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE screens SET force_sync = 1 WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    crate::lan::server::publish_revision(&core.pool, &core.events).map_err(|e| e.to_string())
}

/// Persist just the gate CSV column on a screen (used by the gate setup tab).
pub fn update_screen_gate_only(
    core: &AppCore,
    id: String,
    gate: Option<String>,
) -> Result<(), String> {
    let normalized = gate
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE screens SET gate = ?1 WHERE id = ?2",
        params![normalized, id],
    )
    .map_err(|e| e.to_string())?;
    let _ = crate::lan::server::publish_revision(&core.pool, &core.events);
    Ok(())
}

pub fn update_screen_fullscreen(core: &AppCore, id: String, fullscreen: bool) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE screens SET is_fullscreen = ?1 WHERE id = ?2",
        params![fullscreen, id],
    )
    .map_err(|e| e.to_string())?;
    let _ = crate::lan::server::publish_revision(&core.pool, &core.events);
    Ok(())
}
