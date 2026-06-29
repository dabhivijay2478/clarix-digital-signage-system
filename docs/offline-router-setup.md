# Clarix Offline Router Setup and Diagnostics

This guide explains how to run Clarix on a private local network with no internet connection. It applies to any standard Wi-Fi router. TP-Link Archer C20 / AC750 menu names are included as examples because many sites use that model.

Clarix default controller port: `7420`

Browser player URL: `http://<controller-ip>:7420/player`

Health check URL: `http://<controller-ip>:7420/v1/health`

## Network Goal

Use one router to place the controller computer and every display/player device on the same local subnet.

Example:

| Device | Example IP | Notes |
| --- | --- | --- |
| Router | `192.168.0.1` | DHCP server enabled |
| Clarix controller | `192.168.0.100` | Runs the controller service on TCP `7420` |
| Samsung display/player | `192.168.0.120` | Opens `http://192.168.0.100:7420/player` |

The internet/WAN cable is optional. Clarix only needs local LAN traffic between devices.

## Router Setup

1. Reset or prepare the router.
   - Generic: use the router reset button or admin page if the current settings are unknown.
   - TP-Link Archer C20 example: hold **Reset/WPS** until the LEDs blink, then connect to the default Wi-Fi printed on the router label.
2. Open the router admin page.
   - Common addresses: `http://192.168.0.1`, `http://192.168.1.1`, or the address printed on the router.
   - TP-Link Archer C20 example labels: **Quick Setup**, **Wireless**, **DHCP**, **Security**.
3. Configure Wi-Fi.
   - Use a clear SSID for the site, such as `Clarix-Site-01`.
   - Use WPA2/WPA3 password protection.
   - Avoid guest networks for Clarix devices.
4. Disable client isolation.
   - Generic labels: **AP Isolation**, **Client Isolation**, **Wireless Isolation**, **Guest Isolation**.
   - TP-Link Archer C20 example: check **Wireless Advanced** and guest network settings. Isolation must be off.
5. Enable DHCP.
   - Generic: DHCP server should be enabled so each device receives an IP address automatically.
   - TP-Link Archer C20 example: **DHCP > DHCP Settings > DHCP Server: Enable**.
6. Keep devices on the same subnet.
   - If the controller is `192.168.0.100`, players should usually start with `192.168.0.x`.
   - If one device is `192.168.1.x` and another is `192.168.0.x`, they are probably not on the same LAN.

## Controller Setup

1. Connect the controller computer to the router Wi-Fi or Ethernet.
2. Open Clarix.
3. Go to **Settings > Device Operation Mode**.
4. Select **Controller**.
5. Restart Clarix if prompted.
6. Confirm the controller IP shown in Settings or Network Diagnostics.
7. Allow inbound TCP `7420` on the controller firewall.

Firewall examples:

| OS | What to allow |
| --- | --- |
| macOS | Allow Clarix / MG Enterprise in **System Settings > Network > Firewall** |
| Windows | Create an inbound rule for TCP port `7420` on Private networks |

## Player and Display Setup

For a packaged player app:

1. Connect the player computer to the same router.
2. Open Clarix.
3. Go to **Settings > Device Operation Mode**.
4. Enter `http://<controller-ip>:7420`.
5. Select **Player** and restart if prompted.
6. Request pairing.
7. Approve the pairing on the controller and assign the logical screen.

For a browser player:

1. Connect the device to the same router.
2. Open a browser.
3. Visit `http://<controller-ip>:7420/player`.

Browser playback is connected-only. For stronger offline playback, use the packaged player.

## Samsung QB55C URL Launcher

Use this when the Samsung display should open the controller-hosted browser player directly.

1. Connect the Samsung QB55C to the Clarix router Wi-Fi or Ethernet.
2. Open **Network Status** on the display and confirm it has an IP address on the same subnet as the controller.
3. Open **Custom Home** or **URL Launcher**.
4. Set the URL to `http://<controller-ip>:7420/player`.
5. Save and launch.
6. If the page does not load, test `http://<controller-ip>:7420/v1/health` from another device on the same router.

## Recommended Static IP or DHCP Reservation

After the controller works, reserve its IP address in the router so the player URL does not change.

Generic router wording:

1. Find **DHCP Reservation**, **Address Reservation**, or **Static Lease**.
2. Select the controller computer by device name or MAC address.
3. Reserve the current controller IP.
4. Reboot or reconnect the controller and confirm it receives the same IP.

TP-Link Archer C20 example:

1. Open **DHCP > Address Reservation**.
2. Add the controller MAC address.
3. Assign the desired IP, such as `192.168.0.100`.
4. Enable the entry and save.

## Diagnostics Checklist

Use this order when a display cannot show content:

1. Confirm all devices are on the same router SSID or LAN switch.
2. Confirm guest Wi-Fi and client isolation are disabled.
3. Confirm DHCP is enabled.
4. Compare IP addresses. The first three numbers should usually match, for example `192.168.0`.
5. From the player device, open `http://<controller-ip>:7420/v1/health`.
6. If the health URL fails, check the controller firewall for TCP `7420`.
7. If the health URL works but `/player` is blank, publish the screen playlist again from the controller.
8. If the controller IP changes after reboot, add a DHCP reservation.

## Common Problems

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Player cannot discover controller | Client isolation, guest network, or different subnet | Disable isolation and connect both devices to the same LAN |
| `http://<controller-ip>:7420/player` does not open | Firewall or wrong IP | Allow TCP `7420` and confirm the controller IP |
| Samsung display opens old address | Controller IP changed | Add a DHCP reservation and update URL Launcher |
| Works on controller computer only | Using `localhost` or `127.0.0.1` | Use the controller LAN IP, not localhost |
| Playlist assigned but screen says no feed | Playlist was not saved/published or schedule is not eligible | Save playlist, publish revision, and check schedule times |

