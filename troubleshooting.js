(function initTroubleshootingPage() {
  "use strict";

  const shared = globalThis.ControllerAutofillShared;
  const themeToggle = document.getElementById("themeToggle");
  const openOptionsButton = document.getElementById("openOptionsButton");

  function applyThemeToUi(theme) {
    const normalizedTheme = shared.applyTheme(theme);
    if (themeToggle) {
      themeToggle.checked = normalizedTheme === "dark";
    }
  }

  async function initTheme() {
    if (!themeToggle) {
      return;
    }

    const theme = await shared.loadTheme();
    applyThemeToUi(theme);

    themeToggle.addEventListener("change", async () => {
      const nextTheme = themeToggle.checked ? "dark" : "light";
      applyThemeToUi(nextTheme);
      await shared.saveTheme(nextTheme);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.themePreference) {
        return;
      }

      applyThemeToUi(changes.themePreference.newValue);
    });
  }

  openOptionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  initTheme();
})();
