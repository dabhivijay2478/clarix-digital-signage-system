use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

/// Initialize the SQLite database with connection pooling and schema.
pub fn init_db(app_data_dir: &str) -> Result<DbPool> {
    // Ensure the app data directory exists
    std::fs::create_dir_all(app_data_dir)?;

    let db_path = Path::new(app_data_dir).join("signalos.db");
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
        created_at   TEXT NOT NULL
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

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_analytics_screen    ON analytics_events(screen_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_ts        ON analytics_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_analytics_type      ON analytics_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_schedule_active     ON schedule_slots(is_active);
    CREATE INDEX IF NOT EXISTS idx_playlist_items_pid  ON playlist_items(playlist_id);
"#;
