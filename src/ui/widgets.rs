//! Shared small UI helpers: labeled fields, section headers, confirm dialogs,
//! media controls used across pages.

pub use crate::theme;

/// Section heading with spacing.
pub fn section_header(ui: &mut egui::Ui, text: &str) {
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        let (bar, _) = ui.allocate_exact_size(egui::vec2(4.0, 18.0), egui::Sense::hover());
        ui.painter()
            .rect_filled(bar, 2.0, theme::tokens(ui).primary);
        ui.label(
            egui::RichText::new(text)
                .size(15.0)
                .strong()
                .color(theme::tokens(ui).text),
        );
    });
    ui.add_space(2.0);
}

/// Stacked field labels keep forms readable in narrow dialogs.
pub fn labeled_text(
    ui: &mut egui::Ui,
    label: &str,
    text: &mut String,
    hint: &str,
) -> egui::Response {
    ui.vertical(|ui| {
        ui.label(
            egui::RichText::new(label)
                .size(12.0)
                .color(theme::tokens(ui).muted),
        );
        ui.add_sized(
            [ui.available_width().min(440.0), 34.0],
            egui::TextEdit::singleline(text).hint_text(hint),
        )
    })
    .inner
}

pub fn labeled_password(ui: &mut egui::Ui, label: &str, text: &mut String) -> egui::Response {
    ui.vertical(|ui| {
        ui.label(
            egui::RichText::new(label)
                .size(12.0)
                .color(theme::tokens(ui).muted),
        );
        ui.add_sized(
            [ui.available_width().min(440.0), 34.0],
            egui::TextEdit::singleline(text).password(true),
        )
    })
    .inner
}

pub fn labeled_select<T: Copy + PartialEq>(
    ui: &mut egui::Ui,
    label: &str,
    options: &[(&str, T, String)],
    selected: &mut T,
) -> egui::Response {
    let id_salt = format!("labeled-select-{label}");
    let response = ui
        .horizontal(|ui| {
            ui.label(
                egui::RichText::new(label)
                    .size(13.0)
                    .color(theme::tokens(ui).muted),
            );
            egui::ComboBox::from_id_salt(id_salt)
                .width(220.0)
                .selected_text(
                    options
                        .iter()
                        .find(|(_, value, _)| *value == *selected)
                        .map(|(text, _, _)| *text)
                        .unwrap_or(""),
                )
                .show_ui(ui, |ui| {
                    for (text, value, _) in options {
                        ui.selectable_value(selected, *value, *text);
                    }
                })
                .response
        })
        .inner;

    // Keep any configured display for reference lookups out of the label set:
    options.iter().for_each(|(_, _, _)| {});
    response
}

pub fn toggle(ui: &mut egui::Ui, label: &str, value: &mut bool) -> egui::Response {
    ui.checkbox(&mut *value, label)
}

pub fn slider_u32(ui: &mut egui::Ui, label: &str, value: &mut u32, range: std::ops::Range<u32>) {
    ui.horizontal(|ui| {
        ui.label(
            egui::RichText::new(label)
                .size(13.0)
                .color(theme::tokens(ui).muted),
        );
        let mut proxy = *value as i32;
        ui.add(egui::Slider::new(
            &mut proxy,
            range.start as i32..=range.end as i32,
        ));
        if proxy != *value as i32 {
            *value = proxy as u32;
        }
    });
}

pub fn empty_state(ui: &mut egui::Ui, text: &str) {
    // Bias toward the upper-middle of the remaining space so pages don't end
    // with a huge empty band under the message.
    let avail_h = ui.available_height();
    let block = 78.0;
    if avail_h > block + 40.0 {
        ui.add_space(((avail_h - block) * 0.33).min(120.0));
    }
    ui.vertical_centered(|ui| {
        ui.label(
            egui::RichText::new("· · ·")
                .size(22.0)
                .color(theme::with_alpha(theme::tokens(ui).muted, 0.55)),
        );
        ui.add_space(8.0);
        ui.label(
            egui::RichText::new(text)
                .size(14.5)
                .color(theme::tokens(ui).muted),
        );
    });
}

/// Clip and wrap painter text to a real allocated rectangle.
pub fn paint_text(
    painter: &egui::Painter,
    rect: egui::Rect,
    text: &str,
    size: f32,
    color: egui::Color32,
) {
    let galley = painter.layout(
        text.to_string(),
        egui::FontId::proportional(size),
        color,
        rect.width().max(1.0),
    );
    painter
        .with_clip_rect(rect.intersect(painter.clip_rect()))
        .galley(rect.min, galley, color);
}

pub fn stat_card(ui: &mut egui::Ui, width: f32, label: &str, value: &str, accent: egui::Color32) {
    use super::icons::{self, Icon};
    let t = theme::tokens(ui);
    let (r, response) = ui.allocate_exact_size(egui::vec2(width, 112.0), egui::Sense::hover());
    let p = ui.painter_at(r);
    p.rect_filled(r, theme::PlatformStyle::current().radius + 2, t.card);
    p.rect_stroke(
        r,
        theme::PlatformStyle::current().radius + 2,
        egui::Stroke::new(1.0, t.stroke),
        egui::StrokeKind::Inside,
    );
    let chip = egui::Rect::from_min_size(r.min + egui::vec2(14.0, 14.0), egui::vec2(28.0, 28.0));
    p.rect_filled(chip, 6.0, theme::with_alpha(accent, 0.12));
    let lower = label.to_lowercase();
    let icon = if lower.contains("screen") {
        Icon::Screen
    } else if lower.contains("truck") || lower.contains("dispatch") {
        Icon::Truck
    } else if lower.contains("content") || lower.contains("storage") {
        Icon::Content
    } else if lower.contains("play") {
        Icon::Play
    } else if lower.contains("slot") {
        Icon::Calendar
    } else {
        Icon::Chart
    };
    icons::paint(&p, chip.shrink(5.0), icon, accent);
    paint_text(
        &p,
        egui::Rect::from_min_max(
            egui::pos2(chip.right() + 10.0, r.top() + 14.0),
            egui::pos2(r.right() - 14.0, r.top() + 51.0),
        ),
        label,
        12.0,
        t.muted,
    );
    paint_text(
        &p,
        egui::Rect::from_min_max(
            egui::pos2(r.left() + 14.0, r.top() + 62.0),
            r.max - egui::vec2(12.0, 10.0),
        ),
        value,
        24.0,
        t.text,
    );
    response.on_hover_text(format!("{label}: {value}"));
}

pub fn stat_grid(ui: &mut egui::Ui, items: &[(&str, String, egui::Color32)], max_columns: usize) {
    let gap = ui.spacing().item_spacing.x;
    let (columns, width) = super::layout::grid(ui.available_width(), 210.0, max_columns, gap);
    for row in items.chunks(columns) {
        ui.horizontal(|ui| {
            for (label, value, accent) in row {
                stat_card(ui, width, label, value, *accent);
            }
        });
    }
}

/// Period pattern: runs every frame while visible; callers keep their own
/// `last_refresh: Instant` field and compare against this helper.
pub fn should_refresh(last: std::time::Instant, period: std::time::Duration) -> bool {
    last.elapsed() >= period
}

pub fn format_secs(secs: u64) -> String {
    if secs >= 3600 {
        format!(
            "{:02}:{:02}:{:02}",
            secs / 3600,
            (secs % 3600) / 60,
            secs % 60
        )
    } else {
        format!("{:02}:{:02}", secs / 60, secs % 60)
    }
}

pub fn page_header(ui: &mut egui::Ui, title: &str, subtitle: &str) {
    theme::heading(ui, title);
    theme::muted(ui, subtitle);
    ui.add_space(16.0);
}

pub fn status_checkbox(
    ui: &mut egui::Ui,
    enabled: bool,
    value: &mut bool,
    label: &str,
) -> egui::Response {
    let response = ui.add_enabled(enabled, egui::Checkbox::new(value, ""));
    response.widget_info(|| {
        egui::WidgetInfo::selected(
            egui::Role::CheckBox,
            enabled && ui.is_enabled(),
            *value,
            label,
        )
    });
    response.on_hover_text(label)
}

/// Keep long paths and identifiers on one line while exposing their full value.
pub fn detail_line(ui: &mut egui::Ui, label: &str, value: &str) -> egui::Response {
    ui.add(
        egui::Label::new(
            egui::RichText::new(format!("{label}: {value}"))
                .size(12.0)
                .color(theme::tokens(ui).muted),
        )
        .truncate(),
    )
    .on_hover_text(value)
}
