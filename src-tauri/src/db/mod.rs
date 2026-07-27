use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, OptionalExtension};
use std::path::Path;
use crate::auth_config::{configured_admin_user, AdminUserConfig};
use crate::models::{DeviceIdentity, DeviceRole, NETWORK_PROTOCOL_VERSION};

pub type DbPool = Pool<SqliteConnectionManager>;

pub const RESET_PENDING_MARKER: &str = ".reset-pending";

/// Remove all local app data (database, media, settings).
pub fn wipe_app_data(app_data_dir: &str) -> Result<()> {
    let path = Path::new(app_data_dir);
    if path.exists() {
        std::fs::remove_dir_all(path)?;
    }
    Ok(())
}

/// Mark app data for deletion on the next launch (used before app restart).
pub fn prepare_reset_on_restart(app_data_dir: &str) -> Result<()> {
    std::fs::create_dir_all(app_data_dir)?;
    std::fs::write(
        Path::new(app_data_dir).join(RESET_PENDING_MARKER),
        b"1",
    )?;
    Ok(())
}

/// If a reset was requested, wipe app data before opening SQLite.
pub fn consume_pending_reset(app_data_dir: &str) -> Result<()> {
    let marker = Path::new(app_data_dir).join(RESET_PENDING_MARKER);
    if marker.exists() {
        tracing::warn!("Pending database reset detected — wiping app data at {}", app_data_dir);
        wipe_app_data(app_data_dir)?;
    }
    Ok(())
}

/// Initialize the SQLite database with connection pooling and schema.
pub fn init_db(app_data_dir: &str) -> Result<DbPool> {
    // Ensure the app data directory exists
    std::fs::create_dir_all(app_data_dir)?;

    let mut db_path = Path::new(app_data_dir).join("clarix.db");
    if !db_path.exists() {
        let old_path = Path::new(app_data_dir).join("signalos.db");
        if old_path.exists() {
            if let Err(e) = std::fs::rename(&old_path, &db_path) {
                tracing::warn!("Failed to rename old database from {} to {}: {}", old_path.display(), db_path.display(), e);
                db_path = old_path;
            } else {
                tracing::info!("Successfully migrated database from signalos.db to clarix.db");
            }
        }
    }
    tracing::info!("Initializing SQLite database at: {}", db_path.display());

    let manager = SqliteConnectionManager::file(db_path);
    let pool = r2d2::Pool::builder()
        .max_size(8)
        .build(manager)?;

    // Enable WAL mode and busy timeout
    let conn = pool.get()?;
    conn.pragma_update(None, "journal_mode", &"WAL")?;
    conn.pragma_update(None, "busy_timeout", &5000)?;

    // Run schema migrations
    conn.execute_batch(SCHEMA)?;
    seed_admin_user(&conn)?;

    // Run dynamic migrations (in SQLite, we gracefully ignore column addition errors if they already exist)
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN operating_hours TEXT DEFAULT '{}'", []);
    let _ = conn.execute("ALTER TABLE active_trucks ADD COLUMN loading_duration INTEGER", []);
    let _ = conn.execute("ALTER TABLE dispatched_trucks ADD COLUMN loading_duration INTEGER", []);
    
    // Backfill loading_duration for historical records
    let _ = conn.execute(
        "UPDATE dispatched_trucks
         SET loading_duration = CAST((julianday(out_at) - julianday(loading_at)) * 86400 AS INTEGER)
         WHERE loading_duration IS NULL AND loading_at IS NOT NULL AND out_at IS NOT NULL",
        [],
    );
    let _ = conn.execute(
        "UPDATE active_trucks
         SET loading_duration = CAST((julianday(out_at) - julianday(loading_at)) * 86400 AS INTEGER)
         WHERE loading_duration IS NULL AND loading_at IS NOT NULL AND out_at IS NOT NULL",
        [],
    );
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN playlist_id TEXT", []);
    let _ = conn.execute("ALTER TABLE playlist_items ADD COLUMN display_schedule TEXT DEFAULT '{}'", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN device_id TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN endpoint TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN pairing_status TEXT NOT NULL DEFAULT 'unpaired'", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN last_seen TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN last_sync_revision INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN force_sync BOOLEAN NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE device_settings ADD COLUMN content_library_path TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN is_fullscreen BOOLEAN NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'playlist'", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN gate TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN production_dashboard_id TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN default_content_id TEXT", []);
    let _ = conn.execute("ALTER TABLE content_items ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'", []);
    let _ = conn.execute("ALTER TABLE production_datasets ADD COLUMN selected_table_id TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE production_api_settings
         ADD COLUMN allow_invalid_certs BOOLEAN NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "UPDATE screens SET endpoint = ip_address, pairing_status = 'repair_required'
         WHERE ip_address IS NOT NULL AND endpoint IS NULL AND device_id IS NULL",
        [],
    );

    let device_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM device_settings WHERE singleton = 1",
        [],
        |row| row.get(0),
    )?;
    if device_count == 0 {
        let device_id = uuid::Uuid::new_v4().to_string();
        let hostname = gethostname::gethostname().to_string_lossy().to_string();
        conn.execute(
            "INSERT INTO device_settings
             (singleton, device_id, display_name, role, service_port, protocol_version, current_revision)
             VALUES (1, ?1, ?2, 'Controller', 7420, ?3, 1)",
            rusqlite::params![device_id, hostname, NETWORK_PROTOCOL_VERSION],
        )?;
    }

    // Reset stale ports left by old port-scanning fallback logic.
    // The canonical default is 7420; runtime overrides use CLARIX_PORT or SIGNALOS_PORT env var.
    let _ = conn.execute(
        "UPDATE device_settings SET service_port = 7420 WHERE singleton = 1 AND service_port != 7420",
        [],
    );
    seed_default_marquee(&conn)?;

    tracing::info!("SQLite Database initialized successfully with WAL mode");
    Ok(pool)
}

const SCHEMA: &str = r#"
    CREATE TABLE IF NOT EXISTS screens (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        location     TEXT NOT NULL DEFAULT '',
        ip_address   TEXT,
        mac_address  TEXT,
        resolution_w INTEGER DEFAULT 1920,
        resolution_h INTEGER DEFAULT 1080,
        brightness   INTEGER DEFAULT 80,
        power_on     BOOLEAN DEFAULT TRUE,
        orientation  TEXT DEFAULT 'Landscape',
        group_id     TEXT,
        operating_hours TEXT DEFAULT '{}',
        playlist_id  TEXT,
        force_sync   BOOLEAN NOT NULL DEFAULT 0,
        is_fullscreen BOOLEAN NOT NULL DEFAULT 0,
        purpose      TEXT NOT NULL DEFAULT 'playlist',
        gate         TEXT,
        production_dashboard_id TEXT,
        default_content_id TEXT,
        created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dispatched_trucks (
        id                  TEXT PRIMARY KEY,
        registration_number TEXT NOT NULL,
        gate_no             TEXT,
        waiting_at          TEXT,
        loading_at          TEXT,
        in_at               TEXT,
        out_at              TEXT,
        created_at          TEXT NOT NULL,
        loading_duration    INTEGER
    );

    CREATE TABLE IF NOT EXISTS active_trucks (
        id                  TEXT PRIMARY KEY,
        registration_number TEXT NOT NULL,
        gate_no             TEXT,
        waiting_at          TEXT,
        loading_at          TEXT,
        in_at               TEXT,
        out_at              TEXT,
        created_at          TEXT NOT NULL,
        order_index         INTEGER NOT NULL DEFAULT 0,
        loading_duration    INTEGER
    );

    CREATE TABLE IF NOT EXISTS content_items (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        content_type  TEXT NOT NULL,
        file_path     TEXT,
        url           TEXT,
        duration_secs INTEGER NOT NULL DEFAULT 30,
        tags          TEXT DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlists (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        loop_enabled  BOOLEAN DEFAULT TRUE,
        transition    TEXT DEFAULT 'Fade',
        created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
        id                TEXT PRIMARY KEY,
        playlist_id       TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        content_id        TEXT NOT NULL REFERENCES content_items(id),
        order_index       INTEGER NOT NULL,
        override_duration INTEGER,
        display_schedule  TEXT DEFAULT '{}',
        UNIQUE(playlist_id, order_index)
    );

    CREATE TABLE IF NOT EXISTS schedule_slots (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        screen_ids    TEXT NOT NULL DEFAULT '[]',
        playlist_id   TEXT NOT NULL REFERENCES playlists(id),
        start_time    TEXT NOT NULL,
        duration_mins INTEGER NOT NULL,
        days_of_week  TEXT NOT NULL DEFAULT '["Mon","Tue","Wed","Thu","Fri"]',
        priority      INTEGER DEFAULT 1,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
        id          TEXT PRIMARY KEY,
        screen_id   TEXT NOT NULL,
        content_id  TEXT NOT NULL,
        event_type  TEXT NOT NULL,
        timestamp   TEXT NOT NULL,
        dwell_secs  REAL
    );

    CREATE TABLE IF NOT EXISTS device_settings (
        singleton          INTEGER PRIMARY KEY CHECK (singleton = 1),
        device_id          TEXT NOT NULL,
        display_name       TEXT NOT NULL,
        role               TEXT NOT NULL DEFAULT 'Controller',
        controller_url     TEXT,
        controller_id      TEXT,
        auth_token         TEXT,
        screen_id          TEXT,
        pending_pairing_id TEXT,
        selected_interface TEXT,
        service_port       INTEGER NOT NULL DEFAULT 7420,
        protocol_version   TEXT NOT NULL DEFAULT '1',
        current_revision   INTEGER NOT NULL DEFAULT 1,
        last_successful_sync TEXT
    );

    CREATE TABLE IF NOT EXISTS pairing_requests (
        id            TEXT PRIMARY KEY,
        code          TEXT NOT NULL,
        device_id     TEXT NOT NULL,
        device_name   TEXT NOT NULL,
        player_kind   TEXT NOT NULL,
        screen_id     TEXT,
        status        TEXT NOT NULL DEFAULT 'pending',
        token         TEXT,
        controller_id TEXT,
        created_at    TEXT NOT NULL,
        expires_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_heartbeats (
        device_id        TEXT PRIMARY KEY,
        screen_id        TEXT NOT NULL,
        device_name      TEXT NOT NULL,
        player_kind      TEXT NOT NULL,
        current_revision INTEGER NOT NULL DEFAULT 0,
        last_seen        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_checksums (
        content_id TEXT PRIMARY KEY,
        sha256     TEXT NOT NULL,
        file_path  TEXT NOT NULL,
        file_size  INTEGER NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_datasets (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        source_name       TEXT NOT NULL,
        selected_table_id TEXT,
        tables_json       TEXT NOT NULL DEFAULT '[]',
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_dashboards (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        dataset_id   TEXT NOT NULL REFERENCES production_datasets(id) ON DELETE CASCADE,
        widgets_json TEXT NOT NULL DEFAULT '[]',
        layout_json  TEXT NOT NULL DEFAULT '{}',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL,
        is_developer  BOOLEAN NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token      TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_invites (
        id           TEXT PRIMARY KEY,
        email        TEXT NOT NULL,
        role         TEXT NOT NULL,
        is_developer BOOLEAN NOT NULL DEFAULT 0,
        code         TEXT NOT NULL UNIQUE,
        status       TEXT NOT NULL DEFAULT 'pending',
        created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at   TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        accepted_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
        role        TEXT PRIMARY KEY,
        permissions TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS screen_defaults (
        screen_id          TEXT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
        default_content_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
        updated_at         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_live_sources (
        id               TEXT PRIMARY KEY,
        dataset_id        TEXT NOT NULL REFERENCES production_datasets(id) ON DELETE CASCADE,
        source_path       TEXT,
        source_name       TEXT NOT NULL DEFAULT '',
        enabled           BOOLEAN NOT NULL DEFAULT 1,
        last_imported_at  TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_api_settings (
        singleton             INTEGER PRIMARY KEY CHECK (singleton = 1),
        endpoint              TEXT NOT NULL DEFAULT 'https://172.16.254.249:443/DSC_DSB_API/api/production-summary',
        api_key               TEXT NOT NULL DEFAULT '',
        refresh_interval_secs INTEGER NOT NULL DEFAULT 900,
        allow_invalid_certs   BOOLEAN NOT NULL DEFAULT 0,
        cached_payload        TEXT,
        last_attempt_at       TEXT,
        last_success_at       TEXT,
        last_error            TEXT,
        updated_at            TEXT NOT NULL
    );

    INSERT OR IGNORE INTO production_api_settings
        (singleton, endpoint, api_key, refresh_interval_secs, updated_at)
    VALUES
        (1, 'https://172.16.254.249:443/DSC_DSB_API/api/production-summary', '', 900, datetime('now'));

    CREATE TABLE IF NOT EXISTS marquee_settings (
        singleton  INTEGER PRIMARY KEY CHECK (singleton = 1),
        enabled    BOOLEAN NOT NULL DEFAULT 0,
        text       TEXT NOT NULL DEFAULT '',
        speed      INTEGER NOT NULL DEFAULT 45,
        updated_at TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS revision_content_insert AFTER INSERT ON content_items
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_content_update AFTER UPDATE ON content_items
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_content_delete AFTER DELETE ON content_items
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_playlist_insert AFTER INSERT ON playlists
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_playlist_update AFTER UPDATE ON playlists
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_playlist_delete AFTER DELETE ON playlists
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_item_insert AFTER INSERT ON playlist_items
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_item_update AFTER UPDATE ON playlist_items
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_item_delete AFTER DELETE ON playlist_items
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_schedule_insert AFTER INSERT ON schedule_slots
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_schedule_update AFTER UPDATE ON schedule_slots
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_schedule_delete AFTER DELETE ON schedule_slots
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_production_dataset_insert AFTER INSERT ON production_datasets
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_production_dataset_update AFTER UPDATE ON production_datasets
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_production_dataset_delete AFTER DELETE ON production_datasets
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_production_dashboard_insert AFTER INSERT ON production_dashboards
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_production_dashboard_update AFTER UPDATE ON production_dashboards
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;
    CREATE TRIGGER IF NOT EXISTS revision_production_dashboard_delete AFTER DELETE ON production_dashboards
    WHEN (SELECT role FROM device_settings WHERE singleton = 1) = 'Controller'
    BEGIN UPDATE device_settings SET current_revision = current_revision + 1 WHERE singleton = 1; END;

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_analytics_screen    ON analytics_events(screen_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_ts        ON analytics_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_analytics_type      ON analytics_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_schedule_active     ON schedule_slots(is_active);
    CREATE INDEX IF NOT EXISTS idx_playlist_items_pid  ON playlist_items(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_production_dashboard_dataset ON production_dashboards(dataset_id);
"#;

fn seed_default_marquee(conn: &rusqlite::Connection) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO marquee_settings (singleton, enabled, text, speed, updated_at)
         VALUES (1, 0, '', 45, ?1)",
        rusqlite::params![chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

fn seed_admin_user(conn: &rusqlite::Connection) -> Result<()> {
    if let Some(admin) = configured_admin_user() {
        upsert_admin_user(conn, &admin)?;
        tracing::info!("Configured admin user ensured from ADMIN_USER");
    } else {
        tracing::warn!("ADMIN_USER is not configured; no admin user was seeded");
    }

    Ok(())
}

fn upsert_admin_user(conn: &rusqlite::Connection, admin: &AdminUserConfig) -> Result<()> {
    let normalized_email = admin.email.trim().to_lowercase();
    let now = chrono::Utc::now().to_rfc3339();
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM users WHERE lower(email) = ?1",
            params![normalized_email],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(user_id) = existing_id {
        conn.execute(
            "UPDATE users
             SET name = ?1, email = ?2, password_hash = ?3, role = ?4, is_developer = ?5, updated_at = ?6
             WHERE id = ?7",
            params![
                admin.name.trim(),
                admin.email.trim(),
                admin.password.trim(),
                admin.role.trim(),
                admin.is_developer,
                now,
                user_id,
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, is_developer, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                uuid::Uuid::new_v4().to_string(),
                admin.name.trim(),
                admin.email.trim(),
                admin.password.trim(),
                admin.role.trim(),
                admin.is_developer,
                now,
            ],
        )?;
    }

    Ok(())
}

pub fn get_device_identity(pool: &DbPool) -> Result<DeviceIdentity> {
    let conn = pool.get()?;
    conn.query_row(
        "SELECT device_id, display_name, role, controller_url, controller_id,
                auth_token, screen_id, pending_pairing_id, selected_interface,
                service_port, protocol_version, current_revision
         FROM device_settings WHERE singleton = 1",
        [],
        |row| {
            let role: String = row.get(2)?;
            Ok(DeviceIdentity {
                device_id: row.get(0)?,
                display_name: row.get(1)?,
                role: if role == "Player" { DeviceRole::Player } else { DeviceRole::Controller },
                controller_url: row.get(3)?,
                controller_id: row.get(4)?,
                auth_token: row.get(5)?,
                screen_id: row.get(6)?,
                pending_pairing_id: row.get(7)?,
                selected_interface: row.get(8)?,
                service_port: row.get::<_, i64>(9)? as u16,
                protocol_version: row.get(10)?,
                current_revision: row.get(11)?,
            })
        },
    ).map_err(Into::into)
}
