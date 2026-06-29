use tauri::State;
use chrono::{Datelike, Duration, TimeZone, Utc};
use serde::Deserialize;
use crate::db::DbPool;

use crate::{lan::server::TruckAlertBus, models::{TruckDispatchSummary, TruckScreenAlert}};

#[derive(Debug, Deserialize)]
pub struct DispatchedTruck {
    pub id: String,
    pub registration_number: String,
    pub gate_no: Option<String>,
    pub is_waiting: bool,
    pub is_loading: bool,
    pub is_in: bool,
    pub is_out: bool,
    pub waiting_at: Option<String>,
    pub loading_at: Option<String>,
    pub in_at: Option<String>,
    pub out_at: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn save_dispatched_truck(
    truck: DispatchedTruck,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO dispatched_trucks (
                id, registration_number, gate_no,
                is_waiting, is_loading, is_in, is_out,
                waiting_at, loading_at, in_at, out_at, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                truck.id,
                truck.registration_number,
                truck.gate_no,
                truck.is_waiting,
                truck.is_loading,
                truck.is_in,
                truck.is_out,
                truck.waiting_at,
                truck.loading_at,
                truck.in_at,
                truck.out_at,
                truck.created_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn publish_truck_alert(
    alert: TruckScreenAlert,
    truck_alerts: State<'_, TruckAlertBus>,
) -> Result<(), String> {
    let _ = truck_alerts.0.send(alert);
    Ok(())
}

#[tauri::command]
pub async fn get_truck_dispatch_summary(
    pool: State<'_, DbPool>,
) -> Result<TruckDispatchSummary, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let now = Utc::now();
        let today_start = Utc
            .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
            .single()
            .unwrap_or(now)
            .to_rfc3339();
        let last_24h_start = (now - Duration::hours(24)).to_rfc3339();
        let month_start = Utc
            .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
            .single()
            .unwrap_or(now)
            .to_rfc3339();

        let today: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM dispatched_trucks WHERE out_at IS NOT NULL AND out_at >= ?1",
                rusqlite::params![today_start],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let last_24h: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM dispatched_trucks WHERE out_at IS NOT NULL AND out_at >= ?1",
                rusqlite::params![last_24h_start],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let this_month: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM dispatched_trucks WHERE out_at IS NOT NULL AND out_at >= ?1",
                rusqlite::params![month_start],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare("SELECT loading_at, out_at FROM dispatched_trucks WHERE loading_at IS NOT NULL AND out_at IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut total_secs = 0i64;
        let mut count = 0i64;
        for row in rows {
            let (loading_at, out_at) = row.map_err(|e| e.to_string())?;
            let Ok(start) = chrono::DateTime::parse_from_rfc3339(&loading_at) else {
                continue;
            };
            let Ok(end) = chrono::DateTime::parse_from_rfc3339(&out_at) else {
                continue;
            };
            let secs = end.signed_duration_since(start).num_seconds();
            if secs >= 0 {
                total_secs += secs;
                count += 1;
            }
        }

        Ok(TruckDispatchSummary {
            today: today as u32,
            last_24h: last_24h as u32,
            this_month: this_month as u32,
            avg_loading_secs: if count > 0 { Some((total_secs / count) as u32) } else { None },
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
