use serde::{Deserialize, Serialize};
use chrono::{DateTime, NaiveTime, Utc};

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
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ContentType {
    Video,
    Image,
    WebApp,
    Ad,
    Slideshow,
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
