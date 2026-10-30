use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::models::MarqueeSettings;
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

pub struct MarqueePage {
    loaded_once: bool,
    settings: Option<MarqueeSettings>,
    enabled: bool,
    text: String,
    speed: u32,
    last_refresh: Instant,
}

impl Default for MarqueePage {
    fn default() -> Self {
        Self {
            loaded_once: false,
            settings: None,
            enabled: false,
            text: String::new(),
            speed: 40,
            last_refresh: Instant::now() - Duration::from_secs(3600),
        }
    }
}

impl MarqueePage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let _ = &self.last_refresh;
        if !self.loaded_once {
            self.loaded_once = true;
            if let Ok(settings) = crate::backend::app_config::get_marquee_settings(core) {
                self.enabled = settings.enabled;
                self.text = settings.text.clone();
                self.speed = settings.speed;
                self.settings = Some(settings);
            }
        }

        theme::heading(ui, "Marquee");
        theme::muted(
            ui,
            "Scrolling text overlay rendered on top of playlist content on every screen.",
        );
        ui.add_space(10.0);

        theme::card(ui, |ui| {
            ui.label(
                egui::RichText::new("Marquee text")
                    .size(13.0)
                    .color(theme::tokens(ui).muted),
            );
            ui.add(
                egui::TextEdit::multiline(&mut self.text)
                    .hint_text("e.g. 断货信息 / offers / safety reminders — keep it short")
                    .desired_rows(3)
                    .desired_width(f32::INFINITY),
            );
            ui.add_space(8.0);
            ui.horizontal_wrapped(|ui| {
                ui.checkbox(&mut self.enabled, "Enabled on screens");
            });
            ui.add_space(4.0);
            ui.horizontal_wrapped(|ui| {
                ui.label(
                    egui::RichText::new("Scroll speed")
                        .size(13.0)
                        .color(theme::tokens(ui).muted),
                );
                ui.label(
                    egui::RichText::new(format!("{} px/s", self.speed))
                        .size(13.0)
                        .strong()
                        .color(theme::tokens(ui).text),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    theme::muted(ui, "(15 = slow · 120 = fast)");
                });
            });
            ui.add(egui::Slider::new(&mut self.speed, 15..=120));
            ui.add_space(2.0);
            ui.add_space(4.0);
            ui.horizontal_wrapped(|ui| {
                if ui.button("Save Settings").clicked() {
                    let text = self.text.trim().to_string();
                    match crate::backend::app_config::update_marquee_settings(
                        core, self.enabled, text, self.speed,
                    ) {
                        Ok(updated) => {
                            self.settings = Some(updated.clone());
                            self.enabled = updated.enabled;
                            self.speed = updated.speed;
                            toasts.push(Toast::new(ToastKind::Success, "Marquee settings updated. A sync revision was published to all screens."));
                        }
                        Err(error) => {
                            toasts.push(Toast::new(ToastKind::Error, format!("Save failed: {error}")));
                        }
                    }
                }
                if let Some(settings) = &self.settings {
                    let updated = settings.updated_at.with_timezone(&chrono::Local);
                    let label = if settings.enabled {
                        format!("On · {} px/s · {}", settings.speed, updated.format("%d %b %H:%M"))
                    } else {
                        "Off".to_string()
                    };
                    theme::badge(
                        ui,
                        &label,
                        if settings.enabled { theme::tokens(ui).green } else { theme::tokens(ui).muted },
                    );
                }
            });
        });

        ui.add_space(12.0);
        widgets::section_header(ui, "Preview");
        self.draw_preview(ui);
    }

    /// Simulated scrolling strip — the native player uploads the same
    /// settings and animates identically (right-to-left, clamped ≥ 15 px/s).
    fn draw_preview(&self, ui: &mut egui::Ui) {
        let height = 40.0;
        let width = ui.available_width();
        let (rect, _) = ui.allocate_exact_size(egui::vec2(width, height), egui::Sense::hover());
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, 6.0, super::signage::SignageStyle::BG);
        painter.rect_stroke(
            rect,
            6.0,
            egui::Stroke::new(1.0, super::signage::SignageStyle::BORDER),
            egui::StrokeKind::Outside,
        );

        if !self.enabled {
            painter.text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                "Marquee disabled",
                egui::FontId::proportional(12.5),
                super::signage::SignageStyle::MUTED,
            );
            return;
        }

        let text = if self.text.trim().is_empty() {
            "(empty marquee text)".to_string()
        } else {
            self.text.trim().to_string()
        };
        let galley = painter.layout_no_wrap(
            text.clone(),
            egui::FontId::proportional(16.0),
            super::signage::SignageStyle::AMBER,
        );
        let text_width = galley.size().x;
        let total = width + text_width + 40.0;
        let elapsed = (ui.ctx().time() * self.speed.max(15) as f64) as f32;
        let x = rect.left() + rect.width() + text_width - (elapsed % total);
        if x < rect.right() {
            ui.ctx().request_repaint_after(Duration::from_millis(33));
            painter.galley(
                egui::pos2(x, rect.center().y - galley.size().y / 2.0),
                galley,
                super::signage::SignageStyle::AMBER,
            );
        }
    }
}
