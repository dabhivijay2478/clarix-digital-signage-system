//! Theme-independent signage styling and deterministic ten-second paging.
use egui::{Color32, Rect};

pub struct SignageStyle;
impl SignageStyle {
    pub const BG: Color32 = Color32::from_rgb(9, 15, 25);
    pub const SURFACE: Color32 = Color32::from_rgb(20, 31, 48);
    pub const BORDER: Color32 = Color32::from_rgb(48, 68, 94);
    pub const TEXT: Color32 = Color32::from_rgb(245, 248, 255);
    pub const MUTED: Color32 = Color32::from_rgb(177, 194, 217);
    pub const BLUE: Color32 = Color32::from_rgb(109, 176, 255);
    pub const GREEN: Color32 = Color32::from_rgb(98, 229, 171);
    pub const AMBER: Color32 = Color32::from_rgb(255, 208, 115);
    pub fn scale(rect: Rect) -> f32 {
        (rect.width().min(rect.height()) / 1080.0).clamp(0.4, 4.0)
    }
}

#[derive(Debug)]
pub struct PageLayout {
    pub columns: usize,
    pub rows: usize,
    pub page: usize,
    pub pages: usize,
    pub range: std::ops::Range<usize>,
    bounds: Rect,
    gap: f32,
}
impl PageLayout {
    pub fn new(
        bounds: Rect,
        count: usize,
        minimum: egui::Vec2,
        max_columns: usize,
        time: f64,
        gap: f32,
    ) -> Self {
        let columns = (((bounds.width() + gap) / (minimum.x + gap)).floor() as usize)
            .clamp(1, max_columns.max(1))
            .min(count.max(1));
        let rows = (((bounds.height() + gap) / (minimum.y + gap)).floor() as usize)
            .max(1)
            .min(count.div_ceil(columns).max(1));
        let capacity = columns.saturating_mul(rows).max(1);
        let pages = count.div_ceil(capacity).max(1);
        let page = (time.max(0.0) / 10.0).floor() as usize % pages;
        let start = (page * capacity).min(count);
        // A sparse final page should use the whole display, not leave empty grid slots.
        let visible = (count - start).min(capacity).max(1);
        let columns = columns.min(visible);
        let rows = visible.div_ceil(columns);
        Self {
            columns,
            rows,
            page,
            pages,
            range: start..(start + capacity).min(count),
            bounds,
            gap,
        }
    }
    pub fn cell(&self, offset: usize) -> Rect {
        let width =
            (self.bounds.width() - self.gap * (self.columns - 1) as f32) / self.columns as f32;
        let height = (self.bounds.height() - self.gap * (self.rows - 1) as f32) / self.rows as f32;
        Rect::from_min_size(
            self.bounds.min
                + egui::vec2(
                    (offset % self.columns) as f32 * (width + self.gap),
                    (offset / self.columns) as f32 * (height + self.gap),
                ),
            egui::vec2(width, height),
        )
    }
}

pub fn text(p: &egui::Painter, rect: Rect, text: &str, size: f32, color: Color32) {
    if !rect.is_positive() {
        return;
    }
    let mut size = size.max(1.0);
    let mut galley = p.layout(
        text.to_string(),
        egui::FontId::proportional(size),
        color,
        rect.width(),
    );
    if galley.size().y > rect.height() {
        size *= (rect.height() / galley.size().y).sqrt();
        galley = p.layout(
            text.to_string(),
            egui::FontId::proportional(size.max(1.0)),
            color,
            rect.width(),
        );
    }
    let at = egui::pos2(rect.left(), rect.center().y - galley.size().y / 2.0);
    p.with_clip_rect(rect.intersect(p.clip_rect()))
        .galley(at, galley, color);
}

pub fn page_indicator(p: &egui::Painter, rect: Rect, layout: &PageLayout, scale: f32) {
    if layout.pages > 1 {
        p.text(
            rect.center_bottom() - egui::vec2(0.0, 14.0 * scale),
            egui::Align2::CENTER_BOTTOM,
            format!("{} / {}", layout.page + 1, layout.pages),
            egui::FontId::proportional(18.0 * scale),
            SignageStyle::MUTED,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pagination_visits_every_item_and_changes_at_ten_seconds() {
        for size in [
            egui::vec2(1920.0, 1080.0),
            egui::vec2(1080.0, 1920.0),
            egui::vec2(3840.0, 2160.0),
        ] {
            let bounds = Rect::from_min_size(egui::Pos2::ZERO, size);
            let make = |t| PageLayout::new(bounds, 19, egui::vec2(500.0, 400.0), 3, t, 20.0);
            assert_eq!(make(0.0).range, make(9.999).range);
            let mut visited = Vec::new();
            for page in 0..make(0.0).pages {
                let layout = make(page as f64 * 10.0);
                for (offset, index) in layout.range.clone().enumerate() {
                    visited.push(index);
                    let cell = layout.cell(offset);
                    assert!(bounds.contains_rect(cell));
                    assert!(cell.is_positive());
                }
            }
            assert_eq!(visited, (0..19).collect::<Vec<_>>());
            assert_eq!(make(make(0.0).pages as f64 * 10.0).page, 0);
        }
    }
    #[test]
    fn empty_and_single_item_pages_are_safe() {
        for count in [0, 1] {
            let layout = PageLayout::new(
                Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(200.0, 100.0)),
                count,
                egui::vec2(500.0, 400.0),
                2,
                1e6,
                12.0,
            );
            assert_eq!(layout.pages, 1);
            assert_eq!(layout.range, 0..count);
        }
    }
}
