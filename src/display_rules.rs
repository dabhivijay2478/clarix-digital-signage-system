//! Display rules ported from the former TypeScript contract
//! (`src/lib/signage-schedule.ts`): playlist item display schedules and
//! screen operating hours.

use chrono::{Datelike, Local, NaiveTime, Timelike};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const APP_WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
pub const FULL_WEEKDAYS: [&str; 7] =
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ── Playlist item display schedule ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlaylistItemDaySchedule {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub start: String,
    #[serde(default)]
    pub end: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlaylistItemSchedule {
    #[serde(default)]
    pub time_restricted: bool,
    #[serde(default = "default_start_time")]
    pub start_time: String,
    #[serde(default = "default_end_time")]
    pub end_time: String,
    #[serde(default)]
    pub days: Vec<String>,
    #[serde(default)]
    pub day_times: BTreeMap<String, PlaylistItemDaySchedule>,
    #[serde(default)]
    pub date_restricted: bool,
    #[serde(default)]
    pub start_date: String,
    #[serde(default)]
    pub end_date: String,
    #[serde(default = "default_transition")]
    pub transition: String,
}

fn default_start_time() -> String {
    "09:00".to_string()
}
fn default_end_time() -> String {
    "17:00".to_string()
}
fn default_transition() -> String {
    "Fade".to_string()
}

impl Default for PlaylistItemSchedule {
    fn default() -> Self {
        let mut day_times = BTreeMap::new();
        for day in APP_WEEKDAYS {
            day_times.insert(
                day.to_string(),
                PlaylistItemDaySchedule {
                    enabled: true,
                    start: default_start_time(),
                    end: default_end_time(),
                },
            );
        }
        Self {
            time_restricted: false,
            start_time: default_start_time(),
            end_time: default_end_time(),
            days: APP_WEEKDAYS.iter().map(|d| d.to_string()).collect(),
            day_times,
            date_restricted: false,
            start_date: String::new(),
            end_date: String::new(),
            transition: default_transition(),
        }
    }
}

impl PlaylistItemSchedule {
    /// Parse an item's `display_schedule` JSON (missing/invalid = always on).
    pub fn parse(value: Option<&serde_json::Value>) -> Option<Self> {
        let value = value?;
        if value.is_null() {
            return None;
        }
        let mut parsed: Self = serde_json::from_value(value.clone()).ok()?;
        // Normalize day times from common/legacy single-window fields.
        for day in APP_WEEKDAYS {
            let entry = parsed
                .day_times
                .entry(day.to_string())
                .or_insert_with(|| PlaylistItemDaySchedule {
                    enabled: false,
                    start: parsed.start_time.clone(),
                    end: parsed.end_time.clone(),
                });
            if entry.start.is_empty() {
                entry.start = parsed.start_time.clone();
            }
            if entry.end.is_empty() {
                entry.end = parsed.end_time.clone();
            }
        }
        // Legacy: if nothing is explicitly enabled but days[] exist, use days[].
        if !parsed.day_times.values().any(|day| day.enabled) {
            for day in &parsed.days {
                if let Some(entry) = parsed.day_times.get_mut(day) {
                    entry.enabled = true;
                }
            }
        }
        parsed.days = APP_WEEKDAYS
            .iter()
            .filter(|day| {
                parsed
                    .day_times
                    .get(**day)
                    .map(|d| d.enabled)
                    .unwrap_or(false)
            })
            .map(|d| d.to_string())
            .collect();
        Some(parsed)
    }

    /// Serialize back to the JSON stored in `playlist_items.display_schedule`.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
    }

    /// Is this item eligible to play right now?
    pub fn is_active_now(&self, at: chrono::DateTime<Local>) -> bool {
        if self.date_restricted {
            let today = format!(
                "{:04}-{:02}-{:02}",
                at.year(),
                at.month(),
                at.day()
            );
            if !self.start_date.is_empty() && today < self.start_date {
                return false;
            }
            if !self.end_date.is_empty() && today > self.end_date {
                return false;
            }
        }
        if !self.time_restricted {
            return true;
        }
        if self.days.is_empty() {
            return false;
        }

        let now_minutes = (at.hour() * 60 + at.minute()) as i64;
        let today_name = js_day_to_app_weekday(at.weekday().num_days_from_sunday() as usize);
        let previous_name =
            js_day_to_app_weekday((at.weekday().num_days_from_sunday() as usize + 6) % 7);

        self.day_window_active(&today_name, now_minutes, DayMode::Current)
            || self.day_window_active(&previous_name, now_minutes, DayMode::Previous)
    }

    fn day_window_active(&self, day: &str, now_minutes: i64, mode: DayMode) -> bool {
        let Some(entry) = self.day_times.get(day) else {
            return false;
        };
        if !entry.enabled {
            return false;
        }
        let (Some(start), Some(end)) = (
            time_to_minutes(&entry.start),
            time_to_minutes(&entry.end),
        ) else {
            return false;
        };
        if start == end {
            return mode == DayMode::Current;
        }
        if start < end {
            return mode == DayMode::Current && now_minutes >= start && now_minutes <= end;
        }
        // Overnight window: carry over into the next day.
        if mode == DayMode::Current {
            now_minutes >= start
        } else {
            now_minutes <= end
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DayMode {
    Current,
    Previous,
}

fn time_to_minutes(time: &str) -> Option<i64> {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() < 2 {
        return None;
    }
    let hours: i64 = parts[0].trim().parse().ok()?;
    let minutes: i64 = parts[1].trim().parse().ok()?;
    if (0..=23).contains(&hours) && (0..=59).contains(&minutes) && parts.len() <= 3 {
        Some(hours * 60 + minutes)
    } else {
        None
    }
}

fn js_day_to_app_weekday(js_day: usize) -> String {
    // JS getDay(): 0 = Sunday.
    const APP_BY_JS: [usize; 7] = [6, 0, 1, 2, 3, 4, 5];
    APP_WEEKDAYS[APP_BY_JS[js_day % 7]].to_string()
}

pub fn format_schedule_summary(schedule: Option<&serde_json::Value>) -> String {
    let Some(schedule) = PlaylistItemSchedule::parse(schedule) else {
        return "Always eligible".to_string();
    };
    let mut parts = Vec::new();
    if schedule.time_restricted {
        let enabled = schedule
            .day_times
            .iter()
            .filter(|(_, day)| day.enabled)
            .map(|(name, day)| (name.clone(), day.clone()))
            .collect::<Vec<_>>();
        if let Some((_, first)) = enabled.first() {
            let same_window = enabled
                .iter()
                .all(|(_, day)| day.start == first.start && day.end == first.end);
            let days_summary = compact_day_summary(&schedule.days);
            if same_window {
                let overnight = is_overnight_window(&first.start, &first.end);
                parts.push(format!(
                    "{} · {}-{}{}",
                    days_summary,
                    first.start,
                    first.end,
                    if overnight { " overnight" } else { "" }
                ));
            } else {
                parts.push(format!("{days_summary} · custom times"));
            }
        }
    }
    if schedule.date_restricted {
        parts.push(format!(
            "{} to {}",
            if schedule.start_date.is_empty() { "Any start" } else { &schedule.start_date },
            if schedule.end_date.is_empty() { "Any end" } else { &schedule.end_date }
        ));
    }
    if parts.is_empty() {
        "Always eligible".to_string()
    } else {
        parts.join(" · ")
    }
}

fn compact_day_summary(days: &[String]) -> String {
    if days.is_empty() {
        return "No weekdays".to_string();
    }
    if days.len() == 7 {
        return "Every day".to_string();
    }
    let joined = days.join(",");
    if joined == "Mon,Tue,Wed,Thu,Fri" {
        return "Mon-Fri".to_string();
    }
    if joined == "Sat,Sun" {
        return "Sat-Sun".to_string();
    }
    days.join(", ")
}

pub fn is_overnight_window(start: &str, end: &str) -> bool {
    let (Some(start), Some(end)) = (time_to_minutes(start), time_to_minutes(end)) else {
        return false;
    };
    start > end
}

// ── Screen operating hours ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OperatingHoursDay {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_day_start")]
    pub start: String,
    #[serde(default = "default_day_end")]
    pub end: String,
}

fn default_day_start() -> String {
    "00:00".to_string()
}
fn default_day_end() -> String {
    "23:59".to_string()
}

impl Default for OperatingHoursDay {
    fn default() -> Self {
        Self {
            enabled: false,
            start: default_day_start(),
            end: default_day_end(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct OperatingHours {
    #[serde(default)]
    pub blank_when_not_in_use: bool,
    #[serde(default)]
    pub days: BTreeMap<String, OperatingHoursDay>,
}

impl OperatingHours {
    pub fn parse(value: Option<&serde_json::Value>) -> Self {
        value
            .and_then(|value| serde_json::from_value::<OperatingHours>(value.clone()).ok())
            .unwrap_or_default()
    }

    pub fn to_json(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Object(Default::default()))
    }

    pub fn day(&self, full_name: &str) -> OperatingHoursDay {
        self.days
            .get(full_name)
            .cloned()
            .unwrap_or_default()
    }

    fn day_window_active(day: &OperatingHoursDay, now_minutes: i64, mode: DayMode) -> bool {
        if !day.enabled {
            return false;
        }
        let (Some(start), Some(end)) = (time_to_minutes(&day.start), time_to_minutes(&day.end)) else {
            return false;
        };
        if start == end {
            return true;
        }
        if start < end {
            return mode == DayMode::Current && now_minutes >= start && now_minutes <= end;
        }
        if mode == DayMode::Current {
            now_minutes >= start
        } else {
            now_minutes <= end
        }
    }

    /// Is the screen within its operating hours right now? Hours unset = always on.
    pub fn is_within_now(&self, at: chrono::DateTime<Local>) -> bool {
        if self.days.is_empty() {
            return true;
        }
        let now_minutes = (at.hour() * 60 + at.minute()) as i64;
        let today = FULL_WEEKDAYS[weekday_index_full(at.weekday().number_from_monday() as usize - 1)];
        let previous_full = {
            let index = (at.weekday().number_from_monday() as usize + 5) % 7;
            FULL_WEEKDAYS[index]
        };
        Self::day_window_active(&self.day(today), now_minutes, DayMode::Current)
            || Self::day_window_active(&self.day(previous_full), now_minutes, DayMode::Previous)
    }

    pub fn summary(&self) -> String {
        if self.days.is_empty() {
            return "Around the clock".to_string();
        }
        let enabled: Vec<String> = FULL_WEEKDAYS
            .iter()
            .filter_map(|day| {
                let entry = self.day(day);
                if entry.enabled {
                    Some(format!("{} {}-{}", day_short(day), entry.start, entry.end))
                } else {
                    None
                }
            })
            .collect();
        if enabled.is_empty() {
            "Around the clock".to_string()
        } else {
            enabled.join(", ")
        }
    }
}

fn day_short(day: &str) -> &'static str {
    match day {
        "Monday" => "Mon",
        "Tuesday" => "Tue",
        "Wednesday" => "Wed",
        "Thursday" => "Thu",
        "Friday" => "Fri",
        "Saturday" => "Sat",
        "Sunday" => "Sun",
        _ => "—",
    }
}

fn weekday_index_full(monday_first: usize) -> usize {
    monday_first.min(6)
}

/// Current wall-clock NaiveTime (local).
pub fn now_time() -> NaiveTime {
    Local::now().time()
}
