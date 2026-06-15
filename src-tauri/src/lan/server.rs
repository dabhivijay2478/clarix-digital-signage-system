use std::{collections::HashMap, convert::Infallible, path::{Path as FsPath, PathBuf}, time::Duration};

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{Response, sse::{Event, KeepAlive, Sse}},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use futures_util::StreamExt;
use rusqlite::params;
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tower_http::services::{ServeDir, ServeFile};

use crate::{
    db::{self, DbPool},
    models::{
        AppWeekday, ContentItem, ContentType, DeviceIdentity, DeviceRole, Orientation, PairingRequest,
        Playlist, PlaylistItem, Screen, ScreenResolution, SyncAck, SyncAsset, SyncManifest,
        TransitionEffect,
    },
};

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct SyncPayload {
    pub screen: Option<Screen>,
    pub content_items: Vec<ContentItem>,
    pub playlists: Vec<Playlist>,
    pub schedule_slots: Vec<crate::models::ScheduleSlot>,
}

#[derive(Clone)]
pub struct SyncEventBus(pub broadcast::Sender<i64>);

#[derive(Clone)]
struct AppState {
    pool: DbPool,
    media_dir: PathBuf,
    identity: DeviceIdentity,
    events: SyncEventBus,
}

#[derive(Debug, serde::Deserialize)]
struct PairingRequestInput {
    device_id: String,
    device_name: String,
    player_kind: String,
    screen_id: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct HeartbeatInput {
    device_id: String,
    device_name: String,
    player_kind: String,
    current_revision: i64,
}

#[derive(Debug, serde::Deserialize, Default)]
struct TokenQuery {
    token: Option<String>,
}

pub async fn start_controller_server(
    pool: DbPool,
    app_data_dir: String,
    browser_assets_dir: PathBuf,
    mut identity: DeviceIdentity,
    events: SyncEventBus,
) -> anyhow::Result<u16> {
    let port = std::env::var("SIGNALOS_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(identity.service_port);
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .map_err(|error| anyhow::anyhow!(
            "Controller port {port} is unavailable. Close the conflicting application or configure SIGNALOS_PORT: {error}"
        ))?;
    identity.service_port = port;
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "UPDATE device_settings SET service_port = ?1 WHERE singleton = 1",
            params![port],
        );
    }

    let media_dir = PathBuf::from(app_data_dir).join("media");
    tokio::fs::create_dir_all(&media_dir).await?;
    let state = AppState { pool, media_dir, identity, events };

    let router = Router::new()
        .route("/v1/health", get(health))
        .route("/v1/pairing/requests", post(create_pairing_request))
        .route("/v1/pairing/requests/{id}", get(get_pairing_request))
        .route("/v1/players/heartbeat", post(player_heartbeat))
        .route("/v1/sync/manifest", get(sync_manifest))
        .route("/v1/assets/{sha256}", get(asset))
        .route("/v1/sync/ack", post(sync_ack))
        .route("/v1/events", get(stream_events))
        .route("/v1/browser/events", get(stream_browser_events))
        .route("/status", get(health))
        .route("/api/screens", get(read_screens))
        .route("/api/playlists", get(read_playlists))
        .route("/api/content", get(read_content))
        .route("/api/schedule", get(read_schedule))
        .route("/media/{filename}", get(legacy_media))
        .route_service("/player", ServeFile::new(browser_assets_dir.join("player.html")))
        .route_service("/player/", ServeFile::new(browser_assets_dir.join("player.html")))
        .fallback_service(ServeDir::new(browser_assets_dir))
        .with_state(state);

    tracing::info!("SignalOS controller listening on fixed port {port}");
    tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            tracing::error!("Controller server stopped: {error}");
        }
    });
    Ok(port)
}

async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "online",
        "device_id": state.identity.device_id,
        "display_name": state.identity.display_name,
        "role": state.identity.role,
        "protocol_version": state.identity.protocol_version,
        "port": state.identity.service_port,
        "revision": current_revision(&state.pool).unwrap_or(0),
    }))
}

async fn create_pairing_request(
    State(state): State<AppState>,
    Json(input): Json<PairingRequestInput>,
) -> Result<(StatusCode, Json<PairingRequest>), (StatusCode, String)> {
    let now = Utc::now();
    let id = uuid::Uuid::new_v4().to_string();
    let code = uuid::Uuid::new_v4().simple().to_string()[..6].to_uppercase();
    let expires_at = now + chrono::Duration::minutes(15);
    let request = PairingRequest {
        id: id.clone(),
        code: code.clone(),
        device_id: input.device_id,
        device_name: input.device_name,
        player_kind: input.player_kind,
        screen_id: input.screen_id,
        status: "pending".to_string(),
        token: None,
        controller_id: Some(state.identity.device_id.clone()),
        created_at: now.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
    };
    let pool = state.pool.clone();
    let value = request.clone();
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = pool.get()?;
        conn.execute(
            "INSERT OR REPLACE INTO pairing_requests
             (id, code, device_id, device_name, player_kind, screen_id, status, token, controller_id, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![value.id, value.code, value.device_id, value.device_name, value.player_kind,
                    value.screen_id, value.status, value.token, value.controller_id, value.created_at, value.expires_at],
        )?;
        Ok(())
    }).await.map_err(internal_error)?.map_err(internal_error)?;
    Ok((StatusCode::CREATED, Json(request)))
}

async fn get_pairing_request(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<PairingRequest>, (StatusCode, String)> {
    let pool = state.pool.clone();
    let request = tokio::task::spawn_blocking(move || query_pairing_request(&pool, &id))
        .await.map_err(internal_error)?.map_err(internal_error)?;
    request.map(Json).ok_or((StatusCode::NOT_FOUND, "Pairing request not found".to_string()))
}

async fn player_heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<HeartbeatInput>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pairing = authenticate(&state.pool, &headers, None)?;
    let screen_id = pairing.screen_id.ok_or((StatusCode::CONFLICT, "Player is not assigned to a screen".to_string()))?;
    if pairing.device_id != input.device_id {
        return Err((StatusCode::UNAUTHORIZED, "Token does not belong to this device".to_string()));
    }
    let now = Utc::now().to_rfc3339();
    let pool = state.pool.clone();
    let device_id = input.device_id;
    let name = input.device_name;
    let kind = input.player_kind;
    let screen = screen_id.clone();
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO player_heartbeats (device_id, screen_id, device_name, player_kind, current_revision, last_seen)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(device_id) DO UPDATE SET screen_id=excluded.screen_id, device_name=excluded.device_name,
             player_kind=excluded.player_kind, current_revision=excluded.current_revision, last_seen=excluded.last_seen",
            params![device_id, screen, name, kind, input.current_revision, now],
        )?;
        conn.execute(
            "UPDATE screens SET device_id = ?1, pairing_status = 'paired', last_seen = ?2,
             last_sync_revision = ?3 WHERE id = ?4",
            params![pairing.device_id, now, input.current_revision, screen_id],
        )?;
        Ok(())
    }).await.map_err(internal_error)?.map_err(internal_error)?;
    Ok(Json(serde_json::json!({ "revision": current_revision(&state.pool).unwrap_or(0) })))
}

async fn sync_manifest(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SyncManifest>, (StatusCode, String)> {
    let pairing = authenticate(&state.pool, &headers, None)?;
    let screen_id = pairing.screen_id.ok_or((StatusCode::CONFLICT, "Player is not assigned to a screen".to_string()))?;
    build_manifest(&state.pool, &screen_id).map(Json).map_err(internal_error)
}

async fn asset(
    State(state): State<AppState>,
    Path(sha256): Path<String>,
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, String)> {
    authenticate(&state.pool, &headers, query.token.as_deref())?;
    let pool = state.pool.clone();
    let file_path = tokio::task::spawn_blocking(move || -> anyhow::Result<Option<String>> {
        let conn = pool.get()?;
        let mut stmt = conn.prepare("SELECT file_path FROM asset_checksums WHERE sha256 = ?1")?;
        let mut rows = stmt.query(params![sha256])?;
        Ok(rows.next()?.map(|row| row.get(0)).transpose()?)
    }).await.map_err(internal_error)?.map_err(internal_error)?;
    let path = file_path.ok_or((StatusCode::NOT_FOUND, "Asset not found".to_string()))?;
    let bytes = tokio::fs::read(path).await.map_err(internal_error)?;
    Ok(Response::builder()
        .header("Content-Type", "application/octet-stream")
        .body(Body::from(bytes))
        .map_err(internal_error)?)
}

async fn sync_ack(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(ack): Json<SyncAck>,
) -> Result<StatusCode, (StatusCode, String)> {
    let pairing = authenticate(&state.pool, &headers, None)?;
    if let Some(screen_id) = pairing.screen_id {
        let pool = state.pool.clone();
        tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
            let conn = pool.get()?;
            conn.execute(
                "UPDATE screens SET last_sync_revision = ?1, last_seen = ?2 WHERE id = ?3",
                params![ack.revision, Utc::now().to_rfc3339(), screen_id],
            )?;
            Ok(())
        }).await.map_err(internal_error)?.map_err(internal_error)?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn stream_events(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>>, (StatusCode, String)> {
    authenticate(&state.pool, &headers, query.token.as_deref())?;
    let stream = BroadcastStream::new(state.events.0.subscribe()).filter_map(|message| async move {
        match message {
            Ok(revision) => Some(Ok(Event::default().event("revision").data(revision.to_string()))),
            Err(_) => None,
        }
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))))
}

async fn stream_browser_events(
    State(state): State<AppState>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(state.events.0.subscribe()).filter_map(|message| async move {
        match message {
            Ok(revision) => Some(Ok(Event::default().event("revision").data(revision.to_string()))),
            Err(_) => None,
        }
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

async fn read_screens(State(state): State<AppState>) -> Result<Json<Vec<Screen>>, (StatusCode, String)> {
    query_screens(&state.pool).map(Json).map_err(internal_error)
}

async fn read_playlists(State(state): State<AppState>) -> Result<Json<Vec<Playlist>>, (StatusCode, String)> {
    build_sync_payload(&state.pool, None).map(|payload| Json(payload.playlists)).map_err(internal_error)
}

async fn read_content(State(state): State<AppState>) -> Result<Json<Vec<ContentItem>>, (StatusCode, String)> {
    build_sync_payload(&state.pool, None).map(|payload| Json(payload.content_items)).map_err(internal_error)
}

async fn read_schedule(State(state): State<AppState>) -> Result<Json<Vec<crate::models::ScheduleSlot>>, (StatusCode, String)> {
    build_sync_payload(&state.pool, None).map(|payload| Json(payload.schedule_slots)).map_err(internal_error)
}

async fn legacy_media(
    State(state): State<AppState>,
    Path(filename): Path<String>,
) -> Result<Response, (StatusCode, String)> {
    let safe_name = FsPath::new(&filename).file_name().and_then(|value| value.to_str())
        .ok_or((StatusCode::BAD_REQUEST, "Invalid filename".to_string()))?;
    let bytes = tokio::fs::read(state.media_dir.join(safe_name)).await
        .map_err(|_| (StatusCode::NOT_FOUND, "Media not found".to_string()))?;
    Ok(Response::builder().body(Body::from(bytes)).map_err(internal_error)?)
}

fn authenticate(pool: &DbPool, headers: &HeaderMap, query_token: Option<&str>) -> Result<PairingRequest, (StatusCode, String)> {
    let header_token = headers.get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    let token = header_token.or(query_token).ok_or((StatusCode::UNAUTHORIZED, "Missing device token".to_string()))?;
    let conn = pool.get().map_err(internal_error)?;
    let mut stmt = conn.prepare(
        "SELECT id, code, device_id, device_name, player_kind, screen_id, status, token, controller_id, created_at, expires_at
         FROM pairing_requests WHERE token = ?1 AND status = 'approved'"
    ).map_err(internal_error)?;
    stmt.query_row(params![token], pairing_from_row)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid or expired device token".to_string()))
}

fn query_pairing_request(pool: &DbPool, id: &str) -> anyhow::Result<Option<PairingRequest>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, code, device_id, device_name, player_kind, screen_id, status, token, controller_id, created_at, expires_at
         FROM pairing_requests WHERE id = ?1"
    )?;
    let mut rows = stmt.query(params![id])?;
    Ok(rows.next()?.map(pairing_from_row).transpose()?)
}

fn pairing_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PairingRequest> {
    Ok(PairingRequest {
        id: row.get(0)?, code: row.get(1)?, device_id: row.get(2)?, device_name: row.get(3)?,
        player_kind: row.get(4)?, screen_id: row.get(5)?, status: row.get(6)?, token: row.get(7)?,
        controller_id: row.get(8)?, created_at: row.get(9)?, expires_at: row.get(10)?,
    })
}

pub fn current_revision(pool: &DbPool) -> anyhow::Result<i64> {
    let conn = pool.get()?;
    Ok(conn.query_row("SELECT current_revision FROM device_settings WHERE singleton = 1", [], |row| row.get(0))?)
}

pub fn publish_revision(pool: &DbPool, events: &SyncEventBus) -> anyhow::Result<i64> {
    let conn = pool.get()?;
    conn.execute("UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1", [])?;
    let revision: i64 = conn.query_row("SELECT current_revision FROM device_settings WHERE singleton = 1", [], |row| row.get(0))?;
    let _ = events.0.send(revision);
    Ok(revision)
}

pub fn build_manifest(pool: &DbPool, screen_id: &str) -> anyhow::Result<SyncManifest> {
    let payload = build_sync_payload(pool, Some(screen_id))?;
    let revision = current_revision(pool)?;
    let mut assets = Vec::new();
    let conn = pool.get()?;
    for item in &payload.content_items {
        let Some(path) = item.file_path.as_deref() else { continue };
        let file_path = PathBuf::from(path);
        if !file_path.is_file() { continue; }
        let bytes = std::fs::read(&file_path)?;
        let sha256 = sha256_bytes(&bytes);
        let filename = file_path.file_name().and_then(|value| value.to_str()).unwrap_or("asset").to_string();
        assets.push(SyncAsset { content_id: item.id.clone(), sha256: sha256.clone(), filename, size: bytes.len() as u64 });
        conn.execute(
            "INSERT INTO asset_checksums (content_id, sha256, file_path, file_size, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(content_id) DO UPDATE SET sha256=excluded.sha256, file_path=excluded.file_path,
             file_size=excluded.file_size, updated_at=excluded.updated_at",
            params![item.id, sha256, path, bytes.len() as i64, Utc::now().to_rfc3339()],
        )?;
    }
    Ok(SyncManifest { revision, screen_id: screen_id.to_string(), payload, assets })
}

pub fn build_sync_payload(pool: &DbPool, screen_id: Option<&str>) -> anyhow::Result<SyncPayload> {
    let conn = pool.get()?;
    let screen = screen_id.and_then(|id| query_screen(&conn, id).ok().flatten());
    let mut content_stmt = conn.prepare(
        "SELECT id, name, content_type, file_path, url, duration_secs, tags, created_at FROM content_items"
    )?;
    let content_items = content_stmt.query_map([], |row| {
        let content_type = match row.get::<_, String>(2)?.as_str() {
            "Video" => ContentType::Video, "WebApp" => ContentType::WebApp, "Ad" => ContentType::Ad,
            "Slideshow" => ContentType::Slideshow, _ => ContentType::Image,
        };
        Ok(ContentItem {
            id: row.get(0)?, name: row.get(1)?, content_type, file_path: row.get(3)?, url: row.get(4)?,
            duration_secs: row.get::<_, i64>(5)? as u32,
            tags: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
            created_at: parse_date(row.get(7)?),
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    let mut playlist_stmt = conn.prepare("SELECT id, name, loop_enabled, transition, created_at FROM playlists")?;
    let playlist_rows = playlist_stmt.query_map([], |row| Ok((
        row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, bool>(2)?,
        row.get::<_, String>(3)?, row.get::<_, String>(4)?
    )))?.collect::<Result<Vec<_>, _>>()?;
    let mut playlists = Vec::new();
    for (id, name, loop_enabled, transition, created_at) in playlist_rows {
        let mut item_stmt = conn.prepare(
            "SELECT content_id, order_index, override_duration, display_schedule
             FROM playlist_items WHERE playlist_id = ?1 ORDER BY order_index"
        )?;
        let items = item_stmt.query_map(params![id], |row| Ok(PlaylistItem {
            content_id: row.get(0)?, order: row.get::<_, i64>(1)? as u32,
            override_duration: row.get::<_, Option<i64>>(2)?.map(|value| value as u32),
            display_schedule: serde_json::from_str(&row.get::<_, String>(3)?).ok(),
        }))?.collect::<Result<Vec<_>, _>>()?;
        playlists.push(Playlist {
            id, name, items, loop_enabled,
            transition: match transition.as_str() { "None" => TransitionEffect::None, "Slide" => TransitionEffect::Slide, "Zoom" => TransitionEffect::Zoom, _ => TransitionEffect::Fade },
            created_at: parse_date(created_at),
        });
    }

    let mut schedule_stmt = conn.prepare(
        "SELECT id, name, screen_ids, playlist_id, start_time, duration_mins, days_of_week, priority, is_active, created_at
         FROM schedule_slots"
    )?;
    let schedule_slots = schedule_stmt.query_map([], |row| {
        let start: String = row.get(4)?;
        Ok(crate::models::ScheduleSlot {
            id: row.get(0)?, name: row.get(1)?,
            screen_ids: serde_json::from_str(&row.get::<_, String>(2)?).unwrap_or_default(),
            playlist_id: row.get(3)?,
            start_time: chrono::NaiveTime::parse_from_str(&start, "%H:%M:%S")
                .or_else(|_| chrono::NaiveTime::parse_from_str(&start, "%H:%M"))
                .unwrap_or_default(),
            duration_mins: row.get::<_, i64>(5)? as u32,
            days_of_week: serde_json::from_str::<Vec<AppWeekday>>(&row.get::<_, String>(6)?).unwrap_or_default(),
            priority: row.get::<_, i64>(7)? as u8, is_active: row.get(8)?,
            created_at: parse_date(row.get(9)?),
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(SyncPayload { screen, content_items, playlists, schedule_slots })
}

pub async fn run_player_sync_loop(pool: DbPool, app_data_dir: String) {
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(30)).build() {
        Ok(client) => client,
        Err(error) => { tracing::error!("Failed to initialize player sync client: {error}"); return; }
    };
    let media_dir = PathBuf::from(app_data_dir).join("media");
    let _ = tokio::fs::create_dir_all(&media_dir).await;
    loop {
        let mut synced = false;
        if let Ok(identity) = db::get_device_identity(&pool) {
            if identity.role == DeviceRole::Player {
                if let Err(error) = player_sync_once(&client, &pool, &media_dir, identity).await {
                    tracing::debug!("Player sync waiting: {error}");
                } else {
                    synced = true;
                }
            }
        }
        if synced {
            if let Ok(identity) = db::get_device_identity(&pool) {
                if let Err(error) = wait_for_revision_event(&client, &identity).await {
                    tracing::debug!("Player event stream waiting: {error}");
                    tokio::time::sleep(Duration::from_secs(15)).await;
                }
                continue;
            }
        }
        tokio::time::sleep(Duration::from_secs(15)).await;
    }
}

async fn wait_for_revision_event(
    client: &reqwest::Client,
    identity: &DeviceIdentity,
) -> anyhow::Result<()> {
    let controller = identity.controller_url.as_deref()
        .ok_or_else(|| anyhow::anyhow!("Controller address is not configured"))?
        .trim_end_matches('/');
    let token = identity.auth_token.as_deref()
        .ok_or_else(|| anyhow::anyhow!("Player is not paired"))?;
    let response = client
        .get(format!("{controller}/v1/events"))
        .bearer_auth(token)
        .send()
        .await?
        .error_for_status()?;
    let mut stream = response.bytes_stream();
    match tokio::time::timeout(Duration::from_secs(15), stream.next()).await {
        Ok(Some(Ok(_))) | Err(_) => Ok(()),
        Ok(Some(Err(error))) => Err(error.into()),
        Ok(None) => anyhow::bail!("Controller event stream closed"),
    }
}

async fn player_sync_once(
    client: &reqwest::Client,
    pool: &DbPool,
    media_dir: &FsPath,
    mut identity: DeviceIdentity,
) -> anyhow::Result<()> {
    let controller = identity.controller_url.clone().ok_or_else(|| anyhow::anyhow!("Controller address is not configured"))?;
    let base = controller.trim_end_matches('/');
    if identity.auth_token.is_none() {
        if let Some(request_id) = identity.pending_pairing_id.clone() {
            let request: PairingRequest = client.get(format!("{base}/v1/pairing/requests/{request_id}")).send().await?.error_for_status()?.json().await?;
            if request.status == "approved" {
                let token = request.token.ok_or_else(|| anyhow::anyhow!("Approved pairing has no token"))?;
                let screen_id = request.screen_id.ok_or_else(|| anyhow::anyhow!("Approved pairing has no screen"))?;
                let conn = pool.get()?;
                conn.execute(
                    "UPDATE device_settings SET auth_token=?1, controller_id=?2, screen_id=?3, pending_pairing_id=NULL WHERE singleton=1",
                    params![token, request.controller_id, screen_id],
                )?;
                identity = db::get_device_identity(pool)?;
            } else {
                return Ok(());
            }
        } else {
            return Ok(());
        }
    }
    let token = identity.auth_token.clone().unwrap_or_default();
    let screen_id = identity.screen_id.clone().ok_or_else(|| anyhow::anyhow!("Player is not assigned to a screen"))?;
    let heartbeat = HeartbeatInput {
        device_id: identity.device_id.clone(), device_name: identity.display_name.clone(),
        player_kind: "packaged".to_string(), current_revision: identity.current_revision,
    };
    client.post(format!("{base}/v1/players/heartbeat")).bearer_auth(&token).json(&heartbeat).send().await?.error_for_status()?;
    let manifest: SyncManifest = client.get(format!("{base}/v1/sync/manifest")).bearer_auth(&token).send().await?.error_for_status()?.json().await?;
    if manifest.revision <= identity.current_revision { return Ok(()); }

    let mut payload = manifest.payload;
    let asset_by_content: HashMap<String, SyncAsset> = manifest.assets.into_iter().map(|asset| (asset.content_id.clone(), asset)).collect();
    for item in &mut payload.content_items {
        let Some(asset) = asset_by_content.get(&item.id) else { continue };
        let safe_name = FsPath::new(&asset.filename).file_name().and_then(|value| value.to_str()).unwrap_or("asset");
        let destination = media_dir.join(format!("{}-{safe_name}", asset.sha256));
        let valid_existing = std::fs::read(&destination).map(|bytes| sha256_bytes(&bytes) == asset.sha256).unwrap_or(false);
        if !valid_existing {
            let bytes = client.get(format!("{base}/v1/assets/{}", asset.sha256)).bearer_auth(&token).send().await?.error_for_status()?.bytes().await?;
            if sha256_bytes(&bytes) != asset.sha256 { anyhow::bail!("Asset checksum verification failed for {}", asset.filename); }
            let temporary = destination.with_extension("part");
            tokio::fs::write(&temporary, &bytes).await?;
            tokio::fs::rename(&temporary, &destination).await?;
        }
        item.file_path = Some(destination.to_string_lossy().to_string());
    }
    apply_sync_payload(pool, payload)?;
    let conn = pool.get()?;
    conn.execute(
        "UPDATE device_settings SET current_revision=?1, last_successful_sync=?2 WHERE singleton=1",
        params![manifest.revision, Utc::now().to_rfc3339()],
    )?;
    let ack = SyncAck { revision: manifest.revision, status: "applied".to_string(), message: Some(screen_id) };
    client.post(format!("{base}/v1/sync/ack")).bearer_auth(token).json(&ack).send().await?.error_for_status()?;
    Ok(())
}

pub fn apply_sync_payload(pool: &DbPool, payload: SyncPayload) -> anyhow::Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM schedule_slots", [])?;
    tx.execute("DELETE FROM playlist_items", [])?;
    tx.execute("DELETE FROM playlists", [])?;
    tx.execute("DELETE FROM content_items", [])?;
    if let Some(screen) = payload.screen {
        tx.execute(
            "INSERT INTO screens (id, name, location, resolution_w, resolution_h, brightness, power_on, orientation,
             group_id, operating_hours, playlist_id, device_id, pairing_status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'paired', ?13)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, location=excluded.location, resolution_w=excluded.resolution_w,
             resolution_h=excluded.resolution_h, brightness=excluded.brightness, power_on=excluded.power_on,
             orientation=excluded.orientation, operating_hours=excluded.operating_hours, playlist_id=excluded.playlist_id",
            params![screen.id, screen.name, screen.location, screen.resolution.width, screen.resolution.height,
                    screen.brightness, screen.power_on, format!("{:?}", screen.orientation), screen.group_id,
                    serde_json::to_string(&screen.operating_hours)?, screen.playlist_id, screen.device_id, screen.created_at.to_rfc3339()],
        )?;
    }
    for item in payload.content_items {
        tx.execute(
            "INSERT INTO content_items (id, name, content_type, file_path, url, duration_secs, tags, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![item.id, item.name, format!("{:?}", item.content_type), item.file_path, item.url,
                    item.duration_secs, serde_json::to_string(&item.tags)?, item.created_at.to_rfc3339()],
        )?;
    }
    for playlist in payload.playlists {
        tx.execute(
            "INSERT INTO playlists (id, name, loop_enabled, transition, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![playlist.id, playlist.name, playlist.loop_enabled, format!("{:?}", playlist.transition), playlist.created_at.to_rfc3339()],
        )?;
        for item in playlist.items {
            tx.execute(
                "INSERT INTO playlist_items (id, playlist_id, content_id, order_index, override_duration, display_schedule)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![uuid::Uuid::new_v4().to_string(), playlist.id, item.content_id, item.order,
                        item.override_duration, serde_json::to_string(&item.display_schedule)?],
            )?;
        }
    }
    for slot in payload.schedule_slots {
        tx.execute(
            "INSERT INTO schedule_slots (id, name, screen_ids, playlist_id, start_time, duration_mins, days_of_week, priority, is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![slot.id, slot.name, serde_json::to_string(&slot.screen_ids)?, slot.playlist_id, slot.start_time.to_string(),
                    slot.duration_mins, serde_json::to_string(&slot.days_of_week)?, slot.priority, slot.is_active, slot.created_at.to_rfc3339()],
        )?;
    }
    tx.commit()?;
    Ok(())
}

fn query_screens(pool: &DbPool) -> anyhow::Result<Vec<Screen>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id FROM screens ORDER BY name")?;
    let ids = stmt.query_map([], |row| row.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
    ids.iter().filter_map(|id| query_screen(&conn, id).transpose()).collect()
}

fn query_screen(conn: &rusqlite::Connection, id: &str) -> anyhow::Result<Option<Screen>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, location, ip_address, mac_address, resolution_w, resolution_h, brightness, power_on,
         orientation, group_id, created_at, operating_hours, playlist_id, device_id, endpoint, pairing_status,
         last_seen, last_sync_revision FROM screens WHERE id = ?1"
    )?;
    let mut rows = stmt.query(params![id])?;
    let Some(row) = rows.next()? else { return Ok(None) };
    let orientation = match row.get::<_, String>(9)?.as_str() {
        "Portrait" => Orientation::Portrait, "LandscapeFlipped" => Orientation::LandscapeFlipped,
        "PortraitFlipped" => Orientation::PortraitFlipped, _ => Orientation::Landscape,
    };
    let last_seen: Option<String> = row.get(17)?;
    let online = last_seen.as_deref().and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| Utc::now().signed_duration_since(value.with_timezone(&Utc)).num_seconds() < 45).unwrap_or(false);
    Ok(Some(Screen {
        id: row.get(0)?, name: row.get(1)?, location: row.get(2)?, ip_address: row.get(3)?, mac_address: row.get(4)?,
        resolution: ScreenResolution { width: row.get::<_, i64>(5)? as u32, height: row.get::<_, i64>(6)? as u32 },
        is_online: online, brightness: row.get::<_, i64>(7)? as u8, power_on: row.get(8)?, orientation,
        group_id: row.get(10)?, created_at: parse_date(row.get(11)?),
        operating_hours: serde_json::from_str(&row.get::<_, String>(12)?).ok(), playlist_id: row.get(13)?,
        device_id: row.get(14)?, endpoint: row.get(15)?, pairing_status: row.get(16)?,
        last_seen, last_sync_revision: row.get(18)?,
    }))
}

fn parse_date(value: String) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(&value).map(|date| date.with_timezone(&Utc)).unwrap_or_else(|_| Utc::now())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn internal_error(error: impl std::fmt::Display) -> (StatusCode, String) {
    tracing::error!("Network API error: {error}");
    (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
}

#[cfg(test)]
mod tests {
    use super::sha256_bytes;

    #[test]
    fn produces_stable_sha256_asset_ids() {
        assert_eq!(
            sha256_bytes(b"SignalOS"),
            "5803e439e3dafbeeb433a30cfd81ec152069d1f8285cb4651a3aad9d6dff7204"
        );
    }
}
