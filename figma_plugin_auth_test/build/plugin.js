"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // iframeWrapper.ts
  var pluginUiUrl, pluginOrigin, iframeWrapper;
  var init_iframeWrapper = __esm({
    "iframeWrapper.ts"() {
      "use strict";
      pluginUiUrl = "http://localhost:3000/plugin/ui";
      pluginOrigin = "http://localhost:3000";
      iframeWrapper = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;">
  <iframe src="${pluginUiUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe>
</body>
<script>
  const iframe = document.querySelector('iframe');
  const FIGMA_ORIGIN = "https://www.figma.com";
  const PLUGIN_ORIGIN = "${pluginOrigin}";

  window.addEventListener('message', (event) => {
    if (!event.data || !event.data.pluginMessage) return;
    if (event.origin === PLUGIN_ORIGIN) {
      window.parent.postMessage({ pluginMessage: event.data.pluginMessage }, FIGMA_ORIGIN);
    } else {
      iframe.contentWindow.postMessage({ fromFigma: event.data.pluginMessage }, PLUGIN_ORIGIN);
    }
  });
<\/script>
</html>`;
    }
  });

  // plugin.ts
  var require_plugin = __commonJS({
    "plugin.ts"(exports) {
      init_iframeWrapper();
      figma.showUI(iframeWrapper, { width: 400, height: 500 });
      (() => __async(null, null, function* () {
        const accessToken = yield figma.clientStorage.getAsync("access-token");
        const refreshToken = yield figma.clientStorage.getAsync("refresh-token");
        if (accessToken) {
          figma.ui.postMessage({ type: "tokens", accessToken, refreshToken });
        }
      }))();
      figma.ui.onmessage = (msg) => {
        var _a;
        if (msg.type === "saveTokens" && msg.accessToken) {
          figma.clientStorage.setAsync("access-token", msg.accessToken);
          figma.clientStorage.setAsync("refresh-token", (_a = msg.refreshToken) != null ? _a : "");
        }
        if (msg.type === "logout") {
          figma.clientStorage.deleteAsync("access-token");
          figma.clientStorage.deleteAsync("refresh-token");
        }
      };
    }
  });
  require_plugin();
})();
