use tauri::State;
use crate::db::DbPool;
use crate::models::AnalyticsSummary;
use rusqlite::params;

#[tauri::command]
pub async fn record_analytics_event(
    screen_id: String,
    content_id: String,
    event_type: String,
    dwell_secs: Option<f64>,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO analytics_events (id, screen_id, content_id, event_type, timestamp, dwell_secs)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                screen_id,
                content_id,
                event_type,
                now.to_rfc3339(),
                dwell_secs,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_analytics_summary(
    screen_id: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<AnalyticsSummary, String> {
    let pool = pool.inner().clone();

    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;

        let (impressions, plays, completions, skips, avg_dwell): (i64, i64, i64, i64, f64) = if let Some(ref id) = screen_id {
            let impressions: i64 = conn.query_row("SELECT COUNT(*) FROM analytics_events WHERE screen_id = ?1 AND event_type = 'Impression'", params![id], |r| r.get(0)).unwrap_or(0);
            let plays: i64 = conn.query_row("SELECT COUNT(*) FROM analytics_events WHERE screen_id = ?1 AND event_type = 'Play'", params![id], |r| r.get(0)).unwrap_or(0);
            let completions: i64 = conn.query_row("SELECT COUNT(*) FROM analytics_events WHERE screen_id = ?1 AND event_type = 'Complete'", params![id], |r| r.get(0)).unwrap_or(0);
            let skips: i64 = conn.query_row("SELECT COUNT(*) FROM analytics_events WHERE screen_id = ?1 AND event_type = 'Skip'", params![id], |r| r.get(0)).unwrap_or(0);
            let avg_dwell: f64 = conn.query_row("SELECT COALESCE(AVG(dwell_secs), 0.0) FROM analytics_events WHERE screen_id = ?1 AND dwell_secs IS NOT NULL", params![id], |r| r.get(0)).unwrap_or(0.0);
            (impressions, plays, completions, skips, avg_dwell)
        } else {
            let impressions: i64 = conn.query_row("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'Impression'", [], |r| r.get(0)).unwrap_or(0);
            let plays: i64 = conn.query_row("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'Play'", [], |r| r.get(0)).unwrap_or(0);
            let completions: i64 = conn.query_row("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'Complete'", [], |r| r.get(0)).unwrap_or(0);
            let skips: i64 = conn.query_row("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'Skip'", [], |r| r.get(0)).unwrap_or(0);
            let avg_dwell: f64 = conn.query_row("SELECT COALESCE(AVG(dwell_secs), 0.0) FROM analytics_events WHERE dwell_secs IS NOT NULL", [], |r| r.get(0)).unwrap_or(0.0);
            (impressions, plays, completions, skips, avg_dwell)
        };

        Ok(AnalyticsSummary {
            impressions,
            plays,
            completions,
            skips,
            avg_dwell_secs: avg_dwell,
            uptime_pct: 99.2, // placeholder
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_analytics_timeline(
    screen_id: Option<String>,
    days: u32,
    pool: State<'_, DbPool>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = pool.inner().clone();

    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;

        let since = (chrono::Utc::now() - chrono::Duration::days(days as i64)).to_rfc3339();
        
        let mut result = Vec::new();
        if let Some(ref id) = screen_id {
            let mut stmt = conn.prepare(
                "SELECT strftime('%Y-%m-%d', timestamp) as day, event_type, COUNT(*) as cnt
                 FROM analytics_events
                 WHERE timestamp >= ?1 AND screen_id = ?2
                 GROUP BY day, event_type
                 ORDER BY day",
            ).map_err(|e| e.to_string())?;
            
            let rows = stmt.query_map(params![since, id], |row| {
                let day: String = row.get(0)?;
                let event_type: String = row.get(1)?;
                let count: i64 = row.get(2)?;
                Ok(serde_json::json!({
                    "date": day,
                    "event_type": event_type,
                    "count": count,
                }))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                result.push(r.map_err(|e| e.to_string())?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT strftime('%Y-%m-%d', timestamp) as day, event_type, COUNT(*) as cnt
                 FROM analytics_events
                 WHERE timestamp >= ?1
                 GROUP BY day, event_type
                 ORDER BY day",
            ).map_err(|e| e.to_string())?;
            
            let rows = stmt.query_map(params![since], |row| {
                let day: String = row.get(0)?;
                let event_type: String = row.get(1)?;
                let count: i64 = row.get(2)?;
                Ok(serde_json::json!({
                    "date": day,
                    "event_type": event_type,
                    "count": count,
                }))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                result.push(r.map_err(|e| e.to_string())?);
            }
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
