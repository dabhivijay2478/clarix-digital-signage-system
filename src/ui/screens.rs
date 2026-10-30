use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::display_rules::{OperatingHours, OperatingHoursDay, FULL_WEEKDAYS};
use crate::models::{ContentItem, Orientation, Playlist, ProductionDashboard, Screen};
use crate::state::{AppCore, GateStoreData};

pub struct ScreensPage {
    last_refresh: Instant,
    screens: Vec<Screen>,
    playlists: Vec<Playlist>,
    dashboards: Vec<ProductionDashboard>,
    content: Vec<ContentItem>,
    gates: GateStoreData,
    gate_tab: bool,
    new_gate_number: String,
    screen_editor: Option<ScreenDraft>,
    display_editor: Option<DisplayDraft>,
    hours_editor: Option<HoursDraft>,
    delete_queue: Vec<String>,
    search: String,
}

pub struct ScreenDraft {
    id: Option<String>,
    name: String,
    location: String,
    ip: String,
    orientation: Orientation,
    width: String,
    height: String,
    playlist_id: Option<String>,
    open: bool,
}

pub struct DisplayDraft {
    screen_id: String,
    screen_name: String,
    purpose: String,
    gate_text: String,
    production_dashboard_id: Option<String>,
    default_content_id: Option<String>,
    open: bool,
}

pub struct HoursDraft {
    screen_id: String,
    screen_name: String,
    blank_when_not_in_use: bool,
    days: [OperatingHoursRow; 7],
    open: bool,
}

pub struct OperatingHoursRow {
    enabled: bool,
    start: String,
    end: String,
}

impl Default for ScreensPage {
    fn default() -> Self {
        Self {
            last_refresh: Instant::now() - Duration::from_secs(3600),
            screens: Vec::new(),
            playlists: Vec::new(),
            dashboards: Vec::new(),
            content: Vec::new(),
            gates: GateStoreData::default(),
            gate_tab: false,
            new_gate_number: String::new(),
            screen_editor: None,
            display_editor: None,
            hours_editor: None,
            delete_queue: Vec::new(),
            search: String::new(),
        }
    }
}

impl ScreensPage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_millis(2500)) {
            self.last_refresh = Instant::now();
            self.refresh(core);
        }

        self.handle_deletes(core, toasts);

        ui.horizontal(|ui| {
            let tab = |ui: &mut egui::Ui, text: &str, selected: bool| {
                ui.selectable_label(selected, egui::RichText::new(text).size(14.0))
            };
            if tab(ui, "All screens", !self.gate_tab).clicked() {
                self.gate_tab = false;
            }
            if tab(ui, "Gate setup", self.gate_tab).clicked() {
                self.gate_tab = true;
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if !self.gate_tab
                    && ui
                        .button(egui::RichText::new("+ Add screen").strong())
                        .clicked()
                {
                    self.screen_editor = Some(ScreenDraft::new());
                }
            });
        });
        ui.add_space(8.0);

        if self.gate_tab {
            self.show_gates_tab(ui, core, toasts);
        } else {
            egui::TextEdit::singleline(&mut self.search)
                .hint_text("Filter by name/location…")
                .desired_width(240.0)
                .show(ui);
            ui.add_space(6.0);
            self.show_screens_tab(ui, core, toasts);
        }

        self.draw_screen_editor(ui, core, toasts);
        self.draw_display_editor(ui, core, toasts);
        self.draw_hours_editor(ui, core, toasts);
    }

    fn refresh(&mut self, core: &Arc<AppCore>) {
        self.screens = crate::backend::screens::get_screens(&core.pool).unwrap_or_default();
        self.playlists = crate::backend::playlists::get_playlists(&core.pool).unwrap_or_default();
        self.dashboards =
            crate::backend::production::get_production_dashboards(core).unwrap_or_default();
        self.content = crate::backend::content::get_content_items(&core.pool).unwrap_or_default();
        self.gates = crate::state::load_gate_store(&core.config_dir);
    }

    fn playlist_name(&self, id: &Option<String>) -> String {
        id.as_ref()
            .and_then(|id| self.playlists.iter().find(|p| &p.id == id))
            .map(|p| p.name.clone())
            .unwrap_or_else(|| "—".to_string())
    }

    fn show_screens_tab(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
    ) {
        let query = self.search.to_lowercase();
        let screens = self
            .screens
            .iter()
            .filter(|screen| {
                query.is_empty()
                    || screen.name.to_lowercase().contains(&query)
                    || screen.location.to_lowercase().contains(&query)
            })
            .cloned()
            .collect::<Vec<_>>();

        if screens.is_empty() {
            widgets::empty_state(ui, "No screens yet. Add one to start publishing content.");
            return;
        }

        for screen in screens {
            let status_color = if screen.is_online { theme::GREEN } else { theme::RED };
            let status_text = if screen.is_online { "online" } else { "offline" };
            theme::card(ui, |ui| {
                ui.horizontal(|ui| {
                    // Leading device chip tinted by connection status.
                    let (chip, _) =
                        ui.allocate_exact_size(egui::vec2(40.0, 40.0), egui::Sense::hover());
                    ui.painter()
                        .rect_filled(chip, 10.0, theme::with_alpha(status_color, 0.16));
                    ui.painter().text(
                        chip.center(),
                        egui::Align2::CENTER_CENTER,
                        "🖥",
                        egui::FontId::proportional(18.0),
                        status_color,
                    );
                    ui.add_space(4.0);
                    ui.vertical(|ui| {
                        ui.horizontal(|ui| {
                            ui.label(
                                egui::RichText::new(screen.name.clone())
                                    .size(16.0)
                                    .strong()
                                    .color(theme::TEXT),
                            );
                            theme::badge(ui, status_text, status_color);
                            if screen.is_fullscreen {
                                theme::badge(ui, "fullscreen", theme::PRIMARY);
                            }
                        });
                        theme::muted(
                            ui,
                            &format!(
                                "{} · {} · {}×{} · playlist: {}",
                                skip_empty(&screen.location, "No location"),
                                orientation_label(&screen.orientation),
                                screen.resolution.width,
                                screen.resolution.height,
                                self.playlist_name(&screen.playlist_id),
                            ),
                        );
                        theme::muted(
                            ui,
                            &format!(
                                "purpose: {} · gate: {} · hours: {}",
                                screen.purpose,
                                screen.gate
                                    .as_ref()
                                    .map(|g| g.to_uppercase())
                                    .unwrap_or_else(|| "—".to_string()),
                                OperatingHours::parse(screen.operating_hours.as_ref()).summary(),
                            ),
                        );
                    });
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let screen_id = screen.id.clone();
                        ui.menu_button("Actions", |ui| {
                            if ui.button("Edit details").clicked() {
                                self.screen_editor = Some(ScreenDraft::from_screen(&screen));
                                ui.close();
                            }
                            if ui.button("Display options").clicked() {
                                self.open_display_editor(screen_id.clone());
                                ui.close();
                            }
                            if ui.button("Operating hours").clicked() {
                                self.hours_editor = Some(HoursDraft::from_screen(&screen));
                                ui.close();
                            }
                            if ui.button("Delete screen").clicked() {
                                self.delete_queue.push(screen_id.clone());
                                ui.close();
                            }
                        });

                        if ui.button("🔄 Sync").clicked() {
                            match crate::backend::screens::force_sync_screen(core, screen.id.clone()) {
                                Ok(revision) => toasts.push(Toast::new(
                                    ToastKind::Success,
                                    format!("Revision {revision} queued for the player."),
                                )),
                                Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
                            }
                        }
                    });
                });
            });
            ui.add_space(6.0);
        }
    }

    // ── Gate setup tab ─────────────────────────────────────────────────────

    fn show_gates_tab(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
    ) {
        widgets::section_header(ui, "Truck gates");
        theme::muted(
            ui,
            "Create gates (e.g. D4, G10) and assign screens to them. A screen can serve up to two gates; the player page renders live truck tokens for each assigned gate.",
        );
        ui.add_space(8.0);

        ui.horizontal(|ui| {
            ui.label("New gate:");
            egui::TextEdit::singleline(&mut self.new_gate_number)
                .hint_text("e.g. D4")
                .desired_width(140.0)
                .show(ui);
            if ui.button("Add gate").clicked() {
                let normalized = crate::state::normalize_gate_number(&self.new_gate_number);
                if crate::state::is_valid_gate_number(&normalized)
                    && !self.gates.gates.iter().any(|g| g.number == normalized)
                {
                    self.gates.gates.push(crate::state::GateConfig {
                        number: normalized,
                        ..Default::default()
                    });
                    self.new_gate_number.clear();
                    self.persist_gates(core, toasts);
                } else {
                    toasts.push(Toast::new(
                        ToastKind::Error,
                        "Gate must be letter+digits (like D4) and unique.",
                    ));
                }
            }
        });
        ui.add_space(10.0);

        if self.gates.gates.is_empty() {
            widgets::empty_state(ui, "No gates configured yet.");
            return;
        }

        let screen_options = self
            .screens
            .iter()
            .map(|s| (s.id.clone(), s.name.clone()))
            .collect::<Vec<_>>();

        let gate_rows: Vec<(crate::state::GateConfig, Vec<String>)> = self
            .gates
            .gates
            .iter()
            .map(|gate| {
                (
                    gate.clone(),
                    self.gates
                        .assignments
                        .get(&gate.number)
                        .cloned()
                        .unwrap_or_default(),
                )
            })
            .collect();

        for (index, (gate, assigned)) in gate_rows.iter().enumerate() {
            let purpose = gate.purpose.clone();
            let dashboards = self.dashboards.clone();
            let playlists = self.playlists.clone();
            let current_dashboard = gate
                .production_dashboard_id
                .as_ref()
                .and_then(|id| dashboards.iter().find(|d| &d.id == id))
                .map(|d| d.name.clone())
                .unwrap_or_else(|| "—".to_string());
            let current_playlist = gate
                .playlist_id
                .as_ref()
                .and_then(|id| playlists.iter().find(|p| &p.id == id))
                .map(|p| p.name.clone())
                .unwrap_or_else(|| "—".to_string());
            theme::card(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new(gate.number.to_uppercase())
                            .strong()
                            .size(16.0),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("Remove").clicked() {
                            self.delete_gate(core, index, toasts);
                        }
                    });
                });

                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("Screens:").color(theme::MUTED));
                    if assigned.is_empty() {
                        theme::muted(ui, "none assigned");
                    }
                    for screen_id in assigned {
                        let label = screen_options
                            .iter()
                            .find(|(id, _)| id == screen_id)
                            .map(|(_, name)| name.clone())
                            .unwrap_or_else(|| screen_id.clone());
                        if ui
                            .button(egui::RichText::new(format!("{label} ×")).size(12.0))
                            .clicked()
                        {
                            self.unassign_gate_screen(core, &gate.number, screen_id.clone(), toasts);
                        }
                    }
                });

                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("Assign:").color(theme::MUTED));
                    gew_combo(ui, format!("assign-{}", gate.id), 210.0, "Pick screen…", |ui| {
                        for (screen_id, name) in &screen_options {
                            if ui.selectable_label(false, name.clone()).clicked() {
                                self.assign_gate_screen(core, &gate.number, screen_id.clone(), toasts);
                            }
                        }
                    });

                    ui.label(egui::RichText::new("Loading:").color(theme::MUTED));
                    let mut mins = gate.loading_duration_mins as i32;
                    if ui
                        .add(
                            egui::DragValue::new(&mut mins)
                                .range(1..=1440)
                                .suffix(" min"),
                        )
                        .changed()
                    {
                        self.gates.gates[index].loading_duration_mins = mins.max(1) as u32;
                        self.persist_gates(core, toasts);
                    }

                    ui.label(egui::RichText::new("Display:").color(theme::MUTED));
                    gew_combo(ui, format!("purpose-{}", gate.id), 170.0, &purpose, |ui| {
                        for option in ["playlist", "truck_gate", "production_dashboard"] {
                            if ui.selectable_label(false, option).clicked() {
                                self.gates.gates[index].purpose = option.to_string();
                                self.persist_gates(core, toasts);
                            }
                        }
                    });

                    if purpose == "production_dashboard" {
                        gew_combo(ui, format!("dash-{}", gate.id), 190.0, &current_dashboard, |ui| {
                            for dashboard in &dashboards {
                                if ui.selectable_label(false, dashboard.name.clone()).clicked() {
                                    self.gates.gates[index].production_dashboard_id =
                                        Some(dashboard.id.clone());
                                    self.persist_gates(core, toasts);
                                }
                            }
                        });
                    } else {
                        gew_combo(ui, format!("pl-{}", gate.id), 190.0, &current_playlist, |ui| {
                            for playlist in &playlists {
                                if ui.selectable_label(false, playlist.name.clone()).clicked() {
                                    self.gates.gates[index].playlist_id = Some(playlist.id.clone());
                                    self.persist_gates(core, toasts);
                                }
                            }
                        });
                    }
                });
            });
            ui.add_space(6.0);
        }
    }

    fn assign_gate_screen(
        &mut self,
        core: &Arc<AppCore>,
        gate_number: &str,
        screen_id: String,
        toasts: &mut Vec<Toast>,
    ) {
        let list = self
            .gates
            .assignments
            .entry(gate_number.to_string())
            .or_insert_with(Vec::new);
        if list.len() >= 2 {
            toasts.push(Toast::new(
                ToastKind::Error,
                "A screen can only serve two gates at once.",
            ));
            return;
        }
        if !list.contains(&screen_id) {
            list.push(screen_id);
        }
        self.sync_screen_gate_from_assignments(core, toasts);
    }

    fn unassign_gate_screen(
        &mut self,
        core: &Arc<AppCore>,
        gate_number: &str,
        screen_id: String,
        toasts: &mut Vec<Toast>,
    ) {
        if let Some(list) = self.gates.assignments.get_mut(gate_number) {
            list.retain(|id| id != &screen_id);
        }
        self.sync_screen_gate_from_assignments(core, toasts);
    }

    fn delete_gate(&mut self, core: &Arc<AppCore>, index: usize, toasts: &mut Vec<Toast>) {
        if index >= self.gates.gates.len() {
            return;
        }
        let number = self.gates.gates[index].number.clone();
        self.gates.gates.remove(index);
        self.gates.assignments.remove(&number);
        for screen in &self.screens {
            let gates = crate::state::parse_screen_gates(screen.gate.as_deref());
            if gates.contains(&number) {
                let remaining: Vec<String> = gates.into_iter().filter(|g| *g != number).collect();
                if let Err(error) = crate::backend::screens::update_screen_gate_only(
                    core,
                    screen.id.clone(),
                    crate::state::serialize_screen_gates(&remaining),
                ) {
                    toasts.push(Toast::new(ToastKind::Error, error));
                }
            }
        }
        self.persist_gates(core, toasts);
    }

    /// Recompute each screen's `gate` CSV from the assignments and persist.
    fn sync_screen_gate_from_assignments(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let mut updates: Vec<(String, Option<String>)> = Vec::new();
        for screen in &self.screens {
            let mut gates: Vec<String> = Vec::new();
            for gate in &self.gates.gates {
                let assigned = self
                    .gates
                    .assignments
                    .get(&gate.number)
                    .cloned()
                    .unwrap_or_default();
                if assigned.contains(&screen.id) && !gates.contains(&gate.number) {
                    gates.push(gate.number.clone());
                }
            }
            updates.push((screen.id.clone(), crate::state::serialize_screen_gates(&gates)));
        }
        for (screen_id, gate_csv) in updates {
            if let Some(screen) = self.screens.iter_mut().find(|s| s.id == screen_id) {
                screen.gate = gate_csv.clone();
            }
            if let Err(error) =
                crate::backend::screens::update_screen_gate_only(core, screen_id, gate_csv)
            {
                toasts.push(Toast::new(ToastKind::Error, error));
            }
        }
        self.persist_gates(core, toasts);
    }

    fn persist_gates(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if let Err(error) = crate::state::save_gate_store(&core.config_dir, &self.gates) {
            toasts.push(Toast::new(ToastKind::Error, format!("Saving gates failed: {error}")));
        }
    }

    // ── Display options editor ────────────────────────────────────────────

    fn open_display_editor(&mut self, screen_id: String) {
        let Some(screen) = self.screens.iter().find(|s| s.id == screen_id) else {
            return;
        };
        self.display_editor = Some(DisplayDraft {
            screen_id: screen.id.clone(),
            screen_name: screen.name.clone(),
            purpose: screen.purpose.clone(),
            gate_text: crate::state::parse_screen_gates(screen.gate.as_deref()).join(", "),
            production_dashboard_id: screen.production_dashboard_id.clone(),
            default_content_id: screen.default_content_id.clone(),
            open: true,
        });
    }

    fn draw_display_editor(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
    ) {
        let mut draft = match self.display_editor.take() {
            Some(draft) if draft.open => draft,
            _ => return, // take() already cleared the editor
        };
        let mut open = draft.open;
        let title = format!("Display options — {}", draft.screen_name.clone());
        let dashboards = self.dashboards.clone();
        let content = self.content.clone();
        let purpose = draft.purpose.clone();
        egui::Window::new(egui::RichText::new(title).strong())
            .open(&mut open)
            .resizable(false)
            .show(ui.ctx(), |ui| {
                ui.horizontal(|ui| {
                    ui.label("Purpose:");
                    gew_combo(ui, "display-purpose".to_string(), 210.0, &purpose, |ui| {
                        for option in ["playlist", "truck_gate", "production_dashboard"] {
                            if ui.selectable_label(false, option).clicked() {
                                draft.purpose = option.to_string();
                            }
                        }
                    });
                });
                if draft.purpose == "truck_gate" {
                    theme::muted(ui, "Gate numbers (max 2, comma separated):");
                    egui::TextEdit::singleline(&mut draft.gate_text)
                        .hint_text("d1, d4")
                        .desired_width(260.0)
                        .show(ui);
                }
                if draft.purpose == "production_dashboard" {
                    ui.horizontal(|ui| {
                        ui.label("Dashboard:");
                        let current = dashboards
                            .iter()
                            .find(|d| Some(d.id.clone()) == draft.production_dashboard_id.clone())
                            .map(|d| d.name.clone())
                            .unwrap_or_else(|| "—".to_string());
                        gew_combo(ui, "display-dash".to_string(), 240.0, &current, |ui| {
                            if ui.selectable_label(false, "—").clicked() {
                                draft.production_dashboard_id = None;
                            }
                            for dashboard in &dashboards {
                                if ui
                                    .selectable_label(false, dashboard.name.clone())
                                    .clicked()
                                {
                                    draft.production_dashboard_id = Some(dashboard.id.clone());
                                }
                            }
                        });
                    });
                }
                ui.horizontal(|ui| {
                    ui.label("Default content (playlist fallback):");
                    let content = content.clone();
                    let current = content
                        .iter()
                        .find(|c| Some(c.id.clone()) == draft.default_content_id.clone())
                        .map(|c| c.name.clone())
                        .unwrap_or_else(|| "—".to_string());
                    gew_combo(ui, "display-default".to_string(), 240.0, &current, |ui| {
                        if ui.selectable_label(false, "—").clicked() {
                            draft.default_content_id = None;
                        }
                        for item in &content {
                            if ui.selectable_label(false, item.name.clone()).clicked() {
                                draft.default_content_id = Some(item.id.clone());
                            }
                        }
                    });
                });
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if ui.button("Save").clicked() {
                        let gate_csv = if draft.purpose == "truck_gate" {
                            let gates: Vec<String> = draft
                                .gate_text
                                .split(',')
                                .map(str::trim)
                                .filter(|gate| !gate.is_empty())
                                .map(str::to_string)
                                .collect();
                            crate::state::serialize_screen_gates(&gates)
                        } else {
                            None
                        };
                        match crate::backend::screens::update_screen_display_options(
                            core,
                            draft.screen_id.clone(),
                            draft.purpose.clone(),
                            gate_csv,
                            draft.production_dashboard_id.clone(),
                            draft.default_content_id.clone(),
                        ) {
                            Ok(()) => {
                                toasts.push(Toast::new(ToastKind::Success, "Display options saved."));
                                draft.open = false;
                                self.refresh(core);
                            }
                            Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
                        }
                    }
                    if ui.button("Cancel").clicked() {
                        draft.open = false;
                    }
                });
            });
        if open && draft.open {
            self.display_editor = Some(draft);
        }
    }

    // ── Operating hours editor ────────────────────────────────────────────

    fn draw_hours_editor(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
    ) {
        let mut draft = match self.hours_editor.take() {
            Some(draft) if draft.open => draft,
            _ => return, // take() already cleared the editor
        };
        let mut open = draft.open;
        let title = format!("Operating hours — {}", draft.screen_name.clone());
        egui::Window::new(egui::RichText::new(title).strong())
            .open(&mut open)
            .default_width(560.0)
            .show(ui.ctx(), |ui| {
                ui.checkbox(
                    &mut draft.blank_when_not_in_use,
                    "Blank the display when outside operating hours",
                );
                ui.add_space(6.0);
                for (row, name) in draft.days.iter_mut().zip(FULL_WEEKDAYS) {
                    ui.horizontal(|ui| {
                        ui.checkbox(&mut row.enabled, name);
                        egui::TextEdit::singleline(&mut row.start)
                            .hint_text("00:00")
                            .desired_width(90.0)
                            .show(ui);
                        ui.label("—");
                        egui::TextEdit::singleline(&mut row.end)
                            .hint_text("23:59")
                            .desired_width(90.0)
                            .show(ui);
                    });
                }
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if ui.button("Save").clicked() {
                        let mut hours = OperatingHours {
                            blank_when_not_in_use: draft.blank_when_not_in_use,
                            days: Default::default(),
                        };
                        for (row, name) in draft.days.iter().zip(FULL_WEEKDAYS) {
                            if row.enabled {
                                hours.days.insert(
                                    name.to_string(),
                                    OperatingHoursDay {
                                        enabled: true,
                                        start: row.start.clone(),
                                        end: row.end.clone(),
                                    },
                                );
                            }
                        }
                        match crate::backend::screens::update_screen_operating_hours(
                            core,
                            draft.screen_id.clone(),
                            hours.to_json(),
                        ) {
                            Ok(()) => {
                                toasts.push(Toast::new(ToastKind::Success, "Operating hours saved."));
                                draft.open = false;
                                self.refresh(core);
                            }
                            Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
                        }
                    }
                    if ui.button("Cancel").clicked() {
                        draft.open = false;
                    }
                });
            });
        if open && draft.open {
            self.hours_editor = Some(draft);
        }
    }

    // ── Screen add/edit editor ────────────────────────────────────────────

    fn draw_screen_editor(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
    ) {
        let mut draft = match self.screen_editor.take() {
            Some(draft) if draft.open => draft,
            _ => return, // take() already cleared the editor
        };
        let mut open = draft.open;
        let title = if draft.id.is_some() {
            "Edit screen"
        } else {
            "Add screen"
        };
        let playlists = self.playlists.clone();
        let current_playlist = draft
            .playlist_id
            .as_ref()
            .and_then(|id| playlists.iter().find(|p| &p.id == id))
            .map(|p| p.name.clone())
            .unwrap_or_else(|| "None".to_string());

        egui::Window::new(egui::RichText::new(title).strong())
            .open(&mut open)
            .resizable(false)
            .show(ui.ctx(), |ui| {
                ui.horizontal(|ui| {
                    ui.label("Name: ");
                    egui::TextEdit::singleline(&mut draft.name)
                        .hint_text("Reception LED")
                        .desired_width(260.0)
                        .show(ui);
                });
                ui.horizontal(|ui| {
                    ui.label("Location: ");
                    egui::TextEdit::singleline(&mut draft.location)
                        .desired_width(260.0)
                        .show(ui);
                });
                ui.horizontal(|ui| {
                    ui.label("IP (optional): ");
                    egui::TextEdit::singleline(&mut draft.ip)
                        .hint_text("192.168.1.10")
                        .desired_width(260.0)
                        .show(ui);
                });
                ui.horizontal(|ui| {
                    ui.label("Orientation: ");
                    let current = orientation_label(&draft.orientation);
                    gew_combo(ui, "screen-orientation".to_string(), 160.0, current, |ui| {
                        for (label, value) in [
                            ("Landscape", Orientation::Landscape),
                            ("Portrait", Orientation::Portrait),
                            ("LandscapeFlipped", Orientation::LandscapeFlipped),
                            ("PortraitFlipped", Orientation::PortraitFlipped),
                        ] {
                            if ui.selectable_label(false, label).clicked() {
                                draft.orientation = value;
                            }
                        }
                    });
                    ui.label("Resolution: ");
                    egui::TextEdit::singleline(&mut draft.width)
                        .desired_width(70.0)
                        .show(ui);
                    ui.label("×");
                    egui::TextEdit::singleline(&mut draft.height)
                        .desired_width(70.0)
                        .show(ui);
                });
                ui.horizontal(|ui| {
                    ui.label("Playlist: ");
                    gew_combo(ui, "screen-playlist".to_string(), 240.0, &current_playlist, |ui| {
                        if ui.selectable_label(false, "None").clicked() {
                            draft.playlist_id = None;
                        }
                        for playlist in &playlists {
                            if ui.selectable_label(false, playlist.name.clone()).clicked() {
                                draft.playlist_id = Some(playlist.id.clone());
                            }
                        }
                    });
                });
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if ui.button("Save").clicked() {
                        let width: i32 = draft.width.trim().parse().unwrap_or(1920);
                        let height: i32 = draft.height.trim().parse().unwrap_or(1080);
                        let orientation = orientation_label(&draft.orientation);
                        let ip = draft
                            .ip
                            .clone()
                            .trim()
                            .to_string();
                        let ip = if ip.is_empty() { None } else { Some(ip) };
                        let result = if let Some(id) = draft.id.clone() {
                            crate::backend::screens::edit_screen(
                                core,
                                id,
                                draft.name.clone(),
                                draft.location.clone(),
                                ip.clone(),
                                Some(orientation.to_string()),
                                Some(width),
                                Some(height),
                                draft.playlist_id.clone(),
                                None,
                                None,
                                None,
                                None,
                            )
                        } else {
                            crate::backend::screens::add_screen(
                                core,
                                draft.name.clone(),
                                draft.location.clone(),
                                ip.clone(),
                                Some(orientation.to_string()),
                                Some(width),
                                Some(height),
                                draft.playlist_id.clone(),
                                None,
                                None,
                                None,
                                None,
                            )
                            .map(|_| ())
                        };
                        match result {
                            Ok(()) => {
                                toasts.push(Toast::new(ToastKind::Success, "Screen saved."));
                                draft.open = false;
                                self.refresh(core);
                            }
                            Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
                        }
                    }
                    if ui.button("Cancel").clicked() {
                        draft.open = false;
                    }
                });
            });
        if open && draft.open {
            self.screen_editor = Some(draft);
        }
    }

    fn handle_deletes(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let deleted = std::mem::take(&mut self.delete_queue);
        let deleted_count = deleted.len();
        for id in deleted {
            match crate::backend::screens::delete_screen(core, id.clone()) {
                Ok(()) => toasts.push(Toast::new(ToastKind::Success, "Screen deleted.")),
                Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
            }
        }
        if deleted_count > 0 {
            self.last_refresh = Instant::now() - Duration::from_millis(2500);
        }
    }
}

impl ScreenDraft {
    pub fn new() -> Self {
        Self {
            id: None,
            name: String::new(),
            location: String::new(),
            ip: String::new(),
            orientation: Orientation::Landscape,
            width: "1920".to_string(),
            height: "1080".to_string(),
            playlist_id: None,
            open: true,
        }
    }

    pub fn from_screen(screen: &Screen) -> Self {
        Self {
            id: Some(screen.id.clone()),
            name: screen.name.clone(),
            location: screen.location.clone(),
            ip: screen.ip_address.clone().unwrap_or_default(),
            orientation: screen.orientation.clone(),
            width: screen.resolution.width.to_string(),
            height: screen.resolution.height.to_string(),
            playlist_id: screen.playlist_id.clone(),
            open: true,
        }
    }
}

impl HoursDraft {
    pub fn from_screen(screen: &Screen) -> Self {
        let hours = OperatingHours::parse(screen.operating_hours.as_ref());
        let mut days = std::array::from_fn(|_| OperatingHoursRow {
            enabled: false,
            start: "00:00".to_string(),
            end: "23:59".to_string(),
        });
        for (index, name) in FULL_WEEKDAYS.iter().enumerate() {
            let entry = hours.day(name);
            days[index] = OperatingHoursRow {
                enabled: entry.enabled,
                start: entry.start,
                end: entry.end,
            };
        }
        Self {
            screen_id: screen.id.clone(),
            screen_name: screen.name.clone(),
            blank_when_not_in_use: hours.blank_when_not_in_use,
            days,
            open: true,
        }
    }
}

fn orientation_label(orientation: &Orientation) -> &'static str {
    match orientation {
        Orientation::Landscape => "Landscape",
        Orientation::Portrait => "Portrait",
        Orientation::LandscapeFlipped => "LandscapeFlipped",
        Orientation::PortraitFlipped => "PortraitFlipped",
    }
}

fn skip_empty(value: &str, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

/// Minimal ComboBox wrapper around a simple selection list.
pub fn gew_combo<R>(
    ui: &mut egui::Ui,
    id: String,
    width: f32,
    selected: &str,
    add_options: impl FnOnce(&mut egui::Ui) -> R,
) {
    egui::ComboBox::from_id_salt(id)
        .width(width)
        .selected_text(selected.to_string())
        .show_ui(ui, |ui| {
            add_options(ui);
        });
}

use crate::theme;
use crate::ui::widgets;
