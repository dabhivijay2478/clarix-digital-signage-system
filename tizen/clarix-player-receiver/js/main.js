(function () {
  "use strict";

  var offline = document.getElementById("offline");
  var playerHost = document.getElementById("player-host");
  var status = document.getElementById("status");
  var controller = document.getElementById("controller");
  var retry = document.getElementById("retry");
  var controllerForm = document.getElementById("controller-form");
  var controllerIpInput = document.getElementById("controller-ip");
  var editIpButton = document.getElementById("edit-ip-button");
  var connectButton = document.getElementById("connect-button");
  var retryButton = document.getElementById("retry-button");
  var focusableControls = [controllerIpInput, editIpButton, connectButton, retryButton];
  var manager = null;
  var trusted = null;
  var activeConfig = null;
  var storageKey = "clarix_receiver_controller";
  var defaultConfig = { controllerIp: "", port: 7420, playerPath: "/player" };

  function readSavedController() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch (_error) {
      return null;
    }
  }

  function saveController(config) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        controllerIp: config.controllerIp,
        port: config.port,
        playerPath: config.playerPath
      }));
    } catch (_error) {
      // Some TV firmware can disable storage; the current session still works.
    }
  }

  function composeConfig(override) {
    return {
      controllerIp: override && override.controllerIp ? override.controllerIp : defaultConfig.controllerIp,
      port: override && override.port ? override.port : defaultConfig.port,
      playerPath: override && override.playerPath ? override.playerPath : defaultConfig.playerPath
    };
  }

  function stopManager() {
    if (manager) manager.stop();
    manager = null;
  }

  function showOffline(message) {
    playerHost.hidden = true;
    playerHost.innerHTML = "";
    offline.hidden = false;
    status.textContent = message || "Waiting for Controller...";
    retry.textContent = activeConfig ? activeConfig.origin : "Enter controller IP, then Connect.";
  }

  function showSetup(message) {
    stopManager();
    activeConfig = null;
    trusted = null;
    playerHost.hidden = true;
    playerHost.innerHTML = "";
    offline.hidden = false;
    controller.textContent = "Not set";
    controllerIpInput.value = "";
    status.textContent = message || "Enter controller IP";
    retry.textContent = "Use the controller PC IP, for example 192.168.1.13.";
    focusInputEnd();
  }

  function controllerOrigin() {
    return activeConfig ? activeConfig.origin : "";
  }

  function injectControllerContext(html, origin) {
    var base = "<base href=\"" + origin + "/\">";
    var context = "<script>window.__CLARIX_CONTROLLER_ORIGIN__=\"" + origin.replace(/"/g, "%22") + "\";<\/script>";
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, "<head$1>" + base + context);
    }
    return base + context + html;
  }

  function showPlayerFrame(target, html) {
    var frame = document.createElement("iframe");
    frame.className = "player-frame";
    frame.title = "MG Enterprise Controller Player";
    frame.setAttribute("allow", "autoplay; fullscreen");
    frame.setAttribute("allowfullscreen", "true");
    playerHost.innerHTML = "";
    playerHost.appendChild(frame);
    offline.hidden = true;
    playerHost.hidden = false;

    var doc = frame.contentWindow && frame.contentWindow.document;
    if (!doc) {
      showOffline("Player frame is unavailable.");
      return;
    }
    doc.open();
    doc.write(injectControllerContext(html, controllerOrigin()));
    doc.close();
  }

  function loadControllerPlayer(target) {
    var xhr = new XMLHttpRequest();
    var requestUrl = controllerOrigin() + "/api/proxy?url=" + encodeURIComponent(target);
    xhr.open("GET", requestUrl, true);
    xhr.timeout = 8000;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) {
        showOffline("Controller player page returned HTTP " + xhr.status + ".");
        return;
      }
      showPlayerFrame(target, xhr.responseText);
    };
    xhr.onerror = function () {
      showOffline("Controller player page could not load through the controller proxy.");
    };
    xhr.ontimeout = function () {
      showOffline("Controller player page timed out.");
    };
    try {
      xhr.send();
    } catch (_error) {
      showOffline("Controller player page request was blocked.");
    }
  }

  function openControllerPlayer() {
    var target = trusted.playerUrl();
    if (!trusted.isAllowed(target)) {
      showOffline("Blocked untrusted player address.");
      return;
    }
    stopManager();
    status.textContent = "Opening Controller Player...";
    retry.textContent = target;
    var startedFrom = window.location.href;
    try {
      window.location.href = target;
    } catch (_error) {
      loadControllerPlayer(target);
      return;
    }
    window.setTimeout(function () {
      if (window.location.href === startedFrom) loadControllerPlayer(target);
    }, 1500);
  }

  function showPlayer() {
    openControllerPlayer();
  }

  function probe(config, done) {
    var xhr = new XMLHttpRequest();
    var finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;
      done(result);
    }
    xhr.open("GET", config.healthUrl + "?_=" + Date.now(), true);
    xhr.timeout = 5000;
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
    stopManager();
    try {
      config = ClarixReceiverCore.normalizeConfig(configValue);
      trusted = new ClarixReceiverCore.TrustedUrlManager(configValue);
    } catch (error) {
      showSetup(error.message || "Invalid controller IP.");
      return;
    }
    activeConfig = config;
    controller.textContent = config.controllerIp + ":" + config.port;
    controllerIpInput.value = config.controllerIp;
    saveController(config);
    showOffline("Waiting for Controller...");
    manager = new ClarixReceiverCore.ReceiverManager({
      probe: function (done) { probe(config, done); },
      onOnline: showPlayer,
      onOffline: function () { showOffline("Waiting for Controller..."); },
      retryMs: 5000,
      monitorMs: 10000
    });
    manager.start();
  }

  function retryNow() {
    if (manager) {
      retry.textContent = "Checking...";
      manager.check();
      return;
    }
    if (activeConfig) start(activeConfig);
  }

  function focusInputEnd() {
    controllerIpInput.focus();
    var end = controllerIpInput.value.length;
    try { controllerIpInput.setSelectionRange(end, end); } catch (_error) {}
  }

  function openTvKeyboard() {
    offline.hidden = false;
    playerHost.hidden = true;
    focusInputEnd();
    try { controllerIpInput.click(); } catch (_error) {}
  }

  function moveFocus(delta) {
    var current = focusableControls.indexOf(document.activeElement);
    if (current === -1) current = 0;
    var next = (current + delta + focusableControls.length) % focusableControls.length;
    focusableControls[next].focus();
  }

  function loadConfiguration() {
    var saved = readSavedController();
    if (saved && saved.controllerIp) {
      start(composeConfig(saved));
      return;
    }
    showSetup("Enter controller IP");
  }

  controllerForm.addEventListener("submit", function (event) {
    event.preventDefault();
    start(composeConfig({ controllerIp: controllerIpInput.value }));
  });

  editIpButton.addEventListener("click", openTvKeyboard);
  retryButton.addEventListener("click", retryNow);
  controllerIpInput.addEventListener("click", focusInputEnd);
  controllerIpInput.addEventListener("mousedown", focusInputEnd);
  controllerIpInput.addEventListener("touchstart", focusInputEnd);

  document.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  document.addEventListener("dragstart", function (event) { event.preventDefault(); });
  document.addEventListener("keydown", function (event) {
    if (event.target === controllerIpInput) {
      if (event.keyCode === 13) {
        event.preventDefault();
        if (controllerForm.requestSubmit) controllerForm.requestSubmit();
        else connectButton.click();
      }
      return;
    }
    if (event.keyCode === 37 || event.keyCode === 38) {
      event.preventDefault();
      moveFocus(-1);
      return;
    }
    if (event.keyCode === 39 || event.keyCode === 40) {
      event.preventDefault();
      moveFocus(1);
      return;
    }
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
