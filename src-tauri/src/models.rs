use serde::{Deserialize, Serialize};
use chrono::{DateTime, NaiveTime, Utc};

pub const NETWORK_PROTOCOL_VERSION: &str = "1";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum DeviceRole {
    Controller,
    Player,
}

impl DeviceRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Controller => "Controller",
            Self::Player => "Player",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceIdentity {
    pub device_id: String,
    pub display_name: String,
    pub role: DeviceRole,
    pub controller_url: Option<String>,
    pub controller_id: Option<String>,
    pub auth_token: Option<String>,
    pub screen_id: Option<String>,
    pub pending_pairing_id: Option<String>,
    pub selected_interface: Option<String>,
    pub service_port: u16,
    pub protocol_version: String,
    pub current_revision: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PairingRequest {
    pub id: String,
    pub code: String,
    pub device_id: String,
    pub device_name: String,
    pub player_kind: String,
    pub screen_id: Option<String>,
    pub status: String,
    pub token: Option<String>,
    pub controller_id: Option<String>,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncAsset {
    pub content_id: String,
    pub sha256: String,
    pub filename: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncManifest {
    pub revision: i64,
    pub screen_id: String,
    pub payload: crate::lan::server::SyncPayload,
    pub assets: Vec<SyncAsset>,
    pub force_sync: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncAck {
    pub revision: i64,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionDiagnostic {
    pub role: DeviceRole,
    pub device_id: String,
    pub selected_interface: Option<String>,
    pub local_ip: Option<String>,
    pub controller_url: Option<String>,
    pub service_port: Option<u16>,
    pub discovery_status: String,
    pub pairing_status: String,
    pub protocol_version: String,
    pub last_successful_sync: Option<String>,
    pub current_revision: i64,
    pub hints: Vec<String>,
    pub checks: Vec<DiagnosticCheck>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiagnosticCheck {
    pub name: String,
    pub status: String,
    pub detail: String,
}

// ── Local Admin Auth ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum AdminRole {
    SuperAdmin,
    SiteSuperAdmin,
    Manager,
    User,
}

impl AdminRole {
    pub fn from_str(value: &str) -> Self {
        match value {
            "SuperAdmin" | "Super Admin" | "super_admin" => Self::SuperAdmin,
            "SiteSuperAdmin" | "Site Super Admin" | "site_super_admin" => Self::SiteSuperAdmin,
            "Manager" | "manager" => Self::Manager,
            _ => Self::User,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SuperAdmin => "SuperAdmin",
            Self::SiteSuperAdmin => "SiteSuperAdmin",
            Self::Manager => "Manager",
            Self::User => "User",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: AdminRole,
    pub is_developer: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthSession {
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub user: AuthUser,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamInvite {
    pub id: String,
    pub email: String,
    pub role: AdminRole,
    pub is_developer: bool,
    pub code: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarqueeSettings {
    pub enabled: bool,
    pub text: String,
    pub speed: u32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TruckDispatchSummary {
    pub last_24h: u32,
    pub this_month: u32,
    pub avg_loading_secs: Option<u32>,
}

// ── Screen ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Screen {
    pub id: String,
    pub name: String,
    pub location: String,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    pub resolution: ScreenResolution,
    pub is_online: bool,
    pub brightness: u8, // 0-100
    pub power_on: bool,
    pub orientation: Orientation,
    pub group_id: Option<String>,
    pub operating_hours: Option<serde_json::Value>,
    pub playlist_id: Option<String>,
    pub device_id: Option<String>,
    pub endpoint: Option<String>,
    pub pairing_status: String,
    pub last_seen: Option<String>,
    pub last_sync_revision: i64,
    pub force_sync: bool,
    pub is_fullscreen: bool,
    pub purpose: String,
    pub gate: Option<String>,
    pub production_dashboard_id: Option<String>,
    pub default_content_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl Default for Screen {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            location: String::new(),
            ip_address: None,
            mac_address: None,
            resolution: ScreenResolution {
                width: 1920,
                height: 1080,
            },
            is_online: false,
            brightness: 80,
            power_on: true,
            orientation: Orientation::Landscape,
            group_id: None,
            operating_hours: None,
            playlist_id: None,
            device_id: None,
            endpoint: None,
            pairing_status: "unpaired".to_string(),
            last_seen: None,
            last_sync_revision: 0,
            force_sync: false,
            is_fullscreen: false,
            purpose: "playlist".to_string(),
            gate: None,
            production_dashboard_id: None,
            default_content_id: None,
            created_at: Utc::now(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScreenResolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum Orientation {
    Landscape,
    Portrait,
    LandscapeFlipped,
    PortraitFlipped,
}

// ── Content ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContentItem {
    pub id: String,
    pub name: String,
    pub content_type: ContentType,
    pub file_path: Option<String>,
    pub url: Option<String>,
    pub duration_secs: u32,
    pub tags: Vec<String>,
    pub metadata_json: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ContentType {
    Video,
    Image,
    WebApp,
    Ad,
    Slideshow,
    Document,
    Spreadsheet,
    Presentation,
}

// ── Production Data ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionColumn {
    pub key: String,
    pub label: String,
    pub data_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionTable {
    pub id: String,
    pub name: String,
    pub sheet_name: String,
    pub kind: String,
    pub columns: Vec<ProductionColumn>,
    pub rows: Vec<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionImportResult {
    pub source_name: String,
    pub tables: Vec<ProductionTable>,
    pub detected: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionDataset {
    pub id: String,
    pub name: String,
    pub source_name: String,
    pub selected_table_id: Option<String>,
    pub tables: Vec<ProductionTable>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionDatasetSummary {
    pub id: String,
    pub name: String,
    pub source_name: String,
    pub selected_table_id: Option<String>,
    pub table_count: usize,
    pub row_count: usize,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionWidget {
    pub id: String,
    pub title: String,
    pub widget_type: String,
    pub chart_type: String,
    pub source_table_id: String,
    pub x_key: Option<String>,
    pub series_keys: Vec<String>,
    pub measure_key: Option<String>,
    pub group_by_key: Option<String>,
    pub aggregation: String,
    pub filters: Vec<ProductionWidgetFilter>,
    pub top_n: Option<u32>,
    pub color_map: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionWidgetFilter {
    pub key: String,
    pub op: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionDashboard {
    pub id: String,
    pub name: String,
    pub dataset_id: String,
    pub widgets: Vec<ProductionWidget>,
    pub layout: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductionDashboardBundle {
    pub dashboard: ProductionDashboard,
    pub dataset: ProductionDataset,
}

// ── Playlist ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub items: Vec<PlaylistItem>,
    pub loop_enabled: bool,
    pub transition: TransitionEffect,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaylistItem {
    pub content_id: String,
    pub order: u32,
    pub override_duration: Option<u32>,
    pub display_schedule: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum TransitionEffect {
    None,
    Fade,
    Slide,
    Zoom,
}

// ── Schedule ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScheduleSlot {
    pub id: String,
    pub name: String,
    pub screen_ids: Vec<String>,
    pub playlist_id: String,
    pub start_time: NaiveTime,
    pub duration_mins: u32,
    pub days_of_week: Vec<AppWeekday>,
    pub priority: u8,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum AppWeekday {
    Mon,
    Tue,
    Wed,
    Thu,
    Fri,
    Sat,
    Sun,
}

// ── Analytics ───────────────────────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnalyticsEvent {
    pub id: String,
    pub screen_id: String,
    pub content_id: String,
    pub event_type: AnalyticsEventType,
    pub timestamp: DateTime<Utc>,
    pub dwell_secs: Option<f64>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum AnalyticsEventType {
    Impression,
    Play,
    Complete,
    Skip,
}

// ── Analytics Summary (response type) ───────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnalyticsSummary {
    pub impressions: i64,
    pub plays: i64,
    pub completions: i64,
    pub skips: i64,
    pub avg_dwell_secs: f64,
    pub uptime_pct: f64,
}

// ── Truck Screen Alerts ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TruckScreenAlert {
    pub id: String,
    pub truck_id: String,
    pub truck_number: String,
    pub gate: Option<String>,
    pub status: String,
    pub status_label: String,
    pub changed_at: String,
    pub duration_secs: u32,
    pub active_truck_number: Option<String>,
    pub active_truck_status: Option<String>,
    pub next_truck_number: Option<String>,
    pub next_truck_status: Option<String>,
}
