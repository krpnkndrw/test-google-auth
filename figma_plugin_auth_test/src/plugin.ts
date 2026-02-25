import { iframeWrapper } from "./iframeWrapper";

figma.showUI(iframeWrapper, { width: 400, height: 500 });

(async () => {
  const accessToken = await figma.clientStorage.getAsync("access-token");
  const refreshToken = await figma.clientStorage.getAsync("refresh-token");
  if (accessToken) {
    figma.ui.postMessage({ type: "tokens", accessToken, refreshToken });
  }
})();

figma.ui.onmessage = (msg: {
  type?: string;
  accessToken?: string;
  refreshToken?: string;
}) => {
  if (msg.type === "saveTokens" && msg.accessToken) {
    figma.clientStorage.setAsync("access-token", msg.accessToken);
    figma.clientStorage.setAsync("refresh-token", msg.refreshToken ?? "");
  }
  if (msg.type === "logout") {
    figma.clientStorage.deleteAsync("access-token");
    figma.clientStorage.deleteAsync("refresh-token");
  }
};
