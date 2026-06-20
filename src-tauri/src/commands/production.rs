use std::{collections::{HashMap, HashSet}, fs, path::PathBuf};

use calamine::{open_workbook_auto, Data, Reader};
use chrono::Utc;
use csv::ReaderBuilder;
use rusqlite::{params, OptionalExtension};
use tauri::State;

use crate::{
    db::DbPool,
    models::{
        ContentItem, ContentType, ProductionColumn, ProductionDashboard, ProductionDashboardBundle,
        ProductionDataset, ProductionDatasetSummary, ProductionImportResult, ProductionTable,
        ProductionWidget,
    },
};

type RowMap = serde_json::Map<String, serde_json::Value>;

#[tauri::command]
pub async fn import_production_file(
    filename: String,
    bytes: Vec<u8>,
) -> Result<ProductionImportResult, String> {
    tokio::task::spawn_blocking(move || parse_import(filename, bytes))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_production_import(
    name: String,
    import_result: ProductionImportResult,
    pool: State<'_, DbPool>,
) -> Result<ProductionDashboardBundle, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let now = Utc::now();
        let dataset_id = uuid::Uuid::new_v4().to_string();
        let dashboard_id = uuid::Uuid::new_v4().to_string();
        let selected_table_id = choose_default_table(&import_result.tables).map(|table| table.id.clone());
        let widgets = default_widgets(&import_result.tables);
        let dataset = ProductionDataset {
            id: dataset_id.clone(),
            name: name.trim().to_string(),
            source_name: import_result.source_name,
            selected_table_id,
            tables: import_result.tables,
            created_at: now,
            updated_at: now,
        };
        let dashboard = ProductionDashboard {
            id: dashboard_id,
            name: format!("{} Dashboard", dataset.name),
            dataset_id: dataset.id.clone(),
            widgets,
            layout: serde_json::json!({ "columns": 12 }),
            created_at: now,
            updated_at: now,
        };

        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO production_datasets
             (id, name, source_name, selected_table_id, tables_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &dataset.id,
                &dataset.name,
                &dataset.source_name,
                &dataset.selected_table_id,
                serde_json::to_string(&dataset.tables)?,
                dataset.created_at.to_rfc3339(),
                dataset.updated_at.to_rfc3339(),
            ],
        )?;
        conn.execute(
            "INSERT INTO production_dashboards
             (id, name, dataset_id, widgets_json, layout_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &dashboard.id,
                &dashboard.name,
                &dashboard.dataset_id,
                serde_json::to_string(&dashboard.widgets)?,
                serde_json::to_string(&dashboard.layout)?,
                dashboard.created_at.to_rfc3339(),
                dashboard.updated_at.to_rfc3339(),
            ],
        )?;
        Ok::<_, anyhow::Error>(ProductionDashboardBundle { dashboard, dataset })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_production_datasets(
    pool: State<'_, DbPool>,
) -> Result<Vec<ProductionDatasetSummary>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || query_dataset_summaries(&pool))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_production_dataset(
    id: String,
    pool: State<'_, DbPool>,
) -> Result<ProductionDataset, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || query_dataset(&pool, &id))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Production dataset not found".to_string())
}

#[tauri::command]
pub async fn get_production_dashboards(
    pool: State<'_, DbPool>,
) -> Result<Vec<ProductionDashboard>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || query_dashboards(&pool))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_production_dashboard(
    id: String,
    pool: State<'_, DbPool>,
) -> Result<ProductionDashboardBundle, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || query_dashboard_bundle(&pool, &id))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Production dashboard not found".to_string())
}

#[tauri::command]
pub async fn update_production_table_rows(
    dataset_id: String,
    table_id: String,
    rows: Vec<RowMap>,
    pool: State<'_, DbPool>,
) -> Result<ProductionDataset, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut dataset = query_dataset(&pool, &dataset_id)?
            .ok_or_else(|| anyhow::anyhow!("Production dataset not found"))?;
        let table = dataset
            .tables
            .iter_mut()
            .find(|table| table.id == table_id)
            .ok_or_else(|| anyhow::anyhow!("Production table not found"))?;
        table.rows = rows;
        table.columns = infer_columns_from_rows(&table.rows, Some(&table.columns));
        dataset.updated_at = Utc::now();

        let conn = pool.get()?;
        conn.execute(
            "UPDATE production_datasets SET tables_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![
                serde_json::to_string(&dataset.tables)?,
                dataset.updated_at.to_rfc3339(),
                dataset.id,
            ],
        )?;
        Ok::<_, anyhow::Error>(dataset)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_production_dataset(
    dataset: ProductionDataset,
    pool: State<'_, DbPool>,
) -> Result<ProductionDataset, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut updated = dataset;
        updated.updated_at = Utc::now();
        let selected_exists = updated
            .selected_table_id
            .as_deref()
            .map(|id| updated.tables.iter().any(|table| table.id == id))
            .unwrap_or(false);
        if !selected_exists {
            updated.selected_table_id = updated.tables.first().map(|table| table.id.clone());
        }
        let conn = pool.get()?;
        conn.execute(
            "UPDATE production_datasets
             SET name = ?1, source_name = ?2, selected_table_id = ?3, tables_json = ?4, updated_at = ?5
             WHERE id = ?6",
            params![
                &updated.name,
                &updated.source_name,
                &updated.selected_table_id,
                serde_json::to_string(&updated.tables)?,
                updated.updated_at.to_rfc3339(),
                &updated.id,
            ],
        )?;
        Ok::<_, anyhow::Error>(updated)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_production_dashboard(
    dashboard: ProductionDashboard,
    pool: State<'_, DbPool>,
) -> Result<ProductionDashboard, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut updated = dashboard;
        updated.updated_at = Utc::now();
        let conn = pool.get()?;
        conn.execute(
            "UPDATE production_dashboards
             SET name = ?1, widgets_json = ?2, layout_json = ?3, updated_at = ?4
             WHERE id = ?5",
            params![
                &updated.name,
                serde_json::to_string(&updated.widgets)?,
                serde_json::to_string(&updated.layout)?,
                updated.updated_at.to_rfc3339(),
                &updated.id,
            ],
        )?;
        Ok::<_, anyhow::Error>(updated)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_production_dashboard(
    id: String,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        delete_dashboard_content_shortcuts(&tx, &[id.clone()])?;
        tx.execute("DELETE FROM production_dashboards WHERE id = ?1", params![id])?;
        tx.commit()?;
        Ok::<_, anyhow::Error>(())
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_production_dataset(
    id: String,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let dashboard_ids = {
            let mut stmt = tx.prepare("SELECT id FROM production_dashboards WHERE dataset_id = ?1")?;
            let dashboard_ids = stmt.query_map(params![&id], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            dashboard_ids
        };
        delete_dashboard_content_shortcuts(&tx, &dashboard_ids)?;
        tx.execute("DELETE FROM production_dashboards WHERE dataset_id = ?1", params![&id])?;
        tx.execute("DELETE FROM production_datasets WHERE id = ?1", params![id])?;
        tx.commit()?;
        Ok::<_, anyhow::Error>(())
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn add_production_dashboard_to_content(
    dashboard_id: String,
    duration_secs: u32,
    pool: State<'_, DbPool>,
) -> Result<ContentItem, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let bundle = query_dashboard_bundle(&pool, &dashboard_id)?
            .ok_or_else(|| anyhow::anyhow!("Production dashboard not found"))?;
        let now = Utc::now();
        let id = uuid::Uuid::new_v4().to_string();
        let tags = vec![
            "production-data".to_string(),
            "dashboard".to_string(),
            slugify(&bundle.dataset.source_name),
        ];
        let item = ContentItem {
            id,
            name: bundle.dashboard.name,
            content_type: ContentType::WebApp,
            file_path: None,
            url: Some(format!("/production-data/view?id={}", bundle.dashboard.id)),
            duration_secs,
            tags,
            created_at: now,
        };
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO content_items (id, name, content_type, file_path, url, duration_secs, tags, created_at)
             VALUES (?1, ?2, 'WebApp', NULL, ?3, ?4, ?5, ?6)",
            params![
                &item.id,
                &item.name,
                &item.url,
                item.duration_secs,
                serde_json::to_string(&item.tags)?,
                item.created_at.to_rfc3339(),
            ],
        )?;
        Ok::<_, anyhow::Error>(item)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

fn delete_dashboard_content_shortcuts(
    tx: &rusqlite::Transaction<'_>,
    dashboard_ids: &[String],
) -> anyhow::Result<()> {
    for dashboard_id in dashboard_ids {
        let url = format!("/production-data/view?id={dashboard_id}");
        let content_ids = {
            let mut stmt = tx.prepare("SELECT id FROM content_items WHERE url = ?1")?;
            let rows = stmt.query_map(params![&url], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        for content_id in content_ids {
            tx.execute("DELETE FROM playlist_items WHERE content_id = ?1", params![content_id])?;
        }
        tx.execute("DELETE FROM content_items WHERE url = ?1", params![url])?;
    }
    Ok(())
}

pub fn query_dataset_summaries(pool: &DbPool) -> anyhow::Result<Vec<ProductionDatasetSummary>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, source_name, selected_table_id, tables_json, created_at, updated_at
         FROM production_datasets ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], dataset_summary_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn query_dashboards(pool: &DbPool) -> anyhow::Result<Vec<ProductionDashboard>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, dataset_id, widgets_json, layout_json, created_at, updated_at
         FROM production_dashboards ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], dashboard_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn query_dataset(pool: &DbPool, id: &str) -> anyhow::Result<Option<ProductionDataset>> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT id, name, source_name, selected_table_id, tables_json, created_at, updated_at
         FROM production_datasets WHERE id = ?1",
        params![id],
        dataset_from_row,
    )
    .optional()
    .map_err(Into::into)
}

pub fn query_dashboard_bundle(pool: &DbPool, id: &str) -> anyhow::Result<Option<ProductionDashboardBundle>> {
    let conn = pool.get()?;
    let dashboard = conn
        .query_row(
            "SELECT id, name, dataset_id, widgets_json, layout_json, created_at, updated_at
             FROM production_dashboards WHERE id = ?1",
            params![id],
            dashboard_from_row,
        )
        .optional()?;
    let Some(dashboard) = dashboard else { return Ok(None) };
    let dataset = query_dataset(pool, &dashboard.dataset_id)?
        .ok_or_else(|| anyhow::anyhow!("Dashboard dataset is missing"))?;
    Ok(Some(ProductionDashboardBundle { dashboard, dataset }))
}

fn parse_import(filename: String, bytes: Vec<u8>) -> anyhow::Result<ProductionImportResult> {
    let extension = filename.rsplit('.').next().unwrap_or_default().to_ascii_lowercase();
    match extension.as_str() {
        "csv" | "tsv" | "txt" => parse_delimited(filename, bytes, extension == "tsv"),
        "xlsx" | "xlsm" | "xlsb" | "xls" => parse_excel(filename, bytes),
        _ => anyhow::bail!("Unsupported file type. Upload an Excel, CSV, or TSV file."),
    }
}

fn parse_excel(filename: String, bytes: Vec<u8>) -> anyhow::Result<ProductionImportResult> {
    let path = write_temp_import(&filename, &bytes)?;
    let result = parse_excel_path(filename, &path);
    let _ = fs::remove_file(&path);
    result
}

fn parse_excel_path(filename: String, path: &PathBuf) -> anyhow::Result<ProductionImportResult> {
    let mut workbook = open_workbook_auto(path)?;
    let mut tables = Vec::new();
    let mut detected = Vec::new();
    for sheet_name in workbook.sheet_names().to_owned() {
        let Ok(range) = workbook.worksheet_range(&sheet_name) else { continue };
        let matrix: Vec<Vec<serde_json::Value>> = range
            .rows()
            .map(|row| row.iter().map(cell_to_value).collect())
            .collect();
        if matrix.iter().all(|row| row.iter().all(is_empty_value)) {
            continue;
        }
        if sheet_name.eq_ignore_ascii_case("summary") {
            if let Some(table) = detect_summary_trend(&sheet_name, &matrix) {
                detected.push("Detected Summary trend table with Date, FSL1, PSL1, and PSL2.".to_string());
                tables.push(table);
            }
            if let Some(table) = detect_summary_kpi(&sheet_name, &matrix) {
                detected.push("Detected Summary KPI table with Lines, ABP, Plan, Actual, Production Rate, Asking Rate, and Forecast.".to_string());
                tables.push(table);
            }
        }
        if let Some(table) = table_from_matrix(&sheet_name, &sheet_name, "raw", &matrix) {
            if sheet_name.eq_ignore_ascii_case("dump") {
                detected.push(format!("Detected raw Dump table with {} rows.", table.rows.len()));
            }
            tables.push(table);
        }
    }
    if tables.is_empty() {
        anyhow::bail!("No usable data tables were found in this workbook.");
    }
    Ok(ProductionImportResult { source_name: filename, tables, detected })
}

fn parse_delimited(filename: String, bytes: Vec<u8>, tsv: bool) -> anyhow::Result<ProductionImportResult> {
    let delimiter = if tsv { b'\t' } else { b',' };
    let mut reader = ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_reader(bytes.as_slice());
    let headers = reader.headers()?.iter().map(|value| serde_json::Value::String(value.to_string())).collect::<Vec<_>>();
    let mut matrix = vec![headers];
    for record in reader.records() {
        let record = record?;
        matrix.push(record.iter().map(parse_text_value).collect());
    }
    let table = table_from_matrix("Imported Data", "Imported Data", "raw", &matrix)
        .ok_or_else(|| anyhow::anyhow!("No usable rows were found in this file."))?;
    Ok(ProductionImportResult {
        source_name: filename,
        tables: vec![table],
        detected: vec!["Detected CSV/TSV table from the first row headers.".to_string()],
    })
}

fn write_temp_import(filename: &str, bytes: &[u8]) -> anyhow::Result<PathBuf> {
    let safe = std::path::Path::new(filename)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("production-import.xlsx");
    let path = std::env::temp_dir().join(format!("clarix-{}-{safe}", uuid::Uuid::new_v4()));
    fs::write(&path, bytes)?;
    Ok(path)
}

fn detect_summary_trend(sheet_name: &str, matrix: &[Vec<serde_json::Value>]) -> Option<ProductionTable> {
    let header_index = matrix.iter().position(|row| {
        row.iter().any(|value| string_value(value).eq_ignore_ascii_case("FSL1"))
            && row.iter().any(|value| string_value(value).eq_ignore_ascii_case("PSL1"))
            && row.iter().any(|value| string_value(value).eq_ignore_ascii_case("PSL2"))
    })?;
    let headers = &matrix[header_index];
    let mut indices = vec![0usize];
    for label in ["FSL1", "PSL1", "PSL2"] {
        let index = headers.iter().position(|value| string_value(value).eq_ignore_ascii_case(label))?;
        indices.push(index);
    }
    let columns = vec![
        ProductionColumn { key: "date".to_string(), label: "Date".to_string(), data_type: "date".to_string() },
        ProductionColumn { key: "FSL1".to_string(), label: "FSL1".to_string(), data_type: "number".to_string() },
        ProductionColumn { key: "PSL1".to_string(), label: "PSL1".to_string(), data_type: "number".to_string() },
        ProductionColumn { key: "PSL2".to_string(), label: "PSL2".to_string(), data_type: "number".to_string() },
    ];
    let mut rows = Vec::new();
    for row in matrix.iter().skip(header_index + 1) {
        let label = row.get(indices[0]).map(string_value).unwrap_or_default();
        if label.is_empty() || label.eq_ignore_ascii_case("total") {
            break;
        }
        let mut item = RowMap::new();
        for (column, index) in columns.iter().zip(indices.iter()) {
            item.insert(column.key.clone(), row.get(*index).cloned().unwrap_or(serde_json::Value::Null));
        }
        rows.push(item);
    }
    if rows.is_empty() { return None; }
    Some(ProductionTable {
        id: "summary-trend".to_string(),
        name: "Production Trend".to_string(),
        sheet_name: sheet_name.to_string(),
        kind: "trend".to_string(),
        columns,
        rows,
    })
}

fn detect_summary_kpi(sheet_name: &str, matrix: &[Vec<serde_json::Value>]) -> Option<ProductionTable> {
    let header_index = matrix.iter().position(|row| {
        row.iter().any(|value| string_value(value).eq_ignore_ascii_case("Lines"))
            && row.iter().any(|value| string_value(value).eq_ignore_ascii_case("Forecast"))
    })?;
    let header_row = &matrix[header_index];
    let mut headers = Vec::new();
    let mut indices = Vec::new();
    for (index, value) in header_row.iter().enumerate() {
        let label = string_value(value);
        if label.is_empty() { continue; }
        if ["Lines", "ABP", "Plan", "Actual", "Production Rate", "Asking Rate", "Forecast"].iter().any(|expected| label.eq_ignore_ascii_case(expected)) {
            headers.push(label);
            indices.push(index);
        }
    }
    if headers.len() < 4 { return None; }
    let columns = columns_from_headers(&headers, Some(&["line"]));
    let mut rows = Vec::new();
    for row in matrix.iter().skip(header_index + 1) {
        let first = row.get(indices[0]).map(string_value).unwrap_or_default();
        if first.is_empty() { break; }
        let mut item = RowMap::new();
        for (column, index) in columns.iter().zip(indices.iter()) {
            item.insert(column.key.clone(), row.get(*index).cloned().unwrap_or(serde_json::Value::Null));
        }
        rows.push(item);
        if first.eq_ignore_ascii_case("Total") { break; }
    }
    if rows.is_empty() { return None; }
    Some(ProductionTable {
        id: "summary-kpi".to_string(),
        name: "Production Summary".to_string(),
        sheet_name: sheet_name.to_string(),
        kind: "kpi".to_string(),
        columns: infer_columns_from_rows(&rows, Some(&columns)),
        rows,
    })
}

fn table_from_matrix(id_seed: &str, sheet_name: &str, kind: &str, matrix: &[Vec<serde_json::Value>]) -> Option<ProductionTable> {
    let header_index = matrix.iter().position(|row| row.iter().filter(|value| !is_empty_value(value)).count() >= 2)?;
    let headers = matrix[header_index].iter().map(string_value).collect::<Vec<_>>();
    let columns = columns_from_headers(&headers, None);
    if columns.len() < 2 { return None; }
    let mut rows = Vec::new();
    for row in matrix.iter().skip(header_index + 1) {
        if row.iter().all(is_empty_value) { continue; }
        let mut item = RowMap::new();
        for (index, column) in columns.iter().enumerate() {
            item.insert(column.key.clone(), row.get(index).cloned().unwrap_or(serde_json::Value::Null));
        }
        if item.values().any(|value| !is_empty_value(value)) {
            rows.push(item);
        }
    }
    if rows.is_empty() { return None; }
    let table_id = slugify(id_seed);
    Some(ProductionTable {
        id: if table_id.is_empty() { "imported-data".to_string() } else { table_id },
        name: sheet_name.to_string(),
        sheet_name: sheet_name.to_string(),
        kind: kind.to_string(),
        columns: infer_columns_from_rows(&rows, Some(&columns)),
        rows,
    })
}

fn columns_from_headers(headers: &[String], first_key_override: Option<&[&str]>) -> Vec<ProductionColumn> {
    let mut seen = HashSet::new();
    headers
        .iter()
        .enumerate()
        .filter_map(|(index, label)| {
            let clean = label.trim();
            if clean.is_empty() { return None; }
            let base = first_key_override
                .and_then(|values| values.get(index).copied())
                .map(str::to_string)
                .unwrap_or_else(|| slugify(clean));
            let key = unique_key(if base.is_empty() { format!("column_{}", index + 1) } else { base }, &mut seen);
            Some(ProductionColumn { key, label: clean.to_string(), data_type: "text".to_string() })
        })
        .collect()
}

fn infer_columns_from_rows(rows: &[RowMap], existing: Option<&[ProductionColumn]>) -> Vec<ProductionColumn> {
    let mut labels: HashMap<String, String> = HashMap::new();
    let mut ordered = Vec::new();
    if let Some(existing) = existing {
        for column in existing {
            labels.insert(column.key.clone(), column.label.clone());
            ordered.push(column.key.clone());
        }
    }
    for row in rows {
        for key in row.keys() {
            if !labels.contains_key(key) {
                labels.insert(key.clone(), key.clone());
                ordered.push(key.clone());
            }
        }
    }
    ordered
        .into_iter()
        .map(|key| {
            let values = rows.iter().filter_map(|row| row.get(&key)).collect::<Vec<_>>();
            ProductionColumn {
                label: labels.remove(&key).unwrap_or_else(|| key.clone()),
                data_type: infer_data_type(&key, &values),
                key,
            }
        })
        .collect()
}

fn infer_data_type(key: &str, values: &[&serde_json::Value]) -> String {
    if key.contains("date") || key == "date" {
        return "date".to_string();
    }
    let non_empty = values.iter().filter(|value| !is_empty_value(value)).collect::<Vec<_>>();
    if !non_empty.is_empty() && non_empty.iter().all(|value| value.is_number()) {
        return "number".to_string();
    }
    "text".to_string()
}

fn cell_to_value(cell: &Data) -> serde_json::Value {
    match cell {
        Data::Empty => serde_json::Value::Null,
        Data::String(value) => parse_text_value(value),
        Data::Float(value) => number_value(*value),
        Data::Int(value) => serde_json::json!(value),
        Data::Bool(value) => serde_json::json!(value),
        Data::DateTime(value) => serde_json::Value::String(value.to_string()),
        Data::DateTimeIso(value) => serde_json::Value::String(value.clone()),
        Data::DurationIso(value) => serde_json::Value::String(value.clone()),
        Data::Error(value) => serde_json::Value::String(value.to_string()),
    }
}

fn parse_text_value(value: &str) -> serde_json::Value {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        serde_json::Value::Null
    } else if let Ok(integer) = trimmed.parse::<i64>() {
        serde_json::json!(integer)
    } else if let Ok(number) = trimmed.replace(',', "").parse::<f64>() {
        number_value(number)
    } else {
        serde_json::Value::String(trimmed.to_string())
    }
}

fn number_value(value: f64) -> serde_json::Value {
    serde_json::Number::from_f64(value)
        .map(serde_json::Value::Number)
        .unwrap_or(serde_json::Value::Null)
}

fn string_value(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(value) => value.trim().to_string(),
        serde_json::Value::Number(value) => value.to_string(),
        serde_json::Value::Bool(value) => value.to_string(),
        _ => String::new(),
    }
}

fn is_empty_value(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Null => true,
        serde_json::Value::String(value) => value.trim().is_empty(),
        _ => false,
    }
}

fn choose_default_table(tables: &[ProductionTable]) -> Option<&ProductionTable> {
    tables
        .iter()
        .find(|table| table.kind == "trend")
        .or_else(|| tables.iter().find(|table| table.kind == "raw"))
        .or_else(|| tables.first())
}

fn default_widgets(tables: &[ProductionTable]) -> Vec<ProductionWidget> {
    let mut widgets = Vec::new();
    if let Some(kpi) = tables.iter().find(|table| table.kind == "kpi") {
        widgets.push(ProductionWidget {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Production Summary".to_string(),
            widget_type: "table".to_string(),
            chart_type: "kpi-table".to_string(),
            source_table_id: kpi.id.clone(),
            x_key: None,
            series_keys: Vec::new(),
            measure_key: None,
            group_by_key: None,
            aggregation: "sum".to_string(),
            filters: Vec::new(),
            top_n: None,
            color_map: HashMap::new(),
        });
    }
    if let Some(trend) = tables.iter().find(|table| table.kind == "trend") {
        widgets.push(ProductionWidget {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Production trend Jun'26(MT)".to_string(),
            widget_type: "chart".to_string(),
            chart_type: "line".to_string(),
            source_table_id: trend.id.clone(),
            x_key: Some("date".to_string()),
            series_keys: trend
                .columns
                .iter()
                .filter(|column| column.data_type == "number")
                .map(|column| column.key.clone())
                .collect(),
            measure_key: None,
            group_by_key: None,
            aggregation: "sum".to_string(),
            filters: Vec::new(),
            top_n: None,
            color_map: default_color_map(&trend.columns),
        });
    }
    if widgets.is_empty() {
        if let Some(table) = choose_default_table(tables) {
            widgets.push(ProductionWidget {
                id: uuid::Uuid::new_v4().to_string(),
                title: table.name.clone(),
                widget_type: "table".to_string(),
                chart_type: "kpi-table".to_string(),
                source_table_id: table.id.clone(),
                x_key: None,
                series_keys: Vec::new(),
                measure_key: None,
                group_by_key: None,
                aggregation: "sum".to_string(),
                filters: Vec::new(),
                top_n: None,
                color_map: HashMap::new(),
            });
        }
    }
    widgets
}

fn default_color_map(columns: &[ProductionColumn]) -> HashMap<String, String> {
    let palette = ["#007fff", "#f97316", "#00a859", "#8a2be2", "#f59e0b"];
    columns
        .iter()
        .filter(|column| column.data_type == "number")
        .enumerate()
        .map(|(index, column)| (column.key.clone(), palette[index % palette.len()].to_string()))
        .collect()
}

fn dataset_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProductionDataset> {
    let tables_json: String = row.get(4)?;
    let created_at: String = row.get(5)?;
    let updated_at: String = row.get(6)?;
    Ok(ProductionDataset {
        id: row.get(0)?,
        name: row.get(1)?,
        source_name: row.get(2)?,
        selected_table_id: row.get(3)?,
        tables: serde_json::from_str(&tables_json).unwrap_or_default(),
        created_at: parse_date(&created_at),
        updated_at: parse_date(&updated_at),
    })
}

fn dataset_summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProductionDatasetSummary> {
    let tables_json: String = row.get(4)?;
    let tables: Vec<ProductionTable> = serde_json::from_str(&tables_json).unwrap_or_default();
    let created_at: String = row.get(5)?;
    let updated_at: String = row.get(6)?;
    Ok(ProductionDatasetSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        source_name: row.get(2)?,
        selected_table_id: row.get(3)?,
        table_count: tables.len(),
        row_count: tables.iter().map(|table| table.rows.len()).max().unwrap_or(0),
        created_at: parse_date(&created_at),
        updated_at: parse_date(&updated_at),
    })
}

fn dashboard_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProductionDashboard> {
    let widgets_json: String = row.get(3)?;
    let layout_json: String = row.get(4)?;
    let created_at: String = row.get(5)?;
    let updated_at: String = row.get(6)?;
    Ok(ProductionDashboard {
        id: row.get(0)?,
        name: row.get(1)?,
        dataset_id: row.get(2)?,
        widgets: serde_json::from_str(&widgets_json).unwrap_or_default(),
        layout: serde_json::from_str(&layout_json).unwrap_or_else(|_| serde_json::json!({})),
        created_at: parse_date(&created_at),
        updated_at: parse_date(&updated_at),
    })
}

fn parse_date(value: &str) -> chrono::DateTime<Utc> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

fn unique_key(base: String, seen: &mut HashSet<String>) -> String {
    if !seen.contains(&base) {
        seen.insert(base.clone());
        return base;
    }
    let mut counter = 2;
    loop {
        let candidate = format!("{base}_{counter}");
        if !seen.contains(&candidate) {
            seen.insert(candidate.clone());
            return candidate;
        }
        counter += 1;
    }
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash && !slug.is_empty() {
            slug.push('_');
            previous_dash = true;
        }
    }
    slug.trim_matches('_').to_string()
}

#[cfg(test)]
mod tests {
    use super::{detect_summary_kpi, detect_summary_trend};
    use serde_json::json;

    #[test]
    fn detects_summary_trend_rows() {
        let matrix = vec![
            vec![json!(null), json!("Production(MT)")],
            vec![json!(null), json!("FSL1"), json!("PSL1"), json!("PSL2")],
            vec![json!("2026-06-01"), json!(10), json!(20), json!(30)],
            vec![json!("Total"), json!(10), json!(20), json!(30)],
        ];
        let table = detect_summary_trend("Summary", &matrix).expect("trend table");
        assert_eq!(table.rows.len(), 1);
        assert_eq!(table.columns[0].key, "date");
    }

    #[test]
    fn detects_summary_kpi_rows() {
        let matrix = vec![
            vec![json!(null)],
            vec![json!(null), json!("Lines"), json!("ABP"), json!("Plan"), json!("Forecast")],
            vec![json!(null), json!("FSL1"), json!(1), json!(2), json!(3)],
            vec![json!(null), json!("Total"), json!(1), json!(2), json!(3)],
        ];
        let table = detect_summary_kpi("Summary", &matrix).expect("kpi table");
        assert_eq!(table.rows.len(), 2);
        assert_eq!(table.columns[0].key, "line");
    }
}
