(function initThemeEarly() {
  "use strict";

  const root = document.documentElement;
  root.dataset.theme = "light";

  try {
    chrome.storage.local.get(["themePreference"], (result) => {
      if (chrome.runtime.lastError) {
        return;
      }

      root.dataset.theme = result.themePreference === "dark" ? "dark" : "light";
    });
  } catch (error) {
    root.dataset.theme = "light";
  }
})();
