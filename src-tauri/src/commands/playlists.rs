use tauri::State;
use crate::db::DbPool;
use crate::models::{Playlist, PlaylistItem, TransitionEffect};
use rusqlite::params;

#[tauri::command]
pub async fn get_playlists(pool: State<'_, DbPool>) -> Result<Vec<Playlist>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, loop_enabled, transition, created_at FROM playlists ORDER BY name")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let transition_str: String = row.get(3)?;
                let transition = match transition_str.as_str() {
                    "None" => TransitionEffect::None,
                    "Slide" => TransitionEffect::Slide,
                    "Zoom" => TransitionEffect::Zoom,
                    _ => TransitionEffect::Fade,
                };

                let created_at_str: String = row.get(4)?;
                let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now());

                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    items: Vec::new(),
                    loop_enabled: row.get(2)?,
                    transition,
                    created_at,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut playlists = Vec::new();
        for playlist_res in rows {
            playlists.push(playlist_res.map_err(|e| e.to_string())?);
        }

        // Load items for each playlist
        let mut result = Vec::with_capacity(playlists.len());
        for mut playlist in playlists {
            let mut item_stmt = conn
                .prepare(
                    "SELECT content_id, order_index, override_duration, display_schedule
                     FROM playlist_items
                     WHERE playlist_id = ?1
                     ORDER BY order_index",
                )
                .map_err(|e| e.to_string())?;

            let item_rows = item_stmt
                .query_map(params![playlist.id], |item_row| {
                    let order_idx: i32 = item_row.get(1)?;
                    let override_dur: Option<i32> = item_row.get(2)?;
                    
                    let display_sched_str: String = item_row.get(3).unwrap_or_else(|_| "{}".to_string());
                    let display_sched: Option<serde_json::Value> = serde_json::from_str(&display_sched_str).ok();

                    Ok(PlaylistItem {
                        content_id: item_row.get(0)?,
                        order: order_idx as u32,
                        override_duration: override_dur.map(|d| d as u32),
                        display_schedule: display_sched,
                    })
                })
                .map_err(|e| e.to_string())?;

            let mut items = Vec::new();
            for item_res in item_rows {
                items.push(item_res.map_err(|e| e.to_string())?);
            }

            playlist.items = items;
            result.push(playlist);
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_playlist(
    name: String,
    transition: String,
    loop_enabled: bool,
    pool: State<'_, DbPool>,
) -> Result<Playlist, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let pool = pool.inner().clone();

    let trans = match transition.as_str() {
        "None" => TransitionEffect::None,
        "Slide" => TransitionEffect::Slide,
        "Zoom" => TransitionEffect::Zoom,
        _ => TransitionEffect::Fade,
    };

    let id_clone = id.clone();
    let name_clone = name.clone();
    let transition_clone = transition.clone();

    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO playlists (id, name, loop_enabled, transition, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id_clone, name_clone, loop_enabled, transition_clone, now.to_rfc3339()],
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(Playlist {
        id,
        name,
        items: Vec::new(),
        loop_enabled,
        transition: trans,
        created_at: now,
    })
}

#[tauri::command]
pub async fn update_playlist_items(
    playlist_id: String,
    items: Vec<PlaylistItem>,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();

    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // Remove existing items
        tx.execute(
            "DELETE FROM playlist_items WHERE playlist_id = ?1",
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;

        // Insert new items
        for item in &items {
            let order_idx = item.order as i32;
            let override_dur: Option<i32> = item.override_duration.map(|d| d as i32);
            let item_id = uuid::Uuid::new_v4().to_string();

            let display_sched_str = match &item.display_schedule {
                Some(val) => serde_json::to_string(val).unwrap_or_else(|_| "{}".to_string()),
                None => "{}".to_string(),
            };

            tx.execute(
                "INSERT INTO playlist_items (id, playlist_id, content_id, order_index, override_duration, display_schedule)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    item_id,
                    playlist_id,
                    item.content_id,
                    order_idx,
                    override_dur,
                    display_sched_str,
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_playlist(id: String, pool: State<'_, DbPool>) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
