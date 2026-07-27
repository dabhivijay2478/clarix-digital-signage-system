use std::{sync::OnceLock, time::Duration};

use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::auth::ensure_manager_or_developer,
    db::DbPool,
    lan::server::{publish_revision, SyncEventBus},
};

pub const DEFAULT_PRODUCTION_API_ENDPOINT: &str =
    "https://172.16.254.249:443/DSC_DSB_API/api/production-summary";
const DEFAULT_REFRESH_INTERVAL_SECS: i64 = 900;
const ALLOWED_REFRESH_INTERVALS: [i64; 5] = [300, 900, 3_600, 18_000, 86_400];
const MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024;

static FETCH_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

fn fetch_lock() -> &'static tokio::sync::Mutex<()> {
    FETCH_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[derive(Debug, Clone)]
struct StoredProductionApiConfig {
    endpoint: String,
    api_key: String,
    refresh_interval_secs: i64,
    cached_payload: Option<serde_json::Value>,
    last_attempt_at: Option<DateTime<Utc>>,
    last_success_at: Option<DateTime<Utc>>,
    last_error: Option<String>,
}

impl StoredProductionApiConfig {
    fn effective_api_key(&self) -> String {
        if !self.api_key.trim().is_empty() {
            return self.api_key.trim().to_string();
        }
        std::env::var("PRODUCTION_API_KEY")
            .unwrap_or_default()
            .trim()
            .to_string()
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProductionApiConfig {
    pub endpoint: String,
    pub refresh_interval_secs: i64,
    pub api_key_configured: bool,
    pub last_attempt_at: Option<DateTime<Utc>>,
    pub last_success_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionApiConfigUpdate {
    pub endpoint: String,
    pub refresh_interval_secs: i64,
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_api_key: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProductionLiveSnapshot {
    pub configured: bool,
    pub endpoint: String,
    pub refresh_interval_secs: i64,
    pub data: Option<serde_json::Value>,
    pub last_attempt_at: Option<DateTime<Utc>>,
    pub last_success_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

impl From<StoredProductionApiConfig> for ProductionLiveSnapshot {
    fn from(config: StoredProductionApiConfig) -> Self {
        Self {
            configured: !config.effective_api_key().is_empty(),
            endpoint: config.endpoint,
            refresh_interval_secs: config.refresh_interval_secs,
            data: config.cached_payload,
            last_attempt_at: config.last_attempt_at,
            last_success_at: config.last_success_at,
            last_error: config.last_error,
        }
    }
}

impl From<StoredProductionApiConfig> for ProductionApiConfig {
    fn from(config: StoredProductionApiConfig) -> Self {
        let api_key_configured = !config.effective_api_key().is_empty();
        Self {
            endpoint: config.endpoint,
            refresh_interval_secs: config.refresh_interval_secs,
            api_key_configured,
            last_attempt_at: config.last_attempt_at,
            last_success_at: config.last_success_at,
            last_error: config.last_error,
        }
    }
}

#[tauri::command]
pub async fn get_production_api_config(
    pool: State<'_, DbPool>,
) -> Result<ProductionApiConfig, String> {
    read_stored_config(pool.inner())
        .map(Into::into)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_production_api_config(
    token: String,
    config: ProductionApiConfigUpdate,
    pool: State<'_, DbPool>,
) -> Result<ProductionApiConfig, String> {
    validate_endpoint(&config.endpoint)?;
    validate_refresh_interval(config.refresh_interval_secs)?;

    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        {
            let conn = pool.get()?;
            ensure_manager_or_developer(&conn, &token)?;
        }
        let existing = read_stored_config(&pool)?;
        let api_key = if config.clear_api_key {
            String::new()
        } else {
            config
                .api_key
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or(existing.api_key)
        };
        let now = Utc::now().to_rfc3339();
        let conn = pool.get()?;
        conn.execute(
            "UPDATE production_api_settings
             SET endpoint = ?1, api_key = ?2, refresh_interval_secs = ?3, updated_at = ?4
             WHERE singleton = 1",
            params![
                config.endpoint.trim(),
                api_key,
                config.refresh_interval_secs,
                now
            ],
        )?;
        read_stored_config(&pool).map(Into::into)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error: anyhow::Error| error.to_string())
}

#[tauri::command]
pub async fn get_production_live_data(
    pool: State<'_, DbPool>,
) -> Result<ProductionLiveSnapshot, String> {
    query_live_snapshot(pool.inner()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn refresh_production_api(
    token: String,
    pool: State<'_, DbPool>,
    events: State<'_, SyncEventBus>,
) -> Result<ProductionLiveSnapshot, String> {
    let pool = pool.inner().clone();
    {
        let conn = pool.get().map_err(|error| error.to_string())?;
        ensure_manager_or_developer(&conn, &token).map_err(|error| error.to_string())?;
    }
    refresh_live_production(pool, events.inner().clone(), true)
        .await
        .map_err(|error| error.to_string())
}

pub async fn run_production_api_loop(pool: DbPool, events: SyncEventBus) {
    loop {
        if let Err(error) = refresh_live_production(pool.clone(), events.clone(), false).await {
            tracing::warn!("Production API refresh failed: {error}");
        }
        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}

pub fn query_live_snapshot(pool: &DbPool) -> anyhow::Result<ProductionLiveSnapshot> {
    read_stored_config(pool).map(Into::into)
}

async fn refresh_live_production(
    pool: DbPool,
    events: SyncEventBus,
    force: bool,
) -> anyhow::Result<ProductionLiveSnapshot> {
    let _guard = fetch_lock().lock().await;
    let config = read_stored_config(&pool)?;
    let api_key = config.effective_api_key();

    if api_key.is_empty() {
        if force {
            anyhow::bail!("Enter the production API key before refreshing.");
        }
        return Ok(config.into());
    }

    if !force && !is_refresh_due(&config) {
        return Ok(config.into());
    }

    validate_endpoint(&config.endpoint).map_err(anyhow::Error::msg)?;
    let attempt_at = Utc::now();
    record_attempt(&pool, attempt_at)?;

    let allow_invalid_certs = std::env::var("PRODUCTION_API_ALLOW_INVALID_CERTS")
        .map(|value| value.eq_ignore_ascii_case("true") || value == "1")
        .unwrap_or(false);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .danger_accept_invalid_certs(allow_invalid_certs)
        .build()?;

    let response = match client
        .get(config.endpoint.trim())
        .header("x-api-key", api_key)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            let message = format!("Production API request failed: {error}");
            record_failure(&pool, &message)?;
            anyhow::bail!(message);
        }
    };

    let status = response.status();
    let bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => {
            let message = format!("Failed to read production API response: {error}");
            record_failure(&pool, &message)?;
            anyhow::bail!(message);
        }
    };

    if bytes.len() > MAX_RESPONSE_BYTES {
        let message = "Production API response exceeded the 5 MB safety limit.".to_string();
        record_failure(&pool, &message)?;
        anyhow::bail!(message);
    }

    if !status.is_success() {
        let detail = String::from_utf8_lossy(&bytes);
        let compact = detail.chars().take(300).collect::<String>();
        let message = format!("Production API returned {status}: {compact}");
        record_failure(&pool, &message)?;
        anyhow::bail!(message);
    }

    let payload: serde_json::Value = match serde_json::from_slice::<serde_json::Value>(&bytes) {
        Ok(payload) if payload.is_array() || payload.is_object() => payload,
        Ok(_) => {
            let message = "Production API returned an unsupported JSON value.".to_string();
            record_failure(&pool, &message)?;
            anyhow::bail!(message);
        }
        Err(error) => {
            let message = format!("Production API returned invalid JSON: {error}");
            record_failure(&pool, &message)?;
            anyhow::bail!(message);
        }
    };

    record_success(&pool, &payload)?;
    let _ = publish_revision(&pool, &events);
    query_live_snapshot(&pool)
}

fn is_refresh_due(config: &StoredProductionApiConfig) -> bool {
    let Some(last_attempt_at) = config.last_attempt_at else {
        return true;
    };
    let elapsed = Utc::now().signed_duration_since(last_attempt_at).num_seconds();
    elapsed >= config.refresh_interval_secs.max(300)
}

fn validate_endpoint(endpoint: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(endpoint.trim())
        .map_err(|_| "Enter a valid production API URL.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("The production API URL must use HTTPS.".to_string());
    }
    Ok(())
}

fn validate_refresh_interval(seconds: i64) -> Result<(), String> {
    if ALLOWED_REFRESH_INTERVALS.contains(&seconds) {
        Ok(())
    } else {
        Err("Choose a supported production refresh interval.".to_string())
    }
}

fn read_stored_config(pool: &DbPool) -> anyhow::Result<StoredProductionApiConfig> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT endpoint, api_key, refresh_interval_secs, cached_payload,
                last_attempt_at, last_success_at, last_error
         FROM production_api_settings WHERE singleton = 1",
        [],
        |row| {
            let payload_json: Option<String> = row.get(3)?;
            let last_attempt_at: Option<String> = row.get(4)?;
            let last_success_at: Option<String> = row.get(5)?;
            Ok(StoredProductionApiConfig {
                endpoint: row.get(0)?,
                api_key: row.get(1)?,
                refresh_interval_secs: row.get(2)?,
                cached_payload: payload_json
                    .as_deref()
                    .and_then(|value| serde_json::from_str(value).ok()),
                last_attempt_at: last_attempt_at.as_deref().and_then(parse_datetime),
                last_success_at: last_success_at.as_deref().and_then(parse_datetime),
                last_error: row.get(6)?,
            })
        },
    )
    .optional()?
    .map(Ok)
    .unwrap_or_else(|| {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO production_api_settings
             (singleton, endpoint, api_key, refresh_interval_secs, updated_at)
             VALUES (1, ?1, '', ?2, ?3)",
            params![
                DEFAULT_PRODUCTION_API_ENDPOINT,
                DEFAULT_REFRESH_INTERVAL_SECS,
                now
            ],
        )?;
        read_stored_config(pool)
    })
}

fn record_attempt(pool: &DbPool, attempted_at: DateTime<Utc>) -> anyhow::Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE production_api_settings
         SET last_attempt_at = ?1, updated_at = ?1
         WHERE singleton = 1",
        params![attempted_at.to_rfc3339()],
    )?;
    Ok(())
}

fn record_failure(pool: &DbPool, error: &str) -> anyhow::Result<()> {
    let now = Utc::now().to_rfc3339();
    let conn = pool.get()?;
    conn.execute(
        "UPDATE production_api_settings
         SET last_error = ?1, updated_at = ?2
         WHERE singleton = 1",
        params![error, now],
    )?;
    Ok(())
}

fn record_success(pool: &DbPool, payload: &serde_json::Value) -> anyhow::Result<()> {
    let now = Utc::now().to_rfc3339();
    let conn = pool.get()?;
    conn.execute(
        "UPDATE production_api_settings
         SET cached_payload = ?1, last_success_at = ?2, last_error = NULL, updated_at = ?2
         WHERE singleton = 1",
        params![serde_json::to_string(payload)?, now],
    )?;
    Ok(())
}

fn parse_datetime(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.with_timezone(&Utc))
}
