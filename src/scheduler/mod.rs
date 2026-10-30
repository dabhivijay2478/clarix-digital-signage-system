use chrono::{Datelike, Local};
use std::sync::{Arc, RwLock};

use crate::{db::DbPool, models::{AppWeekday, ScheduleSlot}};

/// Manages the in-memory schedule state and resolves which slot is active
/// for a given screen at the current time.
pub struct SchedulerState {
    pub slots: Arc<RwLock<Vec<ScheduleSlot>>>,
}

impl Default for SchedulerState {
    fn default() -> Self {
        Self { slots: Arc::new(RwLock::new(Vec::new())) }
    }
}

impl SchedulerState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reload schedule slots from the database into memory.
    pub fn reload(&self, pool: &DbPool) {
        let Ok(conn) = pool.get() else { return };
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, name, screen_ids, playlist_id, start_time, duration_mins,
                    days_of_week, priority, is_active, created_at
             FROM schedule_slots WHERE is_active = 1 ORDER BY priority DESC",
        ) else { return };

        let rows = stmt.query_map([], |row| {
            let screen_ids_str: String = row.get(2)?;
            let screen_ids: Vec<String> = serde_json::from_str(&screen_ids_str).unwrap_or_default();

            let days_str: String = row.get(6)?;
            let days_of_week: Vec<AppWeekday> = serde_json::from_str(&days_str).unwrap_or_default();

            let start_time_str: String = row.get(4)?;
            let start_time = chrono::NaiveTime::parse_from_str(&start_time_str, "%H:%M:%S")
                .or_else(|_| chrono::NaiveTime::parse_from_str(&start_time_str, "%H:%M"))
                .unwrap_or_else(|_| chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap());

            let created_at_str: String = row.get(9)?;
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            Ok(ScheduleSlot {
                id: row.get(0)?,
                name: row.get(1)?,
                screen_ids,
                playlist_id: row.get(3)?,
                start_time,
                duration_mins: row.get::<_, i32>(5)? as u32,
                days_of_week,
                priority: row.get::<_, i32>(7)? as u8,
                is_active: row.get(8)?,
                created_at,
            })
        });

        if let Ok(rows) = rows {
            let slots = rows.filter_map(|row| row.ok()).collect::<Vec<_>>();
            let count = slots.len();
            if let Ok(mut guard) = self.slots.write() {
                *guard = slots;
            }
            tracing::info!("Scheduler reloaded: {} active slots", count);
        }
    }

    /// Find the highest-priority active schedule slot for a given screen
    /// at the current local time and day.
    pub fn get_active_slot_for_screen(&self, screen_id: &str) -> Option<ScheduleSlot> {
        let now = Local::now();
        let current_time = now.time();
        let current_day = chrono_weekday_to_app(now.weekday());

        let slots = self.slots.read().ok()?;
        let mut candidates: Vec<&ScheduleSlot> = slots
            .iter()
            .filter(|s| {
                s.is_active
                    && s.screen_ids.contains(&screen_id.to_string())
                    && s.days_of_week.contains(&current_day)
                    && current_time >= s.start_time
                    && current_time
                        < s.start_time
                            + chrono::Duration::minutes(s.duration_mins as i64)
            })
            .collect();

        // Highest priority wins
        candidates.sort_by(|a, b| b.priority.cmp(&a.priority));
        candidates.first().map(|s| (*s).clone())
    }

    /// All active slot overrides for the given screen, sorted by priority.
    pub fn active_slots_for_screen(&self, screen_id: &str) -> Vec<ScheduleSlot> {
        self.slots
            .read()
            .ok()
            .map(|slots| {
                slots
                    .iter()
                    .filter(|s| s.is_active && s.screen_ids.contains(&screen_id.to_string()))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
}

/// Convert chrono::Weekday to our app's AppWeekday enum.
fn chrono_weekday_to_app(w: chrono::Weekday) -> AppWeekday {
    match w {
        chrono::Weekday::Mon => AppWeekday::Mon,
        chrono::Weekday::Tue => AppWeekday::Tue,
        chrono::Weekday::Wed => AppWeekday::Wed,
        chrono::Weekday::Thu => AppWeekday::Thu,
        chrono::Weekday::Fri => AppWeekday::Fri,
        chrono::Weekday::Sat => AppWeekday::Sat,
        chrono::Weekday::Sun => AppWeekday::Sun,
    }
}
