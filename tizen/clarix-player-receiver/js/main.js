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
  var storageKey = "clarix_receiver_controller";
  var defaultConfig = { controllerIp: "", port: 7420, playerPath: "/player" };
  var manager = null;
  var trusted = null;
  var activeConfig = null;
  var editingInput = false;

  function readStoredValue(key) {
    var value = null;
    try {
      if (window.tizen && tizen.preference && tizen.preference.exists(key)) {
        value = tizen.preference.getValue(key);
      }
    } catch (_error) {}
    if (!value) {
      try { value = localStorage.getItem(key); } catch (_error) {}
    }
    if (!value) {
      try {
        if (window.widget && window.widget.preferences) {
          value = window.widget.preferences.getItem(key);
        }
      } catch (_error) {}
    }
    return value;
  }

  function readSavedController() {
    var value = readStoredValue(storageKey);
    if (!value) return null;
    try { return JSON.parse(value); } catch (_error) { return null; }
  }

  function saveController(config) {
    var value = JSON.stringify({
      controllerIp: config.controllerIp,
      port: config.port,
      playerPath: config.playerPath
    });
    try { localStorage.setItem(storageKey, value); } catch (_error) {}
    try {
      if (window.tizen && tizen.preference) tizen.preference.setValue(storageKey, value);
    } catch (_error) {}
    try {
      if (window.widget && window.widget.preferences) {
        window.widget.preferences.setItem(storageKey, value);
      }
    } catch (_error) {}
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
    status.textContent = message || "Enter controller IP";
    retry.textContent = "Use the controller PC IP, for example 192.168.1.13.";
    editingInput = false;
    editIpButton.focus();
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
    try {
      window.location.replace(target);
    } catch (_error) {
      showOffline("Controller player page could not open.");
    }
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
    try { xhr.send(); } catch (_error) { finish(false); }
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
      onOnline: openControllerPlayer,
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
    } else if (activeConfig) {
      start(activeConfig);
    }
  }

  function focusInputEnd() {
    controllerIpInput.focus();
    var end = controllerIpInput.value.length;
    try { controllerIpInput.setSelectionRange(end, end); } catch (_error) {}
  }

  function openTvKeyboard() {
    editingInput = true;
    focusInputEnd();
    try { controllerIpInput.click(); } catch (_error) {}
  }

  function keyName(event) {
    return event.key || event.keyIdentifier || "";
  }

  function isActivationKey(event) {
    var key = keyName(event);
    return event.keyCode === 13 || key === "Enter" || key === "Return" || key === "OK";
  }

  function directionFromKey(event) {
    var key = keyName(event);
    if (event.keyCode === 37 || event.keyCode === 38 || key === "ArrowLeft" || key === "ArrowUp" || key === "Left" || key === "Up") return -1;
    if (event.keyCode === 39 || event.keyCode === 40 || key === "ArrowRight" || key === "ArrowDown" || key === "Right" || key === "Down") return 1;
    return 0;
  }

  function moveFocus(delta) {
    editingInput = false;
    var current = focusableControls.indexOf(document.activeElement);
    if (current === -1) current = 0;
    var next = (current + delta + focusableControls.length) % focusableControls.length;
    focusableControls[next].focus();
  }

  function exitApplication() {
    try {
      if (window.tizen && tizen.application) {
        tizen.application.getCurrentApplication().exit();
      }
    } catch (_error) {}
  }

  function loadConfiguration() {
    var saved = readSavedController();
    if (saved && saved.controllerIp) {
      start(composeConfig(saved));
      return;
    }
    controllerIpInput.value = "";
    showSetup("Enter controller IP");
  }

  controllerForm.addEventListener("submit", function (event) {
    event.preventDefault();
    editingInput = false;
    controllerIpInput.blur();
    start(composeConfig({ controllerIp: controllerIpInput.value }));
  });

  editIpButton.addEventListener("click", openTvKeyboard);
  retryButton.addEventListener("click", retryNow);
  controllerIpInput.addEventListener("mousedown", function () { editingInput = true; });
  controllerIpInput.addEventListener("touchstart", function () { editingInput = true; });
  controllerIpInput.addEventListener("click", function () {
    editingInput = true;
    focusInputEnd();
  });
  controllerIpInput.addEventListener("blur", function () { editingInput = false; });

  document.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  document.addEventListener("dragstart", function (event) { event.preventDefault(); });
  document.addEventListener("keydown", function (event) {
    var direction;
    var active = document.activeElement;

    if (event.target === controllerIpInput && editingInput) {
      if (event.keyCode === 65376 || keyName(event) === "Done") {
        event.preventDefault();
        connectButton.click();
      }
      return;
    }

    if (isActivationKey(event)) {
      if (active === controllerIpInput) {
        openTvKeyboard();
        return;
      }
      if (active && active.click) {
        event.preventDefault();
        active.click();
      } else {
        editIpButton.focus();
      }
      return;
    }

    direction = directionFromKey(event);
    if (direction !== 0) {
      event.preventDefault();
      moveFocus(direction);
      return;
    }

    if (event.keyCode === 10009 || keyName(event) === "Back" || keyName(event) === "XF86Back") {
      event.preventDefault();
      exitApplication();
    }
  }, true);

  document.addEventListener("tizenhwkey", function (event) {
    if (event.keyName !== "back") return;
    event.preventDefault();
    if (editingInput) {
      editingInput = false;
      controllerIpInput.blur();
      editIpButton.focus();
      return;
    }
    exitApplication();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && manager) manager.check();
  });

  loadConfiguration();
}());
