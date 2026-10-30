use chrono::Utc;
use rusqlite::params;

use crate::{models::MarqueeSettings, state::AppCore};

pub fn get_marquee_settings(core: &AppCore) -> Result<MarqueeSettings, String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT enabled, text, speed, updated_at FROM marquee_settings WHERE singleton = 1",
        [],
        |row| {
            let updated_at: String = row.get(3)?;
            Ok(MarqueeSettings {
                enabled: row.get(0)?,
                text: row.get(1)?,
                speed: row.get::<_, i64>(2)? as u32,
                updated_at: chrono::DateTime::parse_from_rfc3339(&updated_at)
                    .map(|date| date.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        },
    )
    .map_err(|e| e.to_string())
}

pub fn get_marquee_settings_pool(pool: &crate::db::DbPool) -> Result<MarqueeSettings, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT enabled, text, speed, updated_at FROM marquee_settings WHERE singleton = 1",
        [],
        |row| {
            let updated_at: String = row.get(3)?;
            Ok(MarqueeSettings {
                enabled: row.get(0)?,
                text: row.get(1)?,
                speed: row.get::<_, i64>(2)? as u32,
                updated_at: chrono::DateTime::parse_from_rfc3339(&updated_at)
                    .map(|date| date.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        },
    )
    .map_err(|e| e.to_string())
}

pub fn update_marquee_settings(
    core: &AppCore,
    enabled: bool,
    text: String,
    speed: u32,
) -> Result<MarqueeSettings, String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    let now = Utc::now();
    let clamped_speed = speed.clamp(15, 120);
    conn.execute(
        "INSERT INTO marquee_settings (singleton, enabled, text, speed, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4)
         ON CONFLICT(singleton) DO UPDATE SET
            enabled = excluded.enabled,
            text = excluded.text,
            speed = excluded.speed,
            updated_at = excluded.updated_at",
        params![enabled, text, clamped_speed, now.to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    let _ = crate::lan::server::publish_revision(&core.pool, &core.events)
        .map_err(|e| e.to_string());
    Ok(MarqueeSettings {
        enabled,
        text,
        speed: clamped_speed,
        updated_at: now,
    })
}
