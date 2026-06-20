use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::Path;
use crate::models::{DeviceIdentity, DeviceRole, NETWORK_PROTOCOL_VERSION};

pub type DbPool = Pool<SqliteConnectionManager>;

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

    // Run dynamic migrations (in SQLite, we gracefully ignore column addition errors if they already exist)
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN operating_hours TEXT DEFAULT '{}'", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN playlist_id TEXT", []);
    let _ = conn.execute("ALTER TABLE playlist_items ADD COLUMN display_schedule TEXT DEFAULT '{}'", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN device_id TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN endpoint TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN pairing_status TEXT NOT NULL DEFAULT 'unpaired'", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN last_seen TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN last_sync_revision INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN force_sync BOOLEAN NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN is_fullscreen BOOLEAN NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE production_datasets ADD COLUMN selected_table_id TEXT", []);
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

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO screens (id, name, location, resolution_w, resolution_h, brightness, power_on, orientation, created_at, pairing_status)
         VALUES ('d4-gate-screen', 'D4 Gate Screen', 'Gate D4', 1920, 1080, 80, 1, 'Landscape', ?1, 'unpaired')",
        rusqlite::params![now],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO screens (id, name, location, resolution_w, resolution_h, brightness, power_on, orientation, created_at, pairing_status)
         VALUES ('d5-gate-screen', 'D5 Gate Screen', 'Gate D5', 1920, 1080, 80, 1, 'Landscape', ?1, 'unpaired')",
        rusqlite::params![now],
    )?;

    let now = chrono::Utc::now().to_rfc3339();
    // Seed default content items
    let _ = conn.execute(
        "INSERT OR IGNORE INTO content_items (id, name, content_type, url, duration_secs, tags, created_at)
         VALUES ('d4-gate-display-content', 'D4 Gate Display', 'WebApp', '/trucks/display?gate=d4', 30, '[\"gate\",\"d4\"]', ?1)",
        rusqlite::params![now],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO content_items (id, name, content_type, url, duration_secs, tags, created_at)
         VALUES ('d5-gate-display-content', 'D5 Gate Display', 'WebApp', '/trucks/display?gate=d5', 30, '[\"gate\",\"d5\"]', ?1)",
        rusqlite::params![now],
    );

    // Seed default playlists
    let _ = conn.execute(
        "INSERT OR IGNORE INTO playlists (id, name, loop_enabled, transition, created_at)
         VALUES ('d4-gate-playlist', 'Playlist for D4 Gate Screen', 1, 'Fade', ?1)",
        rusqlite::params![now],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO playlists (id, name, loop_enabled, transition, created_at)
         VALUES ('d5-gate-playlist', 'Playlist for D5 Gate Screen', 1, 'Fade', ?1)",
        rusqlite::params![now],
    );

    // Seed default playlist items
    let _ = conn.execute(
        "INSERT OR IGNORE INTO playlist_items (id, playlist_id, content_id, order_index, override_duration, display_schedule)
         VALUES ('d4-gate-playlist-item', 'd4-gate-playlist', 'd4-gate-display-content', 0, NULL, '{}')",
        [],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO playlist_items (id, playlist_id, content_id, order_index, override_duration, display_schedule)
         VALUES ('d5-gate-playlist-item', 'd5-gate-playlist', 'd5-gate-display-content', 0, NULL, '{}')",
        [],
    );

    // Update screens to link to these playlists
    let _ = conn.execute(
        "UPDATE screens SET playlist_id = 'd4-gate-playlist' WHERE id = 'd4-gate-screen' AND playlist_id IS NULL",
        [],
    );
    let _ = conn.execute(
        "UPDATE screens SET playlist_id = 'd5-gate-playlist' WHERE id = 'd5-gate-screen' AND playlist_id IS NULL",
        [],
    );

    // Reset stale ports left by old port-scanning fallback logic.
    // The canonical default is 7420; runtime overrides use CLARIX_PORT or SIGNALOS_PORT env var.
    let _ = conn.execute(
        "UPDATE device_settings SET service_port = 7420 WHERE singleton = 1 AND service_port != 7420",
        [],
    );

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
        created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dispatched_trucks (
        id                  TEXT PRIMARY KEY,
        registration_number TEXT NOT NULL,
        gate_no             TEXT,
        is_waiting          BOOLEAN NOT NULL DEFAULT 0,
        is_loading          BOOLEAN NOT NULL DEFAULT 0,
        is_in               BOOLEAN NOT NULL DEFAULT 0,
        is_out              BOOLEAN NOT NULL DEFAULT 0,
        waiting_at          TEXT,
        loading_at          TEXT,
        in_at               TEXT,
        out_at              TEXT,
        created_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_items (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        content_type  TEXT NOT NULL,
        file_path     TEXT,
        url           TEXT,
        duration_secs INTEGER NOT NULL DEFAULT 30,
        tags          TEXT DEFAULT '[]',
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
