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
  var playerScreenStorageKey = "clarix_player_screen_id";
  var defaultConfig = { controllerIp: "", port: 7420, playerPath: "/player" };

  function readJsonStore(key) {
    var value = null;
    try {
      if (window.tizen && tizen.preference && tizen.preference.exists(key)) {
        value = tizen.preference.getValue(key);
      }
    } catch (_error) {}
    if (!value) {
      try { value = localStorage.getItem(key); } catch (_error) {}
    }
    if (!value && window.widget && window.widget.preferences) {
      try { value = window.widget.preferences.getItem(key); } catch (_error) {}
    }
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

  function writeJsonStore(key, payload) {
    var value = JSON.stringify(payload);
    try { localStorage.setItem(key, value); } catch (_error) {}
    try {
      if (window.tizen && tizen.preference) tizen.preference.setValue(key, value);
    } catch (_error) {}
    try {
      if (window.widget && window.widget.preferences) window.widget.preferences.setItem(key, value);
    } catch (_error) {}
  }

  function removeStore(key) {
    try { localStorage.removeItem(key); } catch (_error) {}
    try {
      if (window.tizen && tizen.preference && tizen.preference.exists(key)) tizen.preference.remove(key);
    } catch (_error) {}
    try {
      if (window.widget && window.widget.preferences) window.widget.preferences.removeItem(key);
    } catch (_error) {}
  }

  function readStringStore(key) {
    var payload = readJsonStore(key);
    return typeof payload === "string" && payload ? payload : "";
  }

  function writeStringStore(key, value) {
    if (value) writeJsonStore(key, value);
    else removeStore(key);
  }

  function readSavedController() {
    return readJsonStore(storageKey);
  }

  function saveController(config) {
    writeJsonStore(storageKey, {
      controllerIp: config.controllerIp,
      port: config.port,
      playerPath: config.playerPath
    });
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

  function appendQueryParam(target, name, value) {
    return target + (target.indexOf("?") === -1 ? "?" : "&")
      + encodeURIComponent(name) + "=" + encodeURIComponent(value);
  }

  function playerTargetUrl() {
    var target = trusted.playerUrl();
    var savedScreenId = readStringStore(playerScreenStorageKey);
    if (savedScreenId && !/[?&](?:screenId|id)=/.test(target)) {
      target = appendQueryParam(target, "screenId", savedScreenId);
    }
    if (!/[?&]receiver=/.test(target)) {
      target = appendQueryParam(target, "receiver", "tizen");
    }
    return appendQueryParam(target, "launch", String(Date.now()));
  }

  function injectControllerContext(html, origin) {
    var base = "<base href=\"" + origin + "/\">";
    var safeOrigin = origin.replace(/"/g, "%22");
    var savedScreenId = readStringStore(playerScreenStorageKey).replace(/"/g, "%22");
    var context = "<script>(function(origin){"
      + "window.__CLARIX_CONTROLLER_ORIGIN__=origin;"
      + "window.__CLARIX_PLAYER_SCREEN_ID__=\"" + savedScreenId + "\";"
      + "function fixUrl(value){"
      + "if(typeof value!=='string')return value;"
      + "return value.replace(/^http:\\/\\/(?::7420|undefined:7420|null:7420)(\\/|$)/,origin+'$1');"
      + "}"
      + "function rememberScreen(value){try{if(value){localStorage.setItem('clarix_player_screen_id',value);parent.postMessage({type:'clarix-player-screen-id',value:value},'*');}}catch(_error){}}"
      + "rememberScreen(window.__CLARIX_PLAYER_SCREEN_ID__);"
      + "try{var originalSet=localStorage.setItem.bind(localStorage);localStorage.setItem=function(key,value){originalSet(key,value);if(key==='clarix_player_screen_id')rememberScreen(String(value||''));};var originalRemove=localStorage.removeItem.bind(localStorage);localStorage.removeItem=function(key){originalRemove(key);if(key==='clarix_player_screen_id')parent.postMessage({type:'clarix-player-screen-id',value:''},'*');};}catch(_error){}"
      + "var originalFetch=window.fetch;"
      + "if(originalFetch){window.fetch=function(input,init){"
      + "if(typeof input==='string')return originalFetch.call(this,fixUrl(input),init);"
      + "if(input&&input.url){try{return originalFetch.call(this,new Request(fixUrl(input.url),input),init);}catch(_error){}}"
      + "return originalFetch.call(this,input,init);};}"
      + "var OriginalEventSource=window.EventSource;"
      + "if(OriginalEventSource){window.EventSource=function(url,config){return new OriginalEventSource(fixUrl(url),config);};window.EventSource.prototype=OriginalEventSource.prototype;}"
      + "function rewriteNode(node){if(!node||!node.getAttribute)return;['src','href','data'].forEach(function(name){var value=node.getAttribute(name);var next=fixUrl(value);if(next!==value)node.setAttribute(name,next);});}"
      + "function isEditable(el){return el&&(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||el.isContentEditable);}"
      + "function key(e){return e.key||e.keyIdentifier||'';}"
      + "function direction(e){var k=key(e);if(e.keyCode===37||e.keyCode===38||k==='ArrowLeft'||k==='ArrowUp'||k==='Left'||k==='Up')return-1;if(e.keyCode===39||e.keyCode===40||k==='ArrowRight'||k==='ArrowDown'||k==='Right'||k==='Down')return 1;return 0;}"
      + "function activate(e){var k=key(e);return e.keyCode===13||k==='Enter'||k==='OK'||k==='Accept';}"
      + "function visible(el){var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';}"
      + "function controls(){var q='button,[href],input,select,textarea,[tabindex]:not([tabindex=\"-1\"]),[role=\"button\"],[role=\"link\"],[onclick]';var list=Array.prototype.slice.call(document.querySelectorAll(q)).filter(visible);list.forEach(function(el){if(!el.hasAttribute('tabindex')){try{el.tabIndex=0;}catch(_error){}}});return list;}"
      + "function focusBy(delta){var list=controls();if(!list.length)return;var index=list.indexOf(document.activeElement);index=index<0?0:(index+delta+list.length)%list.length;list[index].focus();}"
      + "document.addEventListener('keydown',function(e){var d=direction(e);if(activate(e)&&!isEditable(document.activeElement)&&document.activeElement&&document.activeElement.click){e.preventDefault();document.activeElement.click();return;}if(d&&!isEditable(document.activeElement)){e.preventDefault();focusBy(d);}},true);"
      + "document.addEventListener('click',function(e){var el=e.target&&e.target.closest&&e.target.closest('button,[href],input,select,textarea,[tabindex],[role=\"button\"],[role=\"link\"],[onclick]');if(el&&el.focus)el.focus();},true);"
      + "setTimeout(function(){var list=controls();if(list.length&&!isEditable(document.activeElement))list[0].focus();},500);"
      + "try{new MutationObserver(function(records){records.forEach(function(record){for(var i=0;i<record.addedNodes.length;i++){var node=record.addedNodes[i];rewriteNode(node);if(node.querySelectorAll){Array.prototype.forEach.call(node.querySelectorAll('[src],[href],[data]'),rewriteNode);}}});}).observe(document.documentElement,{childList:true,subtree:true});}catch(_error){}"
      + "})(\"" + safeOrigin + "\");<\/script>";
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
    var target = playerTargetUrl();
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

  function keyName(event) {
    return event.key || event.keyIdentifier || "";
  }

  function isActivationKey(event) {
    var key = keyName(event);
    return event.keyCode === 13 || key === "Enter" || key === "OK" || key === "Accept";
  }

  function directionFromKey(event) {
    var key = keyName(event);
    if (event.keyCode === 37 || key === "ArrowLeft" || key === "Left") return -1;
    if (event.keyCode === 38 || key === "ArrowUp" || key === "Up") return -1;
    if (event.keyCode === 39 || key === "ArrowRight" || key === "Right") return 1;
    if (event.keyCode === 40 || key === "ArrowDown" || key === "Down") return 1;
    return 0;
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
  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "clarix-player-screen-id") return;
    writeStringStore(playerScreenStorageKey, String(event.data.value || ""));
  });

  document.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  document.addEventListener("dragstart", function (event) { event.preventDefault(); });
  document.addEventListener("keydown", function (event) {
    var direction = directionFromKey(event);
    if (event.target === controllerIpInput) {
      // Samsung's native IME requires input key events to remain unmodified.
      // The form's native Go/Enter action submits the controller address.
      return;
    }
    if (isActivationKey(event) && document.activeElement && document.activeElement.click) {
      event.preventDefault();
      document.activeElement.click();
      return;
    }
    if (direction !== 0) {
      event.preventDefault();
      moveFocus(direction);
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
