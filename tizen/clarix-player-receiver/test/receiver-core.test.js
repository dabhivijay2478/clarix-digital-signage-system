const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeConfig, TrustedUrlManager, ReceiverManager } = require("../js/receiver-core.js");

const projectDir = path.resolve(__dirname, "..");

test("builds the fixed controller URLs", () => {
  const config = normalizeConfig({ controllerIp: "192.168.0.100", port: 7420, playerPath: "/player" });
  assert.equal(config.origin, "http://192.168.0.100:7420");
  assert.equal(config.playerUrl, "http://192.168.0.100:7420/player");
  assert.equal(config.healthUrl, "http://192.168.0.100:7420/v1/health");
});

test("accepts a local DNS controller name", () => {
  const config = normalizeConfig({ controllerIp: "Clarix.Local", port: 7420, playerPath: "/player" });
  assert.equal(config.playerUrl, "http://clarix.local:7420/player");
});

test("rejects injected hosts, ports, and paths", () => {
  const base = { controllerIp: "192.168.0.100", port: 7420, playerPath: "/player" };
  assert.throws(() => normalizeConfig({ ...base, controllerIp: "google.com/path" }));
  assert.throws(() => normalizeConfig({ ...base, port: 70000 }));
  assert.throws(() => normalizeConfig({ ...base, playerPath: "https://google.com" }));
  assert.throws(() => normalizeConfig({ ...base, playerPath: "/player?next=https://google.com" }));
});

test("allows only HTTP URLs at the exact configured origin", () => {
  const trusted = new TrustedUrlManager({ controllerIp: "192.168.0.100", port: 7420, playerPath: "/player" });
  assert.equal(trusted.isAllowed("http://192.168.0.100:7420/player"), true);
  assert.equal(trusted.isAllowed("http://192.168.0.100:7420/media/item.mp4"), true);
  assert.equal(trusted.isAllowed("https://192.168.0.100:7420/player"), false);
  assert.equal(trusted.isAllowed("http://192.168.0.100:7421/player"), false);
  assert.equal(trusted.isAllowed("http://google.com:7420/player"), false);
  assert.equal(trusted.isAllowed("http://192.168.0.100.evil.test:7420/player"), false);
});

test("keeps the manifest, CSP, and iframe sandbox locked down", () => {
  const manifest = fs.readFileSync(path.join(projectDir, "config.xml"), "utf8");
  const html = fs.readFileSync(path.join(projectDir, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(projectDir, "js/main.js"), "utf8");

  assert.match(manifest, /<access origin="http:\/\/192\.168\.0\.100:7420" subdomains="false"\/>/);
  assert.match(manifest, /<tizen:allow-navigation>http:\/\/192\.168\.0\.100:7420\/\*<\/tizen:allow-navigation>/);
  assert.doesNotMatch(manifest, /origin="\*"/);
  assert.match(html, /connect-src http:\/\/192\.168\.0\.100:7420; frame-src http:\/\/192\.168\.0\.100:7420;/);
  assert.match(main, /allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-presentation/);
  assert.doesNotMatch(main, /allow-(?:popups|top-navigation|downloads)/);
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
