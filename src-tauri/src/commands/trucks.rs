use tauri::State;
use serde::Deserialize;
use crate::db::DbPool;

use crate::{lan::server::TruckAlertBus, models::TruckScreenAlert};

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
