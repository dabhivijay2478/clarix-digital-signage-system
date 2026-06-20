use tauri::State;

use crate::{lan::server::TruckAlertBus, models::TruckScreenAlert};

#[tauri::command]
pub async fn publish_truck_alert(
    alert: TruckScreenAlert,
    truck_alerts: State<'_, TruckAlertBus>,
) -> Result<(), String> {
    let _ = truck_alerts.0.send(alert);
    Ok(())
}
