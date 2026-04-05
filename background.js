(function initWindFillBackground() {
  "use strict";

  const CONTEXT_MENU_ID = "windfill-fill-login";
  const CONTEXT_MENU_TITLE = "Fill login with WindFill";

  function removeAllContextMenus() {
    return new Promise((resolve, reject) => {
      chrome.contextMenus.removeAll(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve();
      });
    });
  }

  function createContextMenu() {
    return new Promise((resolve, reject) => {
      chrome.contextMenus.create(
        {
          id: CONTEXT_MENU_ID,
          title: CONTEXT_MENU_TITLE,
          contexts: ["page", "editable"],
          documentUrlPatterns: ["http://*/*", "https://*/*"]
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

  async function ensureContextMenu() {
    try {
      await removeAllContextMenus();
      await createContextMenu();
    } catch (error) {
      // Ignore menu recreation issues in the background worker.
    }
  }

  function sendTabMessage(tabId, frameId, message) {
    return new Promise((resolve, reject) => {
      const options = Number.isInteger(frameId) && frameId >= 0 ? { frameId: frameId } : undefined;

      chrome.tabs.sendMessage(tabId, message, options, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function executeScriptFiles(tabId, frameId, files) {
    return new Promise((resolve, reject) => {
      const target = Number.isInteger(frameId) && frameId >= 0
        ? { tabId: tabId, frameIds: [frameId] }
        : { tabId: tabId };

      chrome.scripting.executeScript(
        {
          target: target,
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

  async function triggerContextFill(tabId, frameId) {
    try {
      await sendTabMessage(tabId, frameId, {
        type: "controller-autofill:contextFill"
      });
    } catch (error) {
      try {
        await executeScriptFiles(tabId, frameId, ["shared.js", "content.js"]);
        await sendTabMessage(tabId, frameId, {
          type: "controller-autofill:contextFill"
        });
      } catch (retryError) {
        // Ignore failures from pages where scripts cannot run.
      }
    }
  }

  chrome.runtime.onInstalled.addListener(() => {
    void ensureContextMenu();
  });

  chrome.runtime.onStartup.addListener(() => {
    void ensureContextMenu();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!info || info.menuItemId !== CONTEXT_MENU_ID || !tab || typeof tab.id !== "number") {
      return;
    }

    void triggerContextFill(tab.id, info.frameId);
  });

  void ensureContextMenu();
})();
