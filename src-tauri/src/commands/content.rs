use tauri::State;
use crate::db::DbPool;
use crate::models::{ContentItem, ContentType};
use rusqlite::params;

#[tauri::command]
pub async fn get_content_items(pool: State<'_, DbPool>) -> Result<Vec<ContentItem>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, content_type, file_path, url, duration_secs, tags, created_at
                 FROM content_items ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let ct_str: String = row.get(2)?;
                let content_type = match ct_str.as_str() {
                    "Video" => ContentType::Video,
                    "Image" => ContentType::Image,
                    "WebApp" => ContentType::WebApp,
                    "Ad" => ContentType::Ad,
                    "Slideshow" => ContentType::Slideshow,
                    _ => ContentType::Image,
                };

                let tags_str: String = row.get(6).unwrap_or_else(|_| "[]".to_string());
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

                let created_at_str: String = row.get(7)?;
                let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now());

                Ok(ContentItem {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content_type,
                    file_path: row.get(3)?,
                    url: row.get(4)?,
                    duration_secs: row.get::<_, i32>(5)? as u32,
                    tags,
                    created_at,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        for item_res in rows {
            items.push(item_res.map_err(|e| e.to_string())?);
        }

        Ok(items)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn add_content_item(
    name: String,
    content_type: String,
    file_path: Option<String>,
    url: Option<String>,
    duration_secs: u32,
    tags: Vec<String>,
    pool: State<'_, DbPool>,
) -> Result<ContentItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let pool = pool.inner().clone();

    let ct = match content_type.as_str() {
        "Video" => ContentType::Video,
        "Image" => ContentType::Image,
        "WebApp" => ContentType::WebApp,
        "Ad" => ContentType::Ad,
        "Slideshow" => ContentType::Slideshow,
        _ => ContentType::Image,
    };

    let duration = duration_secs as i32;
    let tags_str = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

    let id_clone = id.clone();
    let name_clone = name.clone();
    let content_type_clone = content_type.clone();
    let file_path_clone = file_path.clone();
    let url_clone = url.clone();

    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO content_items (id, name, content_type, file_path, url, duration_secs, tags, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id_clone,
                name_clone,
                content_type_clone,
                file_path_clone,
                url_clone,
                duration,
                tags_str,
                now.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(ContentItem {
        id,
        name,
        content_type: ct,
        file_path,
        url,
        duration_secs,
        tags,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_content_item(id: String, pool: State<'_, DbPool>) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM content_items WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_local_content_file(
    filename: String,
    bytes: Vec<u8>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::Manager;
    
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let media_dir = std::path::PathBuf::from(&app_data_dir).join("media");
    tokio::fs::create_dir_all(&media_dir)
        .await
        .map_err(|e| e.to_string())?;

    let file_path = media_dir.join(&filename);
    tokio::fs::write(&file_path, &bytes)
        .await
        .map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}
