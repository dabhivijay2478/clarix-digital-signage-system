use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::models::{AppWeekday, Playlist, ScheduleSlot, Screen};
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

pub const DAY_LABELS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

pub struct SchedulePage {
    slots: Vec<ScheduleSlot>,
    screens: Vec<Screen>,
    playlists: Vec<Playlist>,
    last_refresh: Instant,
    show_add: bool,
    draft: AddDraft,
}

struct AddDraft {
    name: String,
    selected_screens: Vec<String>,
    playlist_id: String,
    start_time: String,
    duration_mins: u32,
    priority: u8,
    days: [bool; 7],
}

impl Default for AddDraft {
    fn default() -> Self {
        Self {
            name: String::new(),
            selected_screens: Vec::new(),
            playlist_id: String::new(),
            start_time: "08:00".to_string(),
            duration_mins: 30,
            priority: 1,
            days: [true; 7],
        }
    }
}

impl Default for SchedulePage {
    fn default() -> Self {
        Self {
            slots: Vec::new(),
            screens: Vec::new(),
            playlists: Vec::new(),
            last_refresh: Instant::now() - Duration::from_secs(3600),
            show_add: false,
            draft: AddDraft::default(),
        }
    }
}

fn day_index(day: AppWeekday) -> usize {
    match day {
        AppWeekday::Mon => 0,
        AppWeekday::Tue => 1,
        AppWeekday::Wed => 2,
        AppWeekday::Thu => 3,
        AppWeekday::Fri => 4,
        AppWeekday::Sat => 5,
        AppWeekday::Sun => 6,
    }
}

fn day_from_index(index: usize) -> AppWeekday {
    match index {
        0 => AppWeekday::Mon,
        1 => AppWeekday::Tue,
        2 => AppWeekday::Wed,
        3 => AppWeekday::Thu,
        4 => AppWeekday::Fri,
        5 => AppWeekday::Sat,
        _ => AppWeekday::Sun,
    }
}

fn format_days(days: &[AppWeekday]) -> String {
    if days.len() >= 7 {
        return "Every day".to_string();
    }
    let mut indices = days.iter().map(|day| day_index(day.clone())).collect::<Vec<_>>();
    indices.sort_unstable();
    let all_weekdays = indices == vec![0, 1, 2, 3, 4];
    let all_weekend = indices == vec![5, 6];
    if all_weekdays {
        return "Weekdays (Mon–Fri)".to_string();
    }
    if all_weekend {
        return "Weekend (Sat–Sun)".to_string();
    }
    indices
        .into_iter()
        .map(|index| DAY_LABELS[index])
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn parse_hhmm(value: &str) -> Option<chrono::NaiveTime> {
    let trimmed = value.trim();
    chrono::NaiveTime::parse_from_str(trimmed, "%H:%M:%S")
        .or_else(|_| chrono::NaiveTime::parse_from_str(trimmed, "%H:%M"))
        .ok()
}

impl SchedulePage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_secs(5)) {
            self.last_refresh = Instant::now();
            self.refresh(core);
        }

        theme::heading(ui, "Schedule");
        theme::muted(ui,
            "Time slots assign a playlist to screens for part of the day. Higher priority wins when slots overlap.");
        ui.add_space(10.0);

        ui.horizontal(|ui| {
            if ui.button("＋ Add Schedule Slot").clicked() {
                self.draft = AddDraft::default();
                // Preselect the first screen for convenience.
                self.draft.selected_screens = self.screens.iter().take(1).map(|s| s.id.clone()).collect();
                if let Some(playlist) = self.playlists.first() {
                    self.draft.playlist_id = playlist.id.clone();
                }
                self.show_add = true;
            }
            theme::badge(ui, &format!("{} active slots", self.slots.len()), theme::PRIMARY);
        });
        ui.add_space(6.0);

        if self.slots.is_empty() {
            widgets::empty_state(ui, "No schedule slots yet. Add one to control playlists by time of day.");
        }

        for slot in &self.slots {
            let end = slot.start_time + chrono::Duration::minutes(slot.duration_mins as i64);
            let playlist_name = self
                .playlists
                .iter()
                .find(|p| p.id == slot.playlist_id)
                .map(|p| p.name.clone())
                .unwrap_or_else(|| "(deleted playlist)".to_string());
            let screen_names = slot
                .screen_ids
                .iter()
                .map(|id| {
                    self.screens
                        .iter()
                        .find(|s| s.id == *id)
                        .map(|s| s.name.clone())
                        .unwrap_or_else(|| "unknown screen".to_string())
                })
                .collect::<Vec<_>>()
                .join(", ");

            theme::card(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new(format!(
                            "{} – {}",
                            slot.start_time.format("%H:%M"),
                            end.format("%H:%M")
                        ))
                        .size(16.0)
                        .strong()
                        .color(theme::PRIMARY),
                    );
                    ui.label(
                        egui::RichText::new(&slot.name)
                            .size(15.0)
                            .strong()
                            .color(theme::TEXT),
                    );
                    theme::badge(ui, &format!("Priority {}", slot.priority), theme::AMBER);
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("🗑 Delete").clicked() {
                            match crate::backend::schedule::delete_schedule_slot(core, slot.id.clone()) {
                                Ok(()) => toasts.push(Toast::new(
                                    ToastKind::Success,
                                    format!("Slot \"{}\" deleted", slot.name),
                                )),
                                Err(error) => toasts.push(Toast::new(
                                    ToastKind::Error,
                                    format!("Delete failed: {error}"),
                                )),
                            }
                            self.last_refresh = Instant::now() - Duration::from_secs(3600);
                        }
                    });
                });
                theme::muted(ui, &format!("Playlist: {playlist_name}"));
                if !screen_names.is_empty() {
                    theme::muted(ui, &format!("Screens: {screen_names}"));
                }
                theme::muted(ui, &format!("Days: {}", format_days(&slot.days_of_week)));
            });
            ui.add_space(4.0);
        }

        if self.show_add {
            let mut keep_open = true;
            egui::Window::new("add-slot-window")
                .title_bar(true)
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .open(&mut keep_open)
                .show(ui.ctx(), |ui| {
                    ui.set_width_range(460.0..=620.0);
                    ui.label(
                        egui::RichText::new("New Schedule Slot")
                            .size(16.0)
                            .strong()
                            .color(theme::TEXT),
                    );
                    ui.add_space(6.0);

                    widgets::labeled_text(ui, "Name", &mut self.draft.name, "e.g. Morning Loop");

                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new("Playlist").size(13.0).color(theme::MUTED));
                        if self.playlists.is_empty() {
                            theme::muted(ui, "Create a playlist first");
                        } else {
                            let selected_name = self
                                .playlists
                                .iter()
                                .find(|p| p.id == self.draft.playlist_id)
                                .map(|p| p.name.clone())
                                .unwrap_or_default();
                            egui::ComboBox::from_id_salt("add-slot-playlist")
                                .width(240.0)
                                .selected_text(
                                    selected_name.is_empty()
                                        .then(|| "Select playlist…")
                                        .unwrap_or(&selected_name),
                                )
                                .show_ui(ui, |ui| {
                                    for playlist in &self.playlists {
                                        ui.selectable_value(
                                            &mut self.draft.playlist_id,
                                            playlist.id.clone(),
                                            &playlist.name,
                                        );
                                    }
                                });
                        }
                    });

                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new("Start (HH:MM)").size(13.0).color(theme::MUTED));
                        ui.add_sized([90.0, 26.0], egui::TextEdit::singleline(&mut self.draft.start_time));
                        ui.label(egui::RichText::new("Duration").size(13.0).color(theme::MUTED));
                        ui.add(egui::Slider::new(&mut self.draft.duration_mins, 1..=720).suffix(" min"));
                    });

                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new("Priority").size(13.0).color(theme::MUTED));
                        ui.add(egui::Slider::new(&mut self.draft.priority, 1..=10));
                    });

                    widgets::section_header(ui, "Screens");
                    if self.screens.is_empty() {
                        theme::muted(ui, "No screens yet — add one on the Screens page first");
                    }
                    ui.horizontal_wrapped(|ui| {
                        for screen in &self.screens {
                            let mut checked = self.draft.selected_screens.contains(&screen.id);
                            if ui.checkbox(&mut checked, &screen.name).changed() {
                                if checked {
                                    self.draft.selected_screens.push(screen.id.clone());
                                } else {
                                    self.draft.selected_screens.retain(|id| id != &screen.id);
                                }
                            }
                        }
                    });

                    widgets::section_header(ui, "Days of week");
                    ui.horizontal(|ui| {
                        for (index, label) in DAY_LABELS.iter().enumerate() {
                            let mut checked = self.draft.days[index];
                            if ui.checkbox(&mut checked, *label).changed() {
                                self.draft.days[index] = checked;
                            }
                        }
                        if ui.button("All").clicked() {
                            self.draft.days = [true; 7];
                        }
                        if ui.button("Weekdays").clicked() {
                            self.draft.days = [true, true, true, true, true, false, false];
                        }
                        if ui.button("Weekend").clicked() {
                            self.draft.days = [false, false, false, false, false, true, true];
                        }
                    });

                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        if ui.button("Create Slot").clicked() {
                            self.submit_add(ui, core, toasts);
                        }
                        if ui.button("Cancel").clicked() {
                            self.show_add = false;
                        }
                    });
                });
            if !keep_open {
                self.show_add = false;
            }
        }
    }

    fn submit_add(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if self.draft.name.trim().is_empty() {
            toasts.push(Toast::new(ToastKind::Error, "Enter a slot name"));
            return;
        }
        if self.draft.playlist_id.is_empty() {
            toasts.push(Toast::new(ToastKind::Error, "Pick a playlist for this slot"));
            return;
        }
        if self.draft.selected_screens.is_empty() {
            toasts.push(Toast::new(ToastKind::Error, "Select at least one screen"));
            return;
        }
        if parse_hhmm(&self.draft.start_time).is_none() {
            toasts.push(Toast::new(ToastKind::Error, "Start time must be HH:MM (e.g. 08:30)"));
            return;
        }
        let days: Vec<AppWeekday> = (0..7)
            .filter(|index| self.draft.days[*index])
            .map(|index| day_from_index(index))
            .collect();
        if days.is_empty() {
            toasts.push(Toast::new(ToastKind::Error, "Select at least one day of the week"));
            return;
        }

        match crate::backend::schedule::add_schedule_slot(
            core,
            self.draft.name.trim().to_string(),
            self.draft.selected_screens.clone(),
            self.draft.playlist_id.clone(),
            self.draft.start_time.trim().to_string(),
            self.draft.duration_mins,
            days,
            self.draft.priority,
        ) {
            Ok(_) => {
                toasts.push(Toast::new(ToastKind::Success, "Schedule slot created and synced"));
                self.show_add = false;
                self.draft = AddDraft::default();
                let _ = ui;
                self.last_refresh = Instant::now() - Duration::from_secs(3600);
            }
            Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Create failed: {error}"))),
        }
    }

    fn refresh(&mut self, core: &Arc<AppCore>) {
        let pool = &core.pool;
        if let Ok(slots) = crate::backend::schedule::get_schedule(pool) {
            self.slots = slots;
        }
        if let Ok(screens) = crate::backend::screens::get_screens(pool) {
            self.screens = screens;
        }
        if let Ok(playlists) = crate::backend::playlists::get_playlists(pool) {
            self.playlists = playlists;
        }
    }
}
