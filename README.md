# Clarix — Digital Signage + Fleet Management Desktop App

Clarix is a fully native desktop application for managing **digital signage screens** and **truck fleets** from a single control center. Written in **Rust** with an **egui (eframe) GUI**, a self-contained **SQLite** database, and an embedded **axum** controller server — no Node.js, no webview, no external servers or Docker needed.

For cross-machine setup, one-time player pairing, firewall guidance, and troubleshooting, see [testing_guide.md](./testing_guide.md). For offline LAN router setup, including TP-Link Archer C20 examples and Samsung QB55C URL Launcher steps, see [docs/offline-router-setup.md](./docs/offline-router-setup.md). Use packaged players for offline signage or `http://<controller-ip>:7420/player` for a connected-only browser player.

---

## ✨ What's Inside

| Area | Details |
|------|---------|
| **GUI** | Native window (egui 0.37) with login, admin pages and an in-app player mode |
| **Screens** | Register displays (name, location, IP, orientation, resolution), pair them, choose purpose: playlist / truck gate / production dashboard, operating hours |
| **Content** | Import images, videos, docs, Excel/CSV; web-app URLs; per-item durations; thumbnails in the library |
| **Playlists** | Ordered items with per-item weekday/time/date schedules and transition overrides |
| **Schedule** | Per-screen schedule slots (priority, weekday sets, durations) that override playlists live |
| **Trucks** | Token gate board with 2 gates, queue moves/reorders, alerts, dispatch summary persistence |
| **Marquee** | Scrolling notice broadcast to every player, speed clamped ≥ 15 px/s |
| **Production** | Import Excel/CSV reports, build dashboards, publish them to screens |
| **Analytics** | Play/Complete event roll-ups + timeline charts |
| **Database** | Browse tables, export CSV, back up the content library to ZIP |
| **Team** | Only for SuperAdmins — invites, roles, password resets |
| **LAN Sync** | axum controller on fixed port **7420** + mDNS discovery + event streams (`/v1/events`, `/v1/truck-alerts`) |
| **Video** | Frame-accurate playback via bundled-by-sidecar ffmpeg piping into a texture |

---

## 🔧 What You Need Before Starting

| # | Tool | Why You Need It | How To Check If Installed |
|---|------|-----------------|---------------------------|
| 1 | **Rust** | Compiles the whole app | Terminal → `rustc --version` |
| 2 | **Git** | Downloads the project | Terminal → `git --version` |

On Windows, Rust's default toolchain (MSVC) needs the free [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **"Desktop development with C++"** workload. On macOS run `xcode-select --install`.

Install Rust via [https://rustup.rs](https://rustup.rs) (accept the default, then restart your terminal).

---

## 🚀 Setup & Run

```bash
# 1. Get the code
git clone https://github.com/dabhivijay2478/clarix-digital-signage-system.git
cd clarix-digital-signage-system

# 2. Run (first build compiles everything — expect a few minutes)
cargo run
```

Subsequent launches start almost instantly. For a packaged build:

```bash
cargo build --release
# binary: target/release/clarix.exe (Windows) / clarix (macOS/Linux)
```

### First Sign-In

Without configuration the database starts empty. Create the initial admin by adding a `.env` file in the project root (values are embedded at build time):

```
ADMIN_USER=your@mail.com
ADMIN_PASSWORD=strong-password
```

Then rebuild (`cargo run`). The login screen accepts this account first, and **Team → invites** create the rest of the user accounts. See `admin_users.example.txt` and `role_permissions.example.txt` for the available knobs.

### Where Data Lives

| Item | Location |
|------|----------|
| Database | `%APPDATA%/com.clarix.app/clarix.db` (Windows; `~/Library/Application Support/com.clarix.app` on macOS) |
| Content library | `com.clarix.app/content/` (also the media root served to players) |
| Truck gates config | `com.clarix.app/clarix-data/gates.json` |

---

## 🖥 Player Pairing (overview)

1. On the sign days, open **Screens → Add screen** on the controller and click **Pair** — a code is shown.
2. Start the player on the target machine, choose **Pair**, enter the code. The player fetches `/api/info`, joins `/v1/pairing/requests`, and approves itself against the controller on port **7420**.
3. Pairing writes the controller URL into the player's local settings; every subsequent launch pulls `/v1/sync/manifest`, downloads assets from `/v1/assets/{sha256}`, and acknowledges `/v1/sync/ack`.

Full details, firewall rules, and the Samsung Tizen receiver flow: [testing_guide.md](./testing_guide.md) and [tizen/](./tizen/).

## 🧭 Controller API (port 7420)

- `GET /v1/health`, `GET /status` — identity + revision
- `GET /v1/sync/manifest`, `GET /v1/assets/{sha256}`, `POST /v1/sync/ack` — offline sync
- `POST /v1/pairing/requests` (+`GET …/{id}`), `POST /v1/players/heartbeat` — pairing/heartbeat
- `GET /v1/events`, `GET /v1/truck-alerts` — SSE streams
- `GET /api/{screens,playlists,content,schedule,marquee,trucks,production/*}` — JSON snapshots
- `GET /player` and `/presentation/{filename}` — browser fallback endpoints

## 📦 Repository Layout

```
Cargo.toml / build.rs     Rust crate (eframe/egui, axum, rusqlite, mdns-sd, ffmpeg-sidecar)
src/main.rs               entry point, runtime spawn, window icon
src/app.rs                eframe App shell: sidebar, topbar, pages, toasts
src/ui/                   every page (dashboard, screens, content, playlists, schedule,
                          trucks, marquee, production, analytics, database, settings, team, player)
src/backend/              SQLite-backed command layer
src/lan/, src/scheduler/  controller server, mDNS discovery, schedule engine
src/db/, src/state.rs     connection pool + shared AppCore
tizen/                    Samsung Tizen receiver source
docs/, outputs/           guides and generated artifacts
```

## 🤝 Contributing

Keep `cargo check --all-targets` green. egui is pinned to `0.37.0`; consult the vendored crate source in `~/.cargo/registry` when unsure about an API. See [AGENTS.md](./AGENTS.md) for coding conventions.

## 📜 License

Internal MG Enterprise tooling — all rights reserved.
