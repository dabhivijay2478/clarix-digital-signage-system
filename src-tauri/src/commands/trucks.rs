use tauri::State;
use chrono::{Datelike, Duration, TimeZone, Utc};
use crate::db::DbPool;

use crate::{lan::server::TruckAlertBus, models::{ActiveTruck, TruckDispatchSummary, TruckScreenAlert}};

fn normalize_import_key_part(value: Option<&str>) -> String {
    value
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect()
}

fn truck_import_key(truck: &ActiveTruck) -> String {
    let delivery_gate = truck
        .delivery_batch_gate
        .as_deref()
        .or(truck.gate_no.as_deref());
    [
        normalize_import_key_part(Some(&truck.registration_number)),
        normalize_import_key_part(truck.shipment_document_no.as_deref()),
        normalize_import_key_part(delivery_gate),
    ].join("|")
}

fn upsert_all_truck_record(conn: &rusqlite::Connection, truck: &ActiveTruck) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO all_trucks (
            id, import_key, registration_number, gate_no, delivery_batch_no, delivery_batch_gate,
            shipment_document_no, is_waiting, is_loading, is_in, is_out,
            waiting_at, loading_at, in_at, out_at, created_at, updated_at, loading_duration
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
         ON CONFLICT(import_key) DO UPDATE SET
            registration_number = excluded.registration_number,
            gate_no = excluded.gate_no,
            delivery_batch_no = excluded.delivery_batch_no,
            delivery_batch_gate = excluded.delivery_batch_gate,
            shipment_document_no = excluded.shipment_document_no,
            is_waiting = excluded.is_waiting,
            is_loading = excluded.is_loading,
            is_in = excluded.is_in,
            is_out = excluded.is_out,
            waiting_at = excluded.waiting_at,
            loading_at = excluded.loading_at,
            in_at = excluded.in_at,
            out_at = excluded.out_at,
            updated_at = excluded.updated_at,
            loading_duration = excluded.loading_duration",
        rusqlite::params![
            truck.id,
            truck_import_key(truck),
            truck.registration_number,
            truck.gate_no,
            truck.delivery_batch_no,
            truck.delivery_batch_gate,
            truck.shipment_document_no,
            truck.is_waiting,
            truck.is_loading,
            truck.is_in,
            truck.is_out,
            truck.waiting_at,
            truck.loading_at,
            truck.in_at,
            truck.out_at,
            truck.created_at,
            now,
            truck.loading_duration
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_dispatched_truck(
    truck: ActiveTruck,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO dispatched_trucks (
                id, registration_number, gate_no,
                waiting_at, loading_at, in_at, out_at, created_at, loading_duration
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                truck.id,
                truck.registration_number,
                truck.gate_no,
                truck.waiting_at,
                truck.loading_at,
                truck.in_at,
                truck.out_at,
                truck.created_at,
                truck.loading_duration
            ],
        )
        .map_err(|e| e.to_string())?;
        upsert_all_truck_record(&conn, &truck)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_active_trucks(pool: State<'_, DbPool>) -> Result<Vec<ActiveTruck>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, registration_number, gate_no,
                        waiting_at, loading_at, in_at, out_at, created_at, loading_duration
                 FROM active_trucks
                 ORDER BY order_index ASC, created_at ASC"
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let waiting_at: Option<String> = row.get(3)?;
                let loading_at: Option<String> = row.get(4)?;
                let in_at: Option<String> = row.get(5)?;
                let out_at: Option<String> = row.get(6)?;
                Ok(ActiveTruck {
                    id: row.get(0)?,
                    registration_number: row.get(1)?,
                    gate_no: row.get(2)?,
                    delivery_batch_no: None,
                    delivery_batch_gate: None,
                    shipment_document_no: None,
                    is_waiting: waiting_at.is_some(),
                    is_loading: loading_at.is_some(),
                    is_in: in_at.is_some(),
                    is_out: out_at.is_some(),
                    waiting_at,
                    loading_at,
                    in_at,
                    out_at,
                    created_at: row.get(7)?,
                    loading_duration: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut trucks = Vec::new();
        for truck in rows {
            trucks.push(truck.map_err(|e| e.to_string())?);
        }
        Ok(trucks)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_all_trucks(pool: State<'_, DbPool>) -> Result<Vec<ActiveTruck>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, registration_number, gate_no, delivery_batch_no, delivery_batch_gate,
                        shipment_document_no, is_waiting, is_loading, is_in, is_out,
                        waiting_at, loading_at, in_at, out_at, created_at, loading_duration
                 FROM all_trucks
                 ORDER BY created_at ASC"
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ActiveTruck {
                    id: row.get(0)?,
                    registration_number: row.get(1)?,
                    gate_no: row.get(2)?,
                    delivery_batch_no: row.get(3)?,
                    delivery_batch_gate: row.get(4)?,
                    shipment_document_no: row.get(5)?,
                    is_waiting: row.get(6)?,
                    is_loading: row.get(7)?,
                    is_in: row.get(8)?,
                    is_out: row.get(9)?,
                    waiting_at: row.get(10)?,
                    loading_at: row.get(11)?,
                    in_at: row.get(12)?,
                    out_at: row.get(13)?,
                    created_at: row.get(14)?,
                    loading_duration: row.get(15)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut trucks = Vec::new();
        for truck in rows {
            trucks.push(truck.map_err(|e| e.to_string())?);
        }
        Ok(trucks)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upsert_all_trucks(
    trucks: Vec<ActiveTruck>,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for truck in &trucks {
            upsert_all_truck_record(&tx, truck)?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_all_trucks(
    ids: Vec<String>,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for id in ids {
            tx.execute("DELETE FROM all_trucks WHERE id = ?1", rusqlite::params![id])
                .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM active_trucks WHERE id = ?1", rusqlite::params![id])
                .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM dispatched_trucks WHERE id = ?1", rusqlite::params![id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_active_trucks(
    trucks: Vec<ActiveTruck>,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM active_trucks", [])
            .map_err(|e| e.to_string())?;

        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO active_trucks (
                        id, registration_number, gate_no,
                        waiting_at, loading_at, in_at, out_at, created_at, order_index, loading_duration
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                )
                .map_err(|e| e.to_string())?;

            for (index, truck) in trucks.into_iter().enumerate() {
                stmt.execute(rusqlite::params![
                    truck.id,
                    truck.registration_number,
                    truck.gate_no,
                    truck.waiting_at,
                    truck.loading_at,
                    truck.in_at,
                    truck.out_at,
                    truck.created_at,
                    index as i64,
                    truck.loading_duration,
                ])
                .map_err(|e| e.to_string())?;
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
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

pub fn query_truck_dispatch_summary(
    pool: &DbPool,
) -> Result<TruckDispatchSummary, String> {
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
}

#[tauri::command]
pub async fn get_truck_dispatch_summary(
    pool: State<'_, DbPool>,
) -> Result<TruckDispatchSummary, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || query_truck_dispatch_summary(&pool))
        .await
        .map_err(|e| e.to_string())?
}
