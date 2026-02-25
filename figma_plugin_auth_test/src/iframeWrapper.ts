export const pluginUiUrl = "http://localhost:3000/plugin/ui";
export const pluginOrigin = "http://localhost:3000";

export const iframeWrapper = `<!DOCTYPE html>
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
</script>
</html>`;
