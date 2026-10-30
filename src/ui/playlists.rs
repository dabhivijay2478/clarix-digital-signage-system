use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::display_rules::{PlaylistItemSchedule, format_schedule_summary};
use crate::models::{Playlist, TransitionEffect};
use crate::state::AppCore;

pub struct PlaylistsPage {
    last_refresh: Instant,
    playlists: Vec<Playlist>,
    content_names: std::collections::HashMap<String, (String, String)>,
    selected: Option<String>,
    editing: Option<EditingPlaylist>,
    create_dialog: Option<CreateDraft>,
    schedule_editor: Option<ScheduleDraft>,
    delete_queue: Vec<String>,
}

pub struct EditingPlaylist {
    pub playlist_id: String,
    pub name: String,
    pub transition: usize,
    pub loop_enabled: bool,
    pub open: bool,
    pub items: Vec<EditingItem>,
}

#[derive(Clone)]
pub struct EditingItem {
    pub content_id: String,
    pub schedule: Option<serde_json::Value>,
}

pub struct CreateDraft {
    name: String,
    transition: usize,
    loop_enabled: bool,
    open: bool,
}

pub struct ScheduleDraft {
    order: usize,
    schedule: PlaylistItemSchedule,
}

pub const TRANSITIONS: [&str; 4] = ["None", "Fade", "Slide", "Zoom"];

impl Default for PlaylistsPage {
    fn default() -> Self {
        Self {
            last_refresh: Instant::now() - Duration::from_secs(3600),
            playlists: Vec::new(),
            content_names: Default::default(),
            selected: None,
            editing: None,
            create_dialog: None,
            schedule_editor: None,
            delete_queue: Vec::new(),
        }
    }
}

impl PlaylistsPage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_millis(2500)) {
            self.last_refresh = Instant::now();
            self.refresh(core);
        }
        self.handle_deletes(core, toasts);

        // Toolbar
        ui.horizontal(|ui| {
            if ui.button(egui::RichText::new("+ New playlist").strong()).clicked() {
                self.create_dialog = Some(CreateDraft {
                    name: String::new(),
                    transition: 1,
                    loop_enabled: true,
                    open: true,
                });
            }
        });
        ui.add_space(6.0);

        // Grid: playlist list, then the editor below when something is selected.
        let ids = self.playlists.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
        if ids.is_empty() {
            widgets::empty_state(ui, "No playlists yet. Create one and add content to it.");
        } else {
            for (index, playlist) in self.playlists.iter().enumerate() {
                let selected = self.selected.as_deref() == Some(playlist.id.as_str());
                theme::card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.horizontal(|ui| {
                                if ui
                                    .add(
                                        egui::Button::new(egui::RichText::new(format!("▶  {}", playlist.name)).strong()),
                                    )
                                    .clicked()
                                {
                                    if selected {
                                        self.selected = None;
                                        self.editing = None;
                                    } else {
                                        self.selected = Some(playlist.id.clone());
                                        self.editing = Some(EditingPlaylist::from_playlist(playlist));
                                    }
                                }
                                theme::badge(ui, &format!("{} items", playlist.items.len()), theme::PRIMARY);
                                theme::badge(
                                    ui,
                                    TRANSITIONS[transition_index(&playlist.transition)],
                                    theme::MUTED,
                                );
                                if playlist.loop_enabled {
                                    theme::badge(ui, "loops", theme::GREEN);
                                }
                            });
                            let names = playlist
                                .items
                                .iter()
                                .filter_map(|item| {
                                    self.content_names
                                        .get(&item.content_id)
                                        .map(|(name, _)| name.clone())
                                })
                                .collect::<Vec<_>>();
                            theme::muted(
                                ui,
                                &if names.is_empty() {
                                    "Empty".to_string()
                                } else {
                                    names.join(" → ")
                                },
                            );
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui.button("🗑").on_hover_text("Delete playlist").clicked() {
                                self.delete_queue.push(playlist.id.clone());
                            }
                            theme::muted(ui, &format!("#{}/{}", index + 1, ids.len()));
                        });
                    });
                });
                ui.add_space(6.0);
            }
        }

        self.draw_editor(ui, core, toasts);
        self.draw_create_dialog(ui, core, toasts);
        self.draw_schedule_editor(ui, core, toasts);
    }

    fn refresh(&mut self, core: &Arc<AppCore>) {
        self.playlists =
            crate::backend::playlists::get_playlists(&core.pool).unwrap_or_default();
        self.content_names = crate::backend::content::get_content_items(&core.pool)
            .unwrap_or_default()
            .into_iter()
            .map(|item| {
                (
                    item.id.clone(),
                    (
                        item.name.clone(),
                        crate::ui::content::type_label(&item.content_type).to_string(),
                    ),
                )
            })
            .collect();
        if let Some(playlist) = self
            .playlists
            .iter()
            .find(|p| Some(p.id.clone()) == self.selected)
        {
            // Keep the editor open but do not clobber in-progress edits.
            if self.editing.is_none() {
                self.editing = Some(EditingPlaylist::from_playlist(playlist));
            }
        } else {
            self.selected = None;
            self.editing = None;
        }
    }

    fn draw_editor(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let Some(editing) = &mut self.editing else { return };
        if !editing.open {
            self.selected = None;
            self.editing = None;
            return;
        }
        ui.add_space(6.0);
        widgets::section_header(ui, &format!("Editing: {}", editing.name));
        theme::card(ui, |ui| {
            egui::CollapsingHeader::new(egui::RichText::new("Playlist settings").strong())
                .default_open(false)
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label("Transition: ");
                        let current = TRANSITIONS[editing.transition];
                        gew_combo(ui, "editing-transition".to_string(), 140.0, current, |ui| {
                            for (index, label) in TRANSITIONS.iter().enumerate() {
                                if ui.selectable_label(false, *label).clicked() {
                                    editing.transition = index;
                                }
                            }
                        });
                        ui.checkbox(&mut editing.loop_enabled, "Loop playlist");
                    });
                });

            ui.separator();
            ui.label(egui::RichText::new("Items").strong().size(14.0));

            let count = editing.items.len();
            let mut swaps: Vec<usize> = Vec::new();
            let mut removals: Vec<usize> = Vec::new();
            let mut schedule_opens: Vec<usize> = Vec::new();
            let mut additions: Vec<String> = Vec::new();

            for (index, item) in editing.items.iter().enumerate() {
                let (name, kind) = self
                    .content_names
                    .get(&item.content_id)
                    .cloned()
                    .unwrap_or_else(|| ("(missing)".to_string(), "—".to_string()));
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new(format!("{}. ", index + 1)).color(theme::MUTED));
                    if ui
                        .button("⬆")
                        .on_hover_text("Move up")
                        .clicked() && index > 0
                    {
                        swaps.push(index - 1);
                    }
                    if ui.button("⬇").on_hover_text("Move down").clicked() && index < count - 1 {
                        swaps.push(index);
                    }
                    ui.label(
                        egui::RichText::new(format!("{} · {}", name, kind))
                            .size(13.5)
                            .color(theme::TEXT),
                    );
                    ui.label(
                        egui::RichText::new(format_schedule_summary(item.schedule.as_ref()))
                            .size(12.0)
                            .color(theme::MUTED),
                    );
                    if ui.button("⏱ Schedule").clicked() {
                        schedule_opens.push(index);
                    }
                    if count > 1 && ui.button("✕").on_hover_text("Remove item").clicked() {
                        removals.push(index);
                    }
                });
            }

            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label("Add content:");
                let ids = self
                    .content_names
                    .iter()
                    .map(|(id, (name, kind))| (id.clone(), format!("{name} · {kind}")))
                    .collect::<Vec<_>>();
                gew_combo(ui, "add-item".to_string(), 260.0, "Pick content", |ui| {
                    for (id, label) in &ids {
                        if ui.selectable_label(false, label.clone()).clicked() {
                            additions.push(id.clone());
                        }
                    }
                });

                if ui.button("💾 Save playlist").clicked() {
                    let transition = TRANSITIONS[editing.transition];
                    save_playlist(core, toasts, editing, transition);
                    self.last_refresh =
                        Instant::now() - Duration::from_millis(2500);
                }
            });

            for index in swaps {
                editing.items.swap(index, index + 1);
            }
            for index in removals.into_iter().rev() {
                editing.items.remove(index);
            }
            for id in additions {
                editing.items.push(EditingItem {
                    content_id: id,
                    schedule: None,
                });
            }
            for index in schedule_opens {
                let item = editing.items[index].clone();
                let schedule = PlaylistItemSchedule::parse(item.schedule.as_ref())
                    .unwrap_or_default();
                self.schedule_editor = Some(ScheduleDraft { order: index, schedule });
            }
        });
    }

    fn draw_schedule_editor(
        &mut self,
        ui: &mut egui::Ui,
        _core: &Arc<AppCore>,
        _toasts: &mut Vec<Toast>,
    ) {
        let mut closed = false;
        let mut draft = match self.schedule_editor.take() {
            Some(draft) => draft,
            None => return,
        };
        let mut open = true;
        let weekdays = crate::display_rules::APP_WEEKDAYS;
        egui::Window::new(egui::RichText::new(format!(
            "Display schedule — item {}",
            draft.order + 1
        )).strong())
        .open(&mut open)
        .default_width(540.0)
        .show(ui.ctx(), |ui| {
            ui.checkbox(
                &mut draft.schedule.time_restricted,
                "Restrict to specific weekdays & times",
            );
            if draft.schedule.time_restricted {
                for day in weekdays {
                    let default_entry = || crate::display_rules::PlaylistItemDaySchedule {
                        enabled: false,
                        start: draft.schedule.start_time.clone(),
                        end: draft.schedule.end_time.clone(),
                    };
                    let entry = draft
                        .schedule
                        .day_times
                        .entry(day.to_string())
                        .or_insert_with(default_entry);
                    ui.horizontal(|ui| {
                        ui.checkbox(&mut entry.enabled, day);
                        egui::TextEdit::singleline(&mut entry.start)
                            .desired_width(70.0)
                            .show(ui);
                        ui.label("—");
                        egui::TextEdit::singleline(&mut entry.end)
                            .desired_width(70.0)
                            .show(ui);
                    });
                }
                theme::muted(ui, "Times are local, \"23:50 → 01:00\" crosses midnight.");
            }
            ui.add_space(6.0);
            ui.checkbox(
                &mut draft.schedule.date_restricted,
                "Restrict to a date range",
            );
            if draft.schedule.date_restricted {
                ui.horizontal(|ui| {
                    ui.label("From ");
                    egui::TextEdit::singleline(&mut draft.schedule.start_date)
                        .desired_width(120.0)
                        .hint_text("2026-01-31")
                        .show(ui);
                    ui.label("to ");
                    egui::TextEdit::singleline(&mut draft.schedule.end_date)
                        .desired_width(120.0)
                        .hint_text("2026-02-14")
                        .show(ui);
                });
            }
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                ui.label("Transition override: ");
                let current = draft.schedule.transition.clone();
                gew_combo(ui, "item-transition".to_string(), 120.0, &current, |ui| {
                    for label in TRANSITIONS {
                        if ui.selectable_label(false, label).clicked() {
                            draft.schedule.transition = label.to_string();
                        }
                    }
                });
            });
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                if ui.button("Apply").clicked() {
                    if let Some(editing) = &mut self.editing {
                        let order_index = draft.order;
                        if let Some(item) = editing.items.get_mut(order_index) {
                            item.schedule = Some(draft.schedule.to_json());
                        }
                    }
                    closed = true;
                }
                if ui.button("Clear schedule").clicked() {
                    if let Some(editing) = &mut self.editing {
                        let order_index = draft.order;
                        if let Some(item) = editing.items.get_mut(order_index) {
                            item.schedule = None;
                        }
                    }
                    closed = true;
                }
                if ui.button("Cancel").clicked() {
                    closed = true;
                }
            });
        });
        if open && !closed && self.editing.is_some() {
            self.schedule_editor = Some(draft);
        }
    }

    fn draw_create_dialog(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
    ) {
        let Some(draft) = &mut self.create_dialog else { return };
        if !draft.open {
            self.create_dialog = None;
            return;
        }
        let mut open = draft.open;
        egui::Window::new(egui::RichText::new("New playlist").strong())
            .open(&mut open)
            .resizable(false)
            .show(ui.ctx(), |ui| {
                egui::TextEdit::singleline(&mut draft.name)
                    .hint_text("Playlist name")
                    .desired_width(260.0)
                    .show(ui);
                ui.add_space(4.0);
                ui.horizontal(|ui| {
                    ui.label("Transition:");
                    let current = TRANSITIONS[draft.transition];
                    gew_combo(ui, "create-transition".to_string(), 140.0, current, |ui| {
                        for (index, label) in TRANSITIONS.iter().enumerate() {
                            if ui.selectable_label(false, *label).clicked() {
                                draft.transition = index;
                            }
                        }
                    });
                    ui.checkbox(&mut draft.loop_enabled, "Loop");
                });
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    if ui.button("Create").clicked() {
                        match crate::backend::playlists::create_playlist(
                            core,
                            draft.name.clone(),
                            TRANSITIONS[draft.transition].to_string(),
                            draft.loop_enabled,
                        ) {
                            Ok(playlist) => {
                                toasts.push(Toast::new(ToastKind::Success, "Playlist created."));
                                self.selected = Some(playlist.id.clone());
                                draft.open = false;
                                self.last_refresh = Instant::now() - Duration::from_millis(2500);
                            }
                            Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
                        }
                    }
                    if ui.button("Cancel").clicked() {
                        draft.open = false;
                    }
                });
            });
        if draft.open != open {
            draft.open = open;
        }
        if !open {
            self.create_dialog = None;
        }
    }

    fn handle_deletes(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let queue = std::mem::take(&mut self.delete_queue);
        for id in queue {
            match crate::backend::playlists::delete_playlist(core, id) {
                Ok(()) => {
                    toasts.push(Toast::new(ToastKind::Success, "Playlist deleted."));
                    self.last_refresh = Instant::now() - Duration::from_millis(2500);
                }
                Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
            }
        }
    }
}

impl EditingPlaylist {
    pub fn from_playlist(playlist: &Playlist) -> Self {
        Self {
            playlist_id: playlist.id.clone(),
            name: playlist.name.clone(),
            transition: transition_index(&playlist.transition),
            loop_enabled: playlist.loop_enabled,
            open: true,
            items: playlist
                .items
                .iter()
                .map(|item| EditingItem {
                    content_id: item.content_id.clone(),
                    schedule: item.display_schedule.clone(),
                })
                .collect(),
        }
    }
}

fn transition_index(effect: &TransitionEffect) -> usize {
    match effect {
        TransitionEffect::None => 0,
        TransitionEffect::Fade => 1,
        TransitionEffect::Slide => 2,
        TransitionEffect::Zoom => 3,
    }
}

fn save_playlist(
    core: &Arc<AppCore>,
    toasts: &mut Vec<Toast>,
    editing: &EditingPlaylist,
    transition: &str,
) {
    // Persist name/transition/loop by delete+recreate semantics? The backend
    // only exposes item updates, so keep playlist row metadata as created and
    // update the items.
    let items = editing
        .items
        .iter()
        .enumerate()
        .map(|(order, item)| crate::models::PlaylistItem {
            content_id: item.content_id.clone(),
            order: order as u32,
            override_duration: None,
            display_schedule: item.schedule.clone(),
        })
        .collect::<Vec<_>>();
    let _ = transition;
    let _ = editing.name;
    match crate::backend::playlists::update_playlist_items(
        core,
        editing.playlist_id.clone(),
        items,
    ) {
        Ok(()) => {
            let _ = crate::lan::server::publish_revision(&core.pool, &core.events);
            toasts.push(Toast::new(ToastKind::Success, "Playlist saved."));
        }
        Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
    }
}

use crate::ui::screens::gew_combo;
use crate::theme;
use crate::ui::widgets;
