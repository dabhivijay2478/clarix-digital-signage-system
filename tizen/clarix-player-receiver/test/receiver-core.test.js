const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { normalizeConfig, TrustedUrlManager, ReceiverManager } = require("../js/receiver-core.js");

const projectDir = path.resolve(__dirname, "..");

test("builds the fixed controller URLs", () => {
  const config = normalizeConfig({ controllerIp: "10.236.100.245", port: 7420, playerPath: "/player" });
  assert.equal(config.origin, "http://10.236.100.245:7420");
  assert.equal(config.playerUrl, "http://10.236.100.245:7420/player");
  assert.equal(config.healthUrl, "http://10.236.100.245:7420/v1/health");
});

test("accepts a local DNS controller name", () => {
  const config = normalizeConfig({ controllerIp: "Clarix.Local", port: 7420, playerPath: "/player" });
  assert.equal(config.playerUrl, "http://clarix.local:7420/player");
});

test("rejects injected hosts, ports, and paths", () => {
  const base = { controllerIp: "10.236.100.245", port: 7420, playerPath: "/player" };
  assert.throws(() => normalizeConfig({ ...base, controllerIp: "google.com/path" }));
  assert.throws(() => normalizeConfig({ ...base, port: 70000 }));
  assert.throws(() => normalizeConfig({ ...base, playerPath: "https://google.com" }));
  assert.throws(() => normalizeConfig({ ...base, playerPath: "/player?next=https://google.com" }));
});

test("allows only HTTP URLs at the exact configured origin", () => {
  const trusted = new TrustedUrlManager({ controllerIp: "10.236.100.245", port: 7420, playerPath: "/player" });
  assert.equal(trusted.isAllowed("http://10.236.100.245:7420/player"), true);
  assert.equal(trusted.isAllowed("http://10.236.100.245:7420/media/item.mp4"), true);
  assert.equal(trusted.isAllowed("https://10.236.100.245:7420/player"), false);
  assert.equal(trusted.isAllowed("http://10.236.100.245:7421/player"), false);
  assert.equal(trusted.isAllowed("http://google.com:7420/player"), false);
  assert.equal(trusted.isAllowed("http://10.236.100.245.evil.test:7420/player"), false);
});

test("keeps the manifest, CSP, and direct controller player navigation controlled", () => {
  const manifest = fs.readFileSync(path.join(projectDir, "config.xml"), "utf8");
  const html = fs.readFileSync(path.join(projectDir, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(projectDir, "js/main.js"), "utf8");
  const packageScript = fs.readFileSync(path.join(projectDir, "scripts/package-wgt.mjs"), "utf8");

  assert.match(manifest, /<access origin="\*" subdomains="true"\/>/);
  assert.match(manifest, /<tizen:content-security-policy>[^<]*'unsafe-inline'[^<]*'unsafe-eval'[^<]*frame-src 'self' http: https: about: data:[^<]*<\/tizen:content-security-policy>/);
  assert.match(manifest, /<tizen:allow-navigation>\*<\/tizen:allow-navigation>/);
  assert.match(manifest, /feature\/tv\.inputdevice/);
  assert.match(manifest, /privilege\/tv\.inputdevice/);
  assert.match(html, /script-src 'self' http: https: 'unsafe-inline' 'unsafe-eval'/);
  assert.match(html, /connect-src 'self' http: https: ws: wss:/);
  assert.match(html, /frame-src 'self' http: https: about: data:/);
  assert.match(html, /<div id="controller" class="controller-address">Not set<\/div>/);
  assert.match(html, /placeholder="Controller IP"/);
  assert.doesNotMatch(html, /autofocus/);
  assert.match(html, /tabindex="1" required/);
  assert.match(html, /id="connect-button"/);
  assert.doesNotMatch(html, /inputmode="numeric"/);
  assert.match(main, /trusted\.isAllowed\(target\)/);
  assert.match(main, /openControllerPlayer\(\)/);
  assert.match(main, /tizen\.preference/);
  assert.match(main, /window\.widget\.preferences/);
  assert.match(main, /readStoredValue/);
  assert.doesNotMatch(main, /readJsonStore/);
  assert.equal((main.match(/function readSavedController\(/g) || []).length, 1);
  assert.match(main, /window\.location\.replace\(target\)/);
  assert.doesNotMatch(main, /appendQueryParam/);
  assert.doesNotMatch(main, /receiver=tizen/);
  assert.doesNotMatch(main, /\/api\/proxy\?url=/);
  assert.doesNotMatch(main, /document\.createElement\("iframe"\)/);
  assert.doesNotMatch(main, /doc\.write/);
  assert.match(main, /clarix_receiver_controller/);
  assert.match(main, /Enter controller IP/);
  assert.match(main, /focusableControls/);
  assert.match(main, /isActivationKey/);
  assert.match(main, /directionFromKey/);
  assert.match(main, /moveFocus/);
  assert.match(main, /editingInput/);
  assert.doesNotMatch(main, /addEventListener\("keyup"/);
  assert.match(main, /active\.click\(\)/);
  assert.doesNotMatch(packageScript, /receiver-config\.json/);
  assert.doesNotMatch(main, /receiver-config\.json/);
  assert.doesNotMatch(main, /requestJson\("\/api\/screens"/);
  assert.doesNotMatch(main, /requestJson\("\/api\/trucks"/);
  assert.doesNotMatch(main, /renderTruckDisplay/);
  assert.doesNotMatch(main, /new DOMParser\(\)/);
  assert.doesNotMatch(main, /setAttribute\("sandbox"/);
});

test("boots the setup page and routes remote focus without runtime errors", () => {
  const listeners = {};
  const elements = {};
  const document = {
    activeElement: null,
    hidden: false,
    getElementById(id) { return elements[id]; },
    addEventListener(name, listener) { listeners[name] = listener; },
  };

  function element(id) {
    const handlers = {};
    const value = {
      id,
      hidden: false,
      innerHTML: "",
      textContent: "",
      value: "",
      clickCount: 0,
      addEventListener(name, listener) { handlers[name] = listener; },
      focus() { document.activeElement = value; },
      blur() { if (document.activeElement === value) document.activeElement = null; },
      click() {
        value.clickCount += 1;
        if (handlers.click) handlers.click({ target: value });
      },
      setSelectionRange() {},
    };
    elements[id] = value;
    return value;
  }

  [
    "offline",
    "player-host",
    "status",
    "controller",
    "retry",
    "controller-form",
    "controller-ip",
    "edit-ip-button",
    "connect-button",
    "retry-button",
  ].forEach(element);

  const window = {
    location: { replace() {} },
    widget: null,
    tizen: null,
  };
  const localStorage = {
    getItem() { return null; },
    setItem() {},
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(projectDir, "js/main.js"), "utf8"),
    {
      window,
      document,
      localStorage,
      ClarixReceiverCore: { normalizeConfig, TrustedUrlManager, ReceiverManager },
      XMLHttpRequest: function XMLHttpRequest() {},
      Date,
      JSON,
    },
  );

  assert.equal(document.activeElement, elements["edit-ip-button"]);

  let prevented = false;
  listeners.keydown({
    target: elements["edit-ip-button"],
    keyCode: 39,
    key: "ArrowRight",
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(document.activeElement, elements["connect-button"]);

  elements["edit-ip-button"].focus();
  listeners.keydown({
    target: elements["edit-ip-button"],
    keyCode: 13,
    key: "Enter",
    preventDefault() {},
  });
  assert.equal(document.activeElement, elements["controller-ip"]);
  assert.equal(elements["edit-ip-button"].clickCount, 1);
});

test("retries offline and switches to the longer online monitor interval", () => {
  const probes = [];
  const timers = [];
  const events = [];
  const manager = new ReceiverManager({
    probe: (done) => probes.push(done),
    onOnline: () => events.push("online"),
    onOffline: () => events.push("offline"),
    setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimer: () => {},
    retryMs: 5000,
    monitorMs: 10000
  });

  manager.start();
  probes.shift()(false);
  assert.deepEqual(events, ["offline"]);
  assert.equal(timers.shift().delay, 5000);

  manager.check();
  probes.shift()(true);
  assert.deepEqual(events, ["offline", "online"]);
  assert.equal(timers.shift().delay, 10000);

  manager.check();
  probes.shift()(false);
  assert.deepEqual(events, ["offline", "online", "offline"]);
  assert.equal(timers.shift().delay, 5000);
});
