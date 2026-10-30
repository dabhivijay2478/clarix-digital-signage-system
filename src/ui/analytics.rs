use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::Toast;
use crate::models::{AnalyticsSummary, Screen};
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

fn event_colors(ui: &egui::Ui) -> [(&'static str, egui::Color32); 4] {
    [
        ("Impression", theme::tokens(ui).amber),
        ("Play", theme::tokens(ui).primary),
        ("Complete", theme::tokens(ui).green),
        ("Skip", theme::tokens(ui).red),
    ]
}

const DAY_OPTIONS: [(u32, &str); 4] = [
    (1, "Last 24 h"),
    (7, "Last 7 days"),
    (14, "Last 14 days"),
    (30, "Last 30 days"),
];

pub struct AnalyticsPage {
    screens: Vec<Screen>,
    filter_screen: Option<String>,
    days: u32,
    summary: Option<AnalyticsSummary>,
    timeline: Vec<crate::backend::analytics::TimelinePoint>,
    last_refresh: Instant,
    loaded_once: bool,
}

impl Default for AnalyticsPage {
    fn default() -> Self {
        Self {
            screens: Vec::new(),
            filter_screen: None,
            days: 7,
            summary: None,
            timeline: Vec::new(),
            last_refresh: Instant::now() - Duration::from_secs(3600),
            loaded_once: false,
        }
    }
}

impl AnalyticsPage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, _toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_secs(8)) || !self.loaded_once {
            self.last_refresh = Instant::now();
            self.loaded_once = true;
            self.refresh(core);
        }

        theme::heading(ui, "Analytics");
        theme::muted(
            ui,
            "Play / impression / completion events recorded by native and synced players.",
        );
        ui.add_space(10.0);

        // ── Filters ────────────────────────────────────────────────────────
        theme::card(ui, |ui| {
            ui.horizontal_wrapped(|ui| {
                ui.label(
                    egui::RichText::new("Screen")
                        .size(13.0)
                        .color(theme::tokens(ui).muted),
                );
                let names: Vec<(String, Option<String>)> =
                    std::iter::once(("All screens".to_string(), None))
                        .chain(
                            self.screens
                                .iter()
                                .map(|screen| (screen.name.clone(), Some(screen.id.clone()))),
                        )
                        .collect();
                let selected_label = names
                    .iter()
                    .find(|(_, id)| id.as_deref() == self.filter_screen.as_deref())
                    .map(|(label, _)| label.clone())
                    .unwrap_or_else(|| "All screens".to_string());
                egui::ComboBox::from_id_salt("analytics-screen-filter")
                    .width(180.0)
                    .selected_text(&selected_label)
                    .show_ui(ui, |ui| {
                        for (label, id) in &names {
                            ui.selectable_value(&mut self.filter_screen, id.clone(), label.clone());
                        }
                    });

                ui.label(
                    egui::RichText::new("Range")
                        .size(13.0)
                        .color(theme::tokens(ui).muted),
                );
                egui::ComboBox::from_id_salt("analytics-days-filter")
                    .width(140.0)
                    .selected_text(
                        DAY_OPTIONS
                            .iter()
                            .find(|(days, _)| *days == self.days)
                            .map(|(_, label)| *label)
                            .unwrap_or("Last 7 days"),
                    )
                    .show_ui(ui, |ui| {
                        for (days, label) in DAY_OPTIONS {
                            ui.selectable_value(&mut self.days, days, label);
                        }
                    });

                if ui.button("Refresh").clicked() {
                    self.last_refresh = Instant::now() - Duration::from_secs(3600);
                }
            });
        });

        ui.add_space(8.0);
        let summary = self.summary.clone().unwrap_or(AnalyticsSummary {
            impressions: 0,
            plays: 0,
            completions: 0,
            skips: 0,
            avg_dwell_secs: 0.0,
            uptime_pct: 0.0,
        });
        widgets::stat_grid(
            ui,
            &[
                (
                    "Impressions",
                    summary.impressions.to_string(),
                    theme::tokens(ui).amber,
                ),
                (
                    "Plays",
                    summary.plays.to_string(),
                    theme::tokens(ui).primary,
                ),
                (
                    "Completions",
                    summary.completions.to_string(),
                    theme::tokens(ui).green,
                ),
                ("Skips", summary.skips.to_string(), theme::tokens(ui).red),
                (
                    "Avg dwell",
                    format!("{:.0} s", summary.avg_dwell_secs),
                    theme::tokens(ui).primary,
                ),
                (
                    "Uptime (video feed artificial)",
                    format!("{:.1} %", summary.uptime_pct),
                    theme::tokens(ui).muted,
                ),
            ],
            3,
        );
        ui.add_space(12.0);
        widgets::section_header(ui, "Activity timeline");
        self.draw_timeline(ui);
    }

    fn draw_timeline(&mut self, ui: &mut egui::Ui) {
        // Aggregate: date -> event type -> count.
        let mut dates: Vec<String> = self
            .timeline
            .iter()
            .map(|point| point.date.clone())
            .collect();
        dates.sort();
        dates.dedup();

        if dates.is_empty() {
            widgets::empty_state(ui, "No recorded events in the selected range.");
            return;
        }

        // Legend
        ui.horizontal_wrapped(|ui| {
            for (label, color) in event_colors(ui) {
                theme::status_dot(ui, color, label);
                ui.add_space(10.0);
            }
        });
        ui.add_space(4.0);

        let max_count = self
            .timeline
            .iter()
            .map(|point| point.count)
            .max()
            .unwrap_or(1)
            .max(1);
        let chart_height = 190.0;

        theme::card(ui, |ui| {
            let wanted = egui::vec2(ui.available_width(), chart_height + 26.0);
            let (rect, response) = ui.allocate_exact_size(wanted, egui::Sense::hover());
            let painter = ui.painter();

            // Horizontal grid lines.
            for fraction in [0.25, 0.5, 0.75, 1.0] {
                let y = rect.bottom() - 20.0 - (chart_height - 16.0) * fraction;
                painter.line_segment(
                    [
                        egui::pos2(rect.left() + 34.0, y),
                        egui::pos2(rect.right(), y),
                    ],
                    egui::Stroke::new(1.0, theme::tokens(ui).stroke.gamma_multiply(0.4)),
                );
                painter.text(
                    egui::pos2(rect.left() + 4.0, y),
                    egui::Align2::LEFT_CENTER,
                    &format!("{}", (max_count as f32 * fraction).round() as i64),
                    egui::FontId::monospace(10.0),
                    theme::tokens(ui).muted,
                );
            }
            // Baseline.
            let base_y = rect.bottom() - 20.0;
            painter.line_segment(
                [
                    egui::pos2(rect.left() + 34.0, base_y),
                    egui::pos2(rect.right(), base_y),
                ],
                egui::Stroke::new(1.0, theme::tokens(ui).stroke),
            );

            let band_width = (rect.width() - 40.0) / dates.len() as f32;
            let group_width = band_width * 0.82;
            let bar_width = (group_width / event_colors(ui).len() as f32).max(2.0);

            let mut hovered_label: Option<String> = None;

            for (date_index, date) in dates.iter().enumerate() {
                let band_left = rect.left() + 34.0 + date_index as f32 * band_width;
                let group_left = band_left + (band_width - group_width) / 2.0;

                for (event_index, (event_label, color)) in event_colors(ui).iter().enumerate() {
                    let count = self
                        .timeline
                        .iter()
                        .find(|point| point.date == *date && point.event_type == *event_label)
                        .map(|point| point.count)
                        .unwrap_or(0);
                    if count <= 0 {
                        continue;
                    }
                    let bar_height =
                        ((chart_height - 16.0) * (count as f32 / max_count as f32)).max(2.0);
                    let x = group_left + event_index as f32 * bar_width;
                    let bar_rect = egui::Rect::from_min_size(
                        egui::pos2(x, base_y - bar_height),
                        egui::vec2(bar_width - 1.5, bar_height),
                    );
                    painter.rect_filled(bar_rect, 2.0, *color);
                    if response.hovered() && response.rect.contains(bar_rect.center()) {
                        hovered_label = Some(format!("{date}\n{event_label}: {count}"));
                    }
                }

                // X axis label (MM-DD).
                let short = date.split('-').skip(1).collect::<Vec<_>>().join("/");
                painter.text(
                    egui::pos2(band_left + band_width / 2.0, rect.bottom() - 12.0),
                    egui::Align2::CENTER_CENTER,
                    &short,
                    egui::FontId::proportional(10.0),
                    theme::tokens(ui).muted,
                );
            }

            if let Some(label) = hovered_label {
                ui.ctx().request_repaint();
                response.on_hover_text(label);
            }
        });
    }

    fn refresh(&mut self, core: &Arc<AppCore>) {
        if let Ok(screens) = crate::backend::screens::get_screens(&core.pool) {
            self.screens = screens;
        }
        match crate::backend::analytics::get_analytics_summary(core, self.filter_screen.clone()) {
            Ok(summary) => self.summary = Some(summary),
            Err(_) => self.summary = None,
        }
        match crate::backend::analytics::get_analytics_timeline(
            core,
            self.filter_screen.clone(),
            self.days,
        ) {
            Ok(points) => self.timeline = points,
            Err(_) => self.timeline = Vec::new(),
        }
    }
}
