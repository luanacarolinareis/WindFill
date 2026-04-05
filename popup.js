(function initPopup() {
  "use strict";

  const pageUrl = document.getElementById("pageUrl");
  const statusPanel = document.getElementById("statusPanel");
  const profilesPanel = document.getElementById("profilesPanel");
  const fillButton = document.getElementById("fillButton");
  const optionsButton = document.getElementById("optionsButton");
  const themeToggle = document.getElementById("themeToggle");

  let activeTabId = null;
  let matchedProfiles = [];

  function applyThemeToUi(theme) {
    if (!globalThis.ControllerAutofillShared) {
      return;
    }

    const normalizedTheme = globalThis.ControllerAutofillShared.applyTheme(theme);
    if (themeToggle) {
      themeToggle.checked = normalizedTheme === "dark";
    }
  }

  async function initTheme() {
    if (!globalThis.ControllerAutofillShared || !themeToggle) {
      return;
    }

    const theme = await globalThis.ControllerAutofillShared.loadTheme();
    applyThemeToUi(theme);

    themeToggle.addEventListener("change", async () => {
      const nextTheme = themeToggle.checked ? "dark" : "light";
      applyThemeToUi(nextTheme);
      await globalThis.ControllerAutofillShared.saveTheme(nextTheme);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.themePreference) {
        return;
      }

      applyThemeToUi(changes.themePreference.newValue);
    });
  }

  function formatPageLabel(rawUrl) {
    if (!rawUrl) {
      return "Unknown page";
    }

    try {
      const currentUrl = new URL(rawUrl);

      if (currentUrl.protocol === "chrome-extension:") {
        return "Extension settings page";
      }

      if (
        currentUrl.protocol === "chrome:" ||
        currentUrl.protocol === "edge:" ||
        currentUrl.protocol === "about:"
      ) {
        return "Browser internal page";
      }

      const host = currentUrl.hostname + (currentUrl.port ? ":" + currentUrl.port : "");
      const path = currentUrl.pathname && currentUrl.pathname !== "/" ? currentUrl.pathname : "";
      const trimmedPath = path.length > 24 ? path.slice(0, 21) + "..." : path;

      if (host && trimmedPath) {
        return host + trimmedPath;
      }

      return host || rawUrl;
    } catch (error) {
      return rawUrl.length > 38 ? rawUrl.slice(0, 35) + "..." : rawUrl;
    }
  }

  function tabsQuery(queryInfo) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query(queryInfo, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(tabs);
      });
    });
  }

  function sendMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function openOptionsPage() {
    chrome.runtime.openOptionsPage();
  }

  function setStatus(kind, text) {
    statusPanel.className = "status-panel " + kind;
    statusPanel.innerHTML = "<p class=\"status-label\">" + text + "</p>";
  }

  function renderProfiles(profiles) {
    profilesPanel.innerHTML = "";

    if (!profiles || profiles.length === 0) {
      profilesPanel.innerHTML = "<p class=\"empty-copy\">No profile matches this page yet.</p>";
      return;
    }

    profiles.forEach((profile) => {
      const article = document.createElement("article");
      article.className = "profile-chip";

      const title = document.createElement("div");
      title.className = "chip-copy";
      title.innerHTML =
        "<strong>" +
        escapeHtml(profile.name || "Unnamed profile") +
        "</strong><span>" +
        escapeHtml(profile.matchPattern || "No pattern") +
        "</span>";

      const button = document.createElement("button");
      button.className = "button mini";
      button.type = "button";
      button.textContent = "Fill";
      button.addEventListener("click", async () => {
        await runFill(profile.id);
      });

      article.appendChild(title);
      article.appendChild(button);
      profilesPanel.appendChild(article);
    });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function runFill(profileId) {
    if (activeTabId === null) {
      setStatus("warning", "No active tab available.");
      return;
    }

    try {
      const response = await sendMessage(activeTabId, {
        type: "controller-autofill:fillNow",
        profileId: profileId || null
      });

      if (response && response.ok) {
        setStatus("success", "Filled " + escapeHtml(response.profileName || "matching profile") + ".");
        return;
      }

      setStatus("warning", escapeHtml((response && response.reason) || "Could not fill the page."));
    } catch (error) {
      setStatus("warning", "This page does not allow content scripts or is not ready yet.");
    }
  }

  async function loadPopupState() {
    try {
      const tabs = await tabsQuery({
        active: true,
        currentWindow: true
      });

      if (!tabs || tabs.length === 0) {
        pageUrl.textContent = "No active tab.";
        setStatus("warning", "Open a controller login page first.");
        renderProfiles([]);
        fillButton.disabled = true;
        return;
      }

      const activeTab = tabs[0];
      activeTabId = typeof activeTab.id === "number" ? activeTab.id : null;
      pageUrl.textContent = formatPageLabel(activeTab.url || "");
      pageUrl.title = activeTab.url || "";

      if (activeTabId === null) {
        setStatus("warning", "Open a normal webpage to use autofill.");
        renderProfiles([]);
        fillButton.disabled = true;
        return;
      }

      const status = await sendMessage(activeTabId, {
        type: "controller-autofill:getStatus"
      });

      matchedProfiles = status && Array.isArray(status.matchedProfiles) ? status.matchedProfiles : [];
      renderProfiles(matchedProfiles);

      if (status && status.autoFillDone) {
        setStatus("success", "Autofill already ran on this page.");
      } else if (matchedProfiles.length > 0) {
        setStatus("info", "Profile matched. You can fill manually if needed.");
      } else {
        setStatus("warning", "No matching profile for this page.");
      }

      fillButton.disabled = matchedProfiles.length === 0;
    } catch (error) {
      setStatus("warning", "Open one of the controller pages to use the extension.");
      renderProfiles([]);
      fillButton.disabled = true;
    }
  }

  fillButton.addEventListener("click", async () => {
    await runFill(matchedProfiles.length > 0 ? matchedProfiles[0].id : null);
  });

  optionsButton.addEventListener("click", openOptionsPage);

  initTheme();
  loadPopupState();
})();
