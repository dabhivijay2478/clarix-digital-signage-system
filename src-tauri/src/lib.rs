use tauri::Manager;
use std::sync::Arc;
use tokio::sync::RwLock;

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
                .unwrap_or_else(|_| "signalos_lib=info".into()),
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

            tracing::info!("SignalOS starting — data dir: {}", app_data);

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

            // ── Initialize LAN Discovery ────────────────────────────
            let lan_discovery = Arc::new(RwLock::new(lan::LanDiscovery::new()));
            app.manage(lan_discovery.clone());

            // ── Start LAN HTTP Server ───────────────────────────────
            let server_pool = pool.clone();
            let server_app_data = app_data.clone();
            let server_scheduler = scheduler.clone();
            let server_port = match tauri::async_runtime::block_on(async {
                lan::server::start_lan_server(server_pool, server_app_data, server_scheduler, lan_discovery.clone()).await
            }) {
                Ok(port) => {
                    tracing::info!("LAN HTTP server started on port {}", port);
                    // Write port to public/port.json for dev fallback discovery
                    let public_port_file = std::path::Path::new("..").join("public").join("port.json");
                    if let Err(e) = std::fs::write(&public_port_file, format!("{{\"port\": {}}}", port)) {
                        tracing::debug!("Could not write port.json to public directory: {}", e);
                    }
                    port
                }
                Err(e) => {
                    tracing::error!("Failed to start LAN HTTP server: {}", e);
                    7420 // fallback port
                }
            };

            app.manage(lan::LanServerPort(server_port));

            let handle2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let lan = lan_discovery.read().await;

                // Register self with the dynamically bound server port
                if let Err(e) = lan.register_self("SignalOS-Device", server_port) {
                    tracing::warn!("Failed to register mDNS service: {}", e);
                }

                // Start discovering LAN peers
                if let Err(e) = lan.discover_peers(handle2).await {
                    tracing::warn!("Failed to start peer discovery: {}", e);
                }
            });

            tracing::info!("SignalOS setup complete");
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
            // Content
            commands::content::get_content_items,
            commands::content::add_content_item,
            commands::content::delete_content_item,
            commands::content::save_local_content_file,
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
            // LAN / Offline
            commands::lan::get_lan_peers,
            commands::lan::check_screen_online,
            commands::lan::check_all_screens_online,
            commands::lan::get_lan_server_port,
            commands::lan::sync_screen_data,
        ])
        .run(tauri::generate_context!())
        .expect("error running SignalOS");
}
