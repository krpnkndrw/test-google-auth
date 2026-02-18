const pluginUiUrl = "http://localhost:3000/plugin-ui";

const parentHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;">
  <iframe src="${pluginUiUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe>
</body>
<script>
  window.addEventListener('message', (event) => {
  console.log('plugin iframe', event.data.pluginMessage)
  window.parent.postMessage({ pluginMessage: event.data.pluginMessage }, "*")
})
</script>
</html>`;

figma.showUI(parentHtml, { width: 400, height: 500 });

figma.ui.onmessage = (event) => {
  console.log("plugin", event);
};
