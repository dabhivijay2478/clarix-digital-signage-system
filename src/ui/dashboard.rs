use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::Toast;
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

pub struct DashboardPage {
    last_refresh: Instant,
    screens_total: usize,
    screens_online: usize,
    content_count: usize,
    playlist_count: usize,
    slot_count: usize,
    dispatch_today: u32,
    storage_used: u64,
    storage_total: u64,
    identity_role: String,
    device_name: String,
    controller_url: String,
    loaded_once: bool,
}

impl Default for DashboardPage {
    fn default() -> Self {
        Self {
            last_refresh: Instant::now() - Duration::from_secs(3600),
            screens_total: 0,
            screens_online: 0,
            content_count: 0,
            playlist_count: 0,
            slot_count: 0,
            dispatch_today: 0,
            storage_used: 0,
            storage_total: 0,
            identity_role: "Controller".to_string(),
            device_name: String::new(),
            controller_url: "via mDNS discovery".to_string(),
            loaded_once: false,
        }
    }
}

impl DashboardPage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_secs(3)) || !self.loaded_once {
            self.last_refresh = Instant::now();
            self.loaded_once = true;
            self.refresh(core, toasts);
        }

        theme::heading(ui, "Overview");
        let port = core.server_port.lock().map(|p| *p).unwrap_or(0);
        theme::muted(
            ui,
            &format!(
                "Device: {} · role: {} · LAN port {}",
                self.device_name, self.identity_role, port
            ),
        );
        ui.add_space(14.0);

        let cards: Vec<(&'static str, String, egui::Color32)> = vec![
            (
                "Screens online",
                format!("{}/{}", self.screens_online, self.screens_total),
                theme::tokens(ui).green,
            ),
            (
                "Content items",
                self.content_count.to_string(),
                theme::tokens(ui).primary,
            ),
            (
                "Playlists",
                self.playlist_count.to_string(),
                theme::tokens(ui).primary,
            ),
            (
                "Active schedule slots",
                self.slot_count.to_string(),
                theme::tokens(ui).amber,
            ),
            (
                "Trucks dispatched today",
                self.dispatch_today.to_string(),
                theme::tokens(ui).green,
            ),
            (
                "Storage used",
                format!(
                    "{} / {}",
                    theme::format_bytes(self.storage_used),
                    theme::format_bytes(self.storage_total)
                ),
                theme::tokens(ui).muted,
            ),
        ];

        widgets::stat_grid(ui, &cards, 3);
        ui.add_space(16.0);
        draw_controller_card(ui, core, self, port);

        ui.add_space(14.0);
        widgets::section_header(ui, "Getting started");
        theme::card(ui, |ui| {
            ui.set_min_width(ui.available_width());
            const STEPS: [&str; 4] = [
                "Add Screens, upload Content, and build a Playlist.",
                "Assign the playlist to a screen, or schedule it for a time slot.",
                "Use Player (sidebar) to preview a screen on this device.",
                "Pair remote players from their Settings page.",
            ];
            for (index, step) in STEPS.iter().enumerate() {
                ui.horizontal(|ui| {
                    let (chip, _) =
                        ui.allocate_exact_size(egui::vec2(22.0, 22.0), egui::Sense::hover());
                    ui.painter().circle_filled(
                        chip.center(),
                        11.0,
                        theme::with_alpha(theme::tokens(ui).primary, 0.18),
                    );
                    ui.painter().text(
                        chip.center(),
                        egui::Align2::CENTER_CENTER,
                        (index + 1).to_string(),
                        egui::FontId::proportional(11.0),
                        theme::tokens(ui).primary,
                    );
                    ui.label(
                        egui::RichText::new(*step)
                            .size(13.0)
                            .color(theme::tokens(ui).text),
                    );
                });
                if index + 1 < STEPS.len() {
                    ui.add_space(6.0);
                }
            }
        });
    }

    fn refresh(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let pool = &core.pool;
        if let Ok(screens) = crate::backend::screens::get_screens(pool) {
            self.screens_total = screens.len();
            self.screens_online = screens.iter().filter(|s| s.is_online).count();
        }
        if let Ok(items) = crate::backend::content::get_content_items(pool) {
            self.content_count = items.len();
        }
        if let Ok(playlists) = crate::backend::playlists::get_playlists(pool) {
            self.playlist_count = playlists.len();
        }
        if let Ok(slots) = crate::backend::schedule::get_schedule(pool) {
            self.slot_count = slots.iter().filter(|s| s.is_active).count();
        }
        if let Ok(summary) = crate::backend::trucks::get_truck_dispatch_summary(core) {
            self.dispatch_today = summary.today;
        }
        if let Ok(storage) = crate::backend::content::get_content_storage(core) {
            self.storage_used = storage.used_bytes;
            self.storage_total = storage.total_bytes;
        }
        if let Ok(identity) = crate::backend::network::get_device_identity(core) {
            self.identity_role = identity.role.as_str().to_string();
            self.device_name = identity.display_name.clone();
            self.controller_url = identity
                .controller_url
                .clone()
                .unwrap_or_else(|| "via mDNS discovery".to_string());
        }
        let _ = toasts;
    }
}

fn draw_controller_card(ui: &mut egui::Ui, _core: &Arc<AppCore>, page: &DashboardPage, port: u16) {
    theme::card(ui, |ui| {
        ui.horizontal_wrapped(|ui| {
            ui.label(egui::RichText::new("Device status").size(16.0).strong());
            if port > 0 {
                theme::badge(ui, "LAN server running", theme::tokens(ui).green);
            } else {
                theme::badge(ui, "LAN server inactive", theme::tokens(ui).muted);
            }
        });
        for (key, value) in [
            ("Device", page.device_name.clone()),
            ("Role", page.identity_role.clone()),
            ("Port", port.to_string()),
            ("Controller", page.controller_url.clone()),
        ] {
            ui.horizontal_wrapped(|ui| {
                theme::muted(ui, key);
                ui.add(egui::Label::new(value).wrap());
            });
        }
        ui.separator();
        theme::muted(ui,"Players discover controllers on the local network. Pair and assign devices from Settings.");
    });
}
