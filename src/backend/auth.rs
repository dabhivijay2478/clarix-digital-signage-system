use chrono::{Duration, Utc};
use rusqlite::{params, OptionalExtension};

use crate::{
    auth_config::configured_admin_user,
    models::{AdminRole, AuthSession, AuthUser, TeamInvite},
    state::AppCore,
};

pub fn parse_date(value: String) -> chrono::DateTime<Utc> {
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

fn query_user_by_token(core: &AppCore, token: &str) -> anyhow::Result<Option<AuthUser>> {
    let now = Utc::now().to_rfc3339();
    let conn = core.pool.get()?;
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

fn user_by_token_string(core: &AppCore, token: &str) -> Result<Option<AuthUser>, String> {
    query_user_by_token(core, token).map_err(|error| error.to_string())
}

fn ensure_super_admin(core: &AppCore, token: &str) -> anyhow::Result<AuthUser> {
    let user = query_user_by_token(core, token)?
        .ok_or_else(|| anyhow::anyhow!("Please log in again."))?;
    if !user.is_developer {
        anyhow::bail!("Only dev users can manage team access.");
    }
    Ok(user)
}

pub fn login_user(core: &AppCore, email: String, password: String) -> Result<AuthSession, String> {
    let normalized_email = email.trim().to_lowercase();
    let conn = core.pool.get().map_err(|e| e.to_string())?;

    // First, check if this is the env-based admin user
    if let Some(admin) = configured_admin_user() {
        if admin.email.to_lowercase().trim() == normalized_email {
            // Compare plain-text password for env admin
            if password.trim() != admin.password.trim() {
                return Err("Invalid email or password.".to_string());
            }

            // Upsert env admin user in DB
            let now = Utc::now().to_rfc3339();
            let existing_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM users WHERE lower(email) = ?1",
                    params![normalized_email],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let user_id = if let Some(uid) = existing_id {
                conn.execute(
                    "UPDATE users SET name = ?1, email = ?2, password_hash = ?3, role = ?4, is_developer = ?5, updated_at = ?6 WHERE id = ?7",
                    params![admin.name, admin.email, admin.password, admin.role, admin.is_developer, now, uid],
                )
                .map_err(|e| e.to_string())?;
                uid
            } else {
                let new_id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO users (id, name, email, password_hash, role, is_developer, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                    params![new_id, admin.name, admin.email, admin.password, admin.role, admin.is_developer, now],
                )
                .map_err(|e| e.to_string())?;
                new_id
            };

            // Create session
            let token = uuid::Uuid::new_v4().to_string();
            let created_at = Utc::now();
            let expires_at = created_at + Duration::days(7);
            conn.execute(
                "INSERT INTO sessions (id, user_id, token, created_at, expires_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    user_id,
                    token,
                    created_at.to_rfc3339(),
                    expires_at.to_rfc3339(),
                ],
            )
            .map_err(|e| e.to_string())?;

            return Ok(AuthSession {
                token,
                expires_at,
                user: AuthUser {
                    id: user_id,
                    name: admin.name,
                    email: admin.email,
                    role: AdminRole::from_str(&admin.role),
                    is_developer: admin.is_developer,
                    created_at: parse_date(now),
                },
            });
        }
    }

    // Check for regular users (invited users) — plain text password comparison
    let user_row: Option<(String, String, String, String, bool, String)> = conn
        .query_row(
            "SELECT id, name, email, role, is_developer, password_hash FROM users WHERE lower(email) = ?1",
            params![normalized_email],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((user_id, name, user_email, role_str, is_developer, stored_password)) = user_row {
        if password.trim() != stored_password.trim() {
            return Err("Invalid email or password.".to_string());
        }

        let token = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now();
        let expires_at = created_at + Duration::days(7);
        conn.execute(
            "INSERT INTO sessions (id, user_id, token, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                user_id,
                token,
                created_at.to_rfc3339(),
                expires_at.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;

        return Ok(AuthSession {
            token,
            expires_at,
            user: AuthUser {
                id: user_id,
                name,
                email: user_email,
                role: AdminRole::from_str(&role_str),
                is_developer,
                created_at: parse_date(created_at.to_rfc3339()),
            },
        });
    }

    Err("Invalid email or password.".to_string())
}

pub fn logout_user(core: &AppCore, token: String) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE token = ?1", params![token])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_current_user(core: &AppCore, token: &str) -> Result<Option<AuthUser>, String> {
    user_by_token_string(core, token)
}

pub fn get_team_members(core: &AppCore, token: &str) -> Result<Vec<AuthUser>, String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    ensure_super_admin(core, token).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, email, role, is_developer, created_at FROM users ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_user).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

pub fn create_team_invite(
    core: &AppCore,
    token: &str,
    email: String,
    role: String,
    is_developer: bool,
) -> Result<TeamInvite, String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    let creator = ensure_super_admin(core, token).map_err(|e| e.to_string())?;
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
    )
    .map_err(|e| e.to_string())?;
    Ok(invite)
}

pub fn get_team_invites(core: &AppCore, token: &str) -> Result<Vec<TeamInvite>, String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    ensure_super_admin(core, token).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, email, role, is_developer, code, status, created_at, expires_at
             FROM team_invites ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

pub fn accept_team_invite(
    core: &AppCore,
    code: String,
    name: String,
    password: String,
) -> Result<AuthSession, String> {
    let mut conn = core.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = Utc::now();
    let invite = tx
        .query_row(
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
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Invite code not found.".to_string())?;
    if invite.status != "pending" || invite.expires_at < now {
        return Err("Invite code is no longer valid.".to_string());
    }

    let user_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO users (id, name, email, password_hash, role, is_developer, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            user_id,
            name.trim(),
            invite.email,
            password.trim(),
            invite.role.as_str(),
            invite.is_developer,
            now.to_rfc3339(),
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE team_invites SET status = 'accepted', accepted_at = ?1 WHERE id = ?2",
        params![now.to_rfc3339(), invite.id],
    )
    .map_err(|e| e.to_string())?;
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
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    let user = user_by_token_string(core, &token)?
        .ok_or_else(|| "Session failed.".to_string())?;
    Ok(AuthSession { token, expires_at, user })
}

pub fn get_role_permissions(core: &AppCore, token: &str) -> Result<Vec<String>, String> {
    let user = user_by_token_string(core, token)?
        .ok_or_else(|| "Please log in again.".to_string())?;
    // Dev users get full access; others get no permissions (UI handles role defaults)
    Ok(if user.is_developer {
        vec!["all".to_string()]
    } else {
        Vec::new()
    })
}

pub fn delete_team_invite(core: &AppCore, token: &str, invite_id: String) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    ensure_super_admin(core, token).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM team_invites WHERE id = ?1", params![invite_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_team_member(core: &AppCore, token: &str, user_id: String) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    ensure_super_admin(core, token).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE user_id = ?1", params![user_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM users WHERE id = ?1", params![user_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_team_member(
    core: &AppCore,
    token: &str,
    user_id: String,
    role: String,
    is_developer: bool,
) -> Result<AuthUser, String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    ensure_super_admin(core, token).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE users SET role = ?1, is_developer = ?2, updated_at = ?3 WHERE id = ?4",
        params![role, is_developer, now, user_id],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, name, email, role, is_developer, created_at FROM users WHERE id = ?1",
        params![user_id],
        row_to_user,
    )
    .map_err(|e| e.to_string())
}

pub fn reset_team_member_password(
    core: &AppCore,
    token: &str,
    user_id: String,
    new_password: String,
) -> Result<(), String> {
    let conn = core.pool.get().map_err(|e| e.to_string())?;
    ensure_super_admin(core, token).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = ?2 WHERE id = ?3",
        params![new_password.trim(), now, user_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE user_id = ?1", params![user_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
