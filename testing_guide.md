# SignalOS Same-Wi-Fi Setup and Testing

SignalOS uses one **Controller** per site and one or more **Players**. Packaged Mac and Windows players connect outward to the controller, pull authenticated revisions, verify downloaded media, and keep playing the last valid revision when the controller is unavailable.

For offline router setup, TP-Link Archer C20 examples, DHCP/firewall checks, and Samsung QB55C URL Launcher guidance, see [docs/offline-router-setup.md](./docs/offline-router-setup.md).

## Important Development Note

`ws://<computer>:3000/_next/webpack-hmr` is Next.js development hot reload. It is not the SignalOS player connection and is not present in packaged builds.

Do not use `http://<development-computer>:3000/player` for cross-machine production testing. Use:

- The packaged SignalOS Player app on Mac or Windows for reliable offline playback.
- `http://<controller-ip>:7420/player` for a connected-only browser player.

During local development, pages opened from `http://<development-computer>:3000` read controller data from the fixed controller service at `http://<development-computer>:7420`. The dev server allows only loopback, filtered private Wi-Fi/Ethernet addresses, and any additional hosts listed in `SIGNALOS_DEV_ORIGINS`.

## Controller Setup

1. Open **Settings → Device Operation Mode**.
2. Select **Controller** and restart SignalOS.
3. Confirm **Network Diagnostics** shows a selected Wi-Fi interface, local IP, controller port `7420`, and protocol version `1`.
4. Allow SignalOS to receive inbound TCP connections on the controller:
   - macOS: allow SignalOS in **System Settings → Network → Firewall**.
   - Windows: create an inbound program rule for SignalOS restricted to TCP port `7420` on Private networks.
5. Add the logical screens that this controller will manage.

SignalOS intentionally fails with a clear error if controller port `7420` is already occupied. Set `SIGNALOS_PORT` before launch only when a different fixed port is required. For browser development with a custom port, set the matching `NEXT_PUBLIC_SIGNALOS_CONTROLLER_PORT`.

## Packaged Player Pairing

1. Install and open SignalOS on the Mac or Windows display computer.
2. Open **Settings → Device Operation Mode**.
3. Enter `http://<controller-ip>:7420`, select **Player**, and restart SignalOS.
4. Click **Request Pairing**. The player displays a short one-time code.
5. On the controller, open **Settings → Pending Player Pairings**.
6. Match the code, choose the logical screen, and approve the request.
7. Launch the player.

The player sends an outbound heartbeat every 15 seconds. It does not require an inbound player port or a player-side firewall exception.

## Publishing Content

1. Add content and assign it to the screen playlist.
2. Open **Screens** and click **Publish Revision**.
3. The paired player detects the new revision, downloads only missing assets, verifies SHA-256 checksums, and applies the revision transactionally.
4. If a download fails, the player keeps the previous working revision.

## Browser Player

Open `http://<controller-ip>:7420/player` from a browser on the same Wi-Fi. Browser playback is connected-only and reads from the controller. It does not cache a full offline signage revision.

## Troubleshooting

Use **Settings → Network Diagnostics** before changing ports or typing IP addresses manually.

- **No controller discovered:** confirm both devices are on the same non-guest Wi-Fi and that client isolation is disabled. Discovery uses local-link mDNS and does not cross different subnets.
- **Controller URL fails:** open `http://<controller-ip>:7420/v1/health` from the player computer. If it does not load, check controller firewall rules and the Wi-Fi subnet.
- **Old IP shown:** restart the controller after changing Wi-Fi. Paired players are identified by stable device ID, not by the previous IP address.
- **Pairing stays pending:** approve the matching code on the controller. Pairing requests expire after 15 minutes.
- **Player is offline:** keep the packaged Player app running and confirm it can make outbound connections to the controller.
- **Different networks or internet:** not supported in this release. Both devices must share the same local Wi-Fi network.

## Verification Checklist

- Mac controller → Mac packaged player.
- Mac controller → Windows packaged player.
- Controller-hosted player in Chrome and Edge.
- Player continues the last playlist after disconnecting the controller.
- Player reconnects after a DHCP IP change.
- Manual controller URL works when discovery is blocked.
- Interrupted asset transfer does not replace the current working revision.
