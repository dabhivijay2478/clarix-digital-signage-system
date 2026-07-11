# Clarix Player Receiver for Samsung Tizen

This directory is a standalone Samsung TV Web Application project. It is a local receiver shell, not a browser and not a copy of the Clarix CMS.

## Runtime behavior

- Reads `receiver-config.json` from the installed widget.
- Probes `http://<controller>:<port>/v1/health` on startup.
- Shows the branded offline screen and retries every 5 seconds while unavailable.
- Loads `/player?receiver=tizen` inside a full-screen sandbox after a successful health response.
- Checks health every 10 seconds while online and immediately removes the player frame after a failed check.
- Restarts the connection check when the application returns to the foreground.

The wrapper has three independent navigation controls:

1. `config.xml` grants network and navigation access only to the configured origin.
2. The document Content Security Policy grants `connect-src` and `frame-src` only to that origin.
3. The iframe sandbox omits pop-up, top-navigation, and download permissions.

Receiver mode also removes the player page's dashboard, disconnect, and Escape actions. There is no URL input or browser UI in the widget.

## Configure the controller

Edit `receiver-config.json`:

```json
{
  "controllerIp": "192.168.0.100",
  "port": 7420,
  "playerPath": "/player"
}
```

An IPv4 address or DNS hostname such as `clarix.local` is accepted. Internet URLs, URL schemes, query strings, fragments, and invalid ports are rejected.

From the repository root, synchronize the Tizen allowlist and CSP with the JSON file:

```sh
npm run tizen:configure
npm run tizen:test
```

Run `tizen:configure` after every controller host or port change. Package again after configuration changes; the installed configuration is deliberately not editable through the TV UI.

Reserve the controller address in the offline router before packaging. If its IP changes, the old package will continue blocking the new address by design.

## Tizen Studio and Samsung signing

Install Tizen Studio, then use Package Manager to install:

- the matching Tizen SDK/Web CLI;
- Samsung TV Extensions;
- Samsung Certificate Extension.

In **Tools > Certificate Manager**, create and activate a **Samsung** TV certificate profile. Keep the author certificate and passwords outside this repository. Add the target display DUID/distributor certificate when the selected Samsung deployment path requires it.

Set the active profile name and build a signed widget:

```sh
export TIZEN_SIGNING_PROFILE="ClarixTV"
npm run tizen:package
```

The output is `tizen/clarix-player-receiver/dist/ClarixPlayerReceiver.wgt`. The packaging command refuses to run without an explicit signing profile and reruns configuration and tests before invoking the Tizen CLI.

Alternatively, import this directory in Tizen Studio with **File > Import > Tizen > Tizen Project**, select the active Samsung certificate profile, then use **Build Signed Package**.

## Development installation on a QB55C

Use this path for device acceptance testing, not permanent fleet deployment:

1. Put the development computer and display on the same LAN.
2. Enable Developer Mode on the display, enter the development computer IP, and cold-reboot the display. Menu wording can vary by firmware.
3. Connect through Tizen Studio Remote Device Manager, normally on port `26101`.
4. Confirm the target with `sdb devices`.
5. Install from Tizen Studio with **Run As > Tizen Web Application**, or use:

   ```sh
   tizen install -s <device-serial> --name ClarixPlayerReceiver.wgt -- tizen/clarix-player-receiver/dist
   ```

6. Launch **Clarix Player Receiver** and confirm the offline screen, recovery, playback, and blocked navigation cases.

Samsung documents that development-installed TV applications can be removed when the TV is powered off or disconnected from Tizen Studio. Do not treat a Developer Mode install as the production autostart solution.

## Persistent deployment and boot launch

A Web Application cannot grant itself boot-launch authority. Persistent installation and power-on selection are display/fleet policies outside the `.wgt` sandbox.

For production:

1. Have the Samsung signage reseller/integrator or Samsung Apps TV Seller Office process deploy the signed custom application through the method approved for the QB55C fleet and region.
2. Configure the installed **Clarix Player Receiver** as the display's **Custom App / Custom Home / power-on source**.
3. Enable the model's source recovery/auto-source option so the Custom App is selected again after a source interruption.
4. Disable or lock Home/menu access using the signage administration controls available to the deployment.
5. Perform three cold-start tests by disconnecting AC power, restoring it, and confirming automatic receiver launch without the development computer present.

Direct installation of an ordinary `.wgt` from USB is not supported by Samsung TV security policy. If an installer proposes USB deployment, require the Samsung Seller Office USB Demo package/licence workflow appropriate to the device; copying this `.wgt` to a USB drive is not sufficient.

## Controller requirements

- Clarix must listen on `0.0.0.0:7420` (or the configured port).
- TCP inbound access to that port must be allowed by the controller firewall.
- `/v1/health` must return JSON with `{"status":"online"}` and a CORS response that permits the Tizen application.
- `/player` and all player assets must stay on the configured controller origin.

The controller in this repository supplies the required health endpoint and CORS headers.

## Acceptance checklist

- Start with the controller off: offline screen appears and retries every 5 seconds.
- Start the controller: player opens without remote input.
- Stop the controller/network: player is removed and offline screen returns within about 14 seconds (probe interval plus timeout).
- Restore the controller: playback returns automatically.
- Verify external links, `window.open`, downloads, context menus, Back, Escape, refresh, and dashboard-exit actions cannot escape the receiver.
- Cold boot with no development workstation: the display selects the receiver automatically.

For router and firewall diagnostics, also see `docs/offline-router-setup.md` at the repository root.
