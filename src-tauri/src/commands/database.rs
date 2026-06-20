use tauri::State;
use crate::db::DbPool;
use serde_json::Value;

#[tauri::command]
pub async fn get_db_tables(pool: State<'_, DbPool>) -> Result<Vec<String>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut tables = Vec::new();
        for r in rows {
            tables.push(r.map_err(|e| e.to_string())?);
        }
        Ok(tables)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_db_table_data(table_name: String, pool: State<'_, DbPool>) -> Result<Value, String> {
    let allowed = [
        "screens",
        "content_items",
        "playlists",
        "playlist_items",
        "schedule_slots",
        "analytics_events",
        "device_settings",
        "pairing_requests",
        "player_heartbeats",
        "asset_checksums",
        "production_datasets",
        "production_dashboards",
        "dispatched_trucks",
    ];
    if !allowed.contains(&table_name.as_str()) {
        return Err("Table not allowed".to_string());
    }

    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let query = format!("SELECT * FROM {}", table_name);
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let column_names: Vec<String> = stmt
            .column_names()
            .into_iter()
            .map(|s| s.to_string())
            .collect();
        let column_count = stmt.column_count();

        let mut rows = Vec::new();
        let mut query_rows = stmt.query([]).map_err(|e| e.to_string())?;
        while let Some(row) = query_rows.next().map_err(|e| e.to_string())? {
            let mut row_map = serde_json::Map::new();
            for i in 0..column_count {
                let col_name = &column_names[i];
                let val: Value = match row.get_ref(i).map_err(|e| e.to_string())? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => Value::Number(n.into()),
                    rusqlite::types::ValueRef::Real(n) => {
                        if let Some(num) = serde_json::Number::from_f64(n) {
                            Value::Number(num)
                        } else {
                            Value::Null
                        }
                    }
                    rusqlite::types::ValueRef::Text(s) => {
                        let text = std::str::from_utf8(s).unwrap_or("");
                        Value::String(text.to_string())
                    }
                    rusqlite::types::ValueRef::Blob(b) => {
                        Value::String(format!("Blob: {} bytes", b.len()))
                    }
                };
                row_map.insert(col_name.clone(), val);
            }
            rows.push(Value::Object(row_map));
        }

        let mut result = serde_json::Map::new();
        result.insert(
            "columns".to_string(),
            Value::Array(column_names.into_iter().map(Value::String).collect()),
        );
        result.insert("rows".to_string(), Value::Array(rows));
        Ok(Value::Object(result))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn export_db_table_to_csv(table_name: String, pool: State<'_, DbPool>) -> Result<String, String> {
    let data = get_db_table_data(table_name, pool).await?;
    let obj = data.as_object().ok_or("Invalid data structure")?;
    let columns = obj
        .get("columns")
        .and_then(|c| c.as_array())
        .ok_or("Invalid columns")?;
    let rows = obj
        .get("rows")
        .and_then(|r| r.as_array())
        .ok_or("Invalid rows")?;

    let mut csv_string = String::new();

    // Header
    let col_headers: Vec<String> = columns
        .iter()
        .map(|c| format!("\"{}\"", c.as_str().unwrap_or("").replace('"', "\"\"")))
        .collect();
    csv_string.push_str(&col_headers.join(","));
    csv_string.push('\n');

    // Rows
    for row_val in rows {
        if let Some(row_obj) = row_val.as_object() {
            let mut row_strings = Vec::new();
            for col in columns {
                let col_name = col.as_str().unwrap_or("");
                let val = row_obj.get(col_name).unwrap_or(&Value::Null);
                let val_str = match val {
                    Value::Null => "".to_string(),
                    Value::Bool(b) => b.to_string(),
                    Value::Number(n) => n.to_string(),
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                row_strings.push(format!("\"{}\"", val_str.replace('"', "\"\"")));
            }
            csv_string.push_str(&row_strings.join(","));
            csv_string.push('\n');
        }
    }
    Ok(csv_string)
}

#[tauri::command]
pub async fn backup_content_library_to_zip(
    save_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Manager;
    use std::fs::File;
    use std::io::{Write, Read};

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let media_dir = std::path::PathBuf::from(&app_data_dir).join("media");
    if !media_dir.exists() {
        return Err("Media directory does not exist".to_string());
    }

    let file = File::create(&save_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let entries = std::fs::read_dir(&media_dir).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or("Invalid file name")?;

            zip.start_file(file_name, options).map_err(|e| e.to_string())?;
            let mut f = File::open(&path).map_err(|e| e.to_string())?;
            f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
            buffer.clear();
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_text_file(
    path: String,
    content: String,
) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}
