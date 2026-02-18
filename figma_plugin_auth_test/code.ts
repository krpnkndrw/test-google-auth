const pluginUiUrl = "http://localhost:3000/plugin/ui";
const pluginOrigin = "http://localhost:3000";

const parentHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;">
  <iframe src="${pluginUiUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe>
</body>
<script>
  window.addEventListener('message', (event) => {
    if (event.data && event.data.pluginMessage) {
      window.parent.postMessage({ pluginMessage: event.data.pluginMessage }, "https://www.figma.com");
    }
  });
</script>
</html>`;

figma.showUI(parentHtml, { width: 400, height: 500 });

(async () => {
  const token = await figma.clientStorage.getAsync("my-token");
  if (token) {
    figma.ui.postMessage({ type: "token", token }, { origin: pluginOrigin });
  }
})();

figma.ui.onmessage = (msg: { type?: string; token?: string }) => {
  if (msg.type === "saveToken" && msg.token) {
    figma.clientStorage.setAsync("my-token", msg.token);
  }
  if (msg.type === "logout") {
    figma.clientStorage.deleteAsync("my-token");
  }
};
