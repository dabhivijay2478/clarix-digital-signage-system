#[derive(Debug, Clone)]
pub struct AdminUserConfig {
    pub email: String,
    pub password: String,
    pub name: String,
    pub role: String,
    pub is_developer: bool,
}

const BUILD_ENV: &str = include_str!("../../.env");

fn parse_admin_user(value: &str) -> Option<AdminUserConfig> {
    let parts: Vec<&str> = value.splitn(5, ',').map(|part| part.trim()).collect();
    if parts.len() < 5 || parts.iter().any(|part| part.is_empty()) {
        return None;
    }

    Some(AdminUserConfig {
        email: parts[0].to_string(),
        password: parts[1].to_string(),
        name: parts[2].to_string(),
        role: parts[3].to_string(),
        is_developer: parts[4].eq_ignore_ascii_case("true"),
    })
}

fn parse_dotenv_value(contents: &str, key: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            return None;
        }

        let line = line.strip_prefix("export ").unwrap_or(line);
        let (candidate_key, value) = line.split_once('=')?;
        if candidate_key.trim() != key {
            return None;
        }

        let value = value.trim();
        Some(
            value
                .strip_prefix('"')
                .and_then(|value| value.strip_suffix('"'))
                .or_else(|| {
                    value
                        .strip_prefix('\'')
                        .and_then(|value| value.strip_suffix('\''))
                })
                .unwrap_or(value)
                .to_string(),
        )
    })
}

pub fn configured_admin_user() -> Option<AdminUserConfig> {
    std::env::var("ADMIN_USER")
        .ok()
        .and_then(|value| parse_admin_user(&value))
        .or_else(|| {
            parse_dotenv_value(BUILD_ENV, "ADMIN_USER").and_then(|value| parse_admin_user(&value))
        })
}
