use chrono::{Duration, Utc};
use rusqlite::{params, OptionalExtension};
use tauri::State;

use crate::{
    db::DbPool,
    models::{AdminRole, AuthSession, AuthUser, TeamInvite},
    security,
};

fn parse_date(value: String) -> chrono::DateTime<Utc> {
    chrono::DateTime::parse_from_rfc3339(&value)
        .map(|date| date.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

fn row_to_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuthUser> {
    let role: String = row.get(3)?;
    Ok(AuthUser {
        id: row.get(0)?,
        name: row.get(1)?,
        email: row.get(2)?,
        role: AdminRole::from_str(&role),
        is_developer: row.get(4)?,
        created_at: parse_date(row.get(5)?),
    })
}

fn query_user_by_token(conn: &rusqlite::Connection, token: &str) -> anyhow::Result<Option<AuthUser>> {
    let now = Utc::now().to_rfc3339();
    conn.query_row(
        "SELECT users.id, users.name, users.email, users.role, users.is_developer, users.created_at
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token = ?1 AND sessions.expires_at > ?2",
        params![token, now],
        row_to_user,
    )
    .optional()
    .map_err(Into::into)
}

fn ensure_super_admin(conn: &rusqlite::Connection, token: &str) -> anyhow::Result<AuthUser> {
    let user = query_user_by_token(conn, token)?
        .ok_or_else(|| anyhow::anyhow!("Please log in again."))?;
    if !user.is_developer {
        anyhow::bail!("Only dev users can manage team access.");
    }
    Ok(user)
}

fn parse_env_admin_user() -> Option<(String, String, String, String, bool)> {
    let val = std::env::var("ADMIN_USER").ok()?;
    let parts: Vec<&str> = val.splitn(5, ',').map(|p| p.trim()).collect();
    if parts.len() < 5 {
        return None;
    }
    Some((
        parts[2].to_string(), // name
        parts[1].to_string(), // password
        parts[3].to_string(), // role
        parts[0].to_string(), // email
        parts[4].to_lowercase() == "true", // is_developer
    ))
}

#[tauri::command]
pub async fn login_user(
    email: String,
    password: String,
    pool: State<'_, DbPool>,
) -> Result<AuthSession, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let normalized_email = email.trim().to_lowercase();

        // ── Read admin user from ADMIN_USER env var ──
        let (name, env_password, role_str, raw_email, is_developer) = parse_env_admin_user()
            .ok_or_else(|| anyhow::anyhow!("ADMIN_USER env var not set or invalid. Format: email,password,name,role,is_developer"))?;

        // Only dev users can login
        if !is_developer {
            anyhow::bail!("Only dev users can login. Set is_developer to true in ADMIN_USER env var.");
        }

        // Check email match
        if raw_email.to_lowercase().trim() != normalized_email {
            anyhow::bail!("Invalid email or password.");
        }

        // Compare plain-text password
        if password.trim() != env_password.trim() {
            anyhow::bail!("Invalid email or password.");
        }

        let conn = pool.get()?;

        // Upsert user in DB to ensure user_id exists for session
        let user_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let existing_id: Option<String> = conn
            .query_row(
                "SELECT id FROM users WHERE lower(email) = ?1",
                params![normalized_email],
                |row| row.get(0),
            )
            .optional()?;

        let user_id = if let Some(uid) = existing_id {
            conn.execute(
                "UPDATE users SET name = ?1, role = ?2, is_developer = ?3, updated_at = ?4 WHERE id = ?5",
                params![name, role_str, is_developer, now, uid],
            )?;
            uid
        } else {
            conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, is_developer, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                params![user_id, name, raw_email, "", role_str, is_developer, now],
            )?;
            user_id
        };

        // Create session
        let token = uuid::Uuid::new_v4().to_string();
        let session_id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now();
        let expires_at = created_at + Duration::days(7);
        conn.execute(
            "INSERT INTO sessions (id, user_id, token, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                session_id,
                user_id,
                token,
                created_at.to_rfc3339(),
                expires_at.to_rfc3339(),
            ],
        )?;

        let user = AuthUser {
            id: user_id,
            name,
            email: raw_email,
            role: AdminRole::from_str(&role_str),
            is_developer,
            created_at: parse_date(now),
        };

        Ok::<_, anyhow::Error>(AuthSession {
            token,
            expires_at,
            user,
        })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn logout_user(token: String, pool: State<'_, DbPool>) -> Result<(), String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute("DELETE FROM sessions WHERE token = ?1", params![token])?;
        Ok::<_, anyhow::Error>(())
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_current_user(token: String, pool: State<'_, DbPool>) -> Result<Option<AuthUser>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        query_user_by_token(&conn, &token)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_team_members(token: String, pool: State<'_, DbPool>) -> Result<Vec<AuthUser>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        ensure_super_admin(&conn, &token)?;
        let mut stmt = conn.prepare(
            "SELECT id, name, email, role, is_developer, created_at FROM users ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_user)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error: anyhow::Error| error.to_string())
}

#[tauri::command]
pub async fn create_team_invite(
    token: String,
    email: String,
    role: String,
    is_developer: bool,
    pool: State<'_, DbPool>,
) -> Result<TeamInvite, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let creator = ensure_super_admin(&conn, &token)?;
        let now = Utc::now();
        let invite = TeamInvite {
            id: uuid::Uuid::new_v4().to_string(),
            email: email.trim().to_lowercase(),
            role: AdminRole::from_str(&role),
            is_developer,
            code: uuid::Uuid::new_v4().simple().to_string()[..8].to_uppercase(),
            status: "pending".to_string(),
            created_at: now,
            expires_at: now + Duration::days(14),
        };
        conn.execute(
            "INSERT INTO team_invites (id, email, role, is_developer, code, status, created_by, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                invite.id,
                invite.email,
                invite.role.as_str(),
                invite.is_developer,
                invite.code,
                invite.status,
                creator.id,
                invite.created_at.to_rfc3339(),
                invite.expires_at.to_rfc3339(),
            ],
        )?;
        Ok::<_, anyhow::Error>(invite)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_team_invites(token: String, pool: State<'_, DbPool>) -> Result<Vec<TeamInvite>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        ensure_super_admin(&conn, &token)?;
        let mut stmt = conn.prepare(
            "SELECT id, email, role, is_developer, code, status, created_at, expires_at
             FROM team_invites ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            let role: String = row.get(2)?;
            Ok(TeamInvite {
                id: row.get(0)?,
                email: row.get(1)?,
                role: AdminRole::from_str(&role),
                is_developer: row.get(3)?,
                code: row.get(4)?,
                status: row.get(5)?,
                created_at: parse_date(row.get(6)?),
                expires_at: parse_date(row.get(7)?),
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error: anyhow::Error| error.to_string())
}

#[tauri::command]
pub async fn accept_team_invite(
    code: String,
    name: String,
    password: String,
    pool: State<'_, DbPool>,
) -> Result<AuthSession, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let now = Utc::now();
        let invite = tx.query_row(
            "SELECT id, email, role, is_developer, code, status, created_at, expires_at
             FROM team_invites WHERE code = ?1",
            params![code.trim().to_uppercase()],
            |row| {
                let role: String = row.get(2)?;
                Ok(TeamInvite {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    role: AdminRole::from_str(&role),
                    is_developer: row.get(3)?,
                    code: row.get(4)?,
                    status: row.get(5)?,
                    created_at: parse_date(row.get(6)?),
                    expires_at: parse_date(row.get(7)?),
                })
            },
        ).optional()?.ok_or_else(|| anyhow::anyhow!("Invite code not found."))?;
        if invite.status != "pending" || invite.expires_at < now {
            anyhow::bail!("Invite code is no longer valid.");
        }

        let user_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO users (id, name, email, password_hash, role, is_developer, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                user_id,
                name.trim(),
                invite.email,
                security::hash_password(&password)?,
                invite.role.as_str(),
                invite.is_developer,
                now.to_rfc3339(),
            ],
        )?;
        tx.execute(
            "UPDATE team_invites SET status = 'accepted', accepted_at = ?1 WHERE id = ?2",
            params![now.to_rfc3339(), invite.id],
        )?;
        let token = uuid::Uuid::new_v4().to_string();
        let expires_at = now + Duration::days(7);
        tx.execute(
            "INSERT INTO sessions (id, user_id, token, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                user_id,
                token,
                now.to_rfc3339(),
                expires_at.to_rfc3339(),
            ],
        )?;
        tx.commit()?;
        let conn = pool.get()?;
        let user = query_user_by_token(&conn, &token)?.ok_or_else(|| anyhow::anyhow!("Session failed."))?;
        Ok::<_, anyhow::Error>(AuthSession { token, expires_at, user })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_role_permissions(token: String, pool: State<'_, DbPool>) -> Result<Vec<String>, String> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let user = query_user_by_token(&conn, &token)?
            .ok_or_else(|| anyhow::anyhow!("Please log in again."))?;
        // Dev users get full access; others get no permissions (frontend handles role defaults)
        let perms = if user.is_developer {
            vec!["all".to_string()]
        } else {
            Vec::new()
        };
        Ok::<_, anyhow::Error>(perms)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}
