use egui::{Color32, Visuals};

pub const BG: Color32 = Color32::from_rgb(16, 18, 27);
pub const PANEL: Color32 = Color32::from_rgb(24, 27, 40);
pub const CARD: Color32 = Color32::from_rgb(30, 34, 51);
pub const CARD_HOVER: Color32 = Color32::from_rgb(38, 43, 63);
pub const STROKE: Color32 = Color32::from_rgb(60, 66, 92);
pub const TEXT: Color32 = Color32::from_rgb(226, 232, 240);
pub const MUTED: Color32 = Color32::from_rgb(148, 163, 184);
pub const PRIMARY: Color32 = Color32::from_rgb(56, 130, 246);
pub const GREEN: Color32 = Color32::from_rgb(46, 173, 108);
pub const RED: Color32 = Color32::from_rgb(220, 75, 75);
pub const AMBER: Color32 = Color32::from_rgb(230, 168, 55);
pub const INPUT_BG: Color32 = Color32::from_rgb(20, 23, 34);

pub fn with_alpha(color: Color32, alpha: f32) -> Color32 {
    Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), (alpha * 255.0).round() as u8)
}

pub fn apply(ctx: &egui::Context) {
    ctx.all_styles_mut(|style| {
        style.visuals = dark_visuals();
        style.spacing.item_spacing = egui::vec2(10.0, 8.0);
        style.spacing.button_padding = egui::vec2(10.0, 6.0);
    });
}

fn dark_visuals() -> Visuals {
    let mut v = Visuals::dark();
    v.panel_fill = PANEL;
    v.window_fill = CARD;
    v.extreme_bg_color = INPUT_BG;
    v.faint_bg_color = Color32::from_rgb(26, 30, 45);
    v.widgets.noninteractive.bg_fill = CARD;
    v.widgets.noninteractive.fg_stroke = egui::Stroke::new(1.0, TEXT);
    v.widgets.noninteractive.bg_stroke = egui::Stroke::new(1.0, STROKE);
    for widget in [
        &mut v.widgets.inactive,
        &mut v.widgets.hovered,
        &mut v.widgets.active,
        &mut v.widgets.open,
    ] {
        widget.bg_fill = CARD_HOVER;
        widget.fg_stroke = egui::Stroke::new(1.0, TEXT);
        widget.bg_stroke = egui::Stroke::new(1.0, STROKE);
    }
    v.widgets.hovered.bg_fill = Color32::from_rgb(42, 48, 70);
    v.widgets.active.bg_fill = PRIMARY;
    v.selection.bg_fill = Color32::from_rgba_unmultiplied(56, 130, 246, 90);
    v.selection.stroke = egui::Stroke::new(1.0, TEXT);
    v.hyperlink_color = PRIMARY;
    v.override_text_color = Some(TEXT);
    v
}

/// Rounded panel used behind cards/sections.
pub fn card(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
    egui::Frame::new()
        .fill(CARD)
        .stroke(egui::Stroke::new(1.0, STROKE))
        .inner_margin(egui::Margin::same(10))
        .corner_radius(6.0)
        .show(ui, |ui| add(ui));
}

pub fn heading(ui: &mut egui::Ui, text: &str) {
    ui.add_space(4.0);
    ui.label(egui::RichText::new(text).size(20.0).strong().color(TEXT));
    ui.add_space(2.0);
}

pub fn muted(ui: &mut egui::Ui, text: &str) {
    ui.label(egui::RichText::new(text).size(12.5).color(MUTED));
}

pub fn status_dot(ui: &mut egui::Ui, color: Color32, label: &str) {
    ui.horizontal(|ui| {
        let (rect, _) = ui.allocate_exact_size(egui::vec2(10.0, 10.0), egui::Sense::hover());
        ui.painter()
            .circle_filled(rect.center(), 5.0, color);
        ui.label(egui::RichText::new(label).color(MUTED).size(12.5));
    });
}

pub fn badge(ui: &mut egui::Ui, text: &str, color: Color32) {
    egui::Frame::new()
        .fill(with_alpha(color, 0.18))
        .stroke(egui::Stroke::new(1.0, color))
        .inner_margin(egui::Margin::symmetric(8, 3))
        .corner_radius(10.0)
        .show(ui, |ui| {
            ui.label(
                egui::RichText::new(text)
                    .size(11.5)
                    .strong()
                    .color(color),
            );
        });
}

pub fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let value = bytes as f64;
    if value >= GB {
        format!("{:.1} GB", value / GB)
    } else if value >= MB {
        format!("{:.1} MB", value / MB)
    } else if value >= KB {
        format!("{:.0} KB", value / KB)
    } else {
        format!("{bytes} B")
    }
}
