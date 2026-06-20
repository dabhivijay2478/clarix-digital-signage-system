use crate::{
    db::{self, DbPool},
    lan::{self, LanDiscoveryState, LanServerPort},
    models::{ConnectionDiagnostic, DeviceIdentity, DeviceRole, DiagnosticCheck, PairingRequest},
};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub async fn get_device_identity(pool: State<'_, DbPool>) -> Result<DeviceIdentity, String> {
    db::get_device_identity(pool.inner()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_device_mode(
    role: String,
    controller_url: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<DeviceIdentity, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let role = if role == "Player" { "Player" } else { "Controller" };
        let normalized_url = controller_url
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty())
            .map(|value| if value.starts_with("http://") || value.starts_with("https://") {
                value
            } else {
                format!("http://{value}")
            });
        let conn = pool.get().map_err(|error| error.to_string())?;
        conn.execute(
            "UPDATE device_settings SET role = ?1, controller_url = ?2,
             auth_token = CASE WHEN role <> ?1 THEN NULL ELSE auth_token END,
             screen_id = CASE WHEN role <> ?1 THEN NULL ELSE screen_id END,
             pending_pairing_id = CASE WHEN role <> ?1 THEN NULL ELSE pending_pairing_id END,
             current_revision = CASE WHEN ?1 = 'Player' THEN 0 ELSE MAX(current_revision, 1) END
             WHERE singleton = 1",
            params![role, normalized_url],
        ).map_err(|error| error.to_string())?;
        drop(conn);
        db::get_device_identity(&pool).map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn request_player_pairing(
    pool: State<'_, DbPool>,
) -> Result<PairingRequest, String> {
    let identity = db::get_device_identity(pool.inner()).map_err(|error| error.to_string())?;
    if identity.role != DeviceRole::Player {
        return Err("Switch this device to Player mode before pairing".to_string());
    }
    let controller = identity.controller_url.clone().ok_or("Enter the controller address first")?;
    let response = reqwest::Client::new()
        .post(format!("{}/v1/pairing/requests", controller.trim_end_matches('/')))
        .json(&serde_json::json!({
            "device_id": identity.device_id,
            "device_name": identity.display_name,
            "player_kind": "packaged",
            "screen_id": null,
        }))
        .send().await.map_err(|error| format!("Could not reach controller: {error}"))?
        .error_for_status().map_err(|error| format!("Controller rejected pairing: {error}"))?
        .json::<PairingRequest>().await.map_err(|error| error.to_string())?;
    let conn = pool.get().map_err(|error| error.to_string())?;
    conn.execute(
        "UPDATE device_settings SET pending_pairing_id = ?1 WHERE singleton = 1",
        params![response.id],
    ).map_err(|error| error.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn get_pairing_requests(pool: State<'_, DbPool>) -> Result<Vec<PairingRequest>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|error| error.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, code, device_id, device_name, player_kind, screen_id, status, token, controller_id, created_at, expires_at
             FROM pairing_requests ORDER BY created_at DESC"
        ).map_err(|error| error.to_string())?;
        let rows = stmt.query_map([], |row| Ok(PairingRequest {
            id: row.get(0)?, code: row.get(1)?, device_id: row.get(2)?, device_name: row.get(3)?,
            player_kind: row.get(4)?, screen_id: row.get(5)?, status: row.get(6)?, token: row.get(7)?,
            controller_id: row.get(8)?, created_at: row.get(9)?, expires_at: row.get(10)?,
        })).map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn approve_pairing_request(
    request_id: String,
    screen_id: String,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let identity = db::get_device_identity(pool.inner()).map_err(|error| error.to_string())?;
    if identity.role != DeviceRole::Controller {
        return Err("Only a controller can approve players".to_string());
    }
    let token = uuid::Uuid::new_v4().to_string();
    let conn = pool.get().map_err(|error| error.to_string())?;
    let device_id: String = conn.query_row(
        "SELECT device_id FROM pairing_requests WHERE id = ?1 AND status = 'pending' AND expires_at > ?2",
        params![request_id, chrono::Utc::now().to_rfc3339()],
        |row| row.get(0),
    ).map_err(|_| "Pending pairing request not found".to_string())?;
    conn.execute(
        "UPDATE pairing_requests SET status='approved', token=?1, screen_id=?2, controller_id=?3 WHERE id=?4",
        params![token, screen_id, identity.device_id, request_id],
    ).map_err(|error| error.to_string())?;
    conn.execute(
        "UPDATE screens SET device_id=?1, pairing_status='paired', endpoint=NULL, ip_address=NULL WHERE id=?2",
        params![device_id, screen_id],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_network_diagnostics(
    pool: State<'_, DbPool>,
    port: State<'_, LanServerPort>,
    lan_state: State<'_, LanDiscoveryState>,
) -> Result<ConnectionDiagnostic, String> {
    let identity = db::get_device_identity(pool.inner()).map_err(|error| error.to_string())?;
    let interface = lan::resolve_local_network_interface().ok();
    let peer_count = lan_state.read().await.get_peers().await.len();
    let conn = pool.get().map_err(|error| error.to_string())?;
    let last_sync: Option<String> = conn.query_row(
        "SELECT last_successful_sync FROM device_settings WHERE singleton=1",
        [],
        |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    drop(conn);
    let mut hints = Vec::new();
    if identity.role == DeviceRole::Player && identity.controller_url.is_none() {
        hints.push("Enter the controller address or wait for Wi-Fi discovery.".to_string());
    }
    if let (Some((_, local_ip)), Some(controller)) = (interface.as_ref(), identity.controller_url.as_deref()) {
        let controller_ip = reqwest::Url::parse(controller).ok()
            .and_then(|url| url.host_str().and_then(|host| host.parse::<std::net::Ipv4Addr>().ok()));
        let local_ip = local_ip.parse::<std::net::Ipv4Addr>().ok();
        if let (Some(local_ip), Some(controller_ip)) = (local_ip, controller_ip) {
            let local = local_ip.octets();
            let remote = controller_ip.octets();
            if local[..3] != remote[..3] {
                hints.push(format!(
                    "This device is on {local_ip}, but the configured controller is {controller_ip}. The saved address may be stale or the devices may be on different Wi-Fi networks."
                ));
            }
        }
    }
    let mut checks = vec![
        DiagnosticCheck {
            name: "Discovery".to_string(),
            status: if peer_count > 0 || identity.role == DeviceRole::Controller { "pass" } else { "warning" }.to_string(),
            detail: if peer_count > 0 { format!("{peer_count} controller service(s) visible") } else if identity.role == DeviceRole::Controller { "Controller advertisement is enabled".to_string() } else { "No controller advertisement is visible".to_string() },
        },
    ];
    if let Some(controller) = identity.controller_url.as_deref() {
        let health_url = format!("{}/v1/health", controller.trim_end_matches('/'));
        let controller_url = reqwest::Url::parse(controller).ok();
        let tcp_target = controller_url.as_ref().and_then(|url| {
            let host = url.host_str()?;
            let port = url.port_or_known_default()?;
            Some(format!("{host}:{port}"))
        });
        let tcp_ok = if let Some(target) = tcp_target.as_deref() {
            tokio::time::timeout(
                std::time::Duration::from_secs(2),
                tokio::net::TcpStream::connect(target),
            ).await.map(|result| result.is_ok()).unwrap_or(false)
        } else {
            false
        };
        checks.push(DiagnosticCheck {
            name: "TCP connection".to_string(),
            status: if tcp_ok { "pass" } else { "fail" }.to_string(),
            detail: if tcp_ok {
                format!("Connected to {}", tcp_target.unwrap_or_default())
            } else {
                format!("Could not connect to {}", tcp_target.unwrap_or_else(|| controller.to_string()))
            },
        });
        let health_ok = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(2)).build() {
            Ok(client) => client.get(&health_url).send().await.map(|response| response.status().is_success()).unwrap_or(false),
            Err(_) => false,
        };
        if !health_ok {
            hints.push("Controller health failed. Check for a stale controller address, Wi-Fi client isolation, or controller firewall blocking.".to_string());
        }
        checks.push(DiagnosticCheck {
            name: "Controller health".to_string(),
            status: if health_ok { "pass" } else { "fail" }.to_string(),
            detail: if health_ok { format!("Reached {health_url}") } else { format!("Could not reach {health_url}") },
        });
    } else if identity.role == DeviceRole::Controller {
        checks.push(DiagnosticCheck {
            name: "Controller port".to_string(),
            status: if port.0 > 0 { "pass" } else { "fail" }.to_string(),
            detail: if port.0 > 0 { format!("Listening on TCP {}", port.0) } else { "Fixed controller port is unavailable".to_string() },
        });
    }
    Ok(ConnectionDiagnostic {
        role: identity.role,
        device_id: identity.device_id,
        selected_interface: interface.as_ref().map(|value| value.0.clone()),
        local_ip: interface.map(|value| value.1),
        controller_url: identity.controller_url,
        service_port: if port.0 == 0 { None } else { Some(port.0) },
        discovery_status: if peer_count > 0 { format!("{peer_count} controller(s) discovered") } else { "No controller discovered".to_string() },
        pairing_status: if identity.auth_token.is_some() { "Paired".to_string() } else if identity.pending_pairing_id.is_some() { "Waiting for approval".to_string() } else { "Not paired".to_string() },
        protocol_version: identity.protocol_version,
        last_successful_sync: last_sync,
        current_revision: identity.current_revision,
        hints,
        checks,
    })
}
