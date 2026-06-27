use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::{Path, PathBuf};
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
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'playlist'", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN gate TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN production_dashboard_id TEXT", []);
    let _ = conn.execute("ALTER TABLE screens ADD COLUMN default_content_id TEXT", []);
    let _ = conn.execute("ALTER TABLE content_items ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'", []);
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
    seed_default_admin_users(&conn, &PathBuf::from(app_data_dir))?;
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

// ── Default file contents ────────────────────────────────────────────────────

const DEFAULT_ADMIN_USERS_TXT: &str = r#"# MG Enterprise — Admin Users Configuration
# ============================================================
# Each non-blank, non-comment line defines one user.
# Format (comma-separated, 5 fields):
#
#   email, password, name, role, is_developer
#
# Fields:
#   email          - login email address (must be unique)
#   password       - plain-text password (hashed automatically on save)
#   name           - display name shown in the UI
#   role           - one of: SuperAdmin, SiteSuperAdmin, Manager, User
#   is_developer   - true or false  (developers see extra tools in the UI)
#
# Rules:
#   - Changes take effect on next app restart.
#   - Existing DB passwords are NOT overwritten unless you change the
#     password field here AND restart. The app tracks which config
#     password was last applied (see admin_users_applied.txt).
#   - Lines starting with # are comments and are ignored.
#   - Blank lines are ignored.
# ============================================================

admin@mgenterprise.local, admin1234, Super Admin, SuperAdmin, false
dev@mgenterprise.local,   dev1234,   Developer,   SuperAdmin, true
"#;

const DEFAULT_ROLE_PERMISSIONS_TXT: &str = r#"# MG Enterprise — Role Permissions Configuration
# ============================================================
# Each non-blank, non-comment line defines permissions for one role.
# Format (comma-separated):
#
#   role, permission1, permission2, ...
#
# Available permissions:
#   all            - unrestricted access to everything
#   screens        - manage display screens
#   content        - manage media content library
#   production     - access production data dashboards
#   trucks         - manage truck token queue
#   team           - manage team members and invites
#   view           - read-only access to basic views
#
# Rules:
#   - Changes take effect on next app restart.
#   - Lines starting with # are comments and are ignored.
#   - Blank lines are ignored.
# ============================================================

SuperAdmin,      all
SiteSuperAdmin,  screens, content, production, trucks, team
Manager,         screens, content, production, trucks
User,            view
"#;

// ── File-based user config structs ───────────────────────────────────────────

#[derive(Debug)]
struct AdminUserConfig {
    email: String,
    password: String,
    name: String,
    role: String,
    is_developer: bool,
}

#[derive(Debug)]
struct RolePermConfig {
    role: String,
    permissions: Vec<String>,
}

/// Parse admin_users.txt content into a list of AdminUserConfig.
fn parse_admin_users(content: &str) -> Vec<AdminUserConfig> {
    let mut users = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = trimmed.splitn(5, ',').map(|p| p.trim()).collect();
        if parts.len() < 5 {
            tracing::warn!("admin_users.txt: skipping malformed line: {:?}", trimmed);
            continue;
        }
        let is_developer = parts[4].to_lowercase() == "true";
        users.push(AdminUserConfig {
            email: parts[0].to_lowercase(),
            password: parts[1].to_string(),
            name: parts[2].to_string(),
            role: parts[3].to_string(),
            is_developer,
        });
    }
    users
}

/// Parse role_permissions.txt content into a list of RolePermConfig.
fn parse_role_permissions(content: &str) -> Vec<RolePermConfig> {
    let mut roles = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').map(|p| p.trim()).collect();
        if parts.is_empty() || parts[0].is_empty() {
            continue;
        }
        let role = parts[0].to_string();
        let permissions: Vec<String> = parts[1..].iter()
            .filter(|p| !p.is_empty())
            .map(|p| p.to_string())
            .collect();
        if permissions.is_empty() {
            tracing::warn!("role_permissions.txt: role '{}' has no permissions, skipping", role);
            continue;
        }
        roles.push(RolePermConfig { role, permissions });
    }
    roles
}

// ── Seed function ─────────────────────────────────────────────────────────────

fn seed_default_admin_users(conn: &rusqlite::Connection, app_data_dir: &PathBuf) -> Result<()> {
    // ── Step 1: Ensure config files exist (create with defaults if missing) ──

    let admin_users_path = app_data_dir.join("admin_users.txt");
    let role_perms_path  = app_data_dir.join("role_permissions.txt");

    if !admin_users_path.exists() {
        std::fs::write(&admin_users_path, DEFAULT_ADMIN_USERS_TXT)
            .map_err(|e| anyhow::anyhow!("Failed to create admin_users.txt: {}", e))?;
        tracing::info!("Created default admin_users.txt at {}", admin_users_path.display());
    }
    if !role_perms_path.exists() {
        std::fs::write(&role_perms_path, DEFAULT_ROLE_PERMISSIONS_TXT)
            .map_err(|e| anyhow::anyhow!("Failed to create role_permissions.txt: {}", e))?;
        tracing::info!("Created default role_permissions.txt at {}", role_perms_path.display());
    }

    // ── Step 2: Read and parse both files ──

    let admin_users_content = std::fs::read_to_string(&admin_users_path)
        .unwrap_or_else(|e| {
            tracing::warn!("Could not read admin_users.txt ({}), using defaults", e);
            DEFAULT_ADMIN_USERS_TXT.to_string()
        });
    let role_perms_content = std::fs::read_to_string(&role_perms_path)
        .unwrap_or_else(|e| {
            tracing::warn!("Could not read role_permissions.txt ({}), using defaults", e);
            DEFAULT_ROLE_PERMISSIONS_TXT.to_string()
        });

    let admin_users = parse_admin_users(&admin_users_content);
    let role_perms  = parse_role_permissions(&role_perms_content);

    tracing::info!(
        "Loaded {} admin user(s) and {} role permission(s) from config files",
        admin_users.len(), role_perms.len()
    );

    // ── Step 3: Read the previously applied password snapshot ──
    // We store a simple file of "email=bcrypt_hash" so we can detect when
    // the plain-text password in admin_users.txt has been changed.

    let applied_path = app_data_dir.join("admin_users_applied.txt");
    let applied_snapshot: std::collections::HashMap<String, String> = std::fs::read_to_string(&applied_path)
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, '=');
            let email = parts.next()?.trim().to_string();
            let hash  = parts.next()?.trim().to_string();
            Some((email, hash))
        })
        .collect();

    let now = chrono::Utc::now().to_rfc3339();
    let mut new_snapshot: Vec<String> = Vec::new();

    // ── Step 4: Upsert each admin user from the file ──
    for user in &admin_users {
        // Determine whether we need to update the password hash.
        // We compare the plain-text password string from the file against the
        // previously-applied plain-text password we stored as a bcrypt hash.
        let previous_hash = applied_snapshot.get(&user.email);
        let password_changed = match previous_hash {
            Some(hash) => !crate::security::verify_password(&user.password, hash),
            None => true, // new user, always hash
        };

        if password_changed {
            tracing::info!("admin_users.txt: hashing updated password for {}", user.email);
            let hash = crate::security::hash_password(&user.password)
                .map_err(|e| anyhow::anyhow!("Failed to hash password for {}: {}", user.email, e))?;

            // Check if user already exists
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM users WHERE lower(email) = lower(?1)",
                rusqlite::params![user.email],
                |row| row.get(0),
            ).unwrap_or(0);

            if exists > 0 {
                // Update existing user
                conn.execute(
                    "UPDATE users SET name = ?1, password_hash = ?2, role = ?3, is_developer = ?4, updated_at = ?5
                     WHERE lower(email) = lower(?6)",
                    rusqlite::params![
                        user.name,
                        hash,
                        user.role,
                        user.is_developer,
                        now,
                        user.email,
                    ],
                )?;
                tracing::info!("admin_users.txt: updated user '{}' ({})", user.name, user.email);
            } else {
                // Insert new user
                conn.execute(
                    "INSERT INTO users (id, name, email, password_hash, role, is_developer, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                    rusqlite::params![
                        uuid::Uuid::new_v4().to_string(),
                        user.name,
                        user.email,
                        hash,
                        user.role,
                        user.is_developer,
                        now,
                    ],
                )?;
                tracing::info!("admin_users.txt: created user '{}' ({})", user.name, user.email);
            }

            new_snapshot.push(format!("{}={}", user.email, hash));
        } else {
            // Password unchanged — update only non-sensitive fields
            conn.execute(
                "UPDATE users SET name = ?1, role = ?2, is_developer = ?3, updated_at = ?4
                 WHERE lower(email) = lower(?5)",
                rusqlite::params![
                    user.name,
                    user.role,
                    user.is_developer,
                    now,
                    user.email,
                ],
            )?;
            // Keep the existing hash in the snapshot
            new_snapshot.push(format!("{}={}", user.email, previous_hash.unwrap()));
        }
    }

    // ── Step 5: Write updated applied snapshot ──
    std::fs::write(&applied_path, new_snapshot.join("\n"))
        .unwrap_or_else(|e| tracing::warn!("Could not write admin_users_applied.txt: {}", e));

    // ── Step 6: Upsert role permissions from file ──
    for rp in &role_perms {
        let perms_json = serde_json::to_string(&rp.permissions)
            .unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR REPLACE INTO role_permissions (role, permissions) VALUES (?1, ?2)",
            rusqlite::params![rp.role, perms_json],
        )?;
        tracing::info!("role_permissions.txt: set '{}' => {}", rp.role, perms_json);
    }

    Ok(())
}

fn seed_default_marquee(conn: &rusqlite::Connection) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO marquee_settings (singleton, enabled, text, speed, updated_at)
         VALUES (1, 0, '', 45, ?1)",
        rusqlite::params![chrono::Utc::now().to_rfc3339()],
    )?;
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
