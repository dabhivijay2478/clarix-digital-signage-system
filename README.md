# SignalOS — Digital Signage Management Desktop App
 
SignalOS is a cross-platform desktop application built with **Tauri v2**, **Next.js**, **Tailwind CSS**, and a self-contained **SQLite** database backend.
 
---
 
## 🚀 Getting Started
 
Follow these steps to set up and run the application.
 
### 1. Development Setup
 
To start the frontend developer server and launch the desktop application in debug mode:
 
```bash
# Install dependencies
npm install
 
# Start Next.js + Tauri in development mode
npx tauri dev
```
 
---
 
### 2. Build & Package the Application
 
To build the optimized production version of the frontend and compile the final cross-platform desktop installers:
 
```bash
# Build the production bundle
npx tauri build
```
 
Once the command completes, the final packaged application bundles will be available in:
 
* **macOS App Bundle:**
  `src-tauri/target/release/bundle/macos/SignalOS.app`
* **macOS Installer Disk Image:**
  `src-tauri/target/release/bundle/dmg/SignalOS_0.1.0_aarch64.dmg` (for Apple Silicon)
 
---
 
## 🛠️ Project Configuration Notes
 
* **Database Backend:** The application uses a local SQLite database (`signalos.db`) automatically initialized inside the user's local app data folder. It runs in WAL (Write-Ahead Logging) mode with a 5000ms busy timeout for high concurrency safety.
* **Tauri v2 Capabilities:** Scopes and application permissions (like file system read/write) are managed inside `src-tauri/capabilities/default.json`.
* **Automatic Migrations:** The database schema is initialized and migrated automatically upon application startup.
