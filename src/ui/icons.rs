//! Small, font-independent line icons for every desktop platform.
use egui::{Color32, Painter, Rect, Stroke};

#[derive(Clone, Copy)]
pub enum Icon {
    Dashboard,
    Screen,
    Content,
    Play,
    Calendar,
    Truck,
    Message,
    Chart,
    Database,
    Settings,
    Team,
    Menu,
    Eye,
    Edit,
    Delete,
}

pub fn paint(p: &Painter, rect: Rect, icon: Icon, color: Color32) {
    let r = rect.shrink(2.0);
    let pos = |x: f32, y: f32| egui::pos2(r.left() + x * r.width(), r.top() + y * r.height());
    let stroke = Stroke::new(1.5, color);
    let line = |a, b| {
        p.line_segment([a, b], stroke);
    };
    let box_at = |a, b| {
        p.rect_stroke(
            Rect::from_min_max(a, b),
            2.0,
            stroke,
            egui::StrokeKind::Inside,
        );
    };
    match icon {
        Icon::Dashboard => {
            for (x, y) in [(0.0, 0.0), (0.6, 0.0), (0.0, 0.6), (0.6, 0.6)] {
                box_at(pos(x, y), pos(x + 0.4, y + 0.4));
            }
        }
        Icon::Screen => {
            box_at(pos(0.0, 0.05), pos(1.0, 0.75));
            line(pos(0.5, 0.75), pos(0.5, 1.0));
            line(pos(0.25, 1.0), pos(0.75, 1.0));
        }
        Icon::Content => {
            box_at(pos(0.0, 0.2), pos(1.0, 1.0));
            line(pos(0.0, 0.2), pos(0.0, 0.0));
            line(pos(0.0, 0.0), pos(0.4, 0.0));
            line(pos(0.4, 0.0), pos(0.55, 0.2));
        }
        Icon::Play => {
            line(pos(0.2, 0.0), pos(0.9, 0.5));
            line(pos(0.9, 0.5), pos(0.2, 1.0));
            line(pos(0.2, 1.0), pos(0.2, 0.0));
        }
        Icon::Calendar => {
            box_at(pos(0.0, 0.15), pos(1.0, 1.0));
            line(pos(0.0, 0.4), pos(1.0, 0.4));
            for x in [0.25, 0.75] {
                line(pos(x, 0.0), pos(x, 0.25));
            }
        }
        Icon::Truck => {
            box_at(pos(0.0, 0.1), pos(0.65, 0.75));
            box_at(pos(0.65, 0.35), pos(1.0, 0.75));
            for x in [0.2, 0.8] {
                p.circle_stroke(pos(x, 0.85), r.width() * 0.12, stroke);
            }
        }
        Icon::Message => {
            box_at(pos(0.0, 0.0), pos(1.0, 0.75));
            line(pos(0.2, 0.75), pos(0.2, 1.0));
            line(pos(0.2, 1.0), pos(0.45, 0.75));
        }
        Icon::Chart => {
            line(pos(0.0, 0.0), pos(0.0, 1.0));
            line(pos(0.0, 1.0), pos(1.0, 1.0));
            for (x, h) in [(0.25, 0.6), (0.55, 0.3), (0.85, 0.0)] {
                line(pos(x, 0.9), pos(x, h));
            }
        }
        Icon::Database => {
            box_at(pos(0.05, 0.0), pos(0.95, 1.0));
            for y in [0.33, 0.66] {
                line(pos(0.05, y), pos(0.95, y));
            }
        }
        Icon::Settings => {
            for (y, x) in [(0.15, 0.3), (0.5, 0.7), (0.85, 0.4)] {
                line(pos(0.0, y), pos(1.0, y));
                p.circle_filled(pos(x, y), 2.5, color);
            }
        }
        Icon::Team => {
            p.circle_stroke(pos(0.35, 0.25), r.width() * 0.2, stroke);
            p.circle_stroke(pos(0.8, 0.35), r.width() * 0.14, stroke);
            box_at(pos(0.05, 0.6), pos(0.65, 1.0));
            line(pos(0.8, 0.65), pos(1.0, 1.0));
        }
        Icon::Menu => {
            for y in [0.15, 0.5, 0.85] {
                line(pos(0.0, y), pos(1.0, y));
            }
        }
        Icon::Eye => {
            p.circle_stroke(r.center(), r.width() * 0.45, stroke);
            p.circle_filled(r.center(), r.width() * 0.14, color);
        }
        Icon::Edit => {
            line(pos(0.1, 0.9), pos(0.9, 0.1));
            line(pos(0.0, 1.0), pos(0.3, 0.9));
            line(pos(0.0, 1.0), pos(0.1, 0.7));
        }
        Icon::Delete => {
            box_at(pos(0.2, 0.25), pos(0.8, 1.0));
            line(pos(0.05, 0.15), pos(0.95, 0.15));
            line(pos(0.35, 0.0), pos(0.65, 0.0));
        }
    }
}

pub fn button(ui: &mut egui::Ui, icon: Icon, label: &str) -> egui::Response {
    // A real Button supplies keyboard activation, focus, and accessibility metadata.
    let response = ui.add(egui::Button::new("").min_size(egui::vec2(34.0, 34.0)));
    response.widget_info(|| egui::WidgetInfo::labeled(egui::Role::Button, ui.is_enabled(), label));
    paint(
        ui.painter(),
        Rect::from_center_size(response.rect.center(), egui::vec2(18.0, 18.0)),
        icon,
        crate::theme::tokens(ui).text,
    );
    response.on_hover_text(label)
}
