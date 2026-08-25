export const FIELD_INSTALL_PROMPT_BOOTSTRAP_SCRIPT = `(function(){
  if (window.__mseFieldInstallCaptureReady) return;
  window.__mseFieldInstallCaptureReady = true;
  window.addEventListener("beforeinstallprompt", function(event) {
    window.__mseFieldInstallPrompt = event;
    window.dispatchEvent(new Event("mse:field-install-ready"));
  });
  window.addEventListener("appinstalled", function() {
    window.__mseFieldInstallPrompt = null;
    window.dispatchEvent(new Event("mse:field-app-installed"));
  });
})();`;
