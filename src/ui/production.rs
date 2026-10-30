use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::models::ProductionImportResult;
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

const MAX_PREVIEW_ROWS: usize = 60;
const MAX_PREVIEW_COLS: usize = 12;

pub struct ProductionPage {
    datasets: Vec<crate::models::ProductionDatasetSummary>,
    selected: Option<String>,
    detail: Option<crate::models::ProductionDataset>,
    import_staging: Option<ProductionImportResult>,
    dataset_name: String,
    preview_table: String,
    last_refresh: Instant,
    loaded_once: bool,
}

impl Default for ProductionPage {
    fn default() -> Self {
        Self {
            datasets: Vec::new(),
            selected: None,
            detail: None,
            import_staging: None,
            dataset_name: String::new(),
            preview_table: String::new(),
            last_refresh: Instant::now() - Duration::from_secs(3600),
            loaded_once: false,
        }
    }
}

impl ProductionPage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_secs(6)) || !self.loaded_once {
            self.last_refresh = Instant::now();
            self.loaded_once = true;
            self.refresh(core);
        }

        theme::heading(ui, "Production data");
        theme::muted(ui,
            "Import Excel/CSV production reports. Datasets and their dashboards sync to gate screens.");
        ui.add_space(10.0);

        ui.horizontal(|ui| {
            if ui.button(" Import Excel / CSV…").clicked() {
                self.start_import(toasts);
            }
            if let Some(dataset_id) = self.selected.clone() {
                if ui.button("↻ Refresh from file").clicked() {
                    self.refresh_from_file(core, &dataset_id, toasts);
                }
                if ui.button("🗑 Delete dataset").clicked() {
                    match crate::backend::production::delete_production_dataset(core, dataset_id.clone()) {
                        Ok(()) => {
                            toasts.push(Toast::new(ToastKind::Success, "Dataset deleted"));
                            if self.selected.as_deref() == Some(dataset_id.as_str()) {
                                self.selected = None;
                                self.detail = None;
                            }
                            self.last_refresh = Instant::now() - Duration::from_secs(3600);
                        }
                        Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Delete failed: {error}"))),
                    }
                }
            }
        });
        ui.add_space(6.0);

        // ── Datasets grid ───────────────────────────────────────────────────
        widgets::section_header(ui, "Player rendering");
        theme::muted(ui,
            "Screens with purpose \"production_dashboard\" render the dataset widgets natively (bars/tables). Content shortcuts to a dashboard can also be added from the API.");
        ui.add_space(4.0);
        if self.datasets.is_empty() {
            widgets::empty_state(ui, "No production datasets yet. Import an Excel or CSV report to create one.");
        }
        for dataset in &self.datasets {
            let selected = self.selected.as_deref() == Some(dataset.id.as_str());
            theme::card(ui, |ui| {
                ui.horizontal(|ui| {
                    let label = egui::RichText::new(&dataset.name)
                        .size(14.5)
                        .strong()
                        .color(if selected { theme::PRIMARY } else { theme::TEXT });
                    if ui.add(egui::Button::selectable(selected, label)).clicked() {
                        if !selected {
                            self.selected = Some(dataset.id.clone());
                            self.detail = None;
                            self.preview_table = String::new();
                            self.last_refresh = Instant::now() - Duration::from_secs(3600);
                        }
                    }
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        theme::muted(ui, &format!(
                            "Updated {}",
                            dataset.updated_at.with_timezone(&chrono::Local).format("%d %b %H:%M")
                        ));
                        theme::badge(ui, &format!("{} tables · {} rows", dataset.table_count, dataset.row_count), theme::PRIMARY);
                    });
                });
                theme::muted(ui, &format!("Source: {}", dataset.source_name));
            });
            ui.add_space(4.0);
        }

        // ── Staged import preview ───────────────────────────────────────────
        if let Some(staged) = &self.import_staging.clone() {
            ui.add_space(8.0);
            widgets::section_header(ui, "Import preview");
            theme::card(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new(&staged.source_name).size(13.5).strong().color(theme::TEXT));
                    theme::badge(ui, &format!("{} tables", staged.tables.len()), theme::AMBER);
                });
                for detected in &staged.detected {
                    theme::muted(ui, detected);
                }
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    widgets::labeled_text(ui, "Dataset name", &mut self.dataset_name, "e.g. Dump Sep 15");
                    if ui.button("💾 Save dataset").clicked() {
                        let name = self.dataset_name.trim().to_string();
                        if name.is_empty() {
                            toasts.push(Toast::new(ToastKind::Error, "Enter a dataset name"));
                        } else {
                            match crate::backend::production::save_production_import(
                                core,
                                name.clone(),
                                staged.clone(),
                            ) {
                                Ok(_) => {
                                    toasts.push(Toast::new(ToastKind::Success, format!("Dataset \"{name}\" saved with an auto dashboard")));
                                    self.import_staging = None;
                                    self.dataset_name.clear();
                                    self.last_refresh = Instant::now() - Duration::from_secs(3600);
                                }
                                Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Save failed: {error}"))),
                            }
                        }
                    }
                    if ui.button("Discard").clicked() {
                        self.import_staging = None;
                    }
                });
            });
        }

        // ── Dataset preview ─────────────────────────────────────────────────
        if let Some(dataset_id) = self.selected.clone() {
            if self.detail.is_none() {
                match crate::backend::production::get_production_dataset(core, dataset_id.clone()) {
                    Ok(dataset) => {
                        if self.preview_table.is_empty() {
                            self.preview_table = dataset
                                .selected_table_id
                                .clone()
                                .or_else(|| dataset.tables.first().map(|t| t.id.clone()))
                                .unwrap_or_default();
                        }
                        self.detail = Some(dataset);
                    }
                    Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Dataset lookup failed: {error}"))),
                }
            }
            if let Some(dataset) = &self.detail {
                ui.add_space(10.0);
                widgets::section_header(ui, "Dataset preview");
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("Sheet").size(13.0).color(theme::MUTED));
                    let table = dataset
                        .tables
                        .iter()
                        .find(|t| t.id == self.preview_table)
                        .map(|t| t.name.clone())
                        .unwrap_or_else(|| "—".to_string());
                    egui::ComboBox::from_id_salt("dataset-table-select")
                        .width(200.0)
                        .selected_text(&table)
                        .show_ui(ui, |ui| {
                            for table in &dataset.tables {
                                let mut choice = self.preview_table.clone();
                                if ui.selectable_value(&mut choice, table.id.clone(), &table.name).changed() {
                                    self.preview_table = choice;
                                }
                            }
                        });
                });
                ui.add_space(4.0);
                if let Some(table) = dataset.tables.iter().find(|t| t.id == self.preview_table) {
                    egui::ScrollArea::both()
                        .max_height(420.0)
                        .show(ui, |ui| {
                            let shown_cols = table.columns.len().min(MAX_PREVIEW_COLS);
                            egui::Grid::new("production-rows-grid")
                                .striped(true)
                                .show(ui, |ui| {
                                    ui.label(egui::RichText::new("#").size(12.0).strong().color(theme::MUTED));
                                    for column in table.columns.iter().take(shown_cols) {
                                        ui.label(
                                            egui::RichText::new(column.label.clone())
                                                .size(12.0)
                                                .strong()
                                                .color(theme::PRIMARY),
                                        );
                                    }
                                    ui.end_row();
                                    for (index, row) in table.rows.iter().take(MAX_PREVIEW_ROWS).enumerate() {
                                        ui.label(
                                            egui::RichText::new((index + 1).to_string())
                                                .size(11.5)
                                                .color(theme::MUTED),
                                        );
                                        for column in table.columns.iter().take(shown_cols) {
                                            let text = match row.get(&column.key) {
                                                Some(serde_json::Value::String(text)) => text.clone(),
                                                Some(serde_json::Value::Number(n)) => n.to_string(),
                                                Some(serde_json::Value::Bool(b)) => b.to_string(),
                                                _ => String::new(),
                                            };
                                            ui.add(
                                                egui::Label::new(
                                                    egui::RichText::new(text).size(11.5).color(theme::TEXT),
                                                )
                                                .truncate(),
                                            );
                                        }
                                        ui.end_row();
                                    }
                                });
                        });
                    let _ = theme::PRIMARY; // keep color import alive in unused branches
                    theme::muted(ui, &format!(
                        "Showing first {} of {} rows · {} columns{}",
                        table.rows.len().min(MAX_PREVIEW_ROWS),
                        table.rows.len(),
                        table.columns.len(),
                        if table.columns.len() > MAX_PREVIEW_COLS { " (columns capped)" } else { "" }
                    ));
                }
            }
        }
    }

    fn start_import(&mut self, toasts: &mut Vec<Toast>) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Production reports", &["xlsx", "xlsm", "xlsb", "xls", "csv", "tsv", "txt"])
            .pick_file()
        else {
            return;
        };
        let filename = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "import.xlsx".to_string());
        match std::fs::read(&path) {
            Ok(bytes) => match crate::backend::production::import_production_file(filename.clone(), bytes) {
                Ok(result) => {
                    self.dataset_name = std::path::Path::new(&filename)
                        .file_stem()
                        .map(|stem| stem.to_string_lossy().to_string())
                        .unwrap_or_else(|| "Imported data".to_string());
                    toasts.push(Toast::new(
                        ToastKind::Info,
                        format!("Parsed {} tables from {} — name and save below", result.tables.len(), filename),
                    ));
                    self.import_staging = Some(result);
                }
                Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Import failed: {error}"))),
            },
            Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Could not read file: {error}"))),
        }
    }

    fn refresh_from_file(&mut self, core: &Arc<AppCore>, dataset_id: &str, toasts: &mut Vec<Toast>) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Production reports", &["xlsx", "xlsm", "xlsb", "xls", "csv", "tsv", "txt"])
            .pick_file()
        else {
            return;
        };
        let filename = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "import.xlsx".to_string());
        match std::fs::read(&path) {
            Ok(bytes) => match crate::backend::production::refresh_production_dataset_from_file(
                core,
                dataset_id.to_string(),
                filename.clone(),
                bytes,
            ) {
                Ok(_) => {
                    toasts.push(Toast::new(ToastKind::Success, format!("Dataset refreshed from {filename}")));
                    self.detail = None;
                    self.last_refresh = Instant::now() - Duration::from_secs(3600);
                }
                Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Refresh failed: {error}"))),
            },
            Err(error) => toasts.push(Toast::new(ToastKind::Error, format!("Could not read file: {error}"))),
        }
    }

    fn refresh(&mut self, core: &Arc<AppCore>) {
        if let Ok(datasets) = crate::backend::production::get_production_datasets(core) {
            self.datasets = datasets;
            if let Some(selected) = &self.selected {
                if !self.datasets.iter().any(|d| &d.id == selected) {
                    self.selected = None;
                    self.detail = None;
                }
            }
        }
    }
}
