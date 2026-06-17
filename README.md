# Clarix — Digital Signage + Fleet Management Desktop App

Clarix is a cross-platform desktop application for managing **digital signage screens** and **truck fleets** from a single control center. Built with **Tauri v2**, **Next.js 16**, **Tailwind CSS v4**, **Bun**, and a self-contained **SQLite** database — no external servers or Docker needed.

For cross-machine setup, one-time player pairing, firewall guidance, and troubleshooting, see [testing_guide.md](./testing_guide.md). Use packaged players for offline signage or `http://<controller-ip>:7420/player` for a connected-only browser player. The Next.js development server on port `3000` is not a production player endpoint.

> **Package Manager**: This project uses **Bun** (fast, all-in-one JS runtime) instead of npm/pnpm.

---

## 📋 What You Need Before Starting

Before you install Clarix, make sure you have these tools installed on your computer. Follow the guide for your operating system (Windows or macOS).

### ✅ Prerequisites Checklist

| # | Tool | Why You Need It | How to Check If Installed |
|---|------|----------------|---------------------------|
| 1 | **Bun** | Fast JS runtime & package manager | Open Terminal/CMD → type `bun --version` |
| 2 | **Rust** | Compiles the backend (the engine) | Open Terminal/CMD → type `rustc --version` |
| 3 | **Git** | Downloads the project code | Open Terminal/CMD → type `git --version` |

> If any command above shows "not found" or "not recognized", follow the installation steps below.

---

## 🖥️ Step-by-Step Setup for macOS

### Step 1 — Install Xcode Command Line Tools

Open the **Terminal** app (search for "Terminal" in Spotlight) and run:

```bash
xcode-select --install
```

A popup will appear — click **Install** and wait for it to finish. This gives you Git and essential build tools.

### Step 2 — Install Bun

Bun is faster than npm and handles everything (package management, build tools, dev server).

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify it worked:

```bash
bun --version
# Should show something like: 1.3.x
```

### Step 3 — Install Rust

Run this single command in Terminal:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

When prompted, press **1** (default installation) and hit **Enter**. After it finishes, **close and reopen Terminal**, then verify:

```bash
rustc --version
# Should show something like: rustc 1.8x.x
```

### Step 4 — Download the Project

```bash
# Navigate to where you want the project (e.g., your Desktop)
cd ~/Desktop

# Clone the repository
git clone https://github.com/dabhivijay2478/clarix-digital-signage-system.git

# Go into the project folder
cd clarix-digital-signage-system
```

### Step 5 — Install Bun

Bun is faster and more efficient than npm. Install it:

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify:

```bash
bun --version
# Should show: 1.x.x
```

### Step 6 — Install Dependencies

```bash
# Install frontend packages (takes 10–20 seconds with bun)
bun install
```

### Step 7 — Run the App

```bash
# Start the app in development mode
# (First run takes 3–5 minutes to compile Rust code)
bun tauri dev
```

The Clarix window will open automatically. Subsequent launches are much faster.

---

## 🪟 Step-by-Step Setup for Windows

### Step 1 — Install Build Tools

1. Download and install **[Microsoft Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)**
2. During installation, check **"Desktop development with C++"** workload
3. Click **Install** and wait for completion

> This is required by Rust to compile native code on Windows. It's free.

### Step 2 — Install Bun

Bun is faster than npm and handles everything (package management, build tools, dev server).

Open **Command Prompt** (search "cmd" in Start Menu) and run:

```cmd
powershell -c "irm bun.sh/install.ps1 | iex"
```

Verify:

```cmd
bun --version
```

### Step 3 — Install Rust

1. Go to **[https://rustup.rs](https://rustup.rs)**
2. Download and run `rustup-init.exe`
3. Press **1** (default installation) and hit **Enter**
4. **Close and reopen Command Prompt** after installation

Verify:

```cmd
rustc --version
```

### Step 4 — Install Git

1. Go to **[https://git-scm.com/downloads/win](https://git-scm.com/downloads/win)**
2. Download and run the installer — accept all defaults
3. **Restart Command Prompt** after installation

Verify:

```cmd
git --version
```

### Step 5 — Download the Project

Open **Command Prompt** and run:

```cmd
cd %USERPROFILE%\Desktop

git clone https://github.com/dabhivijay2478/clarix-digital-signage-system.git

cd clarix-digital-signage-system
```

### Step 6 — Install Bun

Bun is faster and more efficient than npm. Install it:

```cmd
powershell -c "irm bun.sh/install.ps1 | iex"
```

Verify:

```cmd
bun --version
```

### Step 7 — Install Dependencies

```cmd
bun install
```

### Step 8 — Run the App

```cmd
bun tauri dev
```

> ⏳ The first build takes **5–10 minutes** on Windows (Rust compilation). Grab a coffee! Subsequent runs are fast.

---

## 📦 Building Installers (For Distribution)

To create installable packages that you can share with others:

```bash
bun tauri build
```

### Output Locations

| Platform | File | Path |
|----------|------|------|
| **macOS** | App Bundle | `src-tauri/target/release/bundle/macos/Clarix.app` |
| **macOS** | DMG Installer | `src-tauri/target/release/bundle/dmg/Clarix_0.1.0_aarch64.dmg` |
| **Windows** | MSI Installer | `src-tauri/target/release/bundle/msi/Clarix_0.1.0_x64_en-US.msi` |
| **Windows** | NSIS Installer | `src-tauri/target/release/bundle/nsis/Clarix_0.1.0_x64-setup.exe` |

> **To build for Windows:** You must run `npx tauri build` on a Windows machine.  
> **To build for macOS:** You must run `npx tauri build` on a macOS machine.  
> Cross-compilation is not supported by Tauri.

### Sharing the App

- **macOS users**: Send them the `.dmg` file. They double-click it, drag Clarix to Applications, done.
- **Windows users**: Send them the `.msi` or `.exe` file. They double-click it and follow the installer.

No Docker, no databases to install, no servers to configure — it just works.

---

## 🧩 Modules

Clarix includes two main modules accessible from the sidebar:

### 📺 Digital Signage
- **Dashboard** — Live overview of your signage network
- **Screens** — Register and manage display screens
- **Content** — Upload images, videos, web apps
- **Live Data** — Configure real-time data feeds
- **Settings** — App configuration, branding, themes

### 🚛 Fleet Management
- **Overview** — Fleet stats, active trips, maintenance alerts
- **Fleet** — Truck registry with status tracking
- **Drivers** — Driver management with license tracking
- **Trips** — Trip logging with origin/destination tracking
- **Maintenance** — Service history and upcoming reminders

---

## 🛠️ Technical Notes

| Item | Details |
|------|---------|
| **Database** | Local SQLite (`clarix.db`) — auto-created on first launch in user's app data folder. Runs in WAL mode with 5000ms busy timeout. |
| **Migrations** | Database schema is initialized and migrated automatically on startup. |
| **Frontend** | Next.js 16 with Tailwind CSS v4 (CSS-first config, no `tailwind.config.js`). |
| **Backend** | Rust with Tauri v2, using `rusqlite` + `r2d2` connection pool. |
| **State** | Frontend state managed by Zustand with localStorage persistence. |
| **Local Network Discovery** | Controllers on the same Wi-Fi are discovered via mDNS (`_clarix._tcp.local`). |
| **Permissions** | File system and shell scopes managed in `src-tauri/capabilities/default.json`. |

---

## ❓ Troubleshooting

### "command not found: node" or "command not found: rustc"
You need to install the missing tool. Go back to the setup steps for your OS above.

### First build is very slow
This is normal. Rust compiles everything from scratch the first time. Subsequent builds are much faster because only changed code is recompiled.

### "error: linker `cc` not found" (macOS)
Run `xcode-select --install` to install the missing build tools.

### "error: linker `link.exe` not found" (Windows)
Install **Visual Studio Build Tools** with the **"Desktop development with C++"** workload.

### Port 3000 already in use
Another app is using port 3000. Either stop that app, or change the port:
```bash
PORT=3001 bun tauri dev
```

### App window doesn't open
Wait 1–2 minutes on first run. Check the terminal for error messages. If the Rust compilation failed, the terminal will show the error.
