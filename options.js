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
  const themeToggle = document.getElementById("themeToggle");
  const autoSaveToggle = document.getElementById("autoSaveToggle");
  const searchInput = document.getElementById("searchInput");
  const clearSearchButton = document.getElementById("clearSearchButton");
  const AUTO_SAVE_DELAY_MS = 700;

  const state = {
    profiles: [],
    collapsedProfileIds: new Set(),
    searchQuery: "",
    autoSaveEnabled: true,
    detailedViewEnabled: true
  };

  let autoSaveTimerId = null;
  let saveQueue = Promise.resolve();
  let hasUnsavedChanges = false;

  function getProfileById(profileId) {
    return state.profiles.find((profile) => profile.id === profileId) || null;
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
      state.profiles.forEach((profile) => state.collapsedProfileIds.add(profile.id));
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

    if (!normalizedQuery) {
      return state.profiles;
    }

    return state.profiles.filter((profile) => getProfileSearchText(profile).includes(normalizedQuery));
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
        setStatus("Could not save changes locally.", "warning");
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

  function updateProfile(profileId, field, value) {
    markUnsavedChanges();
    state.profiles = state.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }

      return {
        ...profile,
        [field]: value
      };
    });
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
    const summaryEnabled = card.querySelector(".summary-pill-enabled");
    const summarySubmit = card.querySelector(".summary-pill-submit");
    const patterns = shared.splitPatterns(profile.matchPattern);

    if (summaryPattern) {
      if (patterns.length === 0) {
        summaryPattern.textContent = "No pattern set yet";
      } else {
        summaryPattern.textContent =
          patterns[0] + (patterns.length > 1 ? " +" + (patterns.length - 1) + " more" : "");
      }
    }

    if (summarySecondary) {
      const secondaryParts = [];
      secondaryParts.push(
        patterns.length === 0 ? "No patterns saved" : patterns.length === 1 ? "1 pattern" : patterns.length + " patterns"
      );
      secondaryParts.push(profile.username ? "Username: " + profile.username : "No username saved");
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

  function renderProfiles() {
    profilesList.innerHTML = "";
    updateSearchControls();

    const filteredProfiles = getFilteredProfiles();
    const hasSearchQuery = normalizeSearchQuery(state.searchQuery) !== "";

    if (state.profiles.length === 0) {
      const emptyState = document.createElement("article");
      emptyState.className = "empty-state";
      emptyState.innerHTML =
        "<h2>No profiles yet</h2><p>Add a profile or reset the starter list to begin.</p>";
      profilesList.appendChild(emptyState);
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

    filteredProfiles.forEach((profile) => {
      const fragment = profileTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".profile-card");
      const originalIndex = state.profiles.findIndex((entry) => entry.id === profile.id);
      const displayIndex = originalIndex >= 0 ? originalIndex + 1 : 1;

      fragment.querySelector(".card-index").textContent = "Controller " + displayIndex;
      fragment.querySelector(".card-title").textContent = profile.name || "Unnamed controller";
      renderProfileSummary(card, profile);
      applyProfileCollapseState(card, profile.id);
      renderPatternRows(card, profile.id, shared.splitPatterns(profile.matchPattern));

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
          }

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
          }

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

      const visibilityButton = card.querySelector(".profile-visibility-button");
      if (visibilityButton) {
        visibilityButton.addEventListener("click", () => {
          const nextCollapsed = !state.collapsedProfileIds.has(profile.id);
          setProfileCollapsed(profile.id, nextCollapsed);
          applyProfileCollapseState(card, profile.id);
        });
      }

      card.querySelector(".remove-profile").addEventListener("click", () => {
        state.profiles = state.profiles.filter((entry) => entry.id !== profile.id);
        state.collapsedProfileIds.delete(profile.id);
        renderProfiles();
        scheduleAutoSave();
      });

      profilesList.appendChild(fragment);
    });

    if (!hasSearchQuery) {
      const addProfileCard = document.createElement("button");
      addProfileCard.type = "button";
      addProfileCard.className = "profile-card add-profile-card";
      addProfileCard.setAttribute("aria-label", "Add a new controller profile");
      addProfileCard.innerHTML =
        "<span class=\"card-index\">Quick add</span>" +
        "<span class=\"add-profile-mark\" aria-hidden=\"true\">+</span>" +
        "<span class=\"add-profile-title\">Add controller</span>" +
        "<span class=\"add-profile-copy\">Quickly add another controller profile.</span>";
      addProfileCard.addEventListener("click", addNewProfile);
      profilesList.appendChild(addProfileCard);
    }

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

  function exportProfiles() {
    const blob = new Blob([JSON.stringify(state.profiles, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "controller-autofill-profiles.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Profiles exported.", "success");
  }

  function importProfiles(file) {
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || "[]"));
        if (!Array.isArray(parsed)) {
          throw new Error("JSON must contain an array of profiles.");
        }

        state.profiles = parsed.map((profile, index) => shared.normalizeProfile(profile, index));
        hasUnsavedChanges = true;
        state.collapsedProfileIds.clear();
        renderProfiles();
        await saveProfilesNow({ rerender: false });
      } catch (error) {
        setStatus("Import failed. Check the JSON file format.", "warning");
      }
    };

    reader.readAsText(file);
  }

  async function init() {
    await initTheme();
    state.autoSaveEnabled = await shared.loadAutoSavePreference();
    state.detailedViewEnabled = await shared.loadDetailedViewPreference();
    state.profiles = await shared.ensureSeedProfiles();
    setAllProfilesCollapsed(!state.detailedViewEnabled);
    renderProfiles();
    updateAutoSaveControls();
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

  seedProfilesButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Reset the list and restore default settings? This will set dark theme, autosave on, and detailed view."
    );
    if (!confirmed) {
      return;
    }

    clearAutoSaveTimer();
    applyThemeToUi(shared.DEFAULT_THEME);
    state.autoSaveEnabled = shared.DEFAULT_AUTOSAVE;
    state.detailedViewEnabled = shared.DEFAULT_DETAILED_VIEW;
    state.profiles = shared.createSeedProfiles(shared.INITIAL_PROFILE_COUNT);
    hasUnsavedChanges = true;
    state.collapsedProfileIds.clear();
    setAllProfilesCollapsed(!state.detailedViewEnabled);
    updateAutoSaveControls();
    renderProfiles();
    await Promise.all([
      shared.saveTheme(shared.DEFAULT_THEME),
      shared.saveAutoSavePreference(state.autoSaveEnabled),
      shared.saveDetailedViewPreference(state.detailedViewEnabled)
    ]);
    await saveProfilesNow({ rerender: false });
  });

  exportButton.addEventListener("click", exportProfiles);

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

    importProfiles(file);
    importInput.value = "";
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
})();
