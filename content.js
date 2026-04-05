(function initControllerAutofillContent() {
  "use strict";

  const shared = globalThis.ControllerAutofillShared;

  if (!shared) {
    return;
  }

  let autoFillDone = false;
  let scheduled = false;
  let lastResult = null;

  function profileSummary(profile) {
    return {
      id: profile.id,
      name: profile.name,
      matchPattern: profile.matchPattern,
      autoSubmit: profile.autoSubmit
    };
  }

  async function getMatchingProfiles() {
    const profiles = await shared.loadProfiles();
    return shared.findMatchingProfiles(window.location.href, profiles);
  }

  async function attemptFill(options) {
    const settings = options && typeof options === "object" ? options : {};
    const requestedProfileId = settings.profileId || null;
    const profiles = await getMatchingProfiles();
    const candidates = requestedProfileId
      ? profiles.filter((profile) => profile.id === requestedProfileId)
      : profiles;

    if (candidates.length === 0) {
      lastResult = {
        ok: false,
        reason: "No matching profile for this page.",
        matchedProfiles: []
      };
      return lastResult;
    }

    for (const profile of candidates) {
      const result = shared.fillProfile(profile);
      if (result.ok) {
        autoFillDone = true;
        lastResult = {
          ok: true,
          reason: result.reason,
          profileId: result.profileId,
          profileName: result.profileName,
          matchedProfiles: candidates.map(profileSummary)
        };
        return lastResult;
      }
    }

    lastResult = {
      ok: false,
      reason: "Matching profile found, but the login form is not visible yet.",
      matchedProfiles: candidates.map(profileSummary)
    };
    return lastResult;
  }

  function scheduleFill() {
    if (scheduled || autoFillDone) {
      return;
    }

    scheduled = true;
    window.setTimeout(async () => {
      scheduled = false;
      await attemptFill();
    }, 90);
  }

  function installMutationObserver() {
    const root = document.documentElement || document;
    if (!root) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (!autoFillDone) {
        scheduleFill();
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    window.setTimeout(() => observer.disconnect(), 30000);
  }

  async function sendStatus(sendResponse) {
    const matches = await getMatchingProfiles();
    sendResponse({
      ok: true,
      url: window.location.href,
      autoFillDone,
      lastResult,
      matchedProfiles: matches.map(profileSummary)
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === "controller-autofill:getStatus") {
      sendStatus(sendResponse);
      return true;
    }

    if (message.type === "controller-autofill:fillNow") {
      attemptFill({ profileId: message.profileId || null }).then(sendResponse);
      return true;
    }

    return false;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleFill, { once: true });
  } else {
    scheduleFill();
  }

  installMutationObserver();
})();
