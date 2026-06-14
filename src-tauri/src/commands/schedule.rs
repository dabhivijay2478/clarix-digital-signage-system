use tauri::State;
use crate::db::DbPool;
use crate::models::{ScheduleSlot, AppWeekday};
use crate::scheduler::SchedulerState;
use rusqlite::params;

#[tauri::command]
pub async fn get_schedule(pool: State<'_, DbPool>) -> Result<Vec<ScheduleSlot>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, screen_ids, playlist_id, start_time, duration_mins,
                        days_of_week, priority, is_active, created_at
                 FROM schedule_slots
                 WHERE is_active = 1
                 ORDER BY start_time",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let screen_ids_str: String = row.get(2)?;
                let screen_ids: Vec<String> = serde_json::from_str(&screen_ids_str).unwrap_or_default();

                let days_str: String = row.get(6)?;
                let days_of_week: Vec<AppWeekday> = serde_json::from_str(&days_str).unwrap_or_default();

                let start_time_str: String = row.get(4)?;
                let start_time = chrono::NaiveTime::parse_from_str(&start_time_str, "%H:%M:%S")
                    .or_else(|_| chrono::NaiveTime::parse_from_str(&start_time_str, "%H:%M"))
                    .unwrap_or_else(|_| chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap());

                let created_at_str: String = row.get(9)?;
                let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now());

                Ok(ScheduleSlot {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    screen_ids,
                    playlist_id: row.get(3)?,
                    start_time,
                    duration_mins: row.get::<_, i32>(5)? as u32,
                    days_of_week,
                    priority: row.get::<_, i32>(7)? as u8,
                    is_active: row.get(8)?,
                    created_at,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut slots = Vec::new();
        for slot_res in rows {
            slots.push(slot_res.map_err(|e| e.to_string())?);
        }

        Ok(slots)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn add_schedule_slot(
    name: String,
    screen_ids: Vec<String>,
    playlist_id: String,
    start_time: String,
    duration_mins: u32,
    days_of_week: Vec<AppWeekday>,
    priority: u8,
    pool: State<'_, DbPool>,
    scheduler: State<'_, std::sync::Arc<SchedulerState>>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    // Parse start_time string to NaiveTime
    let parsed_time = chrono::NaiveTime::parse_from_str(&start_time, "%H:%M:%S")
        .or_else(|_| chrono::NaiveTime::parse_from_str(&start_time, "%H:%M"))
        .map_err(|e| format!("Invalid start_time format: {}", e))?;

    let parsed_time_str = parsed_time.format("%H:%M:%S").to_string();

    let duration = duration_mins as i32;
    let priority_val = priority as i32;
    let screen_ids_str = serde_json::to_string(&screen_ids).unwrap_or_else(|_| "[]".to_string());
    let days_str = serde_json::to_string(&days_of_week).unwrap_or_else(|_| "[]".to_string());

    let pool_inner = pool.inner().clone();
    let pool_clone = pool_inner.clone();
    let id_clone = id.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool_clone.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO schedule_slots (id, name, screen_ids, playlist_id, start_time,
             duration_mins, days_of_week, priority, is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
            params![
                id_clone,
                name,
                screen_ids_str,
                playlist_id,
                parsed_time_str,
                duration,
                days_str,
                priority_val,
                now.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Reload the scheduler with updated slots
    scheduler.reload(&pool_inner).await;

    Ok(id)
}

#[tauri::command]
pub async fn delete_schedule_slot(
    id: String,
    pool: State<'_, DbPool>,
    scheduler: State<'_, std::sync::Arc<SchedulerState>>,
) -> Result<(), String> {
    let pool_inner = pool.inner().clone();
    let id_clone = id.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool_inner.get().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE schedule_slots SET is_active = 0 WHERE id = ?1",
            params![id_clone],
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    scheduler.reload(&pool).await;
    Ok(())
}
