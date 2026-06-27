use chrono::Utc;
use rusqlite::params;
use tauri::State;

use crate::{db::DbPool, models::MarqueeSettings};

fn parse_date(value: String) -> chrono::DateTime<Utc> {
    chrono::DateTime::parse_from_rfc3339(&value)
        .map(|date| date.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

#[tauri::command]
pub async fn get_marquee_settings(pool: State<'_, DbPool>) -> Result<MarqueeSettings, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let settings = conn.query_row(
            "SELECT enabled, text, speed, updated_at FROM marquee_settings WHERE singleton = 1",
            [],
            |row| {
                Ok(MarqueeSettings {
                    enabled: row.get(0)?,
                    text: row.get(1)?,
                    speed: row.get::<_, i64>(2)? as u32,
                    updated_at: parse_date(row.get(3)?),
                })
            },
        )?;
        Ok::<_, anyhow::Error>(settings)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_marquee_settings(
    enabled: bool,
    text: String,
    speed: u32,
    pool: State<'_, DbPool>,
    events: State<'_, crate::lan::server::SyncEventBus>,
) -> Result<MarqueeSettings, String> {
    let pool = pool.inner().clone();
    let event_bus = events.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
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
        )?;
        let _ = crate::lan::server::publish_revision(&pool, &event_bus);
        Ok::<_, anyhow::Error>(MarqueeSettings {
            enabled,
            text,
            speed: clamped_speed,
            updated_at: now,
        })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}
