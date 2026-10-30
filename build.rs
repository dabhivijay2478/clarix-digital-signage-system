fn main() {
    // Embed the optional repository `.env` (ADMIN_USER etc.) into the binary at
    // build time, mirroring the behaviour the packaged Tauri build used to have.
    println!("cargo:rerun-if-changed=.env");
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let env_source = std::path::Path::new(".env");
    let encoded = if env_source.is_file() {
        let contents = std::fs::read_to_string(env_source).unwrap_or_default();
        // Represent as `(key, value)` string literal pairs. The generated file
        // is included in EXPRESSION position (see `auth_config.rs`), so it must
        // contain a lone array expression, not a `const` item.
        let mut pairs = Vec::new();
        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let line = line.strip_prefix("export ").unwrap_or(line);
            if let Some((key, value)) = line.split_once('=') {
                pairs.push(format!(
                    "({:?}, {:?}),",
                    key.trim(),
                    value.trim().trim_matches('"').trim_matches('\'')
                ));
            }
        }
        format!("&[{}]\nas &[(&'static str, &'static str)]\n", pairs.join("\n"))
    } else {
        "&[]\nas &[(&'static str, &'static str)]\n".to_string()
    };
    std::fs::write(
        std::path::Path::new(&out_dir).join("build_env.rs"),
        encoded,
    )
    .unwrap();

    // Windows executable icon.
    if std::env::var("CARGO_CFG_WINDOWS").is_ok() {
        if std::path::Path::new("assets/icon.ico").is_file() {
            let mut res = winresource::WindowsResource::new();
            res.set_icon("assets/icon.ico");
            res.compile().expect("failed to embed Windows icon");
        }
    }
}
