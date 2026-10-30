use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::db::DbPool;
use crate::lan::server::{SyncEventBus, TruckAlertBus};
use crate::lan::LanDiscoveryState;
use crate::scheduler::SchedulerState;

/// Shared application state handed to every backend command and UI page.
/// Replaces the old Tauri `State<AppState>` container.
pub struct AppCore {
    pub pool: DbPool,
    pub events: SyncEventBus,
    pub truck_alerts: TruckAlertBus,
    pub lan: LanDiscoveryState,
    pub scheduler: Arc<SchedulerState>,
    /// App data directory (also the default content library root).
    pub config_dir: PathBuf,
    /// Port the LAN controller server bound to (0 while unbound).
    pub server_port: Arc<Mutex<u16>>,
    /// Async runtime used to drive the few `async` backend commands.
    pub runtime: Arc<tokio::runtime::Runtime>,
}

impl AppCore {
    pub fn new(
        pool: DbPool,
        config_dir: PathBuf,
        runtime: Arc<tokio::runtime::Runtime>,
    ) -> Self {
        let (events_tx, _) = tokio::sync::broadcast::channel::<i64>(64);
        let (truck_tx, _) = tokio::sync::broadcast::channel::<crate::models::TruckScreenAlert>(32);
        let device_id = crate::db::get_device_identity(&pool)
            .map(|identity| identity.device_id.clone())
            .unwrap_or_default();
        Self {
            pool,
            events: SyncEventBus(events_tx),
            truck_alerts: TruckAlertBus(truck_tx),
            lan: Arc::new(Mutex::new(crate::lan::LanDiscovery::new(device_id))),
            scheduler: Arc::new(SchedulerState::new()),
            config_dir,
            server_port: Arc::new(Mutex::new(0)),
            runtime,
        }
    }

    /// Run an async backend command to completion from sync UI code.
    pub fn block_on<F: std::future::Future>(&self, future: F) -> F::Output {
        self.runtime.block_on(future)
    }
}

/// Resolve the application data directory used by the database and media
/// library. Matches the directory the Tauri build used (`com.clarix.app`) so
/// existing installs keep their data.
pub fn resolve_app_data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("CLARIX_DATA_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(roaming) = std::env::var_os("APPDATA") {
            return PathBuf::from(roaming).join("com.clarix.app");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.clarix.app");
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("com.clarix.app");
        }
    }
    PathBuf::from(".")
}

// ── Gate configuration (gates.json) ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GateConfig {
    pub id: String,
    pub number: String,
    pub purpose: String,
    pub production_dashboard_id: Option<String>,
    pub playlist_id: Option<String>,
    pub loading_duration_mins: u32,
}

impl Default for GateConfig {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            number: String::new(),
            purpose: "playlist".to_string(),
            production_dashboard_id: None,
            playlist_id: None,
            loading_duration_mins: 30,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct GateStoreData {
    #[serde(default)]
    pub gates: Vec<GateConfig>,
    /// gate number -> screen ids assigned to it.
    #[serde(default)]
    pub assignments: std::collections::HashMap<String, Vec<String>>,
}

pub fn gates_json_path(config_dir: &PathBuf) -> PathBuf {
    config_dir.join("gates.json")
}

pub fn load_gate_store(config_dir: &PathBuf) -> GateStoreData {
    let path = gates_json_path(config_dir);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

pub fn save_gate_store(config_dir: &PathBuf, data: &GateStoreData) -> Result<(), String> {
    let path = gates_json_path(config_dir);
    let rendered = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, rendered).map_err(|e| e.to_string())
}

/// Gate numbers must start with a letter and be followed by digits (e.g. d1, g10).
pub fn is_valid_gate_number(value: &str) -> bool {
    let trimmed = value.trim();
    let mut chars = trimmed.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphabetic())
        && chars.all(|rest| rest.is_ascii_digit())
        && trimmed.len() > 1
}

pub fn normalize_gate_number(value: &str) -> String {
    value.trim().to_lowercase()
}

/// Parse comma-separated gate values stored on `Screen.gate` (max 2 per screen).
pub fn parse_screen_gates(gate: Option<&str>) -> Vec<String> {
    let Some(gate) = gate else { return Vec::new() };
    let mut out = Vec::new();
    for value in gate.split(',') {
        let normalized = normalize_gate_number(value);
        if !normalized.is_empty() && is_valid_gate_number(&normalized) && !out.contains(&normalized) {
            out.push(normalized);
        }
    }
    out.truncate(2);
    out
}

/// Serialize gate list for `Screen.gate` persistence.
pub fn serialize_screen_gates(gates: &[String]) -> Option<String> {
    let mut normalized = Vec::new();
    for gate in gates {
        let normalized_gate = normalize_gate_number(gate);
        if !normalized_gate.is_empty() && is_valid_gate_number(&normalized_gate) && !normalized.contains(&normalized_gate) {
            normalized.push(normalized_gate);
        }
    }
    normalized.truncate(2);
    if normalized.is_empty() {
        None
    } else {
        Some(normalized.join(","))
    }
}
