//! Shared small UI helpers: labeled fields, section headers, confirm dialogs,
//! media controls used across pages.

pub use crate::theme;

/// Section heading with spacing.
pub fn section_header(ui: &mut egui::Ui, text: &str) {
    ui.add_space(6.0);
    ui.add(egui::Label::new(
        egui::RichText::new(text).size(15.0).strong().color(theme::TEXT),
    ));
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
    ui.add_space(20.0);
    ui.vertical_centered(|ui| {
        ui.label(
            egui::RichText::new(text)
                .size(14.0)
                .color(theme::MUTED),
        );
    });
    ui.add_space(20.0);
}

pub fn stat_card(ui: &mut egui::Ui, width: f32, label: &str, value: &str, accent: egui::Color32) {
    ui.allocate_ui_with_layout(
        egui::vec2(width, 84.0),
        egui::Layout::top_down_justified(egui::Align::LEFT),
        |ui| {
            ui.label(egui::RichText::new(label).size(11.5).color(theme::MUTED));
            ui.add_space(6.0);
            ui.label(
                egui::RichText::new(value)
                    .size(24.0)
                    .strong()
                    .color(accent),
            );
        },
    )
    .response
    .on_hover_cursor(egui::CursorIcon::Default);
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
