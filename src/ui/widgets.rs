//! Shared small UI helpers: labeled fields, section headers, confirm dialogs,
//! media controls used across pages.

pub use crate::theme;

/// Section heading with spacing.
pub fn section_header(ui: &mut egui::Ui, text: &str) {
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        let (bar, _) = ui.allocate_exact_size(egui::vec2(4.0, 18.0), egui::Sense::hover());
        ui.painter().rect_filled(bar, 2.0, theme::PRIMARY);
        ui.label(
            egui::RichText::new(text)
                .size(15.0)
                .strong()
                .color(theme::TEXT),
        );
    });
    ui.add_space(2.0);
}

/// A labeled text field row drawn with fixed label width for alignment.
pub fn labeled_text(
    ui: &mut egui::Ui,
    label: &str,
    text: &mut String,
    hint: &str,
) -> egui::Response {
    ui.horizontal(|ui| {
        ui.label(egui::RichText::new(label).size(13.0).color(theme::MUTED));
        ui.add_sized([240.0, 26.0], egui::TextEdit::singleline(text).hint_text(hint))
    })
    .inner
}

pub fn labeled_password(
    ui: &mut egui::Ui,
    label: &str,
    text: &mut String,
) -> egui::Response {
    ui.horizontal(|ui| {
        ui.label(egui::RichText::new(label).size(13.0).color(theme::MUTED));
        ui.add_sized([240.0, 26.0], egui::TextEdit::singleline(text).password(true))
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
    let response = ui.horizontal(|ui| {
        ui.label(egui::RichText::new(label).size(13.0).color(theme::MUTED));
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
        ui.label(egui::RichText::new(label).size(13.0).color(theme::MUTED));
        let mut proxy = *value as i32;
        ui.add(egui::Slider::new(&mut proxy, range.start as i32..=range.end as i32));
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
                .color(theme::with_alpha(theme::MUTED, 0.55)),
        );
        ui.add_space(8.0);
        ui.label(
            egui::RichText::new(text)
                .size(14.5)
                .color(theme::MUTED),
        );
    });
}

/// Icon for a stat card derived from its label (shared by the cluster of pages
/// that render KPI rows).
fn stat_icon(label: &str) -> &'static str {
    let l = label.to_lowercase();
    if l.contains("screen") {
        "🖥"
    } else if l.contains("content") {
        "🗂"
    } else if l.contains("playlist") {
        "🎬"
    } else if l.contains("schedule") || l.contains("slot") {
        "🗓"
    } else if l.contains("truck") {
        "🚚"
    } else if l.contains("storage") || l.contains("disk") {
        "💾"
    } else if l.contains("impression") {
        "👁"
    } else if l.contains("complet") {
        "✅"
    } else if l.contains("skip") {
        "⏭"
    } else if l.contains("waiting") {
        "⏳"
    } else if l.contains("loading") {
        "⏬"
    } else if l.contains("play") {
        "▶"
    } else if l.contains("dispatch") || l.contains("today") || l.contains("month") {
        "📦"
    } else if l.contains("total") {
        "📋"
    } else {
        "📈"
    }
}

/// KPI card: tinted icon chip, muted label, accent value.
///
/// Painted manually at an exact rect so the width is deterministic inside
/// responsive grids (avoids egui Frame/child-layout inheritance quirks).
/// `width` is the exact outer width the card will occupy.
pub fn stat_card(ui: &mut egui::Ui, width: f32, label: &str, value: &str, accent: egui::Color32) {
    let icon = stat_icon(label);
    let (rect, _) = ui.allocate_exact_size(egui::vec2(width, 86.0), egui::Sense::hover());

    // Soft drop shadow, then the card body.
    ui.painter().rect_filled(
        egui::Rect::from_min_size(rect.min + egui::vec2(0.0, 3.0), rect.size()),
        10.0,
        egui::Color32::from_black_alpha(34),
    );
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 10.0, theme::CARD);
    painter.rect_stroke(rect, 10.0, egui::Stroke::new(1.0, theme::STROKE), egui::StrokeKind::Inside);

    // Tinted icon chip with the label beside it.
    let chip = egui::Rect::from_center_size(
        egui::pos2(rect.left() + 12.0 + 15.0, rect.top() + 12.0 + 15.0),
        egui::vec2(30.0, 30.0),
    );
    painter.rect_filled(chip, 8.0, theme::with_alpha(accent, 0.16));
    painter.text(
        chip.center(),
        egui::Align2::CENTER_CENTER,
        icon,
        egui::FontId::proportional(15.0),
        accent,
    );
    painter.text(
        egui::pos2(chip.right() + 10.0, chip.center().y),
        egui::Align2::LEFT_CENTER,
        label,
        egui::FontId::proportional(11.5),
        theme::MUTED,
    );

    // Big value pinned under the chip row.
    painter.text(
        egui::pos2(rect.left() + 12.0, rect.top() + 64.0),
        egui::Align2::LEFT_CENTER,
        value,
        egui::FontId::proportional(22.0),
        accent,
    );
}

/// Period pattern: runs every frame while visible; callers keep their own
/// `last_refresh: Instant` field and compare against this helper.
pub fn should_refresh(last: std::time::Instant, period: std::time::Duration) -> bool {
    last.elapsed() >= period
}

pub fn format_secs(secs: u64) -> String {
    if secs >= 3600 {
        format!("{:02}:{:02}:{:02}", secs / 3600, (secs % 3600) / 60, secs % 60)
    } else {
        format!("{:02}:{:02}", secs / 60, secs % 60)
    }
}
