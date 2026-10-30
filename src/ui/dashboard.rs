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
        theme::muted(ui, &format!(
            "Device: {} · role: {} · LAN port {}",
            self.device_name, self.identity_role, port
        ));
        ui.add_space(14.0);

        let cards: Vec<(&'static str, String, egui::Color32)> = vec![
            (
                "Screens online",
                format!("{}/{}", self.screens_online, self.screens_total),
                theme::GREEN,
            ),
            ("Content items", self.content_count.to_string(), theme::PRIMARY),
            ("Playlists", self.playlist_count.to_string(), theme::PRIMARY),
            ("Active schedule slots", self.slot_count.to_string(), theme::AMBER),
            (
                "Trucks dispatched today",
                self.dispatch_today.to_string(),
                theme::GREEN,
            ),
            (
                "Storage used",
                format!(
                    "{} / {}",
                    theme::format_bytes(self.storage_used),
                    theme::format_bytes(self.storage_total)
                ),
                theme::MUTED,
            ),
        ];

        // Responsive split: at wide sizes the KPI grid runs 3 columns next to a
        // controller status card; otherwise the grid reflows full-width.
        let avail = ui.available_width();
        if avail >= 1120.0 {
            ui.horizontal(|ui| {
                ui.allocate_ui_with_layout(
                    egui::vec2(772.0, 190.0),
                    egui::Layout::top_down(egui::Align::Min),
                    |ui| draw_kpi_grid(ui, 772.0, 3, &cards),
                );
                draw_controller_card(ui, core, self, port);
            });
        } else {
            let cols = if avail >= 720.0 { 2 } else { 1 };
            draw_kpi_grid(ui, avail, cols, &cards);
        }

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
                    let (chip, _) = ui.allocate_exact_size(egui::vec2(22.0, 22.0), egui::Sense::hover());
                    ui.painter()
                        .circle_filled(chip.center(), 11.0, theme::with_alpha(theme::PRIMARY, 0.18));
                    ui.painter().text(
                        chip.center(),
                        egui::Align2::CENTER_CENTER,
                        (index + 1).to_string(),
                        egui::FontId::proportional(11.0),
                        theme::PRIMARY,
                    );
                    ui.label(egui::RichText::new(*step).size(13.0).color(theme::TEXT));
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

fn draw_kpi_grid(
    ui: &mut egui::Ui,
    width: f32,
    cols: usize,
    cards: &[(&'static str, String, egui::Color32)],
) {
    if cols <= 1 {
        let card_width = width.min(420.0);
        for (label, value, accent) in cards {
            widgets::stat_card(ui, card_width, label, value, *accent);
        }
        return;
    }

    // Item spacing (10px) provides the column/row gaps; cards are exact-width.
    let colw = ((width - 10.0 * (cols as f32 - 1.0)) / cols as f32).clamp(170.0, 250.0);
    for chunk in cards.chunks(cols) {
        ui.horizontal(|ui| {
            for (label, value, accent) in chunk.iter() {
                widgets::stat_card(ui, colw, label, value, *accent);
            }
        });
    }
}

fn draw_controller_card(
    ui: &mut egui::Ui,
    core: &Arc<AppCore>,
    page: &DashboardPage,
    port: u16,
) {
    // Exact hand-allocated card: fills the remaining horizontal width.
    let avail = ui.available_width().clamp(240.0, 720.0);
    let (rect, _) = ui.allocate_exact_size(egui::vec2(avail, 252.0), egui::Sense::hover());

    ui.painter().rect_filled(
        egui::Rect::from_min_size(rect.min + egui::vec2(0.0, 3.0), rect.size()),
        10.0,
        egui::Color32::from_black_alpha(34),
    );
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 10.0, theme::CARD);
    painter.rect_stroke(rect, 10.0, egui::Stroke::new(1.0, theme::STROKE), egui::StrokeKind::Inside);

    painter.text(
        egui::pos2(rect.left() + 16.0, rect.top() + 22.0),
        egui::Align2::LEFT_CENTER,
        "Controller status",
        egui::FontId::proportional(14.0),
        theme::TEXT,
    );

    painter.circle_filled(egui::pos2(rect.left() + 21.0, rect.top() + 46.0), 4.0, theme::GREEN);
    painter.text(
        egui::pos2(rect.left() + 30.0, rect.top() + 46.0),
        egui::Align2::LEFT_CENTER,
        "Online · listening for players",
        egui::FontId::proportional(11.5),
        theme::MUTED,
    );

    let rows = [
        ("Device", page.device_name.clone()),
        ("Role", page.identity_role.clone()),
        ("Port", port.to_string()),
        ("LAN URL", page.controller_url.clone()),
    ];
    let info = egui::Rect::from_min_max(
        egui::pos2(rect.left() + 16.0, rect.top() + 66.0),
        egui::pos2(rect.right() - 16.0, rect.bottom() - 58.0),
    );
    let mut info_child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(info)
            .layout(egui::Layout::top_down(egui::Align::Min)),
    );
    egui::Grid::new("controller-card-grid")
        .num_columns(2)
        .spacing([12.0, 5.0])
        .show(&mut info_child, |grid| {
            for (key, value) in rows {
                grid.label(egui::RichText::new(key).size(12.0).color(theme::MUTED));
                grid.label(egui::RichText::new(value).size(12.5).color(theme::TEXT));
                grid.end_row();
            }
        });

    // Separator + wrapped hint text.
    let painter = ui.painter_at(rect);
    painter.line_segment(
        [
            egui::pos2(rect.left() + 14.0, rect.bottom() - 50.0),
            egui::pos2(rect.right() - 14.0, rect.bottom() - 50.0),
        ],
        egui::Stroke::new(1.0, theme::STROKE),
    );
    let mut hint_child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(egui::Rect::from_min_max(
                egui::pos2(rect.left() + 16.0, rect.bottom() - 46.0),
                egui::pos2(rect.right() - 16.0, rect.bottom() - 8.0),
            ))
            .layout(egui::Layout::top_down(egui::Align::Min)),
    );
    hint_child.label(
        egui::RichText::new(
            "Players discover this controller over the LAN via mDNS; pair them from their Settings page.",
        )
        .size(11.5)
        .color(theme::MUTED),
    );
}
