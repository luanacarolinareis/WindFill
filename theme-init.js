(function initThemeEarly() {
  "use strict";

  const root = document.documentElement;
  root.dataset.theme = "dark";

  try {
    chrome.storage.local.get(["themePreference"], (result) => {
      if (chrome.runtime.lastError) {
        return;
      }

      root.dataset.theme = result.themePreference === "light" ? "light" : "dark";
    });
  } catch (error) {
    root.dataset.theme = "dark";
  }
})();
