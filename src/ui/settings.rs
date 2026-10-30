use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::models::{ConnectionDiagnostic, DeviceRole, PairingRequest, Screen};
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

pub struct SettingsPage {
    screens: Vec<Screen>,
    controller_url: String,
    pairing_requests: Vec<PairingRequest>,
    pairing_screen_choice: HashMap<String, String>,
    pending_pairing_code: Option<String>,
    diagnostics: Option<ConnectionDiagnostic>,
    storage: Option<crate::backend::content::ContentStorageInfo>,
    discovered: Vec<crate::lan::PeerScreen>,
    last_refresh: Instant,
    loaded_once: bool,
}

impl Default for SettingsPage {
    fn default() -> Self {
        Self {
            screens: Vec::new(),
            controller_url: String::new(),
            pairing_requests: Vec::new(),
            pairing_screen_choice: HashMap::new(),
            pending_pairing_code: None,
            diagnostics: None,
            storage: None,
            discovered: Vec::new(),
            last_refresh: Instant::now() - Duration::from_secs(3600),
            loaded_once: false,
        }
    }
}

/// Strip an optional `/player` suffix — users paste the player web URL from
/// previous app versions.
fn clean_controller_url(value: &str) -> String {
    let mut url = value.trim().to_string();
    loop {
        let lower = url.to_lowercase();
        if lower.ends_with("/player") {
            url.truncate(url.len() - 7);
        } else if lower.ends_with("/player/") {
            url.truncate(url.len() - 8);
        } else {
            break;
        }
        while url.ends_with('/') {
            url.pop();
        }
    }
    url
}

/// Paint the fixed background of a device-mode card (icon chip, title,
/// description, optional ACTIVE badge) and return its rect so the caller can
/// place interactive rows inside it. Hand-painted at an exact rect so two
/// cards share the panel width deterministically.
fn draw_device_mode_card(
    ui: &mut egui::Ui,
    width: f32,
    glyph: &str,
    title: &str,
    desc: &str,
    active: bool,
) -> egui::Rect {
    let height = 128.0;
    let (rect, _) = ui.allocate_exact_size(egui::vec2(width, height), egui::Sense::hover());

    ui.painter().rect_filled(
        egui::Rect::from_min_size(rect.min + egui::vec2(0.0, 3.0), rect.size()),
        10.0,
        egui::Color32::from_black_alpha(34),
    );
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 10.0, theme::CARD);
    painter.rect_stroke(rect, 10.0, egui::Stroke::new(1.0, theme::STROKE), egui::StrokeKind::Inside);

    let chip = egui::Rect::from_center_size(
        egui::pos2(rect.left() + 27.0, rect.top() + 27.0),
        egui::vec2(30.0, 30.0),
    );
    painter.rect_filled(chip, 8.0, theme::with_alpha(theme::PRIMARY, 0.14));
    painter.text(
        chip.center(),
        egui::Align2::CENTER_CENTER,
        glyph,
        egui::FontId::proportional(15.5),
        theme::TEXT,
    );

    let title_x = chip.right() + 10.0;
    painter.text(
        egui::pos2(title_x, chip.center().y - 7.0),
        egui::Align2::LEFT_CENTER,
        title,
        egui::FontId::proportional(14.5),
        theme::TEXT,
    );
    painter.text(
        egui::pos2(title_x, chip.center().y + 10.0),
        egui::Align2::LEFT_CENTER,
        desc,
        egui::FontId::proportional(11.0),
        theme::MUTED,
    );

    if active {
        let mut badge_child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(egui::Rect::from_min_max(
                    egui::pos2(rect.right() - 92.0, rect.top() + 12.0),
                    egui::pos2(rect.right() - 10.0, rect.top() + 42.0),
                ))
                .layout(egui::Layout::right_to_left(egui::Align::Center)),
        );
        theme::badge(&mut badge_child, "ACTIVE", theme::GREEN);
    }
    rect
}

impl SettingsPage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_secs(5)) || !self.loaded_once {
            self.last_refresh = Instant::now();
            self.loaded_once = true;
            self.refresh(core);
        }

        theme::heading(ui, "Settings");
        theme::muted(ui, "Device mode, crowd of players pairing, storage, and network diagnostics.");
        ui.add_space(10.0);

        let role = crate::backend::network::get_device_identity(core)
            .map(|identity| identity.role)
            .unwrap_or(DeviceRole::Controller);

        // ── Device mode ─────────────────────────────────────────────────────
        widgets::section_header(ui, "Device operation mode");
        let avail = ui.available_width();
        let card_w = (avail / 2.0 - 9.0).clamp(300.0, 640.0);
        ui.horizontal(|ui| {
            // Controller card (background painted; actionable rows below).
            let c1 = draw_device_mode_card(
                ui,
                card_w,
                "🛡",
                "Controller",
                "Hosts the database, media assets,\nschedule and pairing service.",
                role == DeviceRole::Controller,
            );
            ui.add_space(6.0);
            // Player card.
            let c2 = draw_device_mode_card(
                ui,
                card_w,
                "📺",
                "Player",
                "Connects to a controller and plays\nsynced playlists offline.",
                role == DeviceRole::Player,
            );

            // Controller card: switch button when inactive.
            if role != DeviceRole::Controller {
                let mut btn = ui.new_child(
                    egui::UiBuilder::new()
                        .max_rect(egui::Rect::from_min_max(
                            egui::pos2(c1.left() + 12.0, c1.bottom() - 38.0),
                            egui::pos2(c1.right() - 12.0, c1.bottom() - 12.0),
                        ))
                        .layout(egui::Layout::top_down(egui::Align::Min)),
                );
                if btn
                    .add_sized(
                        [btn.available_width(), 26.0],
                        egui::Button::new("Use as Controller"),
                    )
                    .clicked()
                {
                    match crate::backend::network::set_device_mode(core, "Controller".to_string(), None) {
                        Ok(_) => toasts.push(Toast::new(ToastKind::Success, "Device is now a controller. The LAN server and discovery restart automatically.")),
                        Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Mode change failed: {error}"))),
                    }
                    self.last_refresh = Instant::now() - Duration::from_secs(3600);
                }
            }

            // Player card: controller URL field + save button.
            let mut field = ui.new_child(
                egui::UiBuilder::new()
                    .max_rect(egui::Rect::from_min_max(
                        egui::pos2(c2.left() + 12.0, c2.top() + 62.0),
                        egui::pos2(c2.right() - 12.0, c2.top() + 90.0),
                    ))
                    .layout(egui::Layout::left_to_right(egui::Align::Center)),
            );
            field.label(egui::RichText::new("Controller").size(12.0).color(theme::MUTED));
            field.add_space(8.0);
            field.add_sized(
                [field.available_width(), 26.0],
                egui::TextEdit::singleline(&mut self.controller_url)
                    .hint_text("http://controller-ip:7420"),
            );
            let mut btn = ui.new_child(
                egui::UiBuilder::new()
                    .max_rect(egui::Rect::from_min_max(
                        egui::pos2(c2.left() + 12.0, c2.bottom() - 38.0),
                        egui::pos2(c2.right() - 12.0, c2.bottom() - 12.0),
                    ))
                    .layout(egui::Layout::top_down(egui::Align::Min)),
            );
            if btn
                .add_sized(
                    [btn.available_width(), 26.0],
                    egui::Button::new(
                        if role == DeviceRole::Player { "Re-save Player mode" } else { "Use as Player" },
                    ),
                )
                .clicked()
            {
                let cleaned = clean_controller_url(&self.controller_url.clone());
                match crate::backend::network::set_device_mode(core, "Player".to_string(), Some(cleaned)) {
                    Ok(_) => toasts.push(Toast::new(ToastKind::Success, "Device mode saved as Player.")),
                    Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Mode change failed: {error}"))),
                }
                self.last_refresh = Instant::now() - Duration::from_secs(3600);
            }
        });
        ui.add_space(8.0);

        // ── Pairing (device role dependent) ─────────────────────────────────
        if role == DeviceRole::Player {
            widgets::section_header(ui, "Device pairing");
            theme::card(ui, |ui| {
                ui.label(egui::RichText::new("Send a pairing request to the controller, then approve it there to assign this player to a screen.").size(13.0).color(theme::TEXT));
                ui.add_space(4.0);
                ui.horizontal(|ui| {
                    if ui.button("🔐 Request pairing").clicked() {
                        match core.block_on(crate::backend::network::request_player_pairing(core)) {
                            Ok(request) => {
                                self.pending_pairing_code = Some(request.code.clone());
                                toasts.push(Toast::new(ToastKind::Success, format!("Pairing request {} sent to the controller.", request.code)));
                                self.last_refresh = Instant::now() - Duration::from_secs(3600);
                            }
                            Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Pairing failed: {error}"))),
                        }
                    }
                    if let Some(code) = &self.pending_pairing_code {
                        theme::badge(ui, &format!("Pairing code: {code}"), theme::PRIMARY);
                    }
                });
                let discovered = self.discovered.clone();
                if !discovered.is_empty() {
                    ui.add_space(4.0);
                    theme::muted(ui, "Discovered controllers on this network:");
                    ui.horizontal_wrapped(|ui| {
                        for peer in discovered {
                            let url = format!("http://{}:{}", peer.ip, peer.port);
                            if ui.button(format!("📡 {} · {}:{}", peer.name, peer.ip, peer.port)).clicked() {
                                self.controller_url = url.clone();
                                toasts.push(Toast::new(ToastKind::Info, format!("Selected {}. Click \"Use as Player\" to save.", peer.name)));
                            }
                        }
                    });
                }
            });
            ui.add_space(8.0);
        } else {
            let pending: Vec<&PairingRequest> =
                self.pairing_requests.iter().filter(|r| r.status == "pending").collect();
            widgets::section_header(ui, &format!("Pending player pairings ({})", pending.len()));
            for request in pending {
                theme::card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&request.device_name).size(14.0).strong().color(theme::TEXT));
                            theme::muted(ui, &format!("{} · {} · {}", request.code, request.player_kind, request.device_id));
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let current = self.pairing_screen_choice.get(&request.id).cloned().unwrap_or_default();
                            let selected_name = self
                                .screens
                                .iter()
                                .find(|s| s.id == current)
                                .map(|s| s.name.clone())
                                .unwrap_or_else(|| "Assign to screen…".to_string());
                            egui::ComboBox::from_id_salt(format!("pairing-{}", request.id))
                                .width(190.0)
                                .selected_text(&selected_name)
                                .show_ui(ui, |ui| {
                                    for screen in &self.screens {
                                        let mut choice = self
                                            .pairing_screen_choice
                                            .get(&request.id)
                                            .cloned()
                                            .unwrap_or_default();
                                        if ui.selectable_value(&mut choice, screen.id.clone(), &screen.name).changed() {
                                            self.pairing_screen_choice.insert(request.id.clone(), choice);
                                        }
                                    }
                                });
                            if ui.button("✓ Approve").clicked() {
                                match self.pairing_screen_choice.get(&request.id) {
                                    Some(screen_id) => {
                                        match crate::backend::network::approve_pairing_request(
                                            core,
                                            request.id.clone(),
                                            screen_id.clone(),
                                        ) {
                                            Ok(()) => {
                                                toasts.push(Toast::new(ToastKind::Success, format!("{} is now paired.", request.device_name)));
                                                self.last_refresh = Instant::now() - Duration::from_secs(3600);
                                            }
                                            Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Approval failed: {error}"))),
                                        }
                                    }
                                    None => toasts.push(Toast::new(ToastKind::Error, "Choose the screen this player should control.")),
                                }
                            }
                        });
                    });
                });
                ui.add_space(4.0);
            }
            ui.add_space(6.0);
        }

        // ── Content library ─────────────────────────────────────────────────
        widgets::section_header(ui, "Content library");
        theme::card(ui, |ui| {
            let path = self.storage.as_ref().map(|s| s.path.clone()).unwrap_or_default();
            theme::muted(ui, &format!("📁 {}", path));
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                if let Some(storage) = &self.storage {
                    theme::muted(ui, &format!(
                        "Used {} · free {} · total {}",
                        theme::format_bytes(storage.used_bytes),
                        theme::format_bytes(storage.free_bytes),
                        theme::format_bytes(storage.total_bytes)
                    ));
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("Browse…").clicked() {
                        if let Some(dir) = rfd::FileDialog::new().pick_folder() {
                            let dir = dir.to_string_lossy().to_string();
                            match crate::backend::content::set_content_directory(core, dir) {
                                Ok(storage) => {
                                    self.storage = Some(storage);
                                    toasts.push(Toast::new(ToastKind::Success, "Content library directory updated"));
                                }
                                Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Failed to set directory: {error}"))),
                            }
                        }
                    }
                });
            });
            if let Some(storage) = &self.storage {
                let fraction = if storage.total_bytes > 0 {
                    (storage.used_bytes as f32 / storage.total_bytes as f32).clamp(0.0, 1.0)
                } else {
                    0.0
                };
                let bar = egui::ProgressBar::new(fraction).desired_width(ui.available_width());
                ui.add(bar);
            }
        });
        ui.add_space(8.0);

        // ── Network diagnostics ─────────────────────────────────────────────
        widgets::section_header(ui, "Network diagnostics");
        theme::card(ui, |ui| {
            ui.horizontal(|ui| {
                if ui.button("Run checks").clicked() {
                    match core.block_on(crate::backend::network::get_network_diagnostics(core)) {
                        Ok(diag) => self.diagnostics = Some(diag),
                        Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Diagnostics failed: {error}"))),
                    }
                }
                if let Some(diag) = &self.diagnostics {
                    theme::muted(ui, &format!("Role {} · local IP {:?} · port {:?}", diag.role.as_str(), diag.local_ip, diag.service_port));
                    if let Some(sync) = &diag.last_successful_sync {
                        theme::muted(ui, &format!("Last successful sync: {sync}"));
                    }
                }
            });
            ui.add_space(4.0);
            if let Some(diag) = &self.diagnostics {
                for check in &diag.checks {
                    let color = match check.status.as_str() {
                        "pass" => theme::GREEN,
                        "warning" => theme::AMBER,
                        _ => theme::RED,
                    };
                    ui.horizontal(|ui| {
                        theme::status_dot(ui, color, &format!("{} — {}", check.name, check.status));
                    });
                    theme::muted(ui, &check.detail);
                }
                for hint in &diag.hints {
                    ui.label(egui::RichText::new(format!("⚠ {hint}")).size(12.5).color(theme::AMBER));
                }
                theme::muted(ui, &format!("Discovery: {} · Pairing: {}", diag.discovery_status, diag.pairing_status));
            } else {
                theme::muted(ui, "Run checks to see discovery, TCP and controller-health results.");
            }
        });
        ui.add_space(8.0);

        // ── About ───────────────────────────────────────────────────────────
        widgets::section_header(ui, "About");
        theme::card(ui, |ui| {
            let identity = crate::backend::network::get_device_identity(core);
            ui.label(egui::RichText::new("Clarix").size(14.0).strong().color(theme::TEXT));
            theme::muted(ui, &format!("Version {} (egui native)", env!("CARGO_PKG_VERSION")));
            theme::muted(ui, &format!("Device ID: {}", identity.as_ref().map(|i| i.device_id.clone()).unwrap_or_default()));
            theme::muted(ui, &format!("Data dir: {}", core.config_dir.display()));
            theme::muted(ui, "Migrated from Tauri: LAN pairing, sync, scheduling and truck alerts unchanged.");
        });
    }

    fn refresh(&mut self, core: &Arc<AppCore>) {
        if let Ok(screens) = crate::backend::screens::get_screens(&core.pool) {
            self.screens = screens;
        }
        if let Ok(storage) = crate::backend::content::get_content_storage(core) {
            self.storage = Some(storage);
        }
        if let Ok(identity) = crate::backend::network::get_device_identity(core) {
            if self.controller_url.is_empty() {
                self.controller_url = identity
                    .controller_url
                    .clone()
                    .unwrap_or_default();
            }
            if identity.role == DeviceRole::Controller {
                if let Ok(requests) = crate::backend::network::get_pairing_requests(core) {
                    self.pairing_requests = requests;
                }
            }
            self.discovered = crate::backend::lan::get_network_peers(core)
                .into_iter()
                .filter(|peer| peer.is_controller)
                .collect();
        }
    }
}
