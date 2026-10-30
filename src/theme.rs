//! Desktop appearance is independent of the live signage palette.
use egui::{Color32, RichText, Stroke, Visuals};
pub const APPEARANCE_KEY: &str = "clarix_appearance";
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum AppearancePreference {
    #[default]
    System,
    Light,
    Dark,
}
impl AppearancePreference {
    pub fn load(storage: Option<&dyn eframe::Storage>) -> Self {
        match storage
            .and_then(|s| s.get_string(APPEARANCE_KEY))
            .as_deref()
        {
            Some("light") => Self::Light,
            Some("dark") => Self::Dark,
            _ => Self::System,
        }
    }
    pub fn save(self, storage: &mut dyn eframe::Storage) {
        storage.set_string(APPEARANCE_KEY, self.name().to_ascii_lowercase());
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::System => "System",
            Self::Light => "Light",
            Self::Dark => "Dark",
        }
    }
    pub fn resolve(self, system: Option<egui::Theme>) -> egui::Theme {
        match self {
            Self::System => system.unwrap_or(egui::Theme::Dark),
            Self::Light => egui::Theme::Light,
            Self::Dark => egui::Theme::Dark,
        }
    }
    pub fn apply(self, ctx: &egui::Context) {
        ctx.set_theme(match self {
            Self::System => egui::ThemePreference::System,
            Self::Light => egui::ThemePreference::Light,
            Self::Dark => egui::ThemePreference::Dark,
        });
    }
}
#[derive(Clone, Copy)]
pub struct PlatformStyle {
    pub radius: u8,
    pub control_height: f32,
    pub border_width: f32,
}
impl PlatformStyle {
    pub const fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self {
                radius: 10,
                control_height: 32.0,
                border_width: 0.75,
            }
        } else if cfg!(target_os = "windows") {
            Self {
                radius: 7,
                control_height: 34.0,
                border_width: 1.0,
            }
        } else {
            Self {
                radius: 6,
                control_height: 34.0,
                border_width: 1.0,
            }
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub struct Tokens {
    pub bg: Color32,
    pub panel: Color32,
    pub card: Color32,
    pub card_hover: Color32,
    pub stroke: Color32,
    pub text: Color32,
    pub muted: Color32,
    pub primary: Color32,
    pub on_primary: Color32,
    pub green: Color32,
    pub red: Color32,
    pub amber: Color32,
    pub input_bg: Color32,
    pub shadow: Color32,
}
impl Tokens {
    pub const fn for_dark(dark: bool) -> Self {
        if dark {
            Self {
                bg: Color32::from_rgb(14, 19, 29),
                panel: Color32::from_rgb(19, 26, 39),
                card: Color32::from_rgb(25, 34, 49),
                card_hover: Color32::from_rgb(33, 45, 63),
                stroke: Color32::from_rgb(51, 65, 85),
                text: Color32::from_rgb(237, 242, 250),
                muted: Color32::from_rgb(163, 179, 199),
                primary: Color32::from_rgb(93, 160, 255),
                on_primary: Color32::from_rgb(9, 23, 43),
                green: Color32::from_rgb(78, 211, 155),
                red: Color32::from_rgb(255, 132, 144),
                amber: Color32::from_rgb(245, 195, 101),
                input_bg: Color32::from_rgb(17, 24, 36),
                shadow: Color32::from_black_alpha(35),
            }
        } else {
            Self {
                bg: Color32::from_rgb(243, 246, 251),
                panel: Color32::from_rgb(250, 252, 255),
                card: Color32::WHITE,
                card_hover: Color32::from_rgb(232, 239, 249),
                stroke: Color32::from_rgb(209, 219, 232),
                text: Color32::from_rgb(26, 39, 59),
                muted: Color32::from_rgb(82, 100, 124),
                primary: Color32::from_rgb(29, 92, 203),
                on_primary: Color32::WHITE,
                green: Color32::from_rgb(19, 116, 77),
                red: Color32::from_rgb(185, 42, 61),
                amber: Color32::from_rgb(141, 86, 8),
                input_bg: Color32::from_rgb(248, 250, 253),
                shadow: Color32::from_black_alpha(10),
            }
        }
    }
}
pub fn tokens(ui: &egui::Ui) -> Tokens {
    Tokens::for_dark(ui.visuals().dark_mode)
}
pub fn with_alpha(c: Color32, a: f32) -> Color32 {
    Color32::from_rgba_unmultiplied(
        c.r(),
        c.g(),
        c.b(),
        (a.clamp(0.0, 1.0) * 255.0).round() as u8,
    )
}
pub fn apply(ctx: &egui::Context) {
    let candidates: &[&str] = if cfg!(target_os = "windows") {
        &["C:/Windows/Fonts/segoeui.ttf"]
    } else if cfg!(target_os = "macos") {
        &[
            "/System/Library/Fonts/SFNS.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]
    } else {
        &[
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        ]
    };
    if let Some(bytes) = candidates.iter().find_map(|p| std::fs::read(p).ok()) {
        let mut fonts = egui::FontDefinitions::default();
        fonts.font_data.insert(
            "platform-ui".into(),
            std::sync::Arc::new(egui::FontData::from_owned(bytes)),
        );
        fonts
            .families
            .entry(egui::FontFamily::Proportional)
            .or_default()
            .insert(0, "platform-ui".into());
        ctx.set_fonts(fonts);
    }
    let p = PlatformStyle::current();
    for theme in [egui::Theme::Light, egui::Theme::Dark] {
        ctx.style_mut_of(theme, |s| {
            s.visuals = visuals(theme == egui::Theme::Dark);
            s.spacing.item_spacing = egui::vec2(12.0, 10.0);
            s.spacing.button_padding = egui::vec2(12.0, 7.0);
            s.spacing.interact_size.y = p.control_height;
            s.spacing.slider_width = 220.0;
            s.spacing.text_edit_width = 220.0;
            for (k, size) in [
                (egui::TextStyle::Body, 14.0),
                (egui::TextStyle::Button, 14.0),
                (egui::TextStyle::Small, 12.0),
                (egui::TextStyle::Heading, 24.0),
            ] {
                s.text_styles.insert(k, egui::FontId::proportional(size));
            }
            s.text_styles
                .insert(egui::TextStyle::Monospace, egui::FontId::monospace(13.0));
        });
    }
}
fn visuals(dark: bool) -> Visuals {
    let t = Tokens::for_dark(dark);
    let p = PlatformStyle::current();
    let mut v = if dark {
        Visuals::dark()
    } else {
        Visuals::light()
    };
    v.panel_fill = t.panel;
    v.window_fill = t.card;
    v.extreme_bg_color = t.input_bg;
    v.text_edit_bg_color = Some(t.input_bg);
    v.faint_bg_color = with_alpha(t.muted, 0.045);
    v.override_text_color = Some(t.text);
    v.widgets.noninteractive.bg_fill = t.card;
    v.widgets.noninteractive.fg_stroke = Stroke::new(1.0, t.text);
    v.widgets.noninteractive.bg_stroke = Stroke::new(p.border_width, t.stroke);
    for w in [
        &mut v.widgets.inactive,
        &mut v.widgets.hovered,
        &mut v.widgets.active,
        &mut v.widgets.open,
    ] {
        w.bg_fill = t.card;
        w.weak_bg_fill = t.card;
        w.fg_stroke = Stroke::new(1.0, t.text);
        w.bg_stroke = Stroke::new(p.border_width, t.stroke);
        w.corner_radius = egui::CornerRadius::same(p.radius);
    }
    v.widgets.hovered.bg_fill = t.card_hover;
    v.widgets.hovered.weak_bg_fill = t.card_hover;
    v.widgets.hovered.bg_stroke = Stroke::new(1.0, t.primary);
    v.widgets.active.bg_fill = with_alpha(t.primary, 0.18);
    v.widgets.active.bg_stroke = Stroke::new(1.5, t.primary);
    v.widgets.open.bg_fill = t.card_hover;
    v.selection.bg_fill = with_alpha(t.primary, if dark { 0.28 } else { 0.14 });
    v.selection.stroke = Stroke::new(1.0, t.primary);
    v.hyperlink_color = t.primary;
    v.warn_fg_color = t.amber;
    v.error_fg_color = t.red;
    v.window_corner_radius = egui::CornerRadius::same(p.radius + 2);
    v.menu_corner_radius = egui::CornerRadius::same(p.radius);
    v.window_shadow.color = t.shadow;
    v
}
pub fn appearance_control(ui: &mut egui::Ui, pref: &mut AppearancePreference) {
    ui.horizontal_wrapped(|ui| {
        muted(ui, "Appearance");
        for c in [
            AppearancePreference::System,
            AppearancePreference::Light,
            AppearancePreference::Dark,
        ] {
            if ui
                .add(egui::Button::selectable(*pref == c, c.name()))
                .clicked()
            {
                *pref = c;
                c.apply(ui.ctx());
                ui.ctx().request_repaint();
            }
        }
    });
}
pub fn primary_button(ui: &mut egui::Ui, text: impl Into<String>) -> egui::Response {
    let t = tokens(ui);
    ui.add(
        egui::Button::new(RichText::new(text.into()).strong().color(t.on_primary)).fill(t.primary),
    )
}
pub fn card(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
    let t = tokens(ui);
    egui::Frame::new()
        .fill(t.card)
        .stroke(Stroke::new(1.0, t.stroke))
        .inner_margin(egui::Margin::same(16))
        .corner_radius(PlatformStyle::current().radius + 2)
        .show(ui, |ui| add(ui));
}
pub fn heading(ui: &mut egui::Ui, text: &str) {
    ui.label(
        RichText::new(text)
            .size(24.0)
            .strong()
            .color(tokens(ui).text),
    );
}
pub fn muted(ui: &mut egui::Ui, text: &str) {
    ui.add(egui::Label::new(RichText::new(text).size(12.0).color(tokens(ui).muted)).wrap());
}
pub fn status_dot(ui: &mut egui::Ui, color: Color32, label: &str) {
    ui.horizontal(|ui| {
        let (r, _) = ui.allocate_exact_size(egui::vec2(8.0, 8.0), egui::Sense::hover());
        ui.painter().circle_filled(r.center(), 4.0, color);
        ui.label(RichText::new(label).color(tokens(ui).muted).size(12.0));
    });
}
pub fn badge(ui: &mut egui::Ui, text: &str, color: Color32) {
    egui::Frame::new()
        .fill(with_alpha(color, 0.10))
        .inner_margin(egui::Margin::symmetric(8, 4))
        .corner_radius(5.0)
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(12.0).strong().color(color));
        });
}
pub fn format_bytes(bytes: u64) -> String {
    let v = bytes as f64;
    if v >= 1024.0_f64.powi(3) {
        format!("{:.1} GB", v / 1024.0_f64.powi(3))
    } else if v >= 1024.0_f64.powi(2) {
        format!("{:.1} MB", v / 1024.0_f64.powi(2))
    } else if v >= 1024.0 {
        format!("{:.0} KB", v / 1024.0)
    } else {
        format!("{bytes} B")
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use eframe::Storage;
    #[derive(Default)]
    struct MemoryStorage(std::collections::HashMap<String, String>);
    impl eframe::Storage for MemoryStorage {
        fn get_string(&self, k: &str) -> Option<String> {
            self.0.get(k).cloned()
        }
        fn set_string(&mut self, k: &str, v: String) {
            self.0.insert(k.into(), v);
        }
        fn remove_string(&mut self, k: &str) {
            self.0.remove(k);
        }
        fn flush(&mut self) {}
    }
    #[test]
    fn appearance_survives_restart_and_handles_unknown_values() {
        let mut s = MemoryStorage::default();
        assert_eq!(
            AppearancePreference::load(None),
            AppearancePreference::System
        );
        for p in [
            AppearancePreference::Light,
            AppearancePreference::Dark,
            AppearancePreference::System,
        ] {
            p.save(&mut s);
            assert_eq!(AppearancePreference::load(Some(&s)), p);
        }
        s.set_string(APPEARANCE_KEY, "future-value".into());
        assert_eq!(
            AppearancePreference::load(Some(&s)),
            AppearancePreference::System
        );
    }
    #[test]
    fn explicit_appearance_overrides_system() {
        assert_eq!(
            AppearancePreference::Light.resolve(Some(egui::Theme::Dark)),
            egui::Theme::Light
        );
        assert_eq!(
            AppearancePreference::Dark.resolve(Some(egui::Theme::Light)),
            egui::Theme::Dark
        );
        assert_eq!(
            AppearancePreference::System.resolve(Some(egui::Theme::Light)),
            egui::Theme::Light
        );
        assert_eq!(
            AppearancePreference::System.resolve(None),
            egui::Theme::Dark
        );
    }
}
