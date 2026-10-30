use std::sync::Arc;
use std::time::Duration;

use crate::models::{DeviceIdentity, DeviceRole};
use crate::state::AppCore;

/// Spawn the long-running background tasks: controller LAN server, mDNS
/// maintenance, and the player-side sync loop.
pub fn spawn_all(core: Arc<AppCore>) {
    core.runtime.clone().spawn(async move {
        tokio::spawn(server_task(core.clone()));
        tokio::spawn(register_loop(core.clone()));
        tokio::spawn(run_player_sync_guard(core));
    });
}

/// Binds the LAN controller whenever this device is in Controller role.
async fn server_task(core: Arc<AppCore>) {
    let mut started = false;
    loop {
        let role_is_controller = matches!(
            crate::db::get_device_identity(&core.pool).map(|identity| identity.role),
            Ok(DeviceRole::Controller)
        );
        if role_is_controller && !started {
            match start_server(&core).await {
                Ok(port) => {
                    started = true;
                    if let Ok(mut port_lock) = core.server_port.lock() {
                        *port_lock = port;
                    }
                    tracing::info!("Controller server started on port {port}");
                }
                Err(error) => {
                    tracing::error!("Controller server failed to start: {error}");
                }
            }
        } else if !role_is_controller {
            started = false;
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}

async fn start_server(core: &Arc<AppCore>) -> anyhow::Result<u16> {
    let identity: DeviceIdentity = crate::db::get_device_identity(&core.pool)?;
    let app_data_dir = core.config_dir.to_string_lossy().to_string();
    crate::lan::server::start_controller_server(
        core.pool.clone(),
        app_data_dir,
        identity,
        core.events.clone(),
        core.truck_alerts.clone(),
    )
    .await
}

/// Keeps the mDNS registration fresh and (re)starts peer discovery.
async fn register_loop(core: Arc<AppCore>) {
    let mut discovery_ready = false;
    loop {
        if let Ok(identity) = crate::db::get_device_identity(&core.pool) {
            let port = core.server_port.lock().map(|port| *port).unwrap_or(0);
            let discovery = core.lan.clone();
            let result = tokio::task::spawn_blocking(move || {
                let guard = discovery
                    .lock()
                    .map_err(|_| anyhow::anyhow!("discovery lock poisoned"))?;
                guard.refresh_registration(&identity, port)?;
                let _ = guard.discover_peers();
                Ok::<(), anyhow::Error>(())
            })
            .await;
            match result {
                Ok(Ok(())) => {
                    if !discovery_ready {
                        tracing::info!("LAN discovery is running");
                        discovery_ready = true;
                    }
                }
                Ok(Err(error)) => tracing::debug!("LAN discovery maintenance: {error}"),
                Err(error) => tracing::debug!("LAN discovery task: {error}"),
            }
        }
        tokio::time::sleep(Duration::from_secs(20)).await;
    }
}

/// Player-side: keeps local data in sync with the controller. Runs as its own
/// long-lived task; the guard simply restarts it if it ever aborts.
async fn run_player_sync_guard(core: Arc<AppCore>) {
    loop {
        let role = crate::db::get_device_identity(&core.pool)
            .map(|identity| identity.role)
            .unwrap_or(DeviceRole::Controller);
        if matches!(role, DeviceRole::Player) {
            let pool = core.pool.clone();
            let dir = core.config_dir.to_string_lossy().to_string();
            crate::lan::server::run_player_sync_loop(pool, dir).await;
        }
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}
