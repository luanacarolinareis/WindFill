(function initOptionsPage() {
  "use strict";

  const shared = globalThis.ControllerAutofillShared;

  const profilesList = document.getElementById("profilesList");
  const saveButton = document.getElementById("saveButton");
  const addProfileButton = document.getElementById("addProfileButton");
  const seedProfilesButton = document.getElementById("seedProfilesButton");
  const toggleViewToggle = document.getElementById("toggleViewToggle");
  const exportButton = document.getElementById("exportButton");
  const importInput = document.getElementById("importInput");
  const saveStatus = document.getElementById("saveStatus");
  const patternRowTemplate = document.getElementById("patternRowTemplate");
  const profileTemplate = document.getElementById("profileTemplate");
  const matchPriorityRuleTemplate = document.getElementById("matchPriorityRuleTemplate");
  const themeToggle = document.getElementById("themeToggle");
  const autoSaveToggle = document.getElementById("autoSaveToggle");
  const searchInput = document.getElementById("searchInput");
  const clearSearchButton = document.getElementById("clearSearchButton");
  const sortBySelect = document.getElementById("sortBySelect");
  const sortDirectionSelect = document.getElementById("sortDirectionSelect");
  const matchPriorityPanel = document.getElementById("matchPriorityPanel");
  const matchPriorityToggleButton = document.getElementById("matchPriorityToggleButton");
  const matchPriorityList = document.getElementById("matchPriorityList");
  const AUTO_SAVE_DELAY_MS = 700;
  const DRAG_SCROLL_EDGE_PX = 120;
  const DRAG_SCROLL_MAX_STEP = 18;
  const creationDateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium"
  });

  const state = {
    profiles: [],
    collapsedProfileIds: new Set(),
    searchQuery: "",
    autoSaveEnabled: true,
    detailedViewEnabled: true,
    sortBy: shared.DEFAULT_SORT_BY,
    sortDirection: shared.DEFAULT_SORT_DIRECTION,
    matchPreferences: shared.createDefaultMatchPreferenceSettings()
  };

  let autoSaveTimerId = null;
  let saveQueue = Promise.resolve();
  let hasUnsavedChanges = false;
  let draggedProfileId = null;
  let dragOriginRect = null;
  let dragClientY = null;
  let dragAutoScrollFrameId = null;
  let draggedMatchRuleId = null;

  function getProfileById(profileId) {
    return state.profiles.find((profile) => isValidProfileEntry(profile) && profile.id === profileId) || null;
  }

  function isValidProfileEntry(profile) {
    return Boolean(
      profile &&
      typeof profile === "object" &&
      typeof profile.id === "string" &&
      profile.id.trim()
    );
  }

  function isManualSortActive() {
    return state.sortBy === "manual";
  }

  function formatProfileModifiedAt(lastModifiedAt) {
    const timestamp = Date.parse(lastModifiedAt);
    if (!Number.isFinite(timestamp)) {
      return "Updated recently";
    }

    return creationDateFormatter.format(new Date(timestamp));
  }

  function getMatchRuleMetadata(ruleId) {
    if (ruleId === "patternSpecificity") {
      return {
        title: "Pattern specificity",
        description: "Prefer more specific URL or IP patterns before broader wildcard matches.",
        selectOptions: null
      };
    }

    if (ruleId === "creationDate") {
      return {
        title: "Last modified",
        description: "Prefer profiles updated more recently or less recently when multiple matches are otherwise equivalent.",
        selectOptions: [
          { value: "newest", label: "Newest first" },
          { value: "oldest", label: "Oldest first" }
        ]
      };
    }

    return {
      title: "Saved login data",
      description: "Prefer complete profiles with username and password saved, or profiles that still have missing data.",
      selectOptions: [
        { value: "complete", label: "Complete data first" },
        { value: "missing", label: "Missing data first" }
      ]
    };
  }

  function updateViewToggleControl() {
    if (!toggleViewToggle) {
      return;
    }

    toggleViewToggle.checked = state.detailedViewEnabled;

    if (state.profiles.length === 0) {
      toggleViewToggle.disabled = true;
      return;
    }

    toggleViewToggle.disabled = false;
  }

  function persistDetailedViewPreference() {
    return shared.saveDetailedViewPreference(state.detailedViewEnabled).catch(() => {});
  }

  function persistSortPreferences() {
    return Promise.all([
      shared.saveSortByPreference(state.sortBy).catch(() => {}),
      shared.saveSortDirectionPreference(state.sortDirection).catch(() => {})
    ]);
  }

  function persistMatchPreferences() {
    return shared.saveMatchPreferenceSettings(state.matchPreferences).catch(() => {});
  }

  function setProfileCollapsed(profileId, collapsed) {
    if (collapsed) {
      state.collapsedProfileIds.add(profileId);
    } else {
      state.collapsedProfileIds.delete(profileId);
    }

    updateViewToggleControl();
  }

  function setAllProfilesCollapsed(collapsed) {
    state.collapsedProfileIds.clear();

    if (collapsed) {
      state.profiles
        .filter(isValidProfileEntry)
        .forEach((profile) => state.collapsedProfileIds.add(profile.id));
    }

    state.detailedViewEnabled = !collapsed;
    updateViewToggleControl();
    void persistDetailedViewPreference();
  }

  function syncCollapsedProfiles() {
    const validIds = new Set(state.profiles.map((profile) => profile.id));
    state.collapsedProfileIds = new Set(
      Array.from(state.collapsedProfileIds).filter((profileId) => validIds.has(profileId))
    );
    updateViewToggleControl();
  }

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

  function setStatus(text, kind) {
    const normalizedText = typeof text === "string" ? text.trim() : "";
    const normalizedKind = kind || "info";
    const shouldShow = normalizedText !== "" && normalizedKind === "warning";

    saveStatus.textContent = shouldShow ? normalizedText : "";
    saveStatus.className = shouldShow
      ? "inline-status " + normalizedKind
      : "inline-status is-hidden";
  }

  function showWarningDialog(message) {
    const normalizedMessage = typeof message === "string" ? message.trim() : "";
    if (!normalizedMessage) {
      return;
    }

    window.alert(normalizedMessage);
  }

  function queueSave(task) {
    saveQueue = saveQueue
      .catch(() => {})
      .then(task);

    return saveQueue;
  }

  function normalizeCurrentProfiles() {
    return state.profiles.map((profile, index) => shared.normalizeProfile(profile, index));
  }

  function normalizeSearchQuery(query) {
    return String(query || "").trim().toLowerCase();
  }

  function getProfileSearchText(profile) {
    return [
      profile.name,
      profile.matchPattern,
      profile.username,
      profile.notes,
      profile.usernameSelector,
      profile.passwordSelector,
      profile.submitSelector
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
  }

  function getFilteredProfiles() {
    const normalizedQuery = normalizeSearchQuery(state.searchQuery);
    const validProfiles = Array.isArray(state.profiles)
      ? state.profiles.filter(isValidProfileEntry)
      : [];

    if (!normalizedQuery) {
      return validProfiles;
    }

    return validProfiles.filter((profile) => getProfileSearchText(profile).includes(normalizedQuery));
  }

  function compareProfilesByName(left, right) {
    return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
      sensitivity: "base",
      numeric: true
    });
  }

  function compareProfilesByLastModifiedAt(left, right) {
    const leftTime = Date.parse(left.lastModifiedAt);
    const rightTime = Date.parse(right.lastModifiedAt);
    const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
    return normalizedLeftTime - normalizedRightTime;
  }

  function getSortedProfiles(profiles) {
    const source = Array.isArray(profiles) ? [...profiles] : [];

    if (state.sortBy === "manual") {
      return source;
    }

    const directionMultiplier = state.sortDirection === "desc" ? -1 : 1;

    source.sort((left, right) => {
      const primaryResult = state.sortBy === "name"
        ? compareProfilesByName(left, right)
        : compareProfilesByLastModifiedAt(left, right);

      if (primaryResult !== 0) {
        return primaryResult * directionMultiplier;
      }

      return compareProfilesByLastModifiedAt(left, right);
    });

    return source;
  }

  function formatHumanList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    if (items.length === 1) {
      return items[0];
    }

    if (items.length === 2) {
      return items[0] + " and " + items[1];
    }

    return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
  }

  function getProfileCompleteness(profile) {
    return shared.getIncompleteProfileDetails(profile);
  }

  function getProfileHealthText(profile) {
    const completeness = getProfileCompleteness(profile);
    if (completeness.complete) {
      return "";
    }

    return "Missing " + formatHumanList(completeness.missing);
  }

  function setFieldMissingState(fieldElement, missing, title) {
    if (!fieldElement) {
      return;
    }

    fieldElement.classList.toggle("is-missing", missing);
    fieldElement.title = missing ? title : "";
  }

  function applyIncompleteFieldHighlights(card, profile) {
    const completeness = getProfileCompleteness(profile);
    const missing = completeness.missing;
    const patternField = card.querySelector(".pattern-field");
    const usernameField = card.querySelector(".username-field");
    const passwordField = card.querySelector(".password-field");

    setFieldMissingState(patternField, missing.includes("pattern"), "Add at least one IP or URL pattern.");
    setFieldMissingState(usernameField, missing.includes("username"), "Add a username to complete this profile.");
    setFieldMissingState(passwordField, missing.includes("password"), "Add a password to complete this profile.");
  }

  function updateSearchControls() {
    if (searchInput && searchInput.value !== state.searchQuery) {
      searchInput.value = state.searchQuery;
    }

    if (clearSearchButton) {
      const hasSearchQuery = normalizeSearchQuery(state.searchQuery) !== "";
      clearSearchButton.disabled = !hasSearchQuery;
    }
  }

  function updateAutoSaveControls() {
    if (autoSaveToggle) {
      autoSaveToggle.checked = state.autoSaveEnabled;
    }

    if (!saveButton) {
      return;
    }

    const saveMessage = state.autoSaveEnabled
      ? saveButton.dataset.titleAutosaveOn || "Autosave is on. Click to save immediately if you want to make sure everything is written now."
      : saveButton.dataset.titleAutosaveOff || "Autosave is off. Click to save all current changes now.";

    saveButton.title = saveMessage;
    saveButton.setAttribute("aria-label", saveMessage);
    saveButton.classList.toggle("manual-save-mode", !state.autoSaveEnabled);
    saveButton.classList.toggle("has-pending-save", hasUnsavedChanges);
  }

  function updateSortControls() {
    if (sortBySelect) {
      sortBySelect.value = state.sortBy;
    }

    if (sortDirectionSelect) {
      sortDirectionSelect.value = state.sortDirection;
      sortDirectionSelect.disabled = state.sortBy === "manual";
    }
  }

  function setMatchPriorityExpanded(expanded) {
    if (!matchPriorityPanel || !matchPriorityToggleButton) {
      return;
    }

    matchPriorityPanel.classList.toggle("is-collapsed", !expanded);
    matchPriorityToggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    matchPriorityToggleButton.setAttribute("aria-label", expanded ? "Hide best match priority" : "Show best match priority");
    matchPriorityToggleButton.title = expanded ? "Hide best match priority" : "Show best match priority";
  }

  function toggleMatchPriorityExpanded() {
    if (!matchPriorityToggleButton) {
      return;
    }

    const isExpanded = matchPriorityToggleButton.getAttribute("aria-expanded") === "true";
    setMatchPriorityExpanded(!isExpanded);
  }

  function shouldIgnoreMatchPriorityPanelClick(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(
        "button, select, option, input, textarea, label, a, .match-rule-item, .match-rule-select-shell"
      )
    );
  }

  function reorderMatchRule(draggedRuleId, targetRuleId, placement) {
    if (!draggedRuleId || !targetRuleId || draggedRuleId === targetRuleId) {
      return;
    }

    const currentOrder = [...state.matchPreferences.ruleOrder];
    const draggedIndex = currentOrder.indexOf(draggedRuleId);
    const targetIndex = currentOrder.indexOf(targetRuleId);

    if (draggedIndex < 0 || targetIndex < 0) {
      return;
    }

    currentOrder.splice(draggedIndex, 1);
    const adjustedTargetIndex = currentOrder.indexOf(targetRuleId);
    const insertionIndex = placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
    currentOrder.splice(insertionIndex, 0, draggedRuleId);
    state.matchPreferences = {
      ...state.matchPreferences,
      ruleOrder: currentOrder
    };
    renderMatchPriorityRules();
    void persistMatchPreferences();
  }

  function renderMatchPriorityRules() {
    if (!matchPriorityList || !matchPriorityRuleTemplate) {
      return;
    }

    matchPriorityList.innerHTML = "";

    state.matchPreferences.ruleOrder.forEach((ruleId) => {
      const metadata = getMatchRuleMetadata(ruleId);
      const fragment = matchPriorityRuleTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".match-rule-item");
      const dragHandle = fragment.querySelector(".match-rule-drag-handle");
      const title = fragment.querySelector(".match-rule-title");
      const description = fragment.querySelector(".match-rule-description");
      const select = fragment.querySelector(".match-rule-select");

      card.dataset.ruleId = ruleId;
      card.setAttribute("draggable", "false");
      title.textContent = metadata.title;
      description.textContent = metadata.description;

      if (!metadata.selectOptions) {
        select.remove();
      } else {
        metadata.selectOptions.forEach((option) => {
          const element = document.createElement("option");
          element.value = option.value;
          element.textContent = option.label;
          select.appendChild(element);
        });

        if (ruleId === "creationDate") {
          select.value = state.matchPreferences.creationDateMode;
        } else if (ruleId === "savedData") {
          select.value = state.matchPreferences.savedDataMode;
        }

        select.addEventListener("change", async () => {
          state.matchPreferences = {
            ...state.matchPreferences,
            creationDateMode: ruleId === "creationDate"
              ? shared.normalizeMatchCreationDateMode(select.value)
              : state.matchPreferences.creationDateMode,
            savedDataMode: ruleId === "savedData"
              ? shared.normalizeMatchSavedDataMode(select.value)
              : state.matchPreferences.savedDataMode
          };
          renderMatchPriorityRules();
          await persistMatchPreferences();
        });
      }

      dragHandle.addEventListener("mousedown", () => {
        card.setAttribute("draggable", "true");
      });

      dragHandle.addEventListener("mouseup", () => {
        if (!card.classList.contains("is-dragging")) {
          card.setAttribute("draggable", "false");
        }
      });

      dragHandle.addEventListener("mouseleave", () => {
        if (!card.classList.contains("is-dragging")) {
          card.setAttribute("draggable", "false");
        }
      });

      card.addEventListener("dragstart", (event) => {
        draggedMatchRuleId = ruleId;
        card.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", ruleId);
        }
      });

      card.addEventListener("dragover", (event) => {
        if (!draggedMatchRuleId || draggedMatchRuleId === ruleId) {
          return;
        }

        event.preventDefault();
        matchPriorityList.querySelectorAll(".match-rule-item.drop-before, .match-rule-item.drop-after")
          .forEach((item) => item.classList.remove("drop-before", "drop-after"));

        const rect = card.getBoundingClientRect();
        const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
        card.classList.add(placement === "after" ? "drop-after" : "drop-before");
      });

      card.addEventListener("drop", (event) => {
        if (!draggedMatchRuleId || draggedMatchRuleId === ruleId) {
          return;
        }

        event.preventDefault();
        const rect = card.getBoundingClientRect();
        const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
        const movedRuleId = draggedMatchRuleId;
        draggedMatchRuleId = null;
        reorderMatchRule(movedRuleId, ruleId, placement);
      });

      card.addEventListener("dragend", () => {
        draggedMatchRuleId = null;
        card.classList.remove("is-dragging");
        card.classList.remove("drop-before", "drop-after");
        card.setAttribute("draggable", "false");
        matchPriorityList.querySelectorAll(".match-rule-item.drop-before, .match-rule-item.drop-after")
          .forEach((item) => item.classList.remove("drop-before", "drop-after"));
      });

      matchPriorityList.appendChild(fragment);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the selected file."));

      reader.readAsText(file);
    });
  }

  function tabsQuery(queryInfo) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query(queryInfo, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(tabs || []);
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

  function isBrowserInternalUrl(rawUrl) {
    return (
      !rawUrl ||
      rawUrl.startsWith("chrome:") ||
      rawUrl.startsWith("edge:") ||
      rawUrl.startsWith("about:") ||
      rawUrl.startsWith("chrome-extension:")
    );
  }

  async function ensurePageMessaging(tabId) {
    try {
      return await sendMessage(tabId, {
        type: "controller-autofill:getStatus"
      });
    } catch (error) {
      await executeScriptFiles(tabId, ["shared.js", "content.js"]);
      return sendMessage(tabId, {
        type: "controller-autofill:getStatus"
      });
    }
  }

  async function getMostRecentTestableTab(profile) {
    const tabs = await tabsQuery({
      currentWindow: true
    });

    return tabs
      .filter((tab) => {
        if (typeof tab.id !== "number" || isBrowserInternalUrl(tab.url || "")) {
          return false;
        }

        if (!profile) {
          return true;
        }

        return shared.matchesProfile(profile, tab.url || "");
      })
      .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0] || null;
  }

  function promptForEncryptedExportPassphrase() {
    const passphrase = window.prompt(
      "Enter a passphrase to encrypt this WindFill export file."
    );

    if (passphrase === null) {
      return null;
    }

    if (!String(passphrase).trim()) {
      showWarningDialog("Export cancelled. Enter a non-empty passphrase to encrypt the file.");
      return null;
    }

    const confirmation = window.prompt(
      "Confirm the passphrase for this encrypted WindFill export."
    );

    if (confirmation === null) {
      return null;
    }

    if (passphrase !== confirmation) {
      showWarningDialog("Passphrases did not match. Export cancelled.");
      return null;
    }

    return passphrase;
  }

  function promptForImportPassphrase() {
    const passphrase = window.prompt(
      "Enter the passphrase used to encrypt this WindFill export."
    );

    if (passphrase === null) {
      return null;
    }

    if (!String(passphrase).trim()) {
      showWarningDialog("Import cancelled. Enter the export passphrase to continue.");
      return null;
    }

    return passphrase;
  }

  function markUnsavedChanges() {
    hasUnsavedChanges = true;
    updateAutoSaveControls();
  }

  async function persistProfiles(options) {
    const settings = options && typeof options === "object" ? options : {};
    const rerender = settings.rerender === true;
    const normalized = normalizeCurrentProfiles();

    await shared.saveProfiles(normalized);
    state.profiles = normalized;
    hasUnsavedChanges = false;
    syncCollapsedProfiles();
    setStatus("", "info");
    updateAutoSaveControls();

    if (rerender) {
      renderProfiles();
    }
  }

  async function saveProfiles(options) {
    if (!hasUnsavedChanges) {
      return saveQueue;
    }

    return queueSave(async () => {
      try {
        await persistProfiles(options);
      } catch (error) {
        showWarningDialog("Could not save changes locally.");
      }
    });
  }

  function clearAutoSaveTimer() {
    if (autoSaveTimerId !== null) {
      window.clearTimeout(autoSaveTimerId);
      autoSaveTimerId = null;
    }
  }

  function scheduleAutoSave() {
    markUnsavedChanges();
    if (!state.autoSaveEnabled) {
      clearAutoSaveTimer();
      return;
    }

    clearAutoSaveTimer();
    autoSaveTimerId = window.setTimeout(() => {
      autoSaveTimerId = null;
      void saveProfiles({ rerender: false });
    }, AUTO_SAVE_DELAY_MS);
  }

  function saveProfilesNow(options) {
    clearAutoSaveTimer();
    return saveProfiles(options);
  }

  function clearDropIndicators() {
    profilesList.querySelectorAll(".profile-card.drop-before, .profile-card.drop-after")
      .forEach((card) => {
        card.classList.remove("drop-before", "drop-after");
      });
  }

  function stopDragAutoScroll() {
    dragClientY = null;

    if (dragAutoScrollFrameId !== null) {
      window.cancelAnimationFrame(dragAutoScrollFrameId);
      dragAutoScrollFrameId = null;
    }
  }

  function tickDragAutoScroll() {
    if (!draggedProfileId) {
      stopDragAutoScroll();
      return;
    }

    let scrollDelta = 0;

    if (typeof dragClientY === "number") {
      if (dragClientY < DRAG_SCROLL_EDGE_PX) {
        scrollDelta = -Math.ceil(((DRAG_SCROLL_EDGE_PX - dragClientY) / DRAG_SCROLL_EDGE_PX) * DRAG_SCROLL_MAX_STEP);
      } else if (dragClientY > window.innerHeight - DRAG_SCROLL_EDGE_PX) {
        scrollDelta = Math.ceil(((dragClientY - (window.innerHeight - DRAG_SCROLL_EDGE_PX)) / DRAG_SCROLL_EDGE_PX) * DRAG_SCROLL_MAX_STEP);
      }
    }

    if (scrollDelta !== 0) {
      window.scrollBy(0, scrollDelta);
    }

    dragAutoScrollFrameId = window.requestAnimationFrame(tickDragAutoScroll);
  }

  function startDragAutoScroll() {
    if (dragAutoScrollFrameId !== null) {
      return;
    }

    dragAutoScrollFrameId = window.requestAnimationFrame(tickDragAutoScroll);
  }

  function reorderProfile(draggedId, targetId, placement) {
    if (!isManualSortActive()) {
      return;
    }

    if (!draggedId || !targetId || draggedId === targetId) {
      return;
    }

    const currentProfiles = [...state.profiles];
    const draggedIndex = currentProfiles.findIndex((profile) => isValidProfileEntry(profile) && profile.id === draggedId);
    const targetIndex = currentProfiles.findIndex((profile) => isValidProfileEntry(profile) && profile.id === targetId);

    if (draggedIndex < 0 || targetIndex < 0) {
      return;
    }

    const [draggedProfile] = currentProfiles.splice(draggedIndex, 1);
    const adjustedTargetIndex = currentProfiles.findIndex((profile) => isValidProfileEntry(profile) && profile.id === targetId);
    const insertionIndex = placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;

    currentProfiles.splice(insertionIndex, 0, draggedProfile);
    state.profiles = currentProfiles;
    renderProfiles();
    scheduleAutoSave();
  }

  function getDropPlacement(card, targetProfileId, clientX, clientY) {
    const rect = card.getBoundingClientRect();
    const sameRowAsOrigin =
      dragOriginRect &&
      Math.abs(rect.top - dragOriginRect.top) < Math.max(24, Math.min(rect.height, dragOriginRect.height) * 0.35);
    const draggedIndex = state.profiles.findIndex((profile) => isValidProfileEntry(profile) && profile.id === draggedProfileId);
    const targetIndex = state.profiles.findIndex((profile) => isValidProfileEntry(profile) && profile.id === targetProfileId);

    if (sameRowAsOrigin && draggedIndex >= 0 && targetIndex >= 0 && draggedIndex !== targetIndex) {
      return draggedIndex < targetIndex ? "after" : "before";
    }

    if (sameRowAsOrigin) {
      return clientX > rect.left + rect.width / 2 ? "after" : "before";
    }

    return clientY > rect.top + rect.height / 2 ? "after" : "before";
  }

  function duplicateProfile(profileId) {
    const currentIndex = state.profiles.findIndex((profile) => isValidProfileEntry(profile) && profile.id === profileId);
    const sourceProfile = currentIndex >= 0 ? state.profiles[currentIndex] : null;

    if (!sourceProfile) {
      return;
    }

    const clonedProfile = shared.cloneProfile(sourceProfile, currentIndex + 1);
    const nextProfiles = [...state.profiles];
    nextProfiles.splice(currentIndex + 1, 0, clonedProfile);
    state.profiles = nextProfiles;

    if (!state.detailedViewEnabled) {
      state.collapsedProfileIds.add(clonedProfile.id);
    } else {
      state.collapsedProfileIds.delete(clonedProfile.id);
    }

    renderProfiles();
    scheduleAutoSave();
  }

  function updateProfile(profileId, field, value) {
    markUnsavedChanges();
    state.profiles = state.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }

      return {
        ...profile,
        lastModifiedAt: new Date().toISOString(),
        [field]: value
      };
    });
  }

  function setSelectorTestStatus(card, kind, text) {
    const statusElement = card.querySelector("[data-selector-test-status]");
    if (!statusElement) {
      return;
    }

    const normalizedText = typeof text === "string" ? text.trim() : "";
    statusElement.textContent = normalizedText;
    statusElement.className = normalizedText
      ? "selector-test-status " + (kind || "info")
      : "selector-test-status is-hidden";
    statusElement.hidden = normalizedText === "";
  }

  function buildFieldTestMessage(label, result) {
    if (!result) {
      return label + ": no result.";
    }

    if (result.usingSelector) {
      if (result.explicitMatched) {
        return label + " selector matched " + result.matchedElement + ".";
      }

      if (result.found && result.source === "auto") {
        return label + " selector missed, but auto-detection found " + result.matchedElement + ".";
      }

      return label + " selector did not match a visible field.";
    }

    if (result.found) {
      return label + " auto-detected " + result.matchedElement + ".";
    }

    return label + " field was not found.";
  }

  function buildSelectorTestMessage(response) {
    if (!response || !response.ok || !response.result) {
      return {
        kind: "warning",
        text: "Could not test selectors on that page."
      };
    }

    const result = response.result;
    const parts = [
      buildFieldTestMessage("Username", result.username),
      buildFieldTestMessage("Password", result.password)
    ];

    if (result.submit && result.submit.required) {
      parts.push(buildFieldTestMessage("Submit", result.submit));
    }

    return {
      kind: result.ok ? "success" : "warning",
      text: parts.join(" ")
    };
  }

  async function runSelectorTest(card, profileId, button) {
    const profile = getProfileById(profileId);

    if (!profile) {
      setSelectorTestStatus(card, "warning", "Profile data was not found.");
      return;
    }

    const triggerButton = button || card.querySelector(".test-selectors-button");
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.textContent = "Testing...";
    }

    try {
      const tab = await getMostRecentTestableTab(profile);

      if (!tab || typeof tab.id !== "number") {
        setSelectorTestStatus(card, "warning", "Open a page that matches this profile before testing selectors.");
        return;
      }

      const status = await ensurePageMessaging(tab.id);
      const testedUrl = status && status.url ? status.url : (tab.url || "");

      if (!shared.matchesProfile(profile, testedUrl)) {
        setSelectorTestStatus(card, "warning", "The available page no longer matches this profile. Open the correct controller page and try again.");
        return;
      }

      const response = await sendMessage(tab.id, {
        type: "controller-autofill:testSelectors",
        profile: profile
      });
      const message = buildSelectorTestMessage(response);
      setSelectorTestStatus(card, message.kind, message.text);
    } catch (error) {
      setSelectorTestStatus(card, "warning", "Could not test selectors on the current controller page.");
    } finally {
      if (triggerButton) {
        triggerButton.disabled = false;
        triggerButton.textContent = "Test selectors";
      }
    }
  }

  function getPatternValuesFromCard(card) {
    return Array.from(card.querySelectorAll("[data-pattern-input]")).map((input) => input.value || "");
  }

  function normalizePatternValues(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return [""];
    }

    return values;
  }

  function serializePatternValues(values) {
    return normalizePatternValues(values)
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");
  }

  function persistPatternValues(profileId, values, card) {
    updateProfile(profileId, "matchPattern", serializePatternValues(values));
    const updatedProfile = getProfileById(profileId);
    if (updatedProfile && card) {
      renderProfileSummary(card, updatedProfile);
      applyIncompleteFieldHighlights(card, updatedProfile);
      setSelectorTestStatus(card, "", "");
    }
    scheduleAutoSave();
  }

  function renderPatternRows(card, profileId, values, focusIndex) {
    const patternList = card.querySelector("[data-pattern-list]");
    if (!patternList || !patternRowTemplate) {
      return;
    }

    const normalizedValues = normalizePatternValues(values);
    patternList.innerHTML = "";

    normalizedValues.forEach((value, index) => {
      const fragment = patternRowTemplate.content.cloneNode(true);
      const input = fragment.querySelector("[data-pattern-input]");
      const removeButton = fragment.querySelector(".pattern-remove-button");

      input.value = value;
      input.addEventListener("input", () => {
        persistPatternValues(profileId, getPatternValuesFromCard(card), card);
      });

      removeButton.disabled = normalizedValues.length === 1;
      removeButton.addEventListener("click", () => {
        const nextValues = getPatternValuesFromCard(card);
        nextValues.splice(index, 1);
        const safeValues = nextValues.length > 0 ? nextValues : [""];
        renderPatternRows(card, profileId, safeValues, Math.max(0, index - 1));
        persistPatternValues(profileId, safeValues, card);
      });

      patternList.appendChild(fragment);
    });

    if (Number.isInteger(focusIndex)) {
      const inputs = patternList.querySelectorAll("[data-pattern-input]");
      if (inputs[focusIndex]) {
        inputs[focusIndex].focus();
        inputs[focusIndex].select();
      }
    }
  }

  function renderProfileSummary(card, profile) {
    const summaryPattern = card.querySelector(".profile-summary-pattern");
    const summarySecondary = card.querySelector(".profile-summary-secondary");
    const summaryHealth = card.querySelector(".summary-pill-health");
    const summaryEnabled = card.querySelector(".summary-pill-enabled");
    const summarySubmit = card.querySelector(".summary-pill-submit");
    const healthCopy = card.querySelector(".profile-health-copy");
    const patterns = shared.splitPatterns(profile.matchPattern);
    const completeness = getProfileCompleteness(profile);
    const healthText = getProfileHealthText(profile);

    if (summaryPattern) {
      if (patterns.length === 0) {
        summaryPattern.textContent = "No pattern set yet";
      } else {
        summaryPattern.textContent =
          patterns[0] + (patterns.length > 1 ? " +" + (patterns.length - 1) + " more" : "");
      }
    }

    if (false && summarySecondary) {
      const secondaryParts = [];
      secondaryParts.push(
        patterns.length === 0 ? "No patterns saved" : patterns.length === 1 ? "1 pattern" : patterns.length + " patterns"
      );
      secondaryParts.push(profile.username ? "Username: " + profile.username : "No username saved");
      summarySecondary.textContent = secondaryParts.join(" · ");
    }

    if (healthCopy) {
      healthCopy.hidden = true;
      healthCopy.textContent = "";
    }

    if (summaryHealth) {
      summaryHealth.hidden = completeness.complete;
      summaryHealth.textContent = completeness.complete ? "" : "▲ Incomplete";
      summaryHealth.textContent = completeness.complete ? "" : "Incomplete";
      summaryHealth.dataset.state = completeness.complete ? "" : "warning";
      summaryHealth.title = completeness.complete ? "" : healthText;
    }

    if (summarySecondary) {
      const secondaryParts = [];
      secondaryParts.push(
        patterns.length === 0 ? "No patterns saved" : patterns.length === 1 ? "1 pattern" : patterns.length + " patterns"
      );
      if (profile.username) {
        secondaryParts.push("Username: " + profile.username);
      }
      secondaryParts.push("Last modified: " + formatProfileModifiedAt(profile.lastModifiedAt));
      summarySecondary.textContent = secondaryParts.join(" · ");
    }

    if (summaryEnabled) {
      summaryEnabled.textContent = profile.enabled ? "Enabled" : "Disabled";
      summaryEnabled.dataset.state = profile.enabled ? "enabled" : "disabled";
    }

    if (summarySubmit) {
      summarySubmit.textContent = profile.autoSubmit ? "Auto submit" : "Manual submit";
      summarySubmit.dataset.state = profile.autoSubmit ? "enabled" : "neutral";
    }

    card.classList.toggle("is-incomplete", !completeness.complete);
  }

  function applyProfileCollapseState(card, profileId) {
    const isCollapsed = state.collapsedProfileIds.has(profileId);
    const visibilityButton = card.querySelector(".profile-visibility-button");

    card.classList.toggle("is-collapsed", isCollapsed);

    if (visibilityButton) {
      visibilityButton.textContent = isCollapsed ? "Details" : "Collapse";
      visibilityButton.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    }
  }

  function createQuickAddProfileCard() {
    const addProfileCard = document.createElement("button");
    addProfileCard.type = "button";
    addProfileCard.className = "profile-card add-profile-card";
    addProfileCard.setAttribute("aria-label", "Add a new controller profile");
    addProfileCard.innerHTML =
      "<span class=\"card-index\">Quick add</span>" +
      "<span class=\"add-profile-mark\" aria-hidden=\"true\">+</span>" +
      "<span class=\"add-profile-title\">Add profile</span>" +
      "<span class=\"add-profile-copy\">Quickly add another controller profile.</span>";
    addProfileCard.addEventListener("click", addNewProfile);
    return addProfileCard;
  }

  function syncQuickAddCardHeight() {
    const quickAddCard = profilesList.querySelector(".add-profile-card");

    if (!quickAddCard) {
      return;
    }

    quickAddCard.style.height = "";

    if (state.detailedViewEnabled) {
      return;
    }

    const referenceCard = profilesList.querySelector(".profile-card.is-collapsed:not(.add-profile-card)");

    if (!referenceCard) {
      return;
    }

    const referenceHeight = Math.ceil(referenceCard.getBoundingClientRect().height);
    if (referenceHeight > 0) {
      quickAddCard.style.height = referenceHeight + "px";
    }
  }

  function renderProfiles() {
    profilesList.innerHTML = "";
    updateSearchControls();
    updateSortControls();

    const filteredProfiles = getSortedProfiles(getFilteredProfiles());
    const hasSearchQuery = normalizeSearchQuery(state.searchQuery) !== "";

    if (state.profiles.length === 0) {
      const emptyState = document.createElement("article");
      emptyState.className = "empty-state";
      emptyState.innerHTML =
        "<h2>No profiles yet</h2><p>Add a profile whenever you are ready.</p>";
      profilesList.appendChild(emptyState);
      profilesList.appendChild(createQuickAddProfileCard());
      window.requestAnimationFrame(syncQuickAddCardHeight);
      updateViewToggleControl();
      return;
    }

    if (filteredProfiles.length === 0) {
      const emptyState = document.createElement("article");
      emptyState.className = "empty-state search-empty-state";
      emptyState.innerHTML =
        "<h2>No controllers found</h2><p>Try a different search term, or clear the search to see the full list again.</p>";

      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "button ghost mini";
      clearButton.textContent = "Clear search";
      clearButton.addEventListener("click", () => {
        state.searchQuery = "";
        updateSearchControls();
        renderProfiles();
        if (searchInput) {
          searchInput.focus();
        }
      });

      emptyState.appendChild(clearButton);
      profilesList.appendChild(emptyState);
      updateViewToggleControl();
      return;
    }

    filteredProfiles.forEach((profile, filteredIndex) => {
      if (!isValidProfileEntry(profile)) {
        return;
      }

      const fragment = profileTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".profile-card");
      card.setAttribute("draggable", "false");
      const originalIndex = state.profiles.findIndex((entry) => isValidProfileEntry(entry) && entry.id === profile.id);
      const displayIndex = isManualSortActive()
        ? (originalIndex >= 0 ? originalIndex + 1 : filteredIndex + 1)
        : filteredIndex + 1;
      const dragHandle = card.querySelector(".drag-profile-handle");
      const duplicateButton = card.querySelector(".duplicate-profile");
      const testSelectorsButton = card.querySelector(".test-selectors-button");
      const createdAtLabel = card.querySelector(".profile-created-at");
      const dragEnabled = isManualSortActive();

      fragment.querySelector(".card-index").textContent = "Controller " + displayIndex;
      fragment.querySelector(".card-title").textContent = profile.name || "Unnamed controller";
      if (createdAtLabel) {
        createdAtLabel.textContent = "Last modified " + formatProfileModifiedAt(profile.lastModifiedAt);
      }
      renderProfileSummary(card, profile);
      applyProfileCollapseState(card, profile.id);
      renderPatternRows(card, profile.id, shared.splitPatterns(profile.matchPattern));
      applyIncompleteFieldHighlights(card, profile);
      setSelectorTestStatus(card, "", "");

      if (dragHandle) {
        dragHandle.disabled = !dragEnabled;
        dragHandle.title = dragEnabled
          ? "Drag to reorder"
          : "Switch Order by back to Manual to drag controllers";
        dragHandle.setAttribute("aria-label", dragHandle.title);
        dragHandle.classList.toggle("is-disabled", !dragEnabled);

        dragHandle.addEventListener("mousedown", () => {
          if (!dragEnabled) {
            return;
          }
          card.setAttribute("draggable", "true");
        });

        dragHandle.addEventListener("mouseup", () => {
          if (!card.classList.contains("is-dragging")) {
            card.setAttribute("draggable", "false");
          }
        });

        dragHandle.addEventListener("mouseleave", () => {
          if (!card.classList.contains("is-dragging")) {
            card.setAttribute("draggable", "false");
          }
        });
      }

      card.addEventListener("dragstart", (event) => {
        if (!dragEnabled) {
          event.preventDefault();
          return;
        }
        draggedProfileId = profile.id;
        dragOriginRect = card.getBoundingClientRect();
        clearDropIndicators();
        card.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", profile.id);
        }
      });

      card.addEventListener("dragover", (event) => {
        if (!dragEnabled || !draggedProfileId || draggedProfileId === profile.id) {
          return;
        }

        event.preventDefault();
        clearDropIndicators();
        const placement = getDropPlacement(card, profile.id, event.clientX, event.clientY);
        card.classList.add(placement === "after" ? "drop-after" : "drop-before");
      });

      card.addEventListener("drop", (event) => {
        if (!dragEnabled || !draggedProfileId || draggedProfileId === profile.id) {
          return;
        }

        event.preventDefault();
        const placement = getDropPlacement(card, profile.id, event.clientX, event.clientY);
        const movedProfileId = draggedProfileId;
        draggedProfileId = null;
        dragOriginRect = null;
        stopDragAutoScroll();
        clearDropIndicators();
        reorderProfile(movedProfileId, profile.id, placement);
      });

      card.addEventListener("dragend", () => {
        draggedProfileId = null;
        dragOriginRect = null;
        stopDragAutoScroll();
        clearDropIndicators();
        card.classList.remove("is-dragging");
        card.setAttribute("draggable", "false");
      });

      if (duplicateButton) {
        duplicateButton.addEventListener("click", () => {
          duplicateProfile(profile.id);
        });
      }

      const inputs = fragment.querySelectorAll("[data-field]");
      inputs.forEach((input) => {
        const field = input.dataset.field;
        const isCheckbox = input.type === "checkbox";

        if (isCheckbox) {
          input.checked = Boolean(profile[field]);
        } else {
          input.value = profile[field] || "";
        }

        input.addEventListener("input", () => {
          const nextValue = isCheckbox ? input.checked : input.value;
          updateProfile(profile.id, field, nextValue);
          const updatedProfile = getProfileById(profile.id);
          if (updatedProfile) {
            renderProfileSummary(card, updatedProfile);
            applyIncompleteFieldHighlights(card, updatedProfile);
          }

          setSelectorTestStatus(card, "", "");

          if (field === "name") {
            card.querySelector(".card-title").textContent = input.value || "Unnamed controller";
          }

          if (!isCheckbox) {
            scheduleAutoSave();
          }
        });

        input.addEventListener("change", () => {
          const nextValue = isCheckbox ? input.checked : input.value;
          updateProfile(profile.id, field, nextValue);
          const updatedProfile = getProfileById(profile.id);
          if (updatedProfile) {
            renderProfileSummary(card, updatedProfile);
            applyIncompleteFieldHighlights(card, updatedProfile);
          }

          setSelectorTestStatus(card, "", "");
          scheduleAutoSave();
        });
      });

      const passwordInput = card.querySelector('input[data-field="password"]');
      const passwordToggleButton = card.querySelector(".password-toggle-button");
      if (passwordInput && passwordToggleButton) {
        passwordToggleButton.addEventListener("click", () => {
          const isVisible = passwordInput.type === "text";
          passwordInput.type = isVisible ? "password" : "text";
          passwordToggleButton.setAttribute("aria-pressed", isVisible ? "false" : "true");
          passwordToggleButton.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
        });
      }

      const patternAddButton = card.querySelector(".pattern-add-button");
      if (patternAddButton) {
        patternAddButton.addEventListener("click", () => {
          const nextValues = [...getPatternValuesFromCard(card), ""];
          renderPatternRows(card, profile.id, nextValues, nextValues.length - 1);
          persistPatternValues(profile.id, nextValues, card);
        });
      }

      if (testSelectorsButton) {
        testSelectorsButton.addEventListener("click", () => {
          void runSelectorTest(card, profile.id, testSelectorsButton);
        });
      }

      const visibilityButton = card.querySelector(".profile-visibility-button");
      if (visibilityButton) {
        visibilityButton.addEventListener("click", () => {
          const nextCollapsed = !state.collapsedProfileIds.has(profile.id);
          setProfileCollapsed(profile.id, nextCollapsed);
          applyProfileCollapseState(card, profile.id);
        });
      }

      card.querySelector(".remove-profile").addEventListener("click", () => {
        const confirmed = window.confirm(
          "Remove this controller profile permanently? This action cannot be undone."
        );
        if (!confirmed) {
          return;
        }

        state.profiles = state.profiles.filter((entry) => entry.id !== profile.id);
        state.collapsedProfileIds.delete(profile.id);
        renderProfiles();
        scheduleAutoSave();
      });

      profilesList.appendChild(fragment);
    });

    if (!hasSearchQuery) {
      profilesList.appendChild(createQuickAddProfileCard());
    }

    window.requestAnimationFrame(syncQuickAddCardHeight);
    updateViewToggleControl();
  }

  function addNewProfile() {
    const profile = shared.createEmptyProfile(state.profiles.length + 1);
    const shouldStartCollapsed = !state.detailedViewEnabled;

    state.profiles = [...state.profiles, profile];
    if (shouldStartCollapsed) {
      state.collapsedProfileIds.add(profile.id);
    } else {
      state.collapsedProfileIds.delete(profile.id);
    }

    renderProfiles();
    scheduleAutoSave();
  }

  async function exportProfiles() {
    const passphrase = promptForEncryptedExportPassphrase();
    if (passphrase === null) {
      return;
    }

    try {
      const encryptedPayload = await shared.encryptProfilesExport(normalizeCurrentProfiles(), passphrase);
      const blob = new Blob([JSON.stringify(encryptedPayload, null, 2)], {
        type: "application/json"
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "windfill-profiles.encrypted.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("", "info");
    } catch (error) {
      showWarningDialog("Could not create the encrypted export file.");
    }
  }

  async function importProfiles(file) {
    try {
      const rawText = await readFileAsText(file);
      const parsed = JSON.parse(rawText || "[]");
      let importedProfiles = null;

      if (Array.isArray(parsed)) {
        importedProfiles = parsed.map((profile, index) => shared.normalizeProfile(profile, index));
      } else if (shared.isEncryptedExportPayload(parsed)) {
        const passphrase = promptForImportPassphrase();
        if (passphrase === null) {
          return;
        }

        importedProfiles = await shared.decryptProfilesExport(parsed, passphrase);
      } else {
        throw new Error("Import failed. Use an encrypted WindFill export or a legacy JSON array of profiles.");
      }

      clearAutoSaveTimer();
      state.profiles = importedProfiles;
      hasUnsavedChanges = true;
      state.collapsedProfileIds.clear();
      renderProfiles();
      await saveProfilesNow({ rerender: false });
    } catch (error) {
      showWarningDialog(error && error.message ? error.message : "Import failed. Check the JSON file format.");
    }
  }

  async function init() {
    await initTheme();
    state.autoSaveEnabled = await shared.loadAutoSavePreference();
    state.detailedViewEnabled = await shared.loadDetailedViewPreference();
    state.sortBy = await shared.loadSortByPreference();
    state.sortDirection = await shared.loadSortDirectionPreference();
    state.matchPreferences = await shared.loadMatchPreferenceSettings();
    state.profiles = await shared.loadProfiles();
    setAllProfilesCollapsed(!state.detailedViewEnabled);
    renderProfiles();
    renderMatchPriorityRules();
    updateAutoSaveControls();
    updateSortControls();
    setStatus("", "info");
  }

  saveButton.addEventListener("click", async () => {
    await saveProfilesNow({ rerender: false });
  });

  addProfileButton.addEventListener("click", addNewProfile);

  if (autoSaveToggle) {
    autoSaveToggle.addEventListener("change", async () => {
      state.autoSaveEnabled = autoSaveToggle.checked;
      updateAutoSaveControls();
      clearAutoSaveTimer();
      await shared.saveAutoSavePreference(state.autoSaveEnabled);

      if (state.autoSaveEnabled && hasUnsavedChanges) {
        scheduleAutoSave();
      }
    });
  }

  toggleViewToggle.addEventListener("change", () => {
    setAllProfilesCollapsed(!toggleViewToggle.checked);
    renderProfiles();
  });

  if (sortBySelect) {
    sortBySelect.addEventListener("change", async () => {
      state.sortBy = shared.normalizeSortBy ? shared.normalizeSortBy(sortBySelect.value) : sortBySelect.value;
      updateSortControls();
      renderProfiles();
      await persistSortPreferences();
    });
  }

  if (sortDirectionSelect) {
    sortDirectionSelect.addEventListener("change", async () => {
      state.sortDirection = shared.normalizeSortDirection ? shared.normalizeSortDirection(sortDirectionSelect.value) : sortDirectionSelect.value;
      updateSortControls();
      renderProfiles();
      await persistSortPreferences();
    });
  }

  if (matchPriorityToggleButton) {
    matchPriorityToggleButton.addEventListener("click", toggleMatchPriorityExpanded);
  }

  if (matchPriorityPanel) {
    matchPriorityPanel.addEventListener("click", (event) => {
      if (shouldIgnoreMatchPriorityPanelClick(event.target)) {
        return;
      }

      toggleMatchPriorityExpanded();
    });
  }

  seedProfilesButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Reset the list and restore default settings? This will remove all profiles, reset best match priority rules, and set dark theme, autosave on, and detailed view."
    );
    if (!confirmed) {
      return;
    }

    clearAutoSaveTimer();
    applyThemeToUi(shared.DEFAULT_THEME);
    state.autoSaveEnabled = shared.DEFAULT_AUTOSAVE;
    state.detailedViewEnabled = shared.DEFAULT_DETAILED_VIEW;
    state.sortBy = shared.DEFAULT_SORT_BY;
    state.sortDirection = shared.DEFAULT_SORT_DIRECTION;
    state.matchPreferences = shared.createDefaultMatchPreferenceSettings();
    state.profiles = shared.createSeedProfiles(shared.INITIAL_PROFILE_COUNT);
    hasUnsavedChanges = true;
    state.collapsedProfileIds.clear();
    setAllProfilesCollapsed(!state.detailedViewEnabled);
    updateAutoSaveControls();
    updateSortControls();
    renderProfiles();
    renderMatchPriorityRules();
    await Promise.all([
      shared.saveTheme(shared.DEFAULT_THEME),
      shared.saveAutoSavePreference(state.autoSaveEnabled),
      shared.saveDetailedViewPreference(state.detailedViewEnabled),
      shared.saveSortByPreference(state.sortBy),
      shared.saveSortDirectionPreference(state.sortDirection),
      shared.saveMatchPreferenceSettings(state.matchPreferences)
    ]);
    await saveProfilesNow({ rerender: false });
  });

  exportButton.addEventListener("click", () => {
    void exportProfiles();
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value;
      renderProfiles();
    });
  }

  if (clearSearchButton) {
    clearSearchButton.addEventListener("click", () => {
      if (!normalizeSearchQuery(state.searchQuery)) {
        return;
      }

      state.searchQuery = "";
      updateSearchControls();
      renderProfiles();
      if (searchInput) {
        searchInput.focus();
      }
    });
  }

  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0] ? importInput.files[0] : null;
    if (!file) {
      return;
    }

    const confirmed = window.confirm(
      "Importing a JSON file will overwrite the current profiles shown in WindFill. Do you want to continue?"
    );
    if (!confirmed) {
      importInput.value = "";
      return;
    }

    await importProfiles(file);
    importInput.value = "";
  });

  document.addEventListener(
    "dragover",
    (event) => {
      if (!draggedProfileId) {
        return;
      }

      dragClientY = event.clientY;
      startDragAutoScroll();
    },
    true
  );

  window.addEventListener("resize", () => {
    window.requestAnimationFrame(syncQuickAddCardHeight);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.autoSaveEnabled) {
      void saveProfilesNow({ rerender: false });
    }
  });

  window.addEventListener("pagehide", () => {
    if (state.autoSaveEnabled) {
      void saveProfilesNow({ rerender: false });
    }
  });

  init();
  setMatchPriorityExpanded(false);
})();
