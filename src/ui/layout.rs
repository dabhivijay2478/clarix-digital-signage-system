//! Pure layout decisions shared by pages and the native shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Navigation {
    Drawer,
    Rail,
    Sidebar,
}

pub fn navigation(width: f32) -> Navigation {
    if width >= 1280.0 {
        Navigation::Sidebar
    } else if width >= 1000.0 {
        Navigation::Rail
    } else {
        Navigation::Drawer
    }
}

/// Fill the available width without ever clamping a card beyond its container.
pub fn grid(width: f32, min_card: f32, max_columns: usize, gap: f32) -> (usize, f32) {
    let width = width.max(1.0);
    let columns =
        (((width + gap) / (min_card + gap)).floor() as usize).clamp(1, max_columns.max(1));
    (
        columns,
        ((width - gap * (columns - 1) as f32) / columns as f32).max(1.0),
    )
}

/// Use for dialogs so OS scaling and small windows cannot strand their contents.
pub fn dialog<'a>(
    ui: &egui::Ui,
    title: impl Into<egui::WidgetText>,
    width: f32,
) -> egui::Window<'a> {
    let bounds = ui.ctx().content_rect().shrink(16.0);
    egui::Window::new(title)
        .constrain_to(bounds)
        .default_width(width.min(bounds.width() - 32.0))
        .max_width((bounds.width() - 32.0).max(200.0))
        .max_height((bounds.height() - 64.0).max(160.0))
        .vscroll(true)
        .collapsible(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shell_breakpoints_are_in_logical_points() {
        for (width, expected) in [
            (800.0, Navigation::Drawer),
            (999.0, Navigation::Drawer),
            (1000.0, Navigation::Rail),
            (1279.0, Navigation::Rail),
            (1280.0, Navigation::Sidebar),
        ] {
            assert_eq!(navigation(width), expected);
        }
    }
    #[test]
    fn grids_fit_small_and_large_containers() {
        for width in [120.0, 400.0, 740.0, 1000.0, 1900.0] {
            let (columns, card) = grid(width, 240.0, 4, 12.0);
            assert!((1..=4).contains(&columns));
            assert!(card <= width);
            assert!((card * columns as f32 + 12.0 * (columns - 1) as f32 - width).abs() < 0.01);
        }
    }
}
