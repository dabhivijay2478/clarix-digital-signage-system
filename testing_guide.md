# SignalOS — Same-Wi-Fi Offline Digital Signage Setup & Testing Guide

This guide details how to configure, pair, and synchronize media items between your **Controller** (laptop/dashboard) and **Screen Player** (TV screen/PC) connected to the same Wi-Fi router. No cloud connections or internet access are required.

---

## 🏗️ How it Works (Under the Hood)
1. **Dynamic Media Server**: Every app instance runs an embedded HTTP/Media TCP server in the background. It dynamically binds to a free port (starting at `7420`).
2. **Auto-Discovery**: Screen Player devices advertise themselves on the local network using **mDNS / Bonjour multicast UDP** (service: `_signalos._tcp.local.`).
3. **Database & File Sync**: The Controller queries discovered peers, connects to the screen's IP/Port over HTTP, and pushes database structures (JSON) and binary media assets (images/videos) directly over the local network.
4. **Offline Playback**: Synced screens play and loop the scheduled media from local cache, logging playback analytics locally.

---

## 🔌 Wi-Fi Router Setup

Use this setup to connect SignalOS devices through your Wi-Fi router.

1. Connect your **Laptop** (Controller) and your **PC / TV Setup Box** (Screen Player) to the **same home Wi-Fi network**.
2. No IP addresses need to be manually typed. The devices will automatically find each other using mDNS.

---

## 🚀 Step-by-Step Software Setup & Testing

### Step 1: Automatic SQLite Database Setup
The application is pre-configured with a self-contained SQLite database backend. No manual database setup or Docker Compose commands are required. The database `signalos.db` is automatically created and migrated on startup.

### Step 2: Start the Screen Player
1. Launch the application on your **Screen Player** device (PC/TV).
2. Go to **Settings** in the sidebar, and click **Launch Screen Player** (or navigate to the `/player` URL).
3. Because the screen is not yet linked, it will display a **Local Standby Screen** detailing:
   * Its local network IP address (e.g., `192.168.1.51` or `10.0.0.2`).
   * Its active server port (e.g., `7420`).

### Step 3: Link Screen & Configure Details
1. Launch the application on your **Controller Laptop**.
2. Go to the **Screens** tab in the sidebar.
3. Look at the top of the screen. Under **Nearby Screens**, your Screen Player device will automatically appear in real-time:
   ```
   ⚡ Nearby Screens (1)
   [ Device-Hostname ]   192.168.1.51:7420    [ + Link Screen ]
   ```
4. Click the **+ Link Screen** button. The device will be added instantly and its status indicator will turn **Online (Pulsing Green)**.
5. **Editing Screen Configs**: You can edit any screen's Name, Location, or IP Address at any time. Simply hover over (or tap) the screen card and click the Edit (✎) icon in the top-right corner. Modify the details in the popup modal and click **Save Changes** to update the database.

### Step 4: Upload Media & Configure Playlist
1. Go to the **Content** tab.
2. Click **+ Add Content**.
3. Under **Media File**, select or drag any local image (PNG, JPG) or video (MP4) from your computer.
   * *Notice that the content name is automatically populated, and the content type (Image/Video) is automatically detected.*
4. Click **Add Content**. The file is written to your local media directory.
5. Go to the **Playlists** tab, click **New Playlist**, and add your uploaded media files into a loop list.

### Step 5: Schedule & Synchronize (Real-Time Control)
1. Go to the **Schedule** tab, and click **+ Add Schedule Slot**.
2. Fill in the schedule name, start time, duration, and priority.
3. **Select Playlist & Screens**:
   * Pick your desired playlist from the **Playlist** dropdown selector.
   * Check the boxes for the target screens under **Target Screens**.
4. Save the slot. The active slots table will display your scheduled playlist name and linked screens in real-time.
5. Go to the **Screens** tab.
6. Click the **⚡ Sync to Device** button on your paired screen card. *(This can be clicked from either the Tauri desktop shell or any connected web browser on the network).*
7. The dashboard will bundle the schedules, playlists, and transfer all local media files over the network directly into the screen's storage.
8. The **Screen Player** TV/PC will immediately terminate the standby screen and begin looping the media fullscreen!

---

## 🏠 How to Test at Home (Jio Fiber Router, Jio TV Box & PC Setup)

This section details how to set up and run a local network test in your home using:
* **Controller Laptop (Tauri Dashboard & API Server)**: Laptop on Wi-Fi IP `192.168.31.238`
* **Network**: Jio Fiber Wi-Fi Router (Gateway: `192.168.31.1`)
* **Player Screen 1**: Your Home PC on Wi-Fi IP `192.168.31.232` (or `192.168.31.170`)
* **Player Screen 2**: A Jio Android TV Setup Box connected to a TV (on dynamic IP `192.168.31.X`)

### Step A: Verify your Controller Laptop's Local IP Address
1. On your **Controller Laptop** (macOS), open a terminal and run:
   ```bash
   ipconfig getifaddr en0
   ```
   *(This should output your active Wi-Fi IP: `192.168.31.238`).*
2. Verify that Next.js dev server is running on this network port: `http://192.168.31.238:3000`.

### Step B: Connect Devices to Jio Fiber Wi-Fi
Ensure your **macOS Controller Laptop**, your **Windows Home PC**, and your **Jio Android TV Setup Box** are all connected to the same **Jio Fiber Wi-Fi router** (SSID subnet `192.168.31.X`).

### Step C: Test Screen 1 (Home PC Setup & Linking)
1. **Register the PC Screen in the Dashboard**:
   * On your **Controller Laptop**, open the dashboard at `http://localhost:3000/screens`.
   * Click the **+ Add Screen** button.
   * Fill in the form:
     * **Name**: `Home PC`
     * **Location**: `Study Room`
     * **IP Address**: `192.168.31.232` *(Your home PC Wi-Fi IP address).*
   * Click **Add Screen**.
2. **Open the Player on the Home PC**:
   * Go to your **Home PC**, open Google Chrome or Microsoft Edge.
   * Navigate to the exact Controller URL:
     ```
     http://192.168.31.238:3000/player
     ```
3. **Link the Screen**:
   * The PC browser will load the **SignalOS Player Screen Selector** listing all registered screens from your database.
   * Click on the card named **Home PC** (the screen you registered in Step 1).
   * The browser will transition to the standby screen reading `Home PC - Awaiting Content Feed`.
4. **Assign Content & Sync**:
   * Go back to your **Controller Laptop** browser at `http://localhost:3000`.
   * Go to the **Schedule** tab, create a schedule slot, select your `Home PC` screen, and assign a playlist.
   * Go to the **Screens** tab, and click the **⚡ Sync to Device** button on the `Home PC` card.
   * Your Home PC browser tab will immediately terminate standby and start playing the scheduled loops!

### Step D: Test Screen 2 (Jio Android TV Setup Box Setup & Linking)
1. **Register the TV Screen in the Dashboard**:
   * On your **Controller Laptop** Screens tab, click **+ Add Screen**.
   * Fill in the form:
     * **Name**: `Jio TV`
     * **Location**: `Living Room`
     * **IP Address**: *(Leave blank or enter TV's IP).*
   * Click **Add Screen**.
2. **Open the Player on the Jio TV**:
   * Turn on your **Jio Android TV Box**, open the **JioPages** browser app.
   * Navigate to the exact Controller URL:
     ```
     http://192.168.31.238:3000/player
     ```
3. **Link the Screen**:
   * Use the TV Remote D-Pad to scroll down, highlight the **Jio TV** screen card, and press **OK/Select** on the remote.
   * The TV screen will update to the standby display.
   * *Tip: Enable "Full Screen Mode" in the JioPages menu bar to hide the browser navigation bar.*
4. **Assign Content & Sync**:
   * On your **Controller Laptop**, go to the **Schedule** tab and add the `Jio TV` screen to your scheduled slot.
   * Go to the **Screens** tab and click **⚡ Sync to Device** on the `Jio TV` card.
   * The Jio TV screen will immediately begin looping the media fullscreen!

---

## 🛠️ Troubleshooting & Commands

### How to Exit Player Mode
Press the **Escape (Esc)** key on the keyboard connected to the player device to exit the fullscreen signage loop and return to the main dashboard.

### Verification Commands
To check if the local HTTP media server is running properly on your screen device, open a browser on any device on the network and navigate to:
```
http://<screen-ip>:<port>/status
```
*(Expected response: `{"status":"online","screens_registered":...,"content_count":...}`)*

### Firewall Troubleshooting
If the controller fails to connect or sync to the screen, make sure your operating system's firewall is not blocking incoming connections on port range `7420-7450` on the player device:
* **macOS**: System Settings -> Network -> Firewall (Ensure SignalOS is allowed to accept incoming connections).
* **Windows**: Defender Firewall -> Advanced Settings -> Inbound Rules (Allow port TCP `7420-7450`).
