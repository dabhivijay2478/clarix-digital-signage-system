use crate::lan::{LanDiscoveryState, PeerScreen, LanServerPort};
use crate::db::DbPool;
use tauri::State;
use rusqlite::params;

/// Returns all currently discovered LAN peers (screens broadcasting SignalOS on the network).
#[tauri::command]
pub async fn get_lan_peers(
    lan_state: State<'_, LanDiscoveryState>,
) -> Result<Vec<PeerScreen>, String> {
    Ok(lan_state.read().await.get_peers().await)
}

/// Checks if a specific screen IP address is reachable on the LAN.
/// Returns true if online, false if unreachable.
#[tauri::command]
pub async fn check_screen_online(ip_address: String) -> Result<bool, String> {
    Ok(crate::lan::probe_host_reachable(&ip_address).await)
}

/// Bulk probe — returns a list of (screen_id, is_online) pairs for all
/// registered screens that have an IP address, probed in parallel.
#[tauri::command]
pub async fn check_all_screens_online(
    pool: State<'_, DbPool>,
) -> Result<Vec<(String, bool)>, String> {
    let pool = pool.inner().clone();

    // Fetch all screens with IP addresses
    let screens = tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, ip_address FROM screens WHERE ip_address IS NOT NULL")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let ip: Option<String> = row.get(1)?;
                Ok((id, ip))
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for r in rows {
            if let Ok((id, Some(ip))) = r {
                result.push((id, ip));
            }
        }
        Ok::<_, String>(result)
    })
    .await
    .map_err(|e| e.to_string())??;

    // Probe all screens concurrently
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

    Ok(results)
}

#[tauri::command]
pub fn get_lan_server_port(port: State<'_, LanServerPort>) -> u16 {
    port.0
}

#[tauri::command]
pub async fn sync_screen_data_impl(
    screen_id: String,
    pool: DbPool,
    lan_state: LanDiscoveryState,
) -> Result<(), String> {
    let pool_clone = pool.clone();
    let id_for_query = screen_id.clone();
    let screen_ip = tokio::task::spawn_blocking(move || {
        let conn = pool_clone.get().map_err(|e| e.to_string())?;
        let ip: Option<String> = conn.query_row(
            "SELECT ip_address FROM screens WHERE id = ?1",
            params![id_for_query],
            |row| row.get(0)
        ).map_err(|e| e.to_string())?;
        Ok::<_, String>(ip)
    }).await.map_err(|e| e.to_string())??;

    let ip = match screen_ip {
        Some(ip) => ip,
        None => return Err("Screen does not have an IP address".to_string()),
    };

    // Find the port of this screen from the discovered peers
    let peers = lan_state.read().await.get_peers().await;
    let port = peers
        .iter()
        .find(|p| p.ip == ip)
        .map(|p| p.port)
        .unwrap_or(7420);

    // Fetch the sync payload from the local DB
    let pool_clone2 = pool.clone();
    let payload = tokio::task::spawn_blocking(move || {
        let conn = pool_clone2.get().map_err(|e| e.to_string())?;
        
        // 1. Fetch content items
        let mut content_stmt = conn.prepare("SELECT id, name, content_type, file_path, url, duration_secs, tags, created_at FROM content_items").map_err(|e| e.to_string())?;
        let content_rows = content_stmt.query_map([], |row| {
            let ct_str: String = row.get(2)?;
            let content_type = match ct_str.as_str() {
                "Video" => crate::models::ContentType::Video,
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
        }).map_err(|e| e.to_string())?;
        
        let mut content_items = Vec::new();
        for r in content_rows {
            content_items.push(r.map_err(|e| e.to_string())?);
        }

        // 2. Fetch playlists
        let mut playlist_stmt = conn.prepare("SELECT id, name, loop_enabled, transition, created_at FROM playlists").map_err(|e| e.to_string())?;
        let playlist_rows = playlist_stmt.query_map([], |row| {
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

            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, bool>(2)?, transition, created_at))
        }).map_err(|e| e.to_string())?;
        
        let mut playlists = Vec::new();
        for r in playlist_rows {
            let (id, name, loop_enabled, transition, created_at) = r.map_err(|e| e.to_string())?;
            
            // Fetch playlist items
            let mut items_stmt = conn.prepare(
                "SELECT content_id, order_index, override_duration, display_schedule FROM playlist_items WHERE playlist_id = ?1 ORDER BY order_index"
            ).map_err(|e| e.to_string())?;
            
            let item_rows = items_stmt.query_map(params![id], |ir| {
                let order_idx: i32 = ir.get(1)?;
                let override_dur: Option<i32> = ir.get(2)?;
                let display_schedule_str: String = ir.get(3).unwrap_or_else(|_| "{}".to_string());
                let display_schedule: Option<serde_json::Value> = serde_json::from_str(&display_schedule_str).ok();
                
                Ok(crate::models::PlaylistItem {
                    content_id: ir.get(0)?,
                    order: order_idx as u32,
                    override_duration: override_dur.map(|d| d as u32),
                    display_schedule,
                })
            }).map_err(|e| e.to_string())?;
            
            let mut items = Vec::new();
            for ir_res in item_rows {
                items.push(ir_res.map_err(|e| e.to_string())?);
            }

            playlists.push(crate::models::Playlist {
                id,
                name,
                items,
                loop_enabled,
                transition,
                created_at,
            });
        }

        // 3. Fetch schedules
        let mut schedule_stmt = conn.prepare("SELECT id, name, screen_ids, playlist_id, start_time, duration_mins, days_of_week, priority, is_active, created_at FROM schedule_slots").map_err(|e| e.to_string())?;
        let schedule_rows = schedule_stmt.query_map([], |row| {
            let screen_ids_str: String = row.get(2)?;
            let screen_ids: Vec<String> = serde_json::from_str(&screen_ids_str).unwrap_or_default();
            
            let days_str: String = row.get(6)?;
            let days_of_week: Vec<crate::models::AppWeekday> = serde_json::from_str(&days_str).unwrap_or_default();
            
            let start_time_str: String = row.get(4)?;
            let start_time = chrono::NaiveTime::parse_from_str(&start_time_str, "%H:%M:%S")
                .or_else(|_| chrono::NaiveTime::parse_from_str(&start_time_str, "%H:%M"))
                .unwrap_or_else(|_| chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap());

            let created_at_str: String = row.get(9)?;
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            Ok(crate::models::ScheduleSlot {
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
        }).map_err(|e| e.to_string())?;
        
        let mut schedule_slots = Vec::new();
        for r in schedule_rows {
            schedule_slots.push(r.map_err(|e| e.to_string())?);
        }

        Ok::<_, String>(crate::lan::server::SyncPayload {
            content_items,
            playlists,
            schedule_slots,
        })
    }).await.map_err(|e| e.to_string())??;

    // Send payload to target screen HTTP server
    let client = reqwest::Client::new();
    let sync_url = format!("http://{}:{}/sync", ip, port);
    
    tracing::info!("Syncing database to screen {} at {}", screen_id, sync_url);
    
    let resp = client
        .post(&sync_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to screen: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Screen returned error: {}", resp.status()));
    }

    // Upload content files locally
    for item in &payload.content_items {
        if let Some(ref path) = item.file_path {
            let path_buf = std::path::PathBuf::from(path);
            if path_buf.exists() && path_buf.is_file() {
                let filename = path_buf
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                tracing::info!("Uploading asset {} to screen {}", filename, screen_id);

                match tokio::fs::read(&path_buf).await {
                    Ok(bytes) => {
                        let filename_encoded = filename.replace(' ', "%20");
                        let upload_url = format!(
                            "http://{}:{}/upload?filename={}",
                            ip,
                            port,
                            filename_encoded
                        );
                        
                        let upload_resp = client
                            .post(&upload_url)
                            .body(bytes)
                            .send()
                            .await;

                        match upload_resp {
                            Ok(r) if r.status().is_success() => {
                                tracing::info!("Successfully uploaded {}", filename);
                            }
                            Ok(r) => {
                                tracing::warn!("Failed to upload {}, status: {}", filename, r.status());
                            }
                            Err(e) => {
                                tracing::warn!("Failed to upload {}, error: {}", filename, e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to read local asset file {}: {}", path, e);
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn sync_screen_data(
    screen_id: String,
    pool: State<'_, DbPool>,
    lan_state: State<'_, LanDiscoveryState>,
) -> Result<(), String> {
    sync_screen_data_impl(screen_id, pool.inner().clone(), lan_state.inner().clone()).await
}
