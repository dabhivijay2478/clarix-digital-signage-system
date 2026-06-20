use tauri::Manager;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::models::DeviceRole;

mod commands;
mod db;
mod lan;
mod models;
mod scheduler;

pub fn run() {
    // Initialize tracing/logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "clarix_lib=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory")
                .to_string_lossy()
                .to_string();

            tracing::info!("Clarix starting — data dir: {}", app_data);

            // ── Initialize Database ─────────────────────────────────
            let app_data_clone = app_data.clone();
            let pool = std::thread::spawn(move || {
                db::init_db(&app_data_clone)
            }).join().expect("Database initialization thread panicked")
            .expect("failed to initialize database");
            app.manage(pool.clone());

            // ── Initialize Scheduler ────────────────────────────────
            let scheduler = std::sync::Arc::new(scheduler::SchedulerState::new());
            app.manage(scheduler.clone());

            // Start background scheduler loop
            let handle = app.handle().clone();
            let scheduler_clone = scheduler.clone();
            let pool_clone = pool.clone();
            tauri::async_runtime::spawn(async move {
                scheduler::run_scheduler_loop(handle, scheduler_clone, pool_clone).await;
            });

            // ── Initialize Local-Network Discovery ─────────────────
            if let Ok((interface, _)) = lan::resolve_local_network_interface() {
                if let Ok(conn) = pool.get() {
                    let _ = conn.execute(
                        "UPDATE device_settings SET selected_interface = ?1 WHERE singleton = 1",
                        rusqlite::params![interface],
                    );
                }
            }
            let identity = db::get_device_identity(&pool).expect("failed to load device identity");
            let lan_discovery = Arc::new(RwLock::new(lan::LanDiscovery::new(identity.device_id.clone())));
            app.manage(lan_discovery.clone());

            let (event_sender, _) = tokio::sync::broadcast::channel(64);
            let event_bus = lan::server::SyncEventBus(event_sender);
            app.manage(event_bus.clone());
            let (truck_alert_sender, _) = tokio::sync::broadcast::channel(64);
            let truck_alert_bus = lan::server::TruckAlertBus(truck_alert_sender);
            app.manage(truck_alert_bus.clone());
            let bundled_browser_assets = app.path().resource_dir()
                .map(|directory| directory.join("browser-player"))
                .ok()
                .filter(|directory| directory.join("player.html").exists())
                .unwrap_or_else(|| std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../out"));

            // Only a controller accepts inbound traffic. Players connect outward and pull revisions.
            let server_port = if identity.role == DeviceRole::Controller {
                match tauri::async_runtime::block_on(lan::server::start_controller_server(
                    pool.clone(),
                    app_data.clone(),
                    bundled_browser_assets,
                    identity.clone(),
                    event_bus,
                    truck_alert_bus,
                )) {
                    Ok(port) => port,
                    Err(error) => {
                        tracing::error!("Controller networking unavailable: {error}");
                        0
                    }
                }
            } else {
                0
            };

            app.manage(lan::LanServerPort(server_port));

            let handle2 = app.handle().clone();
            let advertised_identity = identity.clone();
            let discovery_task = lan_discovery.clone();
            tauri::async_runtime::spawn(async move {
                let lan = discovery_task.read().await;

                if server_port > 0 {
                    if let Err(e) = lan.register_self(&advertised_identity, server_port).await {
                        tracing::warn!("Failed to register controller discovery service: {}", e);
                    }
                }

                if let Err(e) = lan.discover_peers(handle2).await {
                    tracing::warn!("Failed to start controller discovery: {}", e);
                }
            });

            if identity.role == DeviceRole::Controller && server_port > 0 {
                let refresh_discovery = lan_discovery.clone();
                let refresh_identity = identity.clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                        let lan = refresh_discovery.read().await;
                        if let Err(error) = lan.refresh_registration(&refresh_identity, server_port).await {
                            tracing::warn!("Failed to refresh controller discovery endpoint: {error}");
                        }
                    }
                });
            }

            let player_pool = pool.clone();
            let player_app_data = app_data.clone();
            tauri::async_runtime::spawn(async move {
                lan::server::run_player_sync_loop(player_pool, player_app_data).await;
            });

            tracing::info!("Clarix setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Screens
            commands::screens::get_screens,
            commands::screens::add_screen,
            commands::screens::update_screen_power,
            commands::screens::update_screen_brightness,
            commands::screens::delete_screen,
            commands::screens::edit_screen,
            commands::screens::update_screen_operating_hours,
            commands::screens::force_sync_screen,
            commands::screens::update_screen_fullscreen,
            // Content
            commands::content::get_content_items,
            commands::content::add_content_item,
            commands::content::delete_content_item,
            commands::content::save_local_content_file,
            commands::content::save_local_content_file_chunk,
            commands::content::prepare_presentation_content,
            // Playlists
            commands::playlists::get_playlists,
            commands::playlists::create_playlist,
            commands::playlists::update_playlist_items,
            commands::playlists::delete_playlist,
            // Schedule
            commands::schedule::get_schedule,
            commands::schedule::add_schedule_slot,
            commands::schedule::delete_schedule_slot,
            // Analytics
            commands::analytics::record_analytics_event,
            commands::analytics::get_analytics_summary,
            commands::analytics::get_analytics_timeline,
            // Local network / offline
            commands::lan::get_network_peers,
            commands::lan::check_screen_online,
            commands::lan::check_all_screens_online,
            commands::lan::get_lan_server_port,
            commands::lan::sync_screen_data,
            // Device networking
            commands::network::get_device_identity,
            commands::network::set_device_mode,
            commands::network::request_player_pairing,
            commands::network::get_pairing_requests,
            commands::network::approve_pairing_request,
            commands::network::get_network_diagnostics,
            // Production data
            commands::production::import_production_file,
            commands::production::save_production_import,
            commands::production::get_production_datasets,
            commands::production::get_production_dataset,
            commands::production::get_production_dashboards,
            commands::production::get_production_dashboard,
            commands::production::update_production_table_rows,
            commands::production::update_production_dataset,
            commands::production::update_production_dashboard,
            commands::production::delete_production_dashboard,
            commands::production::delete_production_dataset,
            commands::production::add_production_dashboard_to_content,
            // Truck screen alerts
            commands::trucks::publish_truck_alert,
            commands::trucks::save_dispatched_truck,
            // Database viewer & backups
            commands::database::get_db_tables,
            commands::database::get_db_table_data,
            commands::database::export_db_table_to_csv,
            commands::database::backup_content_library_to_zip,
            commands::database::save_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error running Clarix");
}
