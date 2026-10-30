//! MG Enterprise / Clarix — digital signage management desktop app.
//! Fully native Rust GUI built on egui (eframe). Tauri has been removed.

mod app;
mod auth_config;
mod backend;
mod bg;
mod db;
mod display_rules;
mod lan;
mod models;
mod scheduler;
mod state;
pub mod theme;
mod ui;

use std::sync::Arc;

fn main() {
    // Optional .env next to the executable / repository root.
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,clarix=debug")),
        )
        .init();

    let runtime = Arc::new(
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to build the async runtime"),
    );

    let config_dir = state::resolve_app_data_dir();
    if let Err(error) = std::fs::create_dir_all(&config_dir) {
        tracing::error!("Could not create app data dir {}: {error}", config_dir.display());
    }
    tracing::info!("App data dir: {}", config_dir.display());

    let pool = match db::init_db(&config_dir.to_string_lossy()) {
        Ok(pool) => pool,
        Err(error) => {
            eprintln!("Failed to initialize the database: {error}");
            std::process::exit(1);
        }
    };

    let core = Arc::new(state::AppCore::new(pool, config_dir.clone(), runtime.clone()));
    core.scheduler.reload(&core.pool);
    bg::spawn_all(core.clone());

    let icon = load_icon();
    let mut viewport = egui::ViewportBuilder::default()
        .with_inner_size([1280.0, 800.0])
        .with_min_inner_size([1024.0, 640.0])
        .with_title("MG Enterprise — Clarix");
    if let Some(icon) = icon {
        viewport = viewport.with_icon(icon);
    }

    let options = eframe::NativeOptions {
        viewport,
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };

    let result = eframe::run_native(
        "MG Enterprise — Clarix",
        options,
        Box::new(move |cc| {
            theme::apply(&cc.egui_ctx);
            Ok(Box::new(app::ClarixApp::new(cc, core)))
        }),
    );
    if let Err(error) = result {
        eprintln!("Application error: {error}");
        std::process::exit(1);
    }
}

/// Load the embedded-style window icon from `assets/icon.png` at runtime.
fn load_icon() -> Option<egui::IconData> {
    fn icon_bytes() -> Option<Vec<u8>> {
        if let Ok(bytes) = std::fs::read("assets/icon.png") {
            return Some(bytes);
        }
        let exe = std::env::current_exe().ok()?;
        std::fs::read(exe.parent()?.join("assets/icon.png")).ok()
    }
    let bytes = icon_bytes()?;
    let image = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png).ok()?;
    let rgba = image.to_rgba8();
    Some(egui::IconData {
        width: rgba.width(),
        height: rgba.height(),
        rgba: rgba.into_raw(),
    })
}
