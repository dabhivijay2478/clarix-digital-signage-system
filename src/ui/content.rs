use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::backend::content::ContentStorageInfo;
use crate::models::{ContentItem, ContentType};
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

pub struct ContentPage {
    last_refresh: Instant,
    items: Vec<ContentItem>,
    storage: Option<ContentStorageInfo>,
    textures: HashMap<String, Option<egui::TextureHandle>>,
    add_dialog: Option<AddDraft>,
    delete_queue: Vec<String>,
}

pub struct AddDraft {
    name: String,
    content_type: String,
    file_path: Option<String>,
    url: String,
    duration_secs: u32,
    open: bool,
}

impl Default for ContentPage {
    fn default() -> Self {
        Self {
            last_refresh: Instant::now() - Duration::from_secs(3600),
            items: Vec::new(),
            storage: None,
            textures: HashMap::new(),
            add_dialog: None,
            delete_queue: Vec::new(),
        }
    }
}

impl ContentPage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_millis(2500)) {
            self.last_refresh = Instant::now();
            self.refresh(core);
        }
        self.handle_deletes(core, toasts);

        // Toolbar.
        ui.horizontal(|ui| {
            if ui.button(egui::RichText::new("+ Upload files").strong()).clicked() {
                if let Some(loaded) = pick_media_files() {
                    for (path, name, content_type) in loaded {
                        self.queue_import(core, toasts, &path, name, content_type);
                    }
                    self.refresh(core);
                }
            }
            if ui.button("Add web URL").clicked() {
                self.add_dialog = Some(AddDraft {
                    name: String::new(),
                    content_type: "WebApp".to_string(),
                    file_path: None,
                    url: "https://".to_string(),
                    duration_secs: 15,
                    open: true,
                });
            }
            if ui.button("Change library folder").clicked() {
                if let Some(folder) = rfd::FileDialog::new()
                    .set_title("Choose content library folder")
                    .pick_folder()
                {
                    match crate::backend::content::set_content_directory(
                        core,
                        folder.to_string_lossy().to_string(),
                    ) {
                        Ok(storage) => {
                            self.storage = Some(storage);
                            toasts.push(Toast::new(ToastKind::Success, "Content library folder updated."));
                            self.refresh(core);
                        }
                        Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
                    }
                }
            }
        });

        if let Some(storage) = &self.storage {
            ui.add_space(2.0);
            theme::muted(
                ui,
                &format!(
                    "Library: {} · used {} · free {} of {}",
                    storage.path,
                    theme::format_bytes(storage.used_bytes),
                    theme::format_bytes(storage.free_bytes),
                    theme::format_bytes(storage.total_bytes)
                ),
            );
        }
        ui.add_space(6.0);

        // Upload progress note removed for brevity; item grid:
        egui::ScrollArea::vertical().show(ui, |ui| {
            let card_w = ((ui.available_width() - 30.0) / 4.0).max(240.0);
            let items = self.items.clone();
            for chunk in items.chunks(4) {
                ui.horizontal(|ui| {
                    for item in chunk {
                        self.draw_item_card(ui, core, toasts, item, card_w);
                    }
                });
                ui.add_space(6.0);
            }
            if items.is_empty() {
                widgets::empty_state(ui, "No content yet — upload images, videos or add web URLs.");
            }
        });

        self.draw_add_dialog(ui, core, toasts);
    }

    fn refresh(&mut self, core: &Arc<AppCore>) {
        self.items = crate::backend::content::get_content_items(&core.pool).unwrap_or_default();
        self.storage = crate::backend::content::get_content_storage(core).ok();
    }

    fn queue_import(
        &mut self,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
        source_path: &str,
        name: String,
        content_type: String,
    ) {
        let path = std::path::Path::new(source_path);
        let display_name = name.clone();
        match crate::backend::content::import_content_file(core, path) {
            Ok((stored_path, _warn)) => {
                let duration = default_duration_for(&content_type);
                match crate::backend::content::add_content_item(
                    core,
                    name,
                    content_type.clone(),
                    Some(stored_path),
                    None,
                    duration,
                    Vec::new(),
                    None,
                ) {
                    Ok(_) => toasts.push(Toast::new(
                        ToastKind::Success,
                        format!("Imported {display_name}"),
                    )),
                    Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
                }
            }
            Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
        }
    }

    fn draw_item_card(
        &mut self,
        ui: &mut egui::Ui,
        _core: &Arc<AppCore>,
        _toasts: &mut Vec<Toast>,
        item: &ContentItem,
        width: f32,
    ) {
        let thumb_size = egui::vec2(width - 12.0, (width * 0.56).min(150.0));
        let texture = self.texture_for(ui.ctx(), item, &thumb_size);

        egui::Frame::new()
            .fill(theme::CARD)
            .stroke(egui::Stroke::new(1.0, theme::STROKE))
            .inner_margin(egui::Margin::same(8))
            .corner_radius(8.0)
            .show(ui, |ui| {
                ui.set_width(width);
                // Thumbnail area.
                let rect = ui.allocate_exact_size(thumb_size, egui::Sense::hover()).0;
                let painter = ui.painter();
                painter.rect_filled(rect, 6.0, theme::INPUT_BG);
                match &texture {
                    Some(handle) => {
                        let fitted = fit_within(handle.size_vec2(), thumb_size);
                        let image_rect =
                            egui::Rect::from_min_size(rect.center() - fitted / 2.0, fitted);
                        painter.image(
                            handle.id(),
                            image_rect,
                            egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0)),
                            egui::Color32::WHITE,
                        );
                    }
                    None => {
                        painter.text(
                            rect.center(),
                            egui::Align2::CENTER_CENTER,
                            type_glyph(&item.content_type),
                            egui::FontId::proportional(30.0),
                            theme::MUTED,
                        );
                    }
                }

                ui.label(
                    egui::RichText::new(item.name.clone())
                        .size(13.5)
                        .strong()
                        .color(theme::TEXT),
                );
                theme::muted(
                    ui,
                    &format!(
                        "{} · {}",
                        type_label(&item.content_type),
                        if item.duration_secs > 0 {
                            format!("{}s", item.duration_secs)
                        } else {
                            "—".to_string()
                        }
                    ),
                );
                ui.horizontal(|ui| {
                    if ui.button("🗑").on_hover_text("Delete").clicked() {
                        self.delete_queue.push(item.id.clone());
                    }
                    if ui.button("⏱").on_hover_text("Adjust duration").clicked() {
                        self.add_dialog = Some(AddDraft {
                            name: item.name.clone(),
                            content_type: type_label(&item.content_type).to_string(),
                            file_path: Some(format!("::{id}", id = item.id)),
                            url: item.url.clone().unwrap_or_default(),
                            duration_secs: item.duration_secs.max(1),
                            open: true,
                        });
                    }
                });
            });
        ui.add_space(4.0);
    }

    /// Load (and cache) the texture for an image item.
    fn texture_for(
        &mut self,
        ctx: &egui::Context,
        item: &ContentItem,
        _size: &egui::Vec2,
    ) -> Option<egui::TextureHandle> {
        if !matches!(item.content_type, ContentType::Image) {
            return None;
        }
        let key = item.file_path.clone()?;
        if let Some(cached) = self.textures.get(&key) {
            return cached.clone();
        }
        let handle = load_image_texture(ctx, &key);
        self.textures.insert(key, handle.clone());
        handle
    }

    fn handle_deletes(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let queue = std::mem::take(&mut self.delete_queue);
        for id in queue {
            match crate::backend::content::delete_content_item(core, id) {
                Ok(()) => {
                    toasts.push(Toast::new(ToastKind::Success, "Content removed."));
                    self.refresh(core);
                }
                Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
            }
        }
    }

    fn draw_add_dialog(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let mut draft = match self.add_dialog.take() {
            Some(draft) if draft.open => draft,
            _ => return, // take() already cleared the dialog
        };
        let mut open = draft.open;
        let is_duration_edit = draft
            .file_path
            .as_deref()
            .map(|p| p.starts_with("::"))
            .unwrap_or(false);
        let editing_id = if is_duration_edit {
            draft.file_path.clone().unwrap_or_default().trim_start_matches("::").to_string()
        } else {
            String::new()
        };

        egui::Window::new(egui::RichText::new(if is_duration_edit {
            "Content properties"
        } else {
            "Add web content"
        }).strong())
        .open(&mut open)
        .resizable(false)
        .show(ui.ctx(), |ui| {
            if is_duration_edit {
                let name_draft = draft.name.clone();
                ui.label(
                    egui::RichText::new(name_draft)
                        .size(15.0)
                        .strong(),
                );
                ui.add_space(4.0);
                let mut duration = draft.duration_secs as i32;
                ui.add(
                    egui::Slider::new(&mut duration, 1..=3600).suffix(" seconds"),
                );
                if duration as u32 != draft.duration_secs {
                    draft.duration_secs = duration as u32;
                    if let Err(error) = crate::backend::content::update_content_duration(
                        core,
                        editing_id.clone(),
                        duration as i32,
                    ) {
                        toasts.push(Toast::new(ToastKind::Error, error));
                    }
                }
                ui.add_space(6.0);
                if let Some(item) = self.items.iter().find(|i| i.id == editing_id) {
                    theme::muted(ui, &item.file_path.clone().unwrap_or_default());
                }
            } else {
                egui::TextEdit::singleline(&mut draft.name)
                    .hint_text("Name")
                    .desired_width(280.0)
                    .show(ui);
                ui.add_space(4.0);
                egui::TextEdit::singleline(&mut draft.url)
                    .hint_text("https://dashboard.example.com")
                    .desired_width(280.0)
                    .show(ui);
                ui.add_space(4.0);
                let mut duration = draft.duration_secs as i32;
                ui.add(
                    egui::Slider::new(&mut duration, 1..=600).suffix(" seconds"),
                );
                draft.duration_secs = duration as u32;
            }
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                if ui.button(if is_duration_edit { "Done" } else { "Add" }).clicked() {
                    if is_duration_edit {
                        draft.open = false;
                    } else {
                        match crate::backend::content::add_content_item(
                            core,
                            draft.name.clone(),
                            "WebApp".to_string(),
                            None,
                            Some(draft.url.clone()),
                            draft.duration_secs,
                            Vec::new(),
                            None,
                        ) {
                            Ok(_) => {
                                toasts.push(Toast::new(ToastKind::Success, "Web content added."));
                                draft.open = false;
                                self.refresh(core);
                            }
                            Err(error) => toasts.push(Toast::new(ToastKind::Error, error)),
                        }
                    }
                }
                if ui.button("Cancel").clicked() {
                    draft.open = false;
                }
            });
        });
        if open && draft.open {
            self.add_dialog = Some(draft);
        }
    }
}

impl AddDraft {
    pub fn content_name(&self) -> String {
        self.name.clone()
    }
}

fn pick_media_files() -> Option<Vec<(String, String, String)>> {
    let dialog = rfd::FileDialog::new()
        .set_title("Import content files")
        .add_filter(
            "Media & docs",
            &[
                "mp4", "mkv", "webm", "mov", "avi", "png", "jpg", "jpeg", "gif", "webp", "bmp",
                "pdf", "xlsx", "xls", "csv", "ppt", "pptx", "pps", "ppsx",
            ],
        )
        .pick_files()?;
    Some(
        dialog
            .into_iter()
            .map(|path| {
                let name = path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("Content")
                    .to_string();
                let content_type = detect_content_type(&path);
                (path.to_string_lossy().to_string(), name, content_type)
            })
            .collect(),
    )
}

pub fn detect_content_type(path: &std::path::Path) -> String {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "mp4" | "mkv" | "webm" | "mov" | "avi" => "Video",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" => "Image",
        "pdf" => "Document",
        "xlsx" | "xls" | "csv" => "Spreadsheet",
        "ppt" | "pptx" | "pps" | "ppsx" => "Presentation",
        _ => "WebApp",
    }
    .to_string()
}

pub fn default_duration_for(content_type: &str) -> u32 {
    match content_type {
        "Image" => 10,
        "Video" => 10,
        "WebApp" => 15,
        "Presentation" => 12,
        _ => 10,
    }
}

pub fn type_label(content_type: &ContentType) -> &'static str {
    match content_type {
        ContentType::Video => "Video",
        ContentType::Image => "Image",
        ContentType::WebApp => "Web App",
        ContentType::Ad => "Ad",
        ContentType::Slideshow => "Slideshow",
        ContentType::Document => "Document",
        ContentType::Spreadsheet => "Spreadsheet",
        ContentType::Presentation => "Presentation",
    }
}

fn type_glyph(content_type: &ContentType) -> &'static str {
    match content_type {
        ContentType::Video => "▶",
        ContentType::WebApp => "🌐",
        ContentType::Document => "📄",
        ContentType::Spreadsheet => "📊",
        ContentType::Presentation => "📽",
        _ => "🖼",
    }
}

fn fit_within(source: egui::Vec2, max: egui::Vec2) -> egui::Vec2 {
    if source.x <= 0.0 || source.y <= 0.0 {
        return max;
    }
    let scale = (max.x / source.x).min(max.y / source.y).min(1.0);
    source * scale
}

fn load_image_texture(ctx: &egui::Context, path: &str) -> Option<egui::TextureHandle> {
    let bytes = std::fs::read(path).ok()?;
    let image = image::load_from_memory(&bytes).ok()?;
    let rgba = image.to_rgba8();
    let color = egui::ColorImage::from_rgba_unmultiplied(
        [rgba.width() as usize, rgba.height() as usize],
        rgba.as_raw(),
    );
    Some(
        ctx.load_texture(
            format!("thumb-{path}"),
            color,
            egui::TextureOptions::default(),
        ),
    )
}
