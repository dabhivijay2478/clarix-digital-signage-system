use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use crate::db::DbPool;
use rusqlite::params;
use chrono;
use uuid;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SyncPayload {
    pub content_items: Vec<crate::models::ContentItem>,
    pub playlists: Vec<crate::models::Playlist>,
    pub schedule_slots: Vec<crate::models::ScheduleSlot>,
}

pub async fn start_lan_server(
    db_pool: DbPool,
    app_data_dir: String,
    scheduler: Arc<crate::scheduler::SchedulerState>,
    lan_state: crate::lan::LanDiscoveryState,
) -> Result<u16, anyhow::Error> {
    // Try to bind to SIGNALOS_PORT environment variable if specified, otherwise default to 7420
    let custom_port = std::env::var("SIGNALOS_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok());

    let mut port = custom_port.unwrap_or(7420);
    let listener = loop {
        match TcpListener::bind(format!("0.0.0.0:{}", port)).await {
            Ok(l) => break l,
            Err(e) => {
                if custom_port.is_some() {
                    return Err(anyhow::anyhow!("Could not bind to specified SIGNALOS_PORT {}: {}", port, e));
                }
                port += 1;
                if port > 7450 {
                    // Fall back to port 0 (bind to any available free ephemeral port assigned by the OS)
                    match TcpListener::bind("0.0.0.0:0").await {
                        Ok(l) => break l,
                        Err(err) => return Err(anyhow::anyhow!("Failed to bind to any port, including dynamic port 0: {}", err)),
                    }
                }
            }
        }
    };

    let bound_port = listener.local_addr()?.port();
    tracing::info!("SignalOS LAN Server listening on port {}", bound_port);

    let db_pool = Arc::new(db_pool);
    let media_dir = PathBuf::from(&app_data_dir).join("media");
    tokio::fs::create_dir_all(&media_dir).await?;

    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let pool = db_pool.clone();
                    let m_dir = media_dir.clone();
                    let sched = scheduler.clone();
                    let lan = lan_state.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream, pool, m_dir, sched, lan).await {
                            tracing::error!("Error handling LAN request: {}", e);
                        }
                    });
                }
                Err(e) => {
                    tracing::error!("Error accepting connection: {}", e);
                }
            }
        }
    });

    Ok(bound_port)
}

async fn handle_connection(
    mut stream: TcpStream,
    pool: Arc<DbPool>,
    media_dir: PathBuf,
    scheduler: Arc<crate::scheduler::SchedulerState>,
    lan_state: crate::lan::LanDiscoveryState,
) -> Result<(), anyhow::Error> {
    let mut buffer = Vec::new();
    let mut temp_buf = [0u8; 1024];
    
    // Read headers until \r\n\r\n
    let mut header_end = None;
    loop {
        let n = stream.read(&mut temp_buf).await?;
        if n == 0 {
            break;
        }
        buffer.extend_from_slice(&temp_buf[..n]);
        
        // Search for \r\n\r\n
        if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
            header_end = Some(pos);
            break;
        }
        
        // Prevent buffer overflow (max 16KB headers)
        if buffer.len() > 16384 {
            send_response(&mut stream, 400, "Bad Request", "Headers too large", true).await?;
            return Ok(());
        }
    }

    let header_pos = match header_end {
        Some(pos) => pos,
        None => {
            send_response(&mut stream, 400, "Bad Request", "Malformed HTTP request", true).await?;
            return Ok(());
        }
    };

    // Split headers and initial body read
    let header_part = &buffer[..header_pos];
    let body_start_pos = header_pos + 4;
    let initial_body = &buffer[body_start_pos..];

    // Parse request line
    let header_str = String::from_utf8_lossy(header_part);
    let mut lines = header_str.lines();
    let req_line = match lines.next() {
        Some(line) => line,
        None => {
            send_response(&mut stream, 400, "Bad Request", "Empty request line", true).await?;
            return Ok(());
        }
    };

    let parts: Vec<&str> = req_line.split_whitespace().collect();
    if parts.len() < 3 {
        send_response(&mut stream, 400, "Bad Request", "Malformed request line", true).await?;
        return Ok(());
    }

    let method = parts[0];
    let path_and_query = parts[1];

    // Parse headers to extract content-length
    let mut content_length = 0;
    for line in lines {
        if line.is_empty() {
            break;
        }
        let kv: Vec<&str> = line.splitn(2, ':').collect();
        if kv.len() == 2 {
            let key = kv[0].trim().to_lowercase();
            let val = kv[1].trim();
            if key == "content-length" {
                content_length = val.parse().unwrap_or(0);
            }
        }
    }

    // Read remaining body bytes
    let mut body = initial_body.to_vec();
    if body.len() < content_length {
        let mut remaining = content_length - body.len();
        let mut body_buf = vec![0u8; 4096];
        while remaining > 0 {
            let n = stream.read(&mut body_buf).await?;
            if n == 0 {
                break;
            }
            body.extend_from_slice(&body_buf[..n]);
            if n <= remaining {
                remaining -= n;
            } else {
                remaining = 0;
            }
        }
    }

    // Support CORS preflight
    if method == "OPTIONS" {
        send_cors_response(&mut stream).await?;
        return Ok(());
    }

    // Handle routes
    let uri = path_and_query.split('?').next().unwrap_or("/");
    let query = path_and_query.split('?').nth(1).unwrap_or("");

    match (method, uri) {
        ("POST", "/sync") => {
            match serde_json::from_slice::<SyncPayload>(&body) {
                Ok(payload) => {
                    if let Err(e) = db_sync_payload(&pool, payload).await {
                        send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Sync failed: {}\"}}", e), true).await?;
                    } else {
                        send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/upload") => {
            let mut filename = "uploaded_file".to_string();
            for part in query.split('&') {
                let kv: Vec<&str> = part.split('=').collect();
                if kv.len() == 2 && kv[0] == "filename" {
                    filename = url_decode(kv[1]);
                }
            }

            // Sanitize filename to prevent directory traversal
            let file_stem = std::path::Path::new(&filename)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy();
            let dest_path = media_dir.join(&*file_stem);

            match tokio::fs::write(&dest_path, &body).await {
                Ok(_) => {
                    tracing::info!("Saved media file to {:?}", dest_path);
                    let path_str = dest_path.to_string_lossy().to_string().replace('\\', "\\\\");
                    send_response(&mut stream, 200, "OK", &format!("{{\"status\":\"success\",\"path\":\"{}\"}}", path_str), true).await?;
                }
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"Failed to write file: {}\"}}", e), true).await?;
                }
            }
        }
        ("GET", "/api/analytics/summary") => {
            let mut screen_id: Option<String> = None;
            for part in query.split('&') {
                let kv: Vec<&str> = part.split('=').collect();
                if kv.len() == 2 && kv[0] == "screen_id" {
                    screen_id = Some(kv[1].to_string());
                }
            }

            let pool = pool.clone();
            match tokio::task::spawn_blocking(move || -> Result<String, anyhow::Error> {
                let conn = pool.get()?;
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

                let summary = serde_json::json!({
                    "impressions": impressions,
                    "plays": plays,
                    "completions": completions,
                    "skips": skips,
                    "avg_dwell_secs": avg_dwell,
                    "uptime_pct": 99.2
                });

                Ok(serde_json::to_string(&summary)?)
            }).await? {
                Ok(json) => {
                    send_response(&mut stream, 200, "OK", &json, true).await?;
                }
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"{}\"}}", e), true).await?;
                }
            }
        }
        ("GET", "/api/analytics/timeline") => {
            let mut screen_id: Option<String> = None;
            let mut days = 7;
            for part in query.split('&') {
                let kv: Vec<&str> = part.split('=').collect();
                if kv.len() == 2 {
                    if kv[0] == "screen_id" {
                        screen_id = Some(kv[1].to_string());
                    } else if kv[0] == "days" {
                        days = kv[1].parse::<i64>().unwrap_or(7);
                    }
                }
            }

            let pool = pool.clone();
            match tokio::task::spawn_blocking(move || -> Result<String, anyhow::Error> {
                let conn = pool.get()?;
                let since = (chrono::Utc::now() - chrono::Duration::days(days)).to_rfc3339();
                let mut result = Vec::new();
                if let Some(ref id) = screen_id {
                    let mut stmt = conn.prepare(
                        "SELECT strftime('%Y-%m-%d', timestamp) as day, event_type, COUNT(*) as cnt
                         FROM analytics_events
                         WHERE timestamp >= ?1 AND screen_id = ?2
                         GROUP BY day, event_type
                         ORDER BY day",
                    )?;
                    let rows = stmt.query_map(params![since, id], |row| {
                        let day: String = row.get(0)?;
                        let event_type: String = row.get(1)?;
                        let count: i64 = row.get(2)?;
                        Ok(serde_json::json!({
                            "date": day,
                            "event_type": event_type,
                            "count": count,
                        }))
                    })?;
                    for r in rows {
                        result.push(r?);
                    }
                } else {
                    let mut stmt = conn.prepare(
                        "SELECT strftime('%Y-%m-%d', timestamp) as day, event_type, COUNT(*) as cnt
                         FROM analytics_events
                         WHERE timestamp >= ?1
                         GROUP BY day, event_type
                         ORDER BY day",
                    )?;
                    let rows = stmt.query_map(params![since], |row| {
                        let day: String = row.get(0)?;
                        let event_type: String = row.get(1)?;
                        let count: i64 = row.get(2)?;
                        Ok(serde_json::json!({
                            "date": day,
                            "event_type": event_type,
                            "count": count,
                        }))
                    })?;
                    for r in rows {
                        result.push(r?);
                    }
                };

                Ok(serde_json::to_string(&result)?)
            }).await? {
                Ok(json) => {
                    send_response(&mut stream, 200, "OK", &json, true).await?;
                }
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"{}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/screens") => {
            #[derive(serde::Deserialize)]
            struct AddScreenPayload {
                name: String,
                location: String,
                ip_address: Option<String>,
                orientation: Option<String>,
                resolution_w: Option<i32>,
                resolution_h: Option<i32>,
                playlist_id: Option<String>,
            }

            match serde_json::from_slice::<AddScreenPayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    let id = uuid::Uuid::new_v4().to_string();
                    let now = chrono::Utc::now();
                    
                    let id_clone = id.clone();
                    let name_clone = payload.name.clone();
                    let loc_clone = payload.location.clone();
                    let ip_clone = payload.ip_address.clone();
                    let orient_clone = payload.orientation.unwrap_or_else(|| "Landscape".to_string());
                    let w_val = payload.resolution_w.unwrap_or(1920);
                    let h_val = payload.resolution_h.unwrap_or(1080);
                    let playlist_clone = payload.playlist_id.clone();
                    
                    match tokio::task::spawn_blocking(move || -> Result<crate::models::Screen, anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute(
                            "INSERT INTO screens (id, name, location, ip_address, orientation, resolution_w, resolution_h, playlist_id, created_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                            params![id_clone, name_clone, loc_clone, ip_clone, orient_clone, w_val, h_val, playlist_clone, now.to_rfc3339()],
                        )?;
                        
                        let orientation_parsed = match orient_clone.as_str() {
                            "Portrait" => crate::models::Orientation::Portrait,
                            "LandscapeFlipped" => crate::models::Orientation::LandscapeFlipped,
                            "PortraitFlipped" => crate::models::Orientation::PortraitFlipped,
                            _ => crate::models::Orientation::Landscape,
                        };

                        Ok(crate::models::Screen {
                            id: id_clone,
                            name: name_clone,
                            location: loc_clone,
                            ip_address: ip_clone,
                            orientation: orientation_parsed,
                            resolution: crate::models::ScreenResolution {
                                width: w_val as u32,
                                height: h_val as u32,
                            },
                            playlist_id: playlist_clone,
                            created_at: now,
                            ..Default::default()
                        })
                    }).await? {
                        Ok(screen) => {
                            send_response(&mut stream, 200, "OK", &serde_json::to_string(&screen)?, true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/screens/power") => {
            #[derive(serde::Deserialize)]
            struct UpdatePowerPayload {
                id: String,
                on: bool,
            }

            match serde_json::from_slice::<UpdatePowerPayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute(
                            "UPDATE screens SET power_on = ?1 WHERE id = ?2",
                            params![payload.on, payload.id],
                        )?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/screens/brightness") => {
            #[derive(serde::Deserialize)]
            struct UpdateBrightnessPayload {
                id: String,
                brightness: u8,
            }

            match serde_json::from_slice::<UpdateBrightnessPayload>(&body) {
                Ok(payload) => {
                    let brightness_val = payload.brightness.min(100) as i32;
                    let pool = pool.clone();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute(
                            "UPDATE screens SET brightness = ?1 WHERE id = ?2",
                            params![brightness_val, payload.id],
                        )?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/screens/edit") => {
            #[derive(serde::Deserialize)]
            struct EditScreenPayload {
                id: String,
                name: String,
                location: String,
                ip_address: Option<String>,
                orientation: Option<String>,
                resolution_w: Option<i32>,
                resolution_h: Option<i32>,
                playlist_id: Option<String>,
            }

            match serde_json::from_slice::<EditScreenPayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    let orient_clone = payload.orientation.unwrap_or_else(|| "Landscape".to_string());
                    let w_val = payload.resolution_w.unwrap_or(1920);
                    let h_val = payload.resolution_h.unwrap_or(1080);
                    let playlist_clone = payload.playlist_id.clone();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute(
                            "UPDATE screens SET name = ?1, location = ?2, ip_address = ?3, orientation = ?4, resolution_w = ?5, resolution_h = ?6, playlist_id = ?7 WHERE id = ?8",
                            params![payload.name, payload.location, payload.ip_address, orient_clone, w_val, h_val, playlist_clone, payload.id],
                        )?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/screens/operating-hours") => {
            #[derive(serde::Deserialize)]
            struct UpdateOperatingHoursPayload {
                id: String,
                operating_hours: serde_json::Value,
            }

            match serde_json::from_slice::<UpdateOperatingHoursPayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    let operating_hours_str = serde_json::to_string(&payload.operating_hours)?;
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute(
                            "UPDATE screens SET operating_hours = ?1 WHERE id = ?2",
                            params![operating_hours_str, payload.id],
                        )?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/screens/delete") => {
            #[derive(serde::Deserialize)]
            struct DeletePayload {
                id: String,
            }

            match serde_json::from_slice::<DeletePayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute("DELETE FROM screens WHERE id = ?1", params![payload.id])?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/screens/sync") => {
            #[derive(serde::Deserialize)]
            struct SyncScreenPayload {
                screen_id: String,
            }

            match serde_json::from_slice::<SyncScreenPayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    let lan = lan_state.clone();
                    match crate::commands::lan::sync_screen_data_impl(payload.screen_id, (*pool).clone(), lan).await {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"Sync Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/content") => {
            #[derive(serde::Deserialize)]
            struct AddContentPayload {
                name: String,
                content_type: String,
                file_path: Option<String>,
                url: Option<String>,
                duration_secs: u32,
                tags: Vec<String>,
            }

            match serde_json::from_slice::<AddContentPayload>(&body) {
                Ok(payload) => {
                    let id = uuid::Uuid::new_v4().to_string();
                    let now = chrono::Utc::now();
                    let pool = pool.clone();

                    let ct = match payload.content_type.as_str() {
                        "Video" => crate::models::ContentType::Video,
                        "Image" => crate::models::ContentType::Image,
                        "WebApp" => crate::models::ContentType::WebApp,
                        "Ad" => crate::models::ContentType::Ad,
                        "Slideshow" => crate::models::ContentType::Slideshow,
                        _ => crate::models::ContentType::Image,
                    };

                    let duration = payload.duration_secs as i32;
                    let tags_val = serde_json::to_string(&payload.tags).unwrap_or_else(|_| "[]".to_string());

                    let id_clone = id.clone();
                    let name_clone = payload.name.clone();
                    let type_clone = payload.content_type.clone();
                    let path_clone = payload.file_path.clone();
                    let url_clone = payload.url.clone();

                    match tokio::task::spawn_blocking(move || -> Result<crate::models::ContentItem, anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute(
                            "INSERT INTO content_items (id, name, content_type, file_path, url, duration_secs, tags, created_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                            params![
                                id_clone,
                                name_clone,
                                type_clone,
                                path_clone,
                                url_clone,
                                duration,
                                tags_val,
                                now.to_rfc3339(),
                            ],
                        )?;
                        Ok(crate::models::ContentItem {
                            id: id_clone,
                            name: name_clone,
                            content_type: ct,
                            file_path: path_clone,
                            url: url_clone,
                            duration_secs: payload.duration_secs,
                            tags: payload.tags,
                            created_at: now,
                        })
                    }).await? {
                        Ok(item) => {
                            send_response(&mut stream, 200, "OK", &serde_json::to_string(&item)?, true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/content/delete") => {
            #[derive(serde::Deserialize)]
            struct DeletePayload {
                id: String,
            }

            match serde_json::from_slice::<DeletePayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute("DELETE FROM content_items WHERE id = ?1", params![payload.id])?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/playlists") => {
            #[derive(serde::Deserialize)]
            struct CreatePlaylistPayload {
                name: String,
                transition: String,
                loop_enabled: bool,
            }

            match serde_json::from_slice::<CreatePlaylistPayload>(&body) {
                Ok(payload) => {
                    let id = uuid::Uuid::new_v4().to_string();
                    let now = chrono::Utc::now();
                    let pool = pool.clone();

                    let trans = match payload.transition.as_str() {
                        "None" => crate::models::TransitionEffect::None,
                        "Slide" => crate::models::TransitionEffect::Slide,
                        "Zoom" => crate::models::TransitionEffect::Zoom,
                        _ => crate::models::TransitionEffect::Fade,
                    };

                    let id_clone = id.clone();
                    let name_clone = payload.name.clone();
                    let transition_clone = payload.transition.clone();

                    match tokio::task::spawn_blocking(move || -> Result<crate::models::Playlist, anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute(
                            "INSERT INTO playlists (id, name, loop_enabled, transition, created_at)
                             VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![id_clone, name_clone, payload.loop_enabled, transition_clone, now.to_rfc3339()],
                        )?;
                        Ok(crate::models::Playlist {
                            id: id_clone,
                            name: name_clone,
                            items: Vec::new(),
                            loop_enabled: payload.loop_enabled,
                            transition: trans,
                            created_at: now,
                        })
                    }).await? {
                        Ok(playlist) => {
                            send_response(&mut stream, 200, "OK", &serde_json::to_string(&playlist)?, true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/playlists/items") => {
            #[derive(serde::Deserialize)]
            struct UpdatePlaylistItemsPayload {
                playlist_id: String,
                items: Vec<crate::models::PlaylistItem>,
            }

            match serde_json::from_slice::<UpdatePlaylistItemsPayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let mut conn = pool.get()?;
                        let transaction = conn.transaction()?;

                        transaction.execute(
                            "DELETE FROM playlist_items WHERE playlist_id = ?1",
                            params![payload.playlist_id],
                        )?;

                        for item in &payload.items {
                            let order_idx = item.order as i32;
                            let override_dur: Option<i32> = item.override_duration.map(|d| d as i32);
                            let display_sched = serde_json::to_string(&item.display_schedule.clone().unwrap_or_else(|| serde_json::json!({})))?;
                            let item_id = uuid::Uuid::new_v4().to_string();

                            transaction.execute(
                                "INSERT INTO playlist_items (id, playlist_id, content_id, order_index, override_duration, display_schedule)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                                params![
                                    item_id,
                                    payload.playlist_id,
                                    item.content_id,
                                    order_idx,
                                    override_dur,
                                    display_sched,
                                ],
                            )?;
                        }

                        transaction.commit()?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/playlists/delete") => {
            #[derive(serde::Deserialize)]
            struct DeletePayload {
                id: String,
            }

            match serde_json::from_slice::<DeletePayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute("DELETE FROM playlists WHERE id = ?1", params![payload.id])?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/schedule") => {
            #[derive(serde::Deserialize)]
            struct AddSchedulePayload {
                name: String,
                screen_ids: Vec<String>,
                playlist_id: String,
                start_time: String,
                duration_mins: u32,
                days_of_week: Vec<crate::models::AppWeekday>,
                priority: u8,
            }

            match serde_json::from_slice::<AddSchedulePayload>(&body) {
                Ok(payload) => {
                    let id = uuid::Uuid::new_v4().to_string();
                    let now = chrono::Utc::now();
                    let pool_for_query = pool.clone();
                    let pool_for_reload = pool.clone();
                    let scheduler_state = scheduler.clone();

                    let parsed_time = chrono::NaiveTime::parse_from_str(&payload.start_time, "%H:%M:%S")
                        .or_else(|_| chrono::NaiveTime::parse_from_str(&payload.start_time, "%H:%M"))
                        .map_err(|e| anyhow::anyhow!("Invalid start_time format: {}", e));

                    let parsed_time = match parsed_time {
                        Ok(t) => t,
                        Err(e) => {
                            send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"{}\"}}", e), true).await?;
                            return Ok(());
                        }
                    };

                    let duration = payload.duration_mins as i32;
                    let priority_val = payload.priority as i32;
                    let screen_ids_val = serde_json::to_value(&payload.screen_ids).unwrap_or_else(|_| serde_json::json!([]));
                    let days_val = serde_json::to_value(&payload.days_of_week).unwrap_or_else(|_| serde_json::json!([]));

                    let id_clone = id.clone();
                    let name_clone = payload.name.clone();
                    let playlist_clone = payload.playlist_id.clone();

                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool_for_query.get()?;
                        let parsed_time_str = parsed_time.format("%H:%M:%S").to_string();
                        conn.execute(
                            "INSERT INTO schedule_slots (id, name, screen_ids, playlist_id, start_time,
                             duration_mins, days_of_week, priority, is_active, created_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
                            params![
                                id_clone,
                                name_clone,
                                serde_json::to_string(&screen_ids_val).unwrap_or_default(),
                                playlist_clone,
                                parsed_time_str,
                                duration,
                                serde_json::to_string(&days_val).unwrap_or_default(),
                                priority_val,
                                now.to_rfc3339(),
                            ],
                        )?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            scheduler_state.reload(&pool_for_reload).await;
                            send_response(&mut stream, 200, "OK", &format!("{{\"status\":\"success\",\"id\":\"{}\"}}", id), true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/schedule/delete") => {
            #[derive(serde::Deserialize)]
            struct DeletePayload {
                id: String,
            }

            match serde_json::from_slice::<DeletePayload>(&body) {
                Ok(payload) => {
                    let pool_for_query = pool.clone();
                    let pool_for_reload = pool.clone();
                    let scheduler_state = scheduler.clone();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool_for_query.get()?;
                        conn.execute("UPDATE schedule_slots SET is_active = 0 WHERE id = ?1", params![payload.id])?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            scheduler_state.reload(&pool_for_reload).await;
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("GET", "/api/screens/online") => {
            let pool = pool.clone();
            let screens = match tokio::task::spawn_blocking(move || -> Result<Vec<(String, String)>, anyhow::Error> {
                let conn = pool.get()?;
                let mut stmt = conn.prepare("SELECT id, ip_address FROM screens WHERE ip_address IS NOT NULL")?;
                let rows = stmt.query_map([], |row| {
                    let id: String = row.get(0)?;
                    let ip: Option<String> = row.get(1)?;
                    Ok((id, ip))
                })?;

                let mut result = Vec::new();
                for r in rows {
                    let (id, ip_opt) = r?;
                    if let Some(ip) = ip_opt {
                        result.push((id, ip));
                    }
                }
                Ok(result)
            }).await? {
                Ok(s) => s,
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"{}\"}}", e), true).await?;
                    return Ok(());
                }
            };

            let mut tasks = Vec::new();
            for (id, ip) in screens {
                tasks.push(tokio::spawn(async move {
                    let online = crate::lan::probe_host_reachable(&ip).await;
                    (id, online)
                }));
            }

            let mut results = Vec::new();
            for task in tasks {
                if let Ok(result) = task.await {
                    results.push(result);
                }
            }

            let json = serde_json::to_string(&results)?;
            send_response(&mut stream, 200, "OK", &json, true).await?;
        }
        ("GET", "/api/screens/online/probe") => {
            let mut ip = String::new();
            for part in query.split('&') {
                let kv: Vec<&str> = part.split('=').collect();
                if kv.len() == 2 && kv[0] == "ip" {
                    ip = kv[1].to_string();
                }
            }

            let online = crate::lan::probe_host_reachable(&ip).await;
            send_response(&mut stream, 200, "OK", &online.to_string(), true).await?;
        }
        ("GET", "/api/screens") => {
            let pool = pool.clone();
            match tokio::task::spawn_blocking(move || -> Result<String, anyhow::Error> {
                let conn = pool.get()?;
                let mut stmt = conn.prepare(
                    "SELECT id, name, location, ip_address, mac_address,
                            resolution_w, resolution_h, brightness, power_on,
                            orientation, group_id, created_at, operating_hours, playlist_id
                     FROM screens ORDER BY name",
                )?;

                let rows = stmt.query_map([], |row| {
                    let orientation_str: String = row.get(9)?;
                    let orientation = match orientation_str.as_str() {
                        "Portrait" => crate::models::Orientation::Portrait,
                        "LandscapeFlipped" => crate::models::Orientation::LandscapeFlipped,
                        "PortraitFlipped" => crate::models::Orientation::PortraitFlipped,
                        _ => crate::models::Orientation::Landscape,
                    };

                    let created_at_str: String = row.get(11)?;
                    let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now());

                    let operating_hours_str: String = row.get(12).unwrap_or_else(|_| "{}".to_string());
                    let operating_hours: serde_json::Value = serde_json::from_str(&operating_hours_str)
                        .unwrap_or(serde_json::Value::Null);

                    Ok(crate::models::Screen {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        location: row.get(2)?,
                        ip_address: row.get(3)?,
                        mac_address: row.get(4)?,
                        resolution: crate::models::ScreenResolution {
                            width: row.get::<_, i32>(5)? as u32,
                            height: row.get::<_, i32>(6)? as u32,
                        },
                        is_online: true,
                        brightness: row.get::<_, i32>(7)? as u8,
                        power_on: row.get(8)?,
                        orientation,
                        group_id: row.get(10)?,
                        created_at,
                        operating_hours: Some(operating_hours),
                        playlist_id: row.get(13)?,
                    })
                })?;

                let mut screens = Vec::new();
                for r in rows {
                    screens.push(r?);
                }
                Ok(serde_json::to_string(&screens)?)
            }).await? {
                Ok(json) => {
                    send_response(&mut stream, 200, "OK", &json, true).await?;
                }
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"{}\"}}", e), true).await?;
                }
            }
        }
        ("GET", "/api/playlists") => {
            let pool = pool.clone();
            match tokio::task::spawn_blocking(move || -> Result<String, anyhow::Error> {
                let conn = pool.get()?;
                let mut stmt = conn.prepare(
                    "SELECT id, name, loop_enabled, transition, created_at FROM playlists ORDER BY name",
                )?;

                let rows = stmt.query_map([], |row| {
                    let transition_str: String = row.get(3)?;
                    let transition = match transition_str.as_str() {
                        "None" => crate::models::TransitionEffect::None,
                        "Slide" => crate::models::TransitionEffect::Slide,
                        "Zoom" => crate::models::TransitionEffect::Zoom,
                        _ => crate::models::TransitionEffect::Fade,
                    };

                    let created_at_str: String = row.get(4)?;
                    let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now());

                    Ok(crate::models::Playlist {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        items: Vec::new(),
                        loop_enabled: row.get(2)?,
                        transition,
                        created_at,
                    })
                })?;

                let mut playlists = Vec::new();
                for r in rows {
                    playlists.push(r?);
                }

                let mut result = Vec::with_capacity(playlists.len());
                for mut playlist in playlists {
                    let mut item_stmt = conn.prepare(
                        "SELECT content_id, order_index, override_duration, display_schedule
                         FROM playlist_items
                         WHERE playlist_id = ?1
                         ORDER BY order_index",
                    )?;
                    let item_rows = item_stmt.query_map(params![playlist.id], |item_row| {
                        let order_idx: i32 = item_row.get(1)?;
                        let override_dur: Option<i32> = item_row.get(2)?;
                        let display_sched_str: Option<String> = item_row.get(3)?;
                        let display_schedule: Option<serde_json::Value> = display_sched_str
                            .and_then(|s| serde_json::from_str(&s).ok());

                        Ok(crate::models::PlaylistItem {
                            content_id: item_row.get(0)?,
                            order: order_idx as u32,
                            override_duration: override_dur.map(|d| d as u32),
                            display_schedule,
                        })
                    })?;

                    let mut items = Vec::new();
                    for r in item_rows {
                        items.push(r?);
                    }

                    playlist.items = items;
                    result.push(playlist);
                }

                Ok(serde_json::to_string(&result)?)
            }).await? {
                Ok(json) => {
                    send_response(&mut stream, 200, "OK", &json, true).await?;
                }
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"{}\"}}", e), true).await?;
                }
            }
        }
        ("GET", "/api/content") => {
            let pool = pool.clone();
            match tokio::task::spawn_blocking(move || -> Result<String, anyhow::Error> {
                let conn = pool.get()?;
                let mut stmt = conn.prepare(
                    "SELECT id, name, content_type, file_path, url, duration_secs, tags, created_at
                     FROM content_items ORDER BY created_at DESC",
                )?;

                let rows = stmt.query_map([], |row| {
                    let ct_str: String = row.get(2)?;
                    let content_type = match ct_str.as_str() {
                        "Video" => crate::models::ContentType::Video,
                        "Image" => crate::models::ContentType::Image,
                        "WebApp" => crate::models::ContentType::WebApp,
                        "Ad" => crate::models::ContentType::Ad,
                        "Slideshow" => crate::models::ContentType::Slideshow,
                        _ => crate::models::ContentType::Image,
                    };

                    let tags_str: String = row.get(6).unwrap_or_else(|_| "[]".to_string());
                    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

                    let created_at_str: String = row.get(7)?;
                    let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now());

                    Ok(crate::models::ContentItem {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        content_type,
                        file_path: row.get(3)?,
                        url: row.get(4)?,
                        duration_secs: row.get::<_, i32>(5)? as u32,
                        tags,
                        created_at,
                    })
                })?;

                let mut items = Vec::new();
                for r in rows {
                    items.push(r?);
                }

                Ok(serde_json::to_string(&items)?)
            }).await? {
                Ok(json) => {
                    send_response(&mut stream, 200, "OK", &json, true).await?;
                }
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"{}\"}}", e), true).await?;
                }
            }
        }
        ("GET", "/api/schedule") => {
            let pool = pool.clone();
            match tokio::task::spawn_blocking(move || -> Result<String, anyhow::Error> {
                let conn = pool.get()?;
                let mut stmt = conn.prepare(
                    "SELECT id, name, screen_ids, playlist_id, start_time, duration_mins,
                            days_of_week, priority, is_active, created_at
                     FROM schedule_slots
                     WHERE is_active = 1
                     ORDER BY start_time",
                )?;

                let rows = stmt.query_map([], |row| {
                    let screen_ids_str: String = row.get(2).unwrap_or_else(|_| "[]".to_string());
                    let days_str: String = row.get(6).unwrap_or_else(|_| "[]".to_string());

                    let screen_ids = serde_json::from_str(&screen_ids_str).unwrap_or_default();
                    let days_of_week = serde_json::from_str(&days_str).unwrap_or_default();

                    let created_at_str: String = row.get(9)?;
                    let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now());

                    Ok(crate::models::ScheduleSlot {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        screen_ids,
                        playlist_id: row.get(3)?,
                        start_time: row.get(4)?,
                        duration_mins: row.get::<_, i32>(5)? as u32,
                        days_of_week,
                        priority: row.get::<_, i32>(7)? as u8,
                        is_active: row.get::<_, i32>(8)? != 0,
                        created_at,
                    })
                })?;

                let mut slots = Vec::new();
                for r in rows {
                    slots.push(r?);
                }

                Ok(serde_json::to_string(&slots)?)
            }).await? {
                Ok(json) => {
                    send_response(&mut stream, 200, "OK", &json, true).await?;
                }
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"{}\"}}", e), true).await?;
                }
            }
        }
        ("POST", "/api/analytics") => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct AnalyticsPayload {
                screen_id: String,
                content_id: String,
                event_type: String,
                dwell_secs: Option<f64>,
            }

            match serde_json::from_slice::<AnalyticsPayload>(&body) {
                Ok(payload) => {
                    let pool = pool.clone();
                    let id = uuid::Uuid::new_v4().to_string();
                    let now = chrono::Utc::now();
                    match tokio::task::spawn_blocking(move || -> Result<(), anyhow::Error> {
                        let conn = pool.get()?;
                        conn.execute(
                            "INSERT INTO analytics_events (id, screen_id, content_id, event_type, timestamp, dwell_secs)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                            params![
                                id,
                                payload.screen_id,
                                payload.content_id,
                                payload.event_type,
                                now.to_rfc3339(),
                                payload.dwell_secs,
                            ],
                        )?;
                        Ok(())
                    }).await? {
                        Ok(_) => {
                            send_response(&mut stream, 200, "OK", "{\"status\":\"success\"}", true).await?;
                        }
                        Err(e) => {
                            send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"DB Error: {}\"}}", e), true).await?;
                        }
                    }
                }
                Err(e) => {
                    send_response(&mut stream, 400, "Bad Request", &format!("{{\"error\":\"Invalid JSON: {}\"}}", e), true).await?;
                }
            }
        }
        ("GET", "/status") => {
            match get_local_status(&pool).await {
                Ok(status_json) => {
                    send_response(&mut stream, 200, "OK", &status_json, true).await?;
                }
                Err(e) => {
                    send_response(&mut stream, 500, "Internal Server Error", &format!("{{\"error\":\"Status query failed: {}\"}}", e), true).await?;
                }
            }
        }
        ("GET", path) if path.starts_with("/media/") => {
            let filename = &path["/media/".len()..];
            let decoded_filename = url_decode(filename);
            let file_stem = std::path::Path::new(&decoded_filename)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy();
            let file_path = media_dir.join(&*file_stem);

            if file_path.exists() && file_path.is_file() {
                match tokio::fs::read(&file_path).await {
                    Ok(content) => {
                        let content_type = match file_path.extension().and_then(|ext| ext.to_str()) {
                            Some("mp4") => "video/mp4",
                            Some("png") => "image/png",
                            Some("jpg") | Some("jpeg") => "image/jpeg",
                            Some("gif") => "image/gif",
                            _ => "application/octet-stream",
                        };
                        send_binary_response(&mut stream, 200, "OK", &content, content_type).await?;
                    }
                    Err(e) => {
                        send_response(&mut stream, 500, "Internal Server Error", &format!("Read error: {}", e), true).await?;
                    }
                }
            } else {
                send_response(&mut stream, 404, "Not Found", "File not found", true).await?;
            }
        }
        _ => {
            send_response(&mut stream, 404, "Not Found", "Route not found", true).await?;
        }
    }

    Ok(())
}

async fn send_response(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    body: &str,
    is_json: bool,
) -> Result<(), anyhow::Error> {
    let content_type = if is_json { "application/json" } else { "text/plain" };
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: {}\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Connection: close\r\n\
         \r\n\
         {}",
        status_code, status_text, content_type, body.len(), body
    );
    stream.write_all(response.as_bytes()).await?;
    stream.flush().await?;
    Ok(())
}

async fn send_cors_response(stream: &mut TcpStream) -> Result<(), anyhow::Error> {
    let response = "HTTP/1.1 204 No Content\r\n\
                    Access-Control-Allow-Origin: *\r\n\
                    Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Content-Type\r\n\
                    Access-Control-Max-Age: 86400\r\n\
                    Connection: close\r\n\
                    \r\n";
    stream.write_all(response.as_bytes()).await?;
    stream.flush().await?;
    Ok(())
}

async fn send_binary_response(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    body: &[u8],
    content_type: &str,
) -> Result<(), anyhow::Error> {
    let response_headers = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: {}\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\
         \r\n",
        status_code, status_text, content_type, body.len()
    );
    stream.write_all(response_headers.as_bytes()).await?;
    stream.write_all(body).await?;
    stream.flush().await?;
    Ok(())
}

async fn get_local_status(pool: &DbPool) -> Result<String, anyhow::Error> {
    let pool = pool.clone();
    let status = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let screen_count: i64 = conn.query_row("SELECT COUNT(*) FROM screens", [], |r| r.get(0))?;
        let content_count: i64 = conn.query_row("SELECT COUNT(*) FROM content_items", [], |r| r.get(0))?;
        
        let hostname = gethostname::gethostname().to_string_lossy().to_string();
        
        Ok::<_, anyhow::Error>(serde_json::json!({
            "hostname": hostname,
            "screens_registered": screen_count,
            "content_count": content_count,
            "status": "online"
        }))
    }).await??;
    
    Ok(serde_json::to_string(&status)?)
}

async fn db_sync_payload(
    pool: &DbPool,
    payload: SyncPayload,
) -> Result<(), anyhow::Error> {
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get()?;
        let trans = conn.transaction()?;

        // 1. Delete all existing items (cascade where appropriate)
        trans.execute("DELETE FROM schedule_slots", [])?;
        trans.execute("DELETE FROM playlist_items", [])?;
        trans.execute("DELETE FROM playlists", [])?;
        trans.execute("DELETE FROM content_items", [])?;

        // 2. Insert content items
        for item in &payload.content_items {
            let ct_str = match item.content_type {
                crate::models::ContentType::Video => "Video",
                crate::models::ContentType::Image => "Image",
                crate::models::ContentType::WebApp => "WebApp",
                crate::models::ContentType::Ad => "Ad",
                crate::models::ContentType::Slideshow => "Slideshow",
            };
            let tags_val = serde_json::to_string(&item.tags)?;
            let duration = item.duration_secs as i32;

            trans.execute(
                "INSERT INTO content_items (id, name, content_type, file_path, url, duration_secs, tags, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    item.id,
                    item.name,
                    ct_str,
                    item.file_path,
                    item.url,
                    duration,
                    tags_val,
                    item.created_at.to_rfc3339(),
                ],
            )?;
        }

        // 3. Insert playlists
        for playlist in &payload.playlists {
            let transition_str = match playlist.transition {
                crate::models::TransitionEffect::None => "None",
                crate::models::TransitionEffect::Slide => "Slide",
                crate::models::TransitionEffect::Zoom => "Zoom",
                crate::models::TransitionEffect::Fade => "Fade",
            };

            trans.execute(
                "INSERT INTO playlists (id, name, loop_enabled, transition, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    playlist.id,
                    playlist.name,
                    playlist.loop_enabled,
                    transition_str,
                    playlist.created_at.to_rfc3339(),
                ],
            )?;

            // Insert playlist items
            for item in &playlist.items {
                let item_id = uuid::Uuid::new_v4().to_string();
                let order_idx = item.order as i32;
                let override_dur: Option<i32> = item.override_duration.map(|d| d as i32);
                let display_sched = serde_json::to_string(&item.display_schedule.clone().unwrap_or_else(|| serde_json::json!({})))?;

                trans.execute(
                    "INSERT INTO playlist_items (id, playlist_id, content_id, order_index, override_duration, display_schedule) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        item_id,
                        playlist.id,
                        item.content_id,
                        order_idx,
                        override_dur,
                        display_sched,
                    ],
                )?;
            }
        }

        // 4. Insert schedule slots
        for slot in &payload.schedule_slots {
            let screen_ids_val = serde_json::to_string(&slot.screen_ids)?;
            let days_val = serde_json::to_string(&slot.days_of_week)?;
            let duration = slot.duration_mins as i32;
            let priority = slot.priority as i32;

            trans.execute(
                "INSERT INTO schedule_slots (id, name, screen_ids, playlist_id, start_time, duration_mins, days_of_week, priority, is_active, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    slot.id,
                    slot.name,
                    screen_ids_val,
                    slot.playlist_id,
                    slot.start_time,
                    duration,
                    days_val,
                    priority,
                    if slot.is_active { 1 } else { 0 },
                    slot.created_at.to_rfc3339(),
                ],
            )?;
        }

        trans.commit()?;
        Ok::<(), anyhow::Error>(())
    }).await??;

    Ok(())
}

fn url_decode(s: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut hex = String::new();
            if let Some(h1) = chars.next() {
                hex.push(h1);
            }
            if let Some(h2) = chars.next() {
                hex.push(h2);
            }
            if let Ok(b) = u8::from_str_radix(&hex, 16) {
                bytes.push(b);
            } else {
                bytes.push(b'%');
                bytes.extend_from_slice(hex.as_bytes());
            }
        } else if c == '+' {
            bytes.push(b' ');
        } else {
            let mut buf = [0; 4];
            let encoded = c.encode_utf8(&mut buf);
            bytes.extend_from_slice(encoded.as_bytes());
        }
    }
    String::from_utf8(bytes).unwrap_or_else(|_| s.to_string())
}
