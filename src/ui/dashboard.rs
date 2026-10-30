use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::state::AppCore;
use crate::app::Toast;

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
        theme::muted(ui, &format!(
            "Device: {} · role: {} · LAN port {}",
            self.device_name,
            self.identity_role,
            core.server_port.lock().map(|p| *p).unwrap_or(0)
        ));
        ui.add_space(10.0);

        let card_w = ((ui.available_width() - 30.0) / 4.0).min(210.0);
        ui.horizontal(|ui| {
            crate::ui::widgets::stat_card(ui, card_w, "Screens online", &format!("{}/{}", self.screens_online, self.screens_total), theme::GREEN);
            ui.add_space(10.0);
            crate::ui::widgets::stat_card(ui, card_w, "Content items", &self.content_count.to_string(), theme::PRIMARY);
            ui.add_space(10.0);
            crate::ui::widgets::stat_card(ui, card_w, "Playlists", &self.playlist_count.to_string(), theme::PRIMARY);
            ui.add_space(10.0);
            crate::ui::widgets::stat_card(ui, card_w, "Active schedule slots", &self.slot_count.to_string(), theme::AMBER);
        });
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            crate::ui::widgets::stat_card(ui, card_w, "Trucks dispatched today", &self.dispatch_today.to_string(), theme::GREEN);
            ui.add_space(10.0);
            crate::ui::widgets::stat_card(
                ui,
                card_w,
                "Storage used",
                &format!(
                    "{} / {}",
                    theme::format_bytes(self.storage_used),
                    theme::format_bytes(self.storage_total)
                ),
                theme::MUTED,
            );
        });

        ui.add_space(16.0);
        widgets::section_header(ui, "Getting started");
        theme::card(ui, |ui| {
            ui.label(
                egui::RichText::new(
                    "1. Add Screens, upload Content, and build a Playlist.\n2. Assign the playlist to a screen, or schedule it for a time slot.\n3. Use Player (sidebar) to preview a screen on this device.\n4. Pair remote players from their Settings page.",
                )
                .size(13.0)
                .color(theme::TEXT),
            );
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
            self.device_name = identity.display_name;
        }
        let _ = toasts;
    }
}

use crate::theme;
use crate::ui::widgets;
