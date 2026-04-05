(function initPopup() {
  "use strict";

  const pageUrl = document.getElementById("pageUrl");
  const statusPanel = document.getElementById("statusPanel");
  const exactUrl = document.getElementById("exactUrl");
  const diagnosticsText = document.getElementById("diagnosticsText");
  const profilesPanel = document.getElementById("profilesPanel");
  const fillButton = document.getElementById("fillButton");
  const optionsButton = document.getElementById("optionsButton");
  const troubleshootingButton = document.getElementById("troubleshootingButton");
  const themeToggle = document.getElementById("themeToggle");

  let activeTabId = null;
  let matchedProfiles = [];
  let pageSupportsMessages = false;

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

  function executeScriptFiles(tabId, files) {
    return new Promise((resolve, reject) => {
      if (!chrome.scripting || typeof chrome.scripting.executeScript !== "function") {
        reject(new Error("Scripting API unavailable."));
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          files: files
        },
        () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve();
        }
      );
    });
  }

  async function getPageStatus(tabId) {
    return sendMessage(tabId, {
      type: "controller-autofill:getStatus"
    });
  }

  async function ensurePageStatus(tabId) {
    try {
      return {
        status: await getPageStatus(tabId),
        recovered: false
      };
    } catch (error) {
      await executeScriptFiles(tabId, ["shared.js", "content.js"]);
      return {
        status: await getPageStatus(tabId),
        recovered: true
      };
    }
  }

  function openOptionsPage() {
    chrome.runtime.openOptionsPage();
  }

  function openTroubleshootingPage() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("troubleshooting.html")
    });
  }

  function setStatus(kind, text) {
    statusPanel.className = "status-panel " + kind;
    statusPanel.innerHTML = "<p class=\"status-label\">" + text + "</p>";
  }

  function setDiagnostics(url, text) {
    exactUrl.textContent = url || "Unknown page";
    exactUrl.title = url || "";
    diagnosticsText.textContent = text;
  }

  function isBrowserInternalUrl(rawUrl) {
    return (
      rawUrl.startsWith("chrome:") ||
      rawUrl.startsWith("edge:") ||
      rawUrl.startsWith("about:") ||
      rawUrl.startsWith("chrome-extension:")
    );
  }

  function renderProfiles(profiles, allowFill) {
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
      button.disabled = !allowFill;
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
        setDiagnostics("", "Open a controller login page to inspect its exact URL and pattern matching.");
        setStatus("warning", "Open a controller login page first.");
        renderProfiles([], false);
        fillButton.disabled = true;
        return;
      }

      const activeTab = tabs[0];
      activeTabId = typeof activeTab.id === "number" ? activeTab.id : null;
      const rawUrl = activeTab.url || "";
      const allProfiles = await globalThis.ControllerAutofillShared.loadProfiles();
      const locallyMatchedProfiles = rawUrl
        ? globalThis.ControllerAutofillShared.findMatchingProfiles(rawUrl, allProfiles)
        : [];

      pageUrl.textContent = formatPageLabel(rawUrl);
      pageUrl.title = rawUrl;
      exactUrl.textContent = rawUrl || "Unknown page";
      exactUrl.title = rawUrl || "";

      if (activeTabId === null) {
        setDiagnostics(rawUrl, "This tab does not expose a normal webpage to the extension.");
        setStatus("warning", "Open a normal webpage to use autofill.");
        renderProfiles(locallyMatchedProfiles, false);
        fillButton.disabled = true;
        return;
      }

      if (isBrowserInternalUrl(rawUrl)) {
        pageSupportsMessages = false;
        setDiagnostics(rawUrl, "This is a browser or extension page. Chrome does not allow autofill scripts to run here.");
        setStatus("warning", "Open the real controller page, not a browser internal page.");
        matchedProfiles = locallyMatchedProfiles;
        renderProfiles(matchedProfiles, false);
        fillButton.disabled = true;
        return;
      }

      try {
        const pageState = await ensurePageStatus(activeTabId);
        const status = pageState.status;

        pageSupportsMessages = true;
        matchedProfiles = status && Array.isArray(status.matchedProfiles) ? status.matchedProfiles : locallyMatchedProfiles;
        renderProfiles(matchedProfiles, true);

        if (status && status.autoFillDone) {
          setStatus("success", "Autofill already ran on this page.");
          setDiagnostics(rawUrl, "Pattern matched and the page allowed the extension to run.");
        } else if (matchedProfiles.length > 0) {
          const reason = status && status.lastResult && status.lastResult.ok === false
            ? "Pattern matched. If fields stay empty, this page probably needs Advanced selectors."
            : "Pattern matched on this exact URL.";
          setStatus("info", "Profile matched. You can fill manually if needed.");
          setDiagnostics(
            rawUrl,
            pageState.recovered
              ? "Pattern matched. The extension reconnected to this page after reloading its page script."
              : reason
          );
        } else {
          setStatus("warning", "No matching profile for this page.");
          setDiagnostics(rawUrl, "No enabled profile matched this exact URL. Check the saved pattern lines carefully.");
        }

        fillButton.disabled = matchedProfiles.length === 0;
      } catch (error) {
        pageSupportsMessages = false;
        matchedProfiles = locallyMatchedProfiles;
        renderProfiles(matchedProfiles, false);

        if (locallyMatchedProfiles.length > 0) {
          setStatus("warning", "A pattern matches, but this page is blocking extension scripts.");
          setDiagnostics(
            rawUrl,
            "The saved pattern matches this URL, but Chrome did not let the extension run here. If you see a certificate warning or browser interstitial, continue to the real page first. If you just reloaded the extension, refresh the controller page once."
          );
        } else {
          setStatus("warning", "Open one of the controller pages to use the extension.");
          setDiagnostics(rawUrl, "No enabled profile matches this exact URL, and the extension could not inspect the page directly.");
        }

        fillButton.disabled = true;
      }
    } catch (error) {
      setStatus("warning", "Open one of the controller pages to use the extension.");
      setDiagnostics("", "Could not inspect the current tab.");
      renderProfiles([], false);
      fillButton.disabled = true;
    }
  }

  fillButton.addEventListener("click", async () => {
    await runFill(matchedProfiles.length > 0 ? matchedProfiles[0].id : null);
  });

  optionsButton.addEventListener("click", openOptionsPage);
  troubleshootingButton.addEventListener("click", openTroubleshootingPage);

  initTheme();
  loadPopupState();
})();
