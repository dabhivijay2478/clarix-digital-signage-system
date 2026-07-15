(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ClarixReceiverCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function fail(message) {
    throw new Error("Invalid receiver configuration: " + message);
  }

  function validIpv4(value) {
    var parts = value.split(".");
    if (parts.length !== 4) return false;
    return parts.every(function (part) {
      return /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255;
    });
  }

  function validHostname(value) {
    if (value.length > 253 || value.indexOf(".") === -1) return false;
    return value.split(".").every(function (label) {
      return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label);
    });
  }

  function normalizeConfig(input) {
    if (!input || typeof input !== "object") fail("expected a JSON object");
    var host = String(input.controllerIp || "").trim().toLowerCase();
    var port = Number(input.port);
    var path = String(input.playerPath || "").trim();

    if (!validIpv4(host) && !validHostname(host)) fail("controllerIp must be an IPv4 address or DNS name");
    if (!Number.isInteger(port) || port < 1 || port > 65535) fail("port must be an integer from 1 to 65535");
    if (!/^\/[a-z0-9._~!$&'()*+,;=:@%\/-]*$/i.test(path) || path.indexOf("//") === 0) {
      fail("playerPath must be a local absolute path without a query or fragment");
    }

    return {
      controllerIp: host,
      port: port,
      playerPath: path,
      origin: "http://" + host + ":" + port,
      playerUrl: "http://" + host + ":" + port + path,
      healthUrl: "http://" + host + ":" + port + "/v1/health"
    };
  }

  function parseHttpUrl(value) {
    var match = /^(http):\/\/([^\/:?#]+):(\d+)(?:[\/?#]|$)/i.exec(value);
    if (!match) return null;
    return { protocol: match[1].toLowerCase(), host: match[2].toLowerCase(), port: Number(match[3]) };
  }

  function TrustedUrlManager(config) {
    this.config = normalizeConfig(config);
  }

  TrustedUrlManager.prototype.isAllowed = function (url) {
    var parsed = parseHttpUrl(String(url || ""));
    return !!parsed && parsed.protocol === "http" &&
      parsed.host === this.config.controllerIp && parsed.port === this.config.port;
  };

  TrustedUrlManager.prototype.playerUrl = function () {
    return this.config.playerUrl;
  };

  function ReceiverManager(options) {
    this.probe = options.probe;
    this.onOnline = options.onOnline;
    this.onOffline = options.onOffline;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.retryMs = options.retryMs || 5000;
    this.monitorMs = options.monitorMs || 10000;
    this.timer = null;
    this.running = false;
    this.online = false;
    this.checking = false;
  }

  ReceiverManager.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.check();
  };

  ReceiverManager.prototype.stop = function () {
    this.running = false;
    this.checking = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  };

  ReceiverManager.prototype.check = function () {
    var self = this;
    if (!this.running || this.checking) return;
    this.checking = true;
    this.probe(function (reachable) {
      if (!self.running) return;
      self.checking = false;
      if (reachable && !self.online) {
        self.online = true;
        self.onOnline();
      } else if (!reachable && self.online) {
        self.online = false;
        self.onOffline();
      } else if (!reachable) {
        self.onOffline();
      }
      self.timer = self.setTimer(function () { self.check(); }, reachable ? self.monitorMs : self.retryMs);
    });
  };

  return {
    normalizeConfig: normalizeConfig,
    TrustedUrlManager: TrustedUrlManager,
    ReceiverManager: ReceiverManager
  };
}));
