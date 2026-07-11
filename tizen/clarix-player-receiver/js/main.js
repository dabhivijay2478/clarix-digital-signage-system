(function () {
  "use strict";

  var offline = document.getElementById("offline");
  var playerHost = document.getElementById("player-host");
  var status = document.getElementById("status");
  var controller = document.getElementById("controller");
  var retry = document.getElementById("retry");
  var manager = null;
  var trusted = null;

  function showOffline(message) {
    while (playerHost.firstChild) playerHost.removeChild(playerHost.firstChild);
    playerHost.hidden = true;
    offline.hidden = false;
    status.textContent = message || "Waiting for Controller...";
    retry.textContent = "Retrying...";
  }

  function showPlayer() {
    if (playerHost.firstChild) return;
    var url = trusted.playerUrl();
    if (!trusted.isAllowed(url)) {
      showOffline("Blocked untrusted player address.");
      return;
    }
    var frame = document.createElement("iframe");
    frame.className = "player-frame";
    frame.title = "Clarix Player";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-presentation");
    frame.setAttribute("allow", "autoplay; fullscreen");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.src = url + "?receiver=tizen";
    playerHost.appendChild(frame);
    offline.hidden = true;
    playerHost.hidden = false;
  }

  function probe(config, done) {
    var xhr = new XMLHttpRequest();
    var finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;
      done(result);
    }
    xhr.open("GET", config.healthUrl + "?receiver=" + Date.now(), true);
    xhr.timeout = 4000;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) return finish(false);
      try {
        var payload = JSON.parse(xhr.responseText);
        finish(payload.status === "online");
      } catch (_error) {
        finish(false);
      }
    };
    xhr.onerror = function () { finish(false); };
    xhr.ontimeout = function () { finish(false); };
    xhr.send();
  }

  function start(configValue) {
    var config;
    try {
      config = ClarixReceiverCore.normalizeConfig(configValue);
      trusted = new ClarixReceiverCore.TrustedUrlManager(configValue);
    } catch (error) {
      controller.textContent = "Configuration error";
      retry.textContent = String(error.message || error);
      status.textContent = "Receiver cannot start.";
      return;
    }
    controller.textContent = config.controllerIp + ":" + config.port;
    manager = new ClarixReceiverCore.ReceiverManager({
      probe: function (done) { probe(config, done); },
      onOnline: showPlayer,
      onOffline: function () { showOffline("Waiting for Controller..."); },
      retryMs: 5000,
      monitorMs: 10000
    });
    manager.start();
  }

  function loadConfiguration() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "receiver-config.json", true);
    xhr.onload = function () {
      if (xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 300)) {
        showOffline("Receiver configuration is unavailable.");
        return;
      }
      try { start(JSON.parse(xhr.responseText)); }
      catch (_error) { showOffline("Receiver configuration is invalid."); }
    };
    xhr.onerror = function () { showOffline("Receiver configuration is unavailable."); };
    xhr.send();
  }

  document.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  document.addEventListener("dragstart", function (event) { event.preventDefault(); });
  document.addEventListener("keydown", function (event) {
    var blocked = [8, 27, 116, 166, 167];
    if (blocked.indexOf(event.keyCode) !== -1 || event.altKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  document.addEventListener("tizenhwkey", function (event) {
    if (event.keyName === "back") event.preventDefault();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && manager) manager.check();
  });

  loadConfiguration();
}());
