use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, SecondsFormat, Utc};

use crate::app::{Toast, ToastKind};
use crate::models::{ActiveTruck, TruckDispatchSummary, TruckScreenAlert};
use crate::state::{AppCore, GateConfig};
use crate::theme;
use crate::ui::widgets;

pub const DEFAULT_GATE_LOADING_MINS: u32 = 30;
pub const GATE_LOADING_CAPACITY: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TruckField {
    Waiting,
    Loading,
    Out,
}

/// (status key, label) — mirrors `lib/truck-alerts.ts`.
fn truck_status(truck: &ActiveTruck) -> (&'static str, &'static str) {
    if truck.is_out {
        ("out", "Loading Out.")
    } else if truck.is_loading || truck.is_in {
        ("loading", "Loading in.")
    } else if truck.is_waiting {
        ("waiting", "Waiting")
    } else {
        ("registered", "Registered")
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn parse_iso(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .ok()
}

/// Status field transition with cascade — ported from the previous zustand
/// `updateTruckChecks`; timestamps follow the same rules (waiting⇄loading share
/// both timestamps; unchecking cascades later flags off).
fn apply_status_field(truck: &mut ActiveTruck, field: TruckField, value: bool, timestamp: &str) {
    match field {
        TruckField::Waiting => truck.is_waiting = value,
        // `is_loading` and `is_in` are one concept (both timestamps set together).
        TruckField::Loading => {
            truck.is_loading = value;
            truck.is_in = value;
        }
        TruckField::Out => truck.is_out = value,
    }

    if value {
        match field {
            TruckField::Waiting => truck.waiting_at = Some(timestamp.to_string()),
            TruckField::Loading => {
                truck.loading_at = Some(timestamp.to_string());
                truck.in_at = Some(timestamp.to_string());
            }
            TruckField::Out => {
                truck.out_at = Some(timestamp.to_string());
                if let Some(start) = truck.loading_at.as_deref().and_then(parse_iso) {
                    if let Ok(end) = DateTime::parse_from_rfc3339(timestamp) {
                        let secs = end.signed_duration_since(start).num_seconds().max(0);
                        truck.loading_duration = Some(secs);
                    }
                }
            }
        }
    } else {
        match field {
            TruckField::Waiting => {
                truck.waiting_at = None;
                truck.is_loading = false;
                truck.loading_at = None;
                truck.is_in = false;
                truck.in_at = None;
                truck.is_out = false;
                truck.out_at = None;
                truck.loading_duration = None;
            }
            TruckField::Loading => {
                truck.is_loading = false;
                truck.loading_at = None;
                truck.is_in = false;
                truck.in_at = None;
                truck.is_out = false;
                truck.out_at = None;
                truck.loading_duration = None;
            }
            TruckField::Out => {
                truck.out_at = None;
                truck.loading_duration = None;
            }
        }
    }
}

/// Index of a truck among the not-out trucks of its gate (by `order_index`),
/// or -1 when unknown.
fn gate_queue_index(trucks: &[ActiveTruck], truck_id: &str) -> i32 {
    let Some(truck) = trucks.iter().find(|t| t.id == truck_id) else {
        return -1;
    };
    let gate = truck.gate_no.clone().unwrap_or_default().to_lowercase();
    if gate.is_empty() {
        return -1;
    }
    trucks
        .iter()
        .filter(|t| !t.is_out && t.gate_no.clone().unwrap_or_default().to_lowercase() == gate)
        .position(|t| t.id == truck_id)
        .map(|index| index as i32)
        .unwrap_or(-1)
}

fn gate_loading_mins(gates: &[GateConfig], gate_no: &Option<String>) -> u32 {
    let key = gate_no.clone().unwrap_or_default().to_lowercase();
    if key.is_empty() {
        return DEFAULT_GATE_LOADING_MINS;
    }
    let configured = gates
        .iter()
        .find(|gate| gate.number.trim().to_lowercase() == key)
        .map(|gate| gate.loading_duration_mins)
        .filter(|mins| *mins > 0)
        .unwrap_or(DEFAULT_GATE_LOADING_MINS);
    if configured < 1 {
        1
    } else {
        configured
    }
}

/// Expected wait until this truck enters a bay (port of `truck-queue.ts`).
fn estimated_wait_mins(trucks: &[ActiveTruck], truck_id: &str, gates: &[GateConfig]) -> u32 {
    let truck = match trucks.iter().find(|t| t.id == truck_id) {
        Some(truck) => truck,
        None => return 0,
    };
    let index = gate_queue_index(trucks, truck_id);
    if index < 0 {
        return 0;
    }
    let cycles_ahead = index as usize / GATE_LOADING_CAPACITY;
    cycles_ahead as u32 * gate_loading_mins(gates, &truck.gate_no)
}

fn format_queue_duration(mins: u32) -> String {
    if mins == 0 {
        return "Now".to_string();
    }
    let rounded = mins;
    if rounded < 60 {
        return format!("{rounded} min");
    }
    let hours = rounded / 60;
    let remaining = rounded % 60;
    if remaining > 0 {
        format!("{hours}h {remaining}m")
    } else {
        format!("{hours}h")
    }
}

/// "hh:mm" elapsed between a stored timestamp and now, or "—".
fn format_since(value: Option<&str>) -> String {
    let Some(value) = value else {
        return "—".to_string();
    };
    let Some(start) = parse_iso(value) else {
        return "—".to_string();
    };
    let minutes = (Utc::now().signed_duration_since(start))
        .num_minutes()
        .max(0);
    format!("{:02}:{:02}", minutes / 60, minutes % 60)
}

fn format_duration_secs(secs: Option<i64>) -> String {
    let Some(secs) = secs else {
        return "—".to_string();
    };
    if secs < 0 {
        return "—".to_string();
    }
    let minutes = secs / 60;
    format!("{:02}:{:02}", minutes / 60, minutes % 60)
}

fn normalize_import_key(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

const REG_KEYS: [&str; 9] = [
    "registration_number",
    "registration",
    "reg_no",
    "reg_number",
    "vehicle_no",
    "vehicle_number",
    "truck_no",
    "truck_number",
    "number",
];
const GATE_KEYS: [&str; 4] = ["gate_no", "gate", "gate_number", "gateno"];

fn lookup_field(row: &serde_json::Map<String, serde_json::Value>, keys: &[&str]) -> String {
    for key in keys {
        let normalized = normalize_import_key(key);
        for (row_key, value) in row {
            if normalize_import_key(row_key) == normalized {
                let text = match value {
                    serde_json::Value::String(text) => text.trim().to_string(),
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::Bool(b) => b.to_string(),
                    _ => String::new(),
                };
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }
    String::new()
}

/// Pending UI events collected during the draw pass, applied after it.
#[derive(Debug)]
enum PendingAction {
    Change(String, TruckField, bool),
    Move(String, bool),
    Delete(String),
    OpenDetails(String),
    OpenEdit(String),
}

struct RowData {
    truck: ActiveTruck,
    list_index: usize,
    status_label: &'static str,
    can_move_up: bool,
    can_move_down: bool,
    can_loading: bool,
    can_out: bool,
    wait_label: String,
}

pub struct TrucksPage {
    trucks: Vec<ActiveTruck>,
    summary: Option<TruckDispatchSummary>,
    gates: Vec<GateConfig>,
    search: String,
    gate_tab: String,
    show_add: bool,
    editing: Option<String>,
    f_reg_no: String,
    f_gate_no: String,
    import_preview: Option<Vec<(String, String)>>,
    details: Option<String>,
    last_refresh: Instant,
    loaded_once: bool,
}

impl Default for TrucksPage {
    fn default() -> Self {
        Self {
            trucks: Vec::new(),
            summary: None,
            gates: Vec::new(),
            search: String::new(),
            gate_tab: "all".to_string(),
            show_add: false,
            editing: None,
            f_reg_no: String::new(),
            f_gate_no: String::new(),
            import_preview: None,
            details: None,
            last_refresh: Instant::now() - Duration::from_secs(3600),
            loaded_once: false,
        }
    }
}

impl TrucksPage {
    pub fn show(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        if widgets::should_refresh(self.last_refresh, Duration::from_secs(5)) || !self.loaded_once {
            self.last_refresh = Instant::now();
            self.loaded_once = true;
            self.refresh(core);
        }

        let mut actions: Vec<PendingAction> = Vec::new();

        theme::heading(ui, "Truck token");
        theme::muted(
            ui,
            "Queue trucks per gate; tokens broadcast to gate token screens in real time.",
        );
        ui.add_space(10.0);

        // ── Stats ───────────────────────────────────────────────────────────
        let total_active = self.trucks.iter().filter(|t| !t.is_out).count();
        let waiting_count = self
            .trucks
            .iter()
            .filter(|t| t.is_waiting && !t.is_out)
            .count();
        let loading_count = self
            .trucks
            .iter()
            .filter(|t| t.is_loading && !t.is_out)
            .count();
        let dispatched_today = self.summary.as_ref().map(|s| s.today).unwrap_or(0);
        let this_month = self.summary.as_ref().map(|s| s.this_month).unwrap_or(0);

        widgets::stat_grid(
            ui,
            &[
                (
                    "Total active",
                    total_active.to_string(),
                    theme::tokens(ui).green,
                ),
                (
                    "Waiting",
                    waiting_count.to_string(),
                    theme::tokens(ui).amber,
                ),
                (
                    "Loading",
                    loading_count.to_string(),
                    theme::tokens(ui).primary,
                ),
                (
                    "Dispatched today",
                    dispatched_today.to_string(),
                    theme::tokens(ui).green,
                ),
                (
                    "This month",
                    this_month.to_string(),
                    theme::tokens(ui).primary,
                ),
            ],
            5,
        );
        ui.add_space(16.0);

        // ── Gate tabs ───────────────────────────────────────────────────────
        ui.horizontal_wrapped(|ui| {
            let mut draw_tab = |ui: &mut egui::Ui, key: &str, label: &str| {
                let is_selected = self.gate_tab == key;
                if ui
                    .add(egui::Button::selectable(
                        is_selected,
                        egui::RichText::new(label).size(13.5),
                    ))
                    .clicked()
                {
                    self.gate_tab = key.to_string();
                }
            };
            draw_tab(ui, "all", "All Trucks");
            for gate in &self.gates {
                draw_tab(
                    ui,
                    &gate.number,
                    &format!("Gate {}", gate.number.to_uppercase()),
                );
            }
            draw_tab(ui, "dispatched", "Dispatched / Out");
        });
        ui.add_space(4.0);

        // ── Action bar ──────────────────────────────────────────────────────
        ui.horizontal_wrapped(|ui| {
            ui.add_sized(
                [220.0, 34.0],
                egui::TextEdit::singleline(&mut self.search).hint_text(" Search trucks…"),
            );
            theme::muted(ui, &format!("{} shown", self.filtered().len()));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if theme::primary_button(ui, "+ Add Truck").clicked() {
                    self.f_reg_no.clear();
                    self.f_gate_no = self
                        .gates
                        .first()
                        .map(|gate| gate.number.clone())
                        .unwrap_or_default();
                    self.show_add = true;
                }
                if ui.button(" Import CSV / Excel").clicked() {
                    self.start_import(toasts);
                }
            });
        });
        ui.add_space(6.0);

        // ── Truck table ─────────────────────────────────────────────────────
        let rows = self.build_rows();
        if rows.is_empty() {
            widgets::empty_state(
                ui,
                "No trucks yet. Add a truck manually or import a CSV/Excel list.",
            );
        } else {
            egui::ScrollArea::horizontal()
                .auto_shrink(false)
                .show(ui, |ui| {
                    egui::Grid::new("trucks-grid")
                        .num_columns(10)
                        .striped(true)
                        .show(ui, |ui| {
                            for column_label in [
                                "#",
                                "Truck number",
                                "Status",
                                "Queue",
                                "Gate",
                                "Est. wait",
                                "Waiting",
                                "Loading in",
                                "Loading out",
                                "Actions",
                            ] {
                                ui.label(
                                    egui::RichText::new(column_label)
                                        .size(11.5)
                                        .strong()
                                        .color(theme::tokens(ui).muted),
                                );
                            }
                            ui.end_row();

                            for (row_index, row) in rows.iter().enumerate() {
                                let truck = &row.truck;
                                ui.label(
                                    egui::RichText::new((row_index + 1).to_string())
                                        .size(12.0)
                                        .color(theme::tokens(ui).muted),
                                );

                                ui.vertical(|ui| {
                                    ui.label(
                                        egui::RichText::new(truck.registration_number.clone())
                                            .size(13.5)
                                            .strong()
                                            .color(theme::tokens(ui).text),
                                    );
                                    let sub = if truck.is_out {
                                        egui::RichText::new(format!(
                                            "Dispatched (loaded for {})",
                                            format_duration_secs(truck.loading_duration)
                                        ))
                                        .size(10.5)
                                        .color(theme::tokens(ui).green)
                                    } else if truck.is_loading {
                                        egui::RichText::new(format!(
                                            "Loading for {}",
                                            format_since(truck.loading_at.as_deref())
                                        ))
                                        .size(10.5)
                                        .color(theme::tokens(ui).primary)
                                    } else {
                                        egui::RichText::new(format!(
                                            "Waiting {}",
                                            format_since(truck.waiting_at.as_deref())
                                        ))
                                        .size(10.5)
                                        .color(theme::tokens(ui).muted)
                                    };
                                    ui.label(sub);
                                });

                                let (status_key, _status_label) = truck_status(truck);
                                let color = match status_key {
                                    "out" => theme::tokens(ui).green,
                                    "loading" => theme::tokens(ui).primary,
                                    "waiting" => theme::tokens(ui).amber,
                                    _ => theme::tokens(ui).muted,
                                };
                                theme::badge(ui, row.status_label, color);

                                if row.status_label == "Waiting" {
                                    ui.horizontal(|ui| {
                                        if ui
                                            .add_enabled(
                                                row.can_move_up,
                                                egui::Button::new(
                                                    egui::RichText::new("▲").size(11.0),
                                                ),
                                            )
                                            .clicked()
                                        {
                                            actions
                                                .push(PendingAction::Move(truck.id.clone(), true));
                                        }
                                        if ui
                                            .add_enabled(
                                                row.can_move_down,
                                                egui::Button::new(
                                                    egui::RichText::new("▼").size(11.0),
                                                ),
                                            )
                                            .clicked()
                                        {
                                            actions
                                                .push(PendingAction::Move(truck.id.clone(), false));
                                        }
                                    });
                                } else {
                                    ui.label(
                                        egui::RichText::new("—")
                                            .size(12.0)
                                            .color(theme::tokens(ui).muted),
                                    );
                                }

                                ui.label(
                                    egui::RichText::new(
                                        truck.gate_no.clone().unwrap_or_else(|| "—".to_string()),
                                    )
                                    .size(12.0)
                                    .strong()
                                    .color(theme::tokens(ui).text),
                                );
                                ui.label(
                                    egui::RichText::new(&row.wait_label)
                                        .size(12.0)
                                        .color(theme::tokens(ui).muted),
                                );

                                let mut waiting = truck.is_waiting;
                                if widgets::status_checkbox(
                                    ui,
                                    !truck.is_out,
                                    &mut waiting,
                                    &format!("Waiting: {}", truck.registration_number),
                                )
                                .changed()
                                    && waiting != truck.is_waiting
                                {
                                    actions.push(PendingAction::Change(
                                        truck.id.clone(),
                                        TruckField::Waiting,
                                        waiting,
                                    ));
                                }
                                let mut loading = truck.is_loading;
                                if widgets::status_checkbox(
                                    ui,
                                    row.can_loading,
                                    &mut loading,
                                    &format!("Loading in: {}", truck.registration_number),
                                )
                                .changed()
                                    && loading != truck.is_loading
                                {
                                    actions.push(PendingAction::Change(
                                        truck.id.clone(),
                                        TruckField::Loading,
                                        loading,
                                    ));
                                }
                                let mut out = truck.is_out;
                                if widgets::status_checkbox(
                                    ui,
                                    row.can_out,
                                    &mut out,
                                    &format!("Loading out: {}", truck.registration_number),
                                )
                                .changed()
                                    && out != truck.is_out
                                {
                                    actions.push(PendingAction::Change(
                                        truck.id.clone(),
                                        TruckField::Out,
                                        out,
                                    ));
                                }

                                ui.horizontal(|ui| {
                                    if super::icons::button(
                                        ui,
                                        super::icons::Icon::Eye,
                                        "View details",
                                    )
                                    .clicked()
                                    {
                                        actions.push(PendingAction::OpenDetails(truck.id.clone()));
                                    }
                                    if !truck.is_out {
                                        if super::icons::button(
                                            ui,
                                            super::icons::Icon::Edit,
                                            "Edit",
                                        )
                                        .clicked()
                                        {
                                            actions.push(PendingAction::OpenEdit(truck.id.clone()));
                                        }
                                        if super::icons::button(
                                            ui,
                                            super::icons::Icon::Delete,
                                            "Delete",
                                        )
                                        .clicked()
                                        {
                                            actions.push(PendingAction::Delete(truck.id.clone()));
                                        }
                                    }
                                });
                                ui.end_row();
                            }
                        });
                });
        }

        // ── Windows & applied actions ───────────────────────────────────────
        for action in actions {
            match action {
                PendingAction::Change(id, field, value) => {
                    self.handle_change(core, toasts, &id, field, value)
                }
                PendingAction::Move(id, up) => self.handle_move(core, toasts, &id, up),
                PendingAction::Delete(id) => self.handle_delete(core, toasts, &id),
                PendingAction::OpenDetails(id) => self.details = Some(id),
                PendingAction::OpenEdit(id) => {
                    if let Some(truck) = self.trucks.iter().find(|t| t.id == id) {
                        self.f_reg_no = truck.registration_number.clone();
                        self.f_gate_no = truck.gate_no.clone().unwrap_or_default();
                    }
                    self.editing = Some(id);
                }
            }
        }

        if self.show_add {
            self.draw_add_window(ui, core, toasts);
        }
        if self.editing.is_some() {
            self.draw_edit_window(ui, core, toasts);
        }
        if self.details.is_some() {
            self.draw_details_window(ui, toasts);
        }
        if self.import_preview.is_some() {
            self.draw_import_window(ui, core, toasts);
        }
    }

    fn filtered(&self) -> Vec<&ActiveTruck> {
        let search = self.search.trim().to_lowercase();
        self.trucks
            .iter()
            .filter(|truck| {
                if !search.is_empty()
                    && !truck.registration_number.to_lowercase().contains(&search)
                    && !truck
                        .gate_no
                        .clone()
                        .unwrap_or_default()
                        .to_lowercase()
                        .contains(&search)
                {
                    return false;
                }
                if self.gate_tab == "all" {
                    return true;
                }
                if self.gate_tab == "dispatched" {
                    return truck.is_out;
                }
                !truck.is_out
                    && truck.gate_no.clone().unwrap_or_default().to_lowercase() == self.gate_tab
            })
            .collect()
    }

    fn build_rows(&self) -> Vec<RowData> {
        self.filtered()
            .into_iter()
            .map(|truck| {
                let list_index = self
                    .trucks
                    .iter()
                    .position(|t| t.id == truck.id)
                    .unwrap_or(0);
                let can_move_up = self.trucks[..list_index].iter().any(|t| t.is_waiting);
                let can_move_down = self.trucks[list_index + 1..].iter().any(|t| t.is_waiting);
                let queue_rank = gate_queue_index(&self.trucks, &truck.id);
                let can_advance = queue_rank <= 1;
                let (_, label) = truck_status(truck);
                RowData {
                    truck: truck.clone(),
                    list_index,
                    status_label: label,
                    can_move_up,
                    can_move_down,
                    can_loading: !truck.is_out && truck.is_waiting && can_advance,
                    can_out: !truck.is_out && truck.is_loading && can_advance,
                    wait_label: format_queue_duration(if !truck.is_out {
                        estimated_wait_mins(&self.trucks, &truck.id, &self.gates)
                    } else {
                        0
                    }),
                }
            })
            .collect()
    }

    // ── Mutations ───────────────────────────────────────────────────────────

    fn persist(&mut self, core: &Arc<AppCore>) {
        let snapshot = self.trucks.clone();
        if let Err(error) = crate::backend::trucks::save_active_trucks(core, snapshot) {
            eprintln!("Failed to save active trucks: {error}");
        }
        self.reload_after(core);
    }

    fn reload_after(&mut self, core: &Arc<AppCore>) {
        if let Ok(summary) = crate::backend::trucks::get_truck_dispatch_summary(core) {
            self.summary = Some(summary);
        }
    }

    fn handle_change(
        &mut self,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
        id: &str,
        field: TruckField,
        value: bool,
    ) {
        let Some((truck_index, truck)) = self.trucks.iter().enumerate().find(|(_, t)| t.id == id)
        else {
            return;
        };
        let truck = truck.clone();
        let before_status = truck_status(&truck).0;
        let mut preview = truck;
        apply_status_field(&mut preview, field, value, &now_iso());
        let after_status = truck_status(&preview).0;
        if preview.is_waiting == self.trucks[truck_index].is_waiting
            && preview.is_loading == self.trucks[truck_index].is_loading
            && preview.is_in == self.trucks[truck_index].is_in
            && preview.is_out == self.trucks[truck_index].is_out
        {
            return; // nothing changed
        }

        self.trucks[truck_index] = preview.clone();
        if value && field == TruckField::Out {
            let dispatched = preview.clone();
            if let Err(error) = crate::backend::trucks::save_dispatched_truck(core, dispatched) {
                toasts.push(Toast::new(
                    ToastKind::Error,
                    format!("Dispatch record failed: {error}"),
                ));
            }
        }
        self.persist(core);

        if before_status == after_status {
            return;
        }

        // Publish a screen alert with queue context (old behaviour).
        let queue_snapshot = self.trucks.clone();
        let gate_val = preview.gate_no.clone().unwrap_or_default().to_lowercase();
        let gate_trucks: Vec<&ActiveTruck> = queue_snapshot
            .iter()
            .filter(|t| t.gate_no.clone().unwrap_or_default().to_lowercase() == gate_val)
            .collect();
        let active = gate_trucks
            .iter()
            .find(|t| (t.is_loading || t.is_in) && !t.is_out)
            .copied();
        let next = gate_trucks
            .iter()
            .find(|t| t.is_waiting && !t.is_loading && !t.is_in && !t.is_out)
            .copied();
        let alert = TruckScreenAlert {
            id: uuid::Uuid::new_v4().to_string(),
            truck_id: preview.id.clone(),
            truck_number: preview.registration_number.clone(),
            gate: preview.gate_no.clone(),
            status: after_status.to_string(),
            status_label: truck_status(&preview).1.to_string(),
            changed_at: now_iso(),
            duration_secs: 30,
            active_truck_number: active.map(|t| t.registration_number.clone()),
            active_truck_status: active.map(|t| truck_status(t).1.to_string()),
            next_truck_number: next.map(|t| t.registration_number.clone()),
            next_truck_status: next.map(|t| truck_status(t).1.to_string()),
            queue_trucks: Some(
                queue_snapshot
                    .iter()
                    .map(|t| serde_json::to_value(t).unwrap_or_default())
                    .collect::<Vec<_>>(),
            ),
            queue_gates: Some(
                self.gates
                    .iter()
                    .map(|gate| {
                        serde_json::json!({
                            "number": gate.number,
                            "loadingDurationMins": gate.loading_duration_mins,
                        })
                    })
                    .collect::<Vec<_>>(),
            ),
        };
        crate::backend::trucks::publish_truck_alert(core, alert);

        // Ask every paired player to resync immediately.
        if let Ok(screens) = crate::backend::screens::get_screens(&core.pool) {
            for screen in screens.iter().filter(|s| s.pairing_status == "paired") {
                let _ = crate::backend::screens::force_sync_screen(core, screen.id.clone());
            }
        }

        if value && field == TruckField::Out {
            toasts.push(Toast::new(
                ToastKind::Success,
                format!(
                    "Truck \"{}\" dispatched and saved to database",
                    preview.registration_number
                ),
            ));
        }
    }

    fn handle_move(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>, id: &str, up: bool) {
        let Some(index) = self.trucks.iter().position(|t| t.id == id) else {
            return;
        };
        let mut range: Box<dyn std::iter::Iterator<Item = usize>> = if up {
            Box::new((0..index).rev())
        } else {
            Box::new(index + 1..self.trucks.len())
        };
        let target = range.find(|i| self.trucks[*i].is_waiting);
        if let Some(target) = target {
            self.trucks.swap(index, target);
            self.persist(core);
            toasts.push(Toast::new(ToastKind::Info, "Queue order updated"));
        }
    }

    fn handle_delete(&mut self, core: &Arc<AppCore>, toasts: &mut Vec<Toast>, id: &str) {
        if let Some(index) = self.trucks.iter().position(|t| t.id == id) {
            let removed = self.trucks.remove(index);
            self.persist(core);
            toasts.push(Toast::new(
                ToastKind::Info,
                format!("Truck \"{}\" removed", removed.registration_number),
            ));
        }
    }

    // ── Windows ─────────────────────────────────────────────────────────────

    fn truck_form(
        ui: &mut egui::Ui,
        page_gates: &[GateConfig],
        reg: &mut String,
        gate: &mut String,
    ) {
        widgets::labeled_text(ui, "Truck number", reg, "MH-01-AB-1234");
        if page_gates.is_empty() {
            widgets::labeled_text(ui, "Gate", gate, "e.g., d1");
        } else {
            let selected = page_gates
                .iter()
                .find(|g| g.number == gate.to_lowercase())
                .map(|g| g.number.clone())
                .unwrap_or_default();
            ui.horizontal_wrapped(|ui| {
                ui.label(
                    egui::RichText::new("Gate")
                        .size(13.0)
                        .color(theme::tokens(ui).muted),
                );
                egui::ComboBox::from_id_salt("truck-gate-select")
                    .width(180.0)
                    .selected_text(if selected.is_empty() {
                        "Select gate"
                    } else {
                        &selected
                    })
                    .show_ui(ui, |ui| {
                        for gate_config in page_gates {
                            let mut choice = gate.to_lowercase();
                            if ui
                                .selectable_value(
                                    &mut choice,
                                    gate_config.number.to_lowercase(),
                                    gate_config.number.to_uppercase(),
                                )
                                .changed()
                            {
                                *gate = choice;
                            }
                        }
                    });
            });
        }
    }

    fn draw_add_window(&mut self, ui: &mut egui::Ui, core: &Arc<AppCore>, toasts: &mut Vec<Toast>) {
        let mut open = true;
        super::layout::dialog(ui, "Add truck", 500.0)
            .id(egui::Id::unique("add-truck-window"))
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                ui.set_width(ui.available_width().min(400.0));
                ui.label(egui::RichText::new("Add new truck").size(15.0).strong());
                ui.add_space(4.0);
                let gates = self.gates.clone();
                let mut reg = self.f_reg_no.clone();
                let mut gate = self.f_gate_no.clone();
                Self::truck_form(ui, &gates, &mut reg, &mut gate);
                self.f_reg_no = reg;
                self.f_gate_no = gate;
                ui.add_space(8.0);
                ui.horizontal_wrapped(|ui| {
                    if ui.button("Add Truck").clicked() {
                        if self.f_reg_no.trim().is_empty() || self.f_gate_no.trim().is_empty() {
                            toasts.push(Toast::new(
                                ToastKind::Error,
                                "Fill the truck number and gate",
                            ));
                        } else {
                            let truck = ActiveTruck {
                                id: uuid::Uuid::new_v4().to_string(),
                                registration_number: self.f_reg_no.trim().to_string(),
                                gate_no: Some(self.f_gate_no.trim().to_lowercase()),
                                is_waiting: true,
                                is_loading: false,
                                is_in: false,
                                is_out: false,
                                waiting_at: Some(now_iso()),
                                loading_at: None,
                                in_at: None,
                                out_at: None,
                                created_at: now_iso(),
                                loading_duration: None,
                            };
                            self.trucks.push(truck);
                            self.persist(core);
                            toasts.push(Toast::new(
                                ToastKind::Success,
                                format!("Truck \"{}\" added", self.f_reg_no.trim()),
                            ));
                            self.show_add = false;
                        }
                    }
                    if ui.button("Cancel").clicked() {
                        self.show_add = false;
                    }
                });
            });
        if !open {
            self.show_add = false;
        }
    }

    fn draw_edit_window(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
    ) {
        let mut open = true;
        super::layout::dialog(ui, "Edit truck", 500.0)
            .id(egui::Id::unique("edit-truck-window"))
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                ui.set_width(ui.available_width().min(400.0));
                ui.label(egui::RichText::new("Edit truck").size(15.0).strong());
                ui.add_space(4.0);
                let gates = self.gates.clone();
                let mut reg = self.f_reg_no.clone();
                let mut gate = self.f_gate_no.clone();
                Self::truck_form(ui, &gates, &mut reg, &mut gate);
                self.f_reg_no = reg;
                self.f_gate_no = gate;
                ui.add_space(8.0);
                ui.horizontal_wrapped(|ui| {
                    if ui.button("Save Changes").clicked() {
                        if let Some(id) = self.editing.clone() {
                            if self.f_reg_no.trim().is_empty() || self.f_gate_no.trim().is_empty() {
                                toasts.push(Toast::new(
                                    ToastKind::Error,
                                    "Fill the truck number and gate",
                                ));
                            } else {
                                if let Some(truck) = self.trucks.iter_mut().find(|t| t.id == id) {
                                    truck.registration_number = self.f_reg_no.trim().to_string();
                                    truck.gate_no = Some(self.f_gate_no.trim().to_lowercase());
                                }
                                self.persist(core);
                                toasts.push(Toast::new(ToastKind::Success, "Truck updated"));
                                self.editing = None;
                            }
                        }
                    }
                    if ui.button("Cancel").clicked() {
                        self.editing = None;
                    }
                });
            });
        if !open {
            self.editing = None;
        }
    }

    fn draw_details_window(&mut self, ui: &mut egui::Ui, toasts: &mut Vec<Toast>) {
        let mut open = true;
        super::layout::dialog(ui, "Truck details", 500.0)
            .id(egui::Id::unique("truck-details-window"))
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                let Some(truck) = self
                    .details
                    .clone()
                    .and_then(|id| self.trucks.iter().find(|t| t.id == id).cloned())
                else {
                    return;
                };
                ui.set_width(ui.available_width().min(460.0));
                ui.label(
                    egui::RichText::new("Truck details & status log")
                        .size(15.0)
                        .strong(),
                );
                ui.add_space(4.0);
                ui.label(
                    egui::RichText::new(&truck.registration_number)
                        .size(18.0)
                        .strong()
                        .color(theme::tokens(ui).primary),
                );
                theme::muted(
                    ui,
                    &format!(
                        "Gate: {}",
                        truck
                            .gate_no
                            .clone()
                            .unwrap_or_else(|| "none".to_string())
                            .to_uppercase()
                    ),
                );
                ui.add_space(8.0);
                let steps: [(&str, bool, Option<String>); 3] = [
                    ("1 · Waiting", truck.is_waiting, truck.waiting_at.clone()),
                    (
                        "2 · Loading in",
                        truck.is_loading || truck.is_in,
                        truck.loading_at.clone(),
                    ),
                    (
                        "3 · Loading out / dispatched",
                        truck.is_out,
                        truck.out_at.clone(),
                    ),
                ];
                for (title, reached, at) in steps {
                    ui.horizontal_wrapped(|ui| {
                        let color = if reached {
                            theme::tokens(ui).primary
                        } else {
                            theme::tokens(ui).stroke
                        };
                        ui.label(egui::RichText::new(if reached { "●" } else { "○" }).color(color));
                        ui.vertical(|ui| {
                            ui.label(
                                egui::RichText::new(title)
                                    .size(13.0)
                                    .strong()
                                    .color(theme::tokens(ui).text),
                            );
                            let time = at
                                .as_deref()
                                .and_then(parse_iso)
                                .map(|dt| {
                                    dt.with_timezone(&chrono::Local)
                                        .format("%d %b %H:%M:%S")
                                        .to_string()
                                })
                                .unwrap_or_else(|| "No timestamp recorded".to_string());
                            theme::muted(ui, &time);
                        });
                    });
                    ui.separator();
                }
                if truck.loading_at.is_some() {
                    theme::muted(
                        ui,
                        &format!(
                            "Total loading time: {}",
                            if truck.is_out {
                                format_duration_secs(truck.loading_duration)
                            } else {
                                format_since(truck.loading_at.as_deref())
                            }
                        ),
                    );
                }
                theme::muted(ui, &format!("Token created: {}", truck.created_at));
                ui.add_space(6.0);
                if ui.button("Copy status").clicked() {
                    ui.ctx().copy_text(format!(
                        "{} | {} | gate {}",
                        truck.registration_number,
                        truck_status(&truck).1,
                        truck.gate_no.clone().unwrap_or_default()
                    ));
                    toasts.push(Toast::new(ToastKind::Info, "Truck summary copied"));
                }
            });
        if !open {
            self.details = None;
        }
    }

    fn draw_import_window(
        &mut self,
        ui: &mut egui::Ui,
        core: &Arc<AppCore>,
        toasts: &mut Vec<Toast>,
    ) {
        let mut open = true;
        super::layout::dialog(ui, "Import trucks", 500.0)
            .id(egui::Id::unique("truck-import-window"))
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                let Some(preview) = self.import_preview.clone() else {
                    return;
                };
                ui.set_width(ui.available_width().min(480.0));
                ui.label(
                    egui::RichText::new(format!("Import {} trucks", preview.len()))
                        .size(15.0)
                        .strong(),
                );
                theme::muted(
                    ui,
                    "Review the records then confirm. Every truck starts as Waiting.",
                );
                ui.add_space(4.0);
                egui::ScrollArea::vertical()
                    .max_height(240.0)
                    .show(ui, |ui| {
                        egui::Grid::new("truck-import-grid")
                            .num_columns(3)
                            .striped(true)
                            .show(ui, |ui| {
                                ui.label(
                                    egui::RichText::new("#")
                                        .strong()
                                        .size(11.5)
                                        .color(theme::tokens(ui).muted),
                                );
                                ui.label(
                                    egui::RichText::new("Truck number")
                                        .strong()
                                        .size(11.5)
                                        .color(theme::tokens(ui).muted),
                                );
                                ui.label(
                                    egui::RichText::new("Gate")
                                        .strong()
                                        .size(11.5)
                                        .color(theme::tokens(ui).muted),
                                );
                                ui.end_row();
                                for (index, (reg, gate)) in preview.iter().take(150).enumerate() {
                                    ui.label(
                                        egui::RichText::new((index + 1).to_string())
                                            .size(11.5)
                                            .color(theme::tokens(ui).muted),
                                    );
                                    ui.label(
                                        egui::RichText::new(reg.clone())
                                            .size(12.0)
                                            .color(theme::tokens(ui).text),
                                    );
                                    ui.label(
                                        egui::RichText::new(gate.clone())
                                            .size(12.0)
                                            .color(theme::tokens(ui).text),
                                    );
                                    ui.end_row();
                                }
                            });
                    });
                theme::muted(
                    ui,
                    "Expected columns: truck_number, gate (lower-case like d1, d2).",
                );
                ui.add_space(6.0);
                ui.horizontal_wrapped(|ui| {
                    if ui
                        .button(
                            egui::RichText::new("Confirm Import").color(theme::tokens(ui).green),
                        )
                        .clicked()
                    {
                        let waiting_at = now_iso();
                        for (reg, gate) in preview {
                            if reg.trim().is_empty() {
                                continue;
                            }
                            self.trucks.push(ActiveTruck {
                                id: uuid::Uuid::new_v4().to_string(),
                                registration_number: reg.trim().to_string(),
                                gate_no: Some(gate.trim().to_lowercase()),
                                is_waiting: true,
                                is_loading: false,
                                is_in: false,
                                is_out: false,
                                waiting_at: Some(waiting_at.clone()),
                                loading_at: None,
                                in_at: None,
                                out_at: None,
                                created_at: waiting_at.clone(),
                                loading_duration: None,
                            });
                        }
                        let count = self.trucks.len();
                        self.persist(core);
                        toasts.push(Toast::new(
                            ToastKind::Success,
                            format!("{count} trucks imported"),
                        ));
                        self.import_preview = None;
                    }
                    if ui.button("Cancel").clicked() {
                        self.import_preview = None;
                    }
                });
            });
        if !open {
            self.import_preview = None;
        }
    }

    // ── Import pipeline ─────────────────────────────────────────────────────

    fn start_import(&mut self, toasts: &mut Vec<Toast>) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter(
                "Truck lists",
                &["csv", "tsv", "txt", "xlsx", "xls", "xlsm", "xlsb"],
            )
            .pick_file()
        else {
            return;
        };
        let filename = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        let extension = filename
            .rsplit('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();

        let rows = if matches!(extension.as_str(), "csv" | "tsv" | "txt") {
            match std::fs::read_to_string(&path) {
                Ok(text) => {
                    parse_delimited_trucks(&text, if extension == "tsv" { b'\t' } else { b',' })
                }
                Err(error) => {
                    toasts.push(Toast::new(
                        ToastKind::Error,
                        format!("Could not read file: {error}"),
                    ));
                    return;
                }
            }
        } else if matches!(extension.as_str(), "xlsx" | "xls" | "xlsm" | "xlsb") {
            match std::fs::read(&path) {
                Ok(bytes) => {
                    match crate::backend::production::import_production_file(filename, bytes) {
                        Ok(result) => {
                            let mut rows = Vec::new();
                            for row in result.tables.iter().flat_map(|t| t.rows.iter()) {
                                let reg = lookup_field(row, &REG_KEYS);
                                let gate = lookup_field(row, &GATE_KEYS);
                                if !reg.is_empty() {
                                    rows.push((reg, gate));
                                }
                            }
                            rows
                        }
                        Err(error) => {
                            toasts.push(Toast::new(
                                ToastKind::Error,
                                format!("Import failed: {error}"),
                            ));
                            return;
                        }
                    }
                }
                Err(error) => {
                    toasts.push(Toast::new(
                        ToastKind::Error,
                        format!("Could not read file: {error}"),
                    ));
                    return;
                }
            }
        } else {
            toasts.push(Toast::new(
                ToastKind::Error,
                "Unsupported file type. Upload CSV, TSV, XLS, or XLSX.",
            ));
            return;
        };

        if rows.is_empty() {
            toasts.push(Toast::new(
                ToastKind::Error,
                "No valid truck records. Need truck_number and gate columns.",
            ));
            return;
        }
        self.import_preview = Some(rows);
    }

    fn refresh(&mut self, core: &Arc<AppCore>) {
        if let Ok(trucks) = crate::backend::trucks::get_active_trucks(&core.pool) {
            self.trucks = trucks;
        }
        if let Ok(summary) = crate::backend::trucks::get_truck_dispatch_summary(core) {
            self.summary = Some(summary);
        }
        self.gates = crate::state::load_gate_store(&core.config_dir).gates;
        self.reload_after(core);
    }
}

/// Header/source mapping for delimited truck lists.
fn parse_delimited_trucks(text: &str, delimiter: u8) -> Vec<(String, String)> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_reader(text.as_bytes());
    let headers: Vec<String> = reader
        .headers()
        .map(|headers| headers.iter().map(normalize_import_key).collect())
        .unwrap_or_default();
    let mut rows = Vec::new();
    for record in reader.records().flatten() {
        let mut row = serde_json::Map::new();
        for (index, value) in record.iter().enumerate() {
            if let Some(header) = headers.get(index) {
                row.insert(header.clone(), serde_json::Value::String(value.to_string()));
            }
        }
        let reg = lookup_field(&row, &REG_KEYS);
        let gate = lookup_field(&row, &GATE_KEYS);
        if !reg.is_empty() {
            rows.push((reg, gate));
        }
    }
    rows
}
