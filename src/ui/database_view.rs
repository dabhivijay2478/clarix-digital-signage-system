use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::app::{Toast, ToastKind};
use crate::state::AppCore;
use crate::theme;
use crate::ui::widgets;

const MAX_PREVIEW_ROWS: usize = 200;

pub struct DatabasePage {
    tables: Vec<String>,
    selected: Option<String>,
    columns: Vec<String>,
    rows: Vec<serde_json::Map<String, serde_json::Value>>,
    error: Option<String>,
    last_refresh: Instant,
    loaded_once: bool,
}

impl Default for DatabasePage {
    fn default() -> Self {
        Self {
            tables: Vec::new(),
            selected: None,
            columns: Vec::new(),
            rows: Vec::new(),
            error: None,
            last_refresh: Instant::now() - Duration::from_secs(3600),
            loaded_once: false,
        }
    }
}

fn cell_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => String::new(),
        serde_json::Value::Bool(b) => {
            if *b {
                "✓".to_string()
            } else {
                "".to_string()
            }
        }
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

impl DatabasePage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_secs(6)) || !self.loaded_once {
            self.last_refresh = Instant::now();
            self.loaded_once = true;
            self.refresh_tables(core);
        }

        theme::heading(ui, "Database console");
        theme::muted(
            ui,
            &format!(
                "SQLite library at {} — read-only view with CSV export.",
                core.config_dir.join("clarix.db").display()
            ),
        );
        ui.add_space(10.0);

        theme::card(ui, |ui| {
            ui.horizontal_wrapped(|ui| {
                ui.label(
                    egui::RichText::new("Table")
                        .size(13.0)
                        .color(theme::tokens(ui).muted),
                );
                let selected_label = self.selected.clone().unwrap_or_else(|| "—".to_string());
                egui::ComboBox::from_id_salt("db-table-select")
                    .width(220.0)
                    .selected_text(&selected_label)
                    .show_ui(ui, |ui| {
                        for table in &self.tables {
                            ui.selectable_value(
                                &mut self.selected,
                                Some(table.clone()),
                                table.clone(),
                            );
                        }
                    });
                if ui.button("Reload").clicked() {
                    self.last_refresh = Instant::now() - Duration::from_secs(3600);
                }

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button(" Export CSV").clicked() {
                        self.export_csv(core, toasts);
                    }
                    if ui.button(" Backup media ZIP").clicked() {
                        self.backup_zip(core, toasts);
                    }
                });
            });

            if let Some(error) = &self.error {
                ui.label(
                    egui::RichText::new(error)
                        .size(12.5)
                        .color(theme::tokens(ui).red),
                );
            }
        });
        ui.add_space(8.0);

        if let Some(table) = self.selected.clone() {
            widgets::section_header(
                ui,
                &format!(
                    "{table} — {} rows{}",
                    self.rows.len(),
                    if self.rows.len() > MAX_PREVIEW_ROWS {
                        " (preview capped)"
                    } else {
                        ""
                    }
                ),
            );

            let columns = self.columns.clone();
            egui::ScrollArea::horizontal()
                .max_height(520.0)
                .show(ui, |ui| {
                    let grid = egui::Grid::new("db-table-grid")
                        .num_columns(columns.len().saturating_add(1).max(1))
                        .striped(true);
                    grid.show(ui, |ui| {
                        ui.label(
                            egui::RichText::new("#")
                                .size(12.0)
                                .strong()
                                .color(theme::tokens(ui).muted),
                        );
                        for column in &columns {
                            ui.label(
                                egui::RichText::new(column.clone())
                                    .size(12.0)
                                    .strong()
                                    .color(theme::tokens(ui).primary),
                            );
                        }
                        ui.end_row();

                        for (index, row) in self.rows.iter().take(MAX_PREVIEW_ROWS).enumerate() {
                            ui.label(
                                egui::RichText::new((index + 1).to_string())
                                    .size(11.5)
                                    .color(theme::tokens(ui).muted),
                            );
                            for column in &columns {
                                let text = row.get(column).map(cell_text).unwrap_or_default();
                                ui.add(
                                    egui::Label::new(
                                        egui::RichText::new(text)
                                            .size(11.5)
                                            .color(theme::tokens(ui).text),
                                    )
                                    .truncate(),
                                );
                            }
                            ui.end_row();
                        }
                    });
                });
        } else {
            widgets::empty_state(ui, "Pick a table to inspect its rows.");
        }
    }

    fn refresh_tables(&mut self, core: &Arc<AppCore>) {
        match crate::backend::database::get_db_tables(core) {
            Ok(tables) => {
                self.tables = tables;
                if self.selected.is_none() {
                    self.selected = self.tables.first().cloned();
                }
                self.load_selected(core);
            }
            Err(error) => {
                self.error = Some(error);
            }
        }
    }

    fn load_selected(&mut self, core: &Arc<AppCore>) {
        self.error = None;
        self.columns = Vec::new();
        self.rows = Vec::new();
        let Some(table) = self.selected.clone() else {
            return;
        };
        match crate::backend::database::get_db_table_data(core, table) {
            Ok(data) => {
                if let Some(array) = data.get("columns").and_then(|c| c.as_array()) {
                    self.columns = array
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                }
                if let Some(array) = data.get("rows").and_then(|r| r.as_array()) {
                    self.rows = array
                        .iter()
                        .filter_map(|v| v.as_object().cloned())
                        .collect();
                }
            }
            Err(error) => self.error = Some(error),
        }
    }

    fn export_csv(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let Some(table) = self.selected.clone() else {
            toasts.push(Toast::new(ToastKind::Error, "Pick a table first"));
            return;
        };
        let Some(path) = rfd::FileDialog::new()
            .add_filter("CSV file", &["csv"])
            .set_file_name(format!("{table}.csv"))
            .save_file()
        else {
            return;
        };
        match crate::backend::database::export_db_table_to_csv(core, table.clone()) {
            Ok(csv_text) => match crate::backend::database::save_text_file(
                path.to_string_lossy().to_string(),
                csv_text,
            ) {
                Ok(()) => toasts.push(Toast::new(
                    ToastKind::Success,
                    format!("Exported {table} rows to CSV"),
                )),
                Err(error) => toasts.push(Toast::new(
                    ToastKind::Error,
                    format!("Write failed: {error}"),
                )),
            },
            Err(error) => toasts.push(Toast::new(
                ToastKind::Error,
                format!("Export failed: {error}"),
            )),
        }
    }

    fn backup_zip(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("ZIP archive", &["zip"])
            .set_file_name("clarix-content-backup.zip")
            .save_file()
        else {
            return;
        };
        match crate::backend::database::backup_content_library_to_zip(
            core,
            path.to_string_lossy().to_string(),
        ) {
            Ok(()) => toasts.push(Toast::new(
                ToastKind::Success,
                "Content library backup saved",
            )),
            Err(error) => toasts.push(Toast::new(
                ToastKind::Error,
                format!("Backup failed: {error}"),
            )),
        }
    }
}
