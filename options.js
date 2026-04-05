(function initOptionsPage() {
  "use strict";

  const shared = globalThis.ControllerAutofillShared;

  const profilesList = document.getElementById("profilesList");
  const saveButton = document.getElementById("saveButton");
  const addProfileButton = document.getElementById("addProfileButton");
  const seedProfilesButton = document.getElementById("seedProfilesButton");
  const toggleViewButton = document.getElementById("toggleViewButton");
  const exportButton = document.getElementById("exportButton");
  const importInput = document.getElementById("importInput");
  const saveStatus = document.getElementById("saveStatus");
  const patternRowTemplate = document.getElementById("patternRowTemplate");
  const profileTemplate = document.getElementById("profileTemplate");
  const themeToggle = document.getElementById("themeToggle");

  const state = {
    profiles: [],
    collapsedProfileIds: new Set()
  };

  function getProfileById(profileId) {
    return state.profiles.find((profile) => profile.id === profileId) || null;
  }

  function areAllProfilesCollapsed() {
    return state.profiles.length > 0 && state.profiles.every((profile) => state.collapsedProfileIds.has(profile.id));
  }

  function updateViewToggleButton() {
    if (!toggleViewButton) {
      return;
    }

    if (state.profiles.length === 0) {
      toggleViewButton.textContent = "Simple view";
      toggleViewButton.disabled = true;
      return;
    }

    toggleViewButton.disabled = false;
    toggleViewButton.textContent = areAllProfilesCollapsed() ? "Detailed view" : "Simple view";
  }

  function setProfileCollapsed(profileId, collapsed) {
    if (collapsed) {
      state.collapsedProfileIds.add(profileId);
    } else {
      state.collapsedProfileIds.delete(profileId);
    }

    updateViewToggleButton();
  }

  function setAllProfilesCollapsed(collapsed) {
    state.collapsedProfileIds.clear();

    if (collapsed) {
      state.profiles.forEach((profile) => state.collapsedProfileIds.add(profile.id));
    }

    updateViewToggleButton();
  }

  function syncCollapsedProfiles() {
    const validIds = new Set(state.profiles.map((profile) => profile.id));
    state.collapsedProfileIds = new Set(
      Array.from(state.collapsedProfileIds).filter((profileId) => validIds.has(profileId))
    );
    updateViewToggleButton();
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
    saveStatus.textContent = text;
    saveStatus.className = "inline-status " + (kind || "info");
  }

  function updateProfile(profileId, field, value) {
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

    if (state.profiles.length === 0) {
      const emptyState = document.createElement("article");
      emptyState.className = "empty-state";
      emptyState.innerHTML =
        "<h2>No profiles yet</h2><p>Add a profile or reset the starter list to begin.</p>";
      profilesList.appendChild(emptyState);
      updateViewToggleButton();
      return;
    }

    state.profiles.forEach((profile, index) => {
      const fragment = profileTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".profile-card");

      fragment.querySelector(".card-index").textContent = "Controller " + (index + 1);
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
        });

        input.addEventListener("change", () => {
          const nextValue = isCheckbox ? input.checked : input.value;
          updateProfile(profile.id, field, nextValue);
          const updatedProfile = getProfileById(profile.id);
          if (updatedProfile) {
            renderProfileSummary(card, updatedProfile);
          }
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
      });

      profilesList.appendChild(fragment);
    });

    updateViewToggleButton();
  }

  async function saveProfiles() {
    const normalized = state.profiles.map((profile, index) => shared.normalizeProfile(profile, index));
    await shared.saveProfiles(normalized);
    state.profiles = normalized;
    syncCollapsedProfiles();
    setStatus("Saved locally.", "success");
    renderProfiles();
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
        state.collapsedProfileIds.clear();
        renderProfiles();
        await saveProfiles();
      } catch (error) {
        setStatus("Import failed. Check the JSON file format.", "warning");
      }
    };

    reader.readAsText(file);
  }

  async function init() {
    await initTheme();
    state.profiles = await shared.ensureSeedProfiles();
    renderProfiles();
    setStatus("Ready.", "info");
  }

  saveButton.addEventListener("click", async () => {
    await saveProfiles();
  });

  addProfileButton.addEventListener("click", () => {
    const profile = shared.createEmptyProfile(state.profiles.length + 1);
    state.profiles = [...state.profiles, profile];
    state.collapsedProfileIds.delete(profile.id);
    renderProfiles();
    setStatus("Unsaved changes.", "info");
  });

  toggleViewButton.addEventListener("click", () => {
    setAllProfilesCollapsed(!areAllProfilesCollapsed());
    renderProfiles();
  });

  seedProfilesButton.addEventListener("click", async () => {
    const confirmed = window.confirm("Replace the current list with a fresh starter profile?");
    if (!confirmed) {
      return;
    }

    state.profiles = shared.createSeedProfiles(shared.INITIAL_PROFILE_COUNT);
    state.collapsedProfileIds.clear();
    renderProfiles();
    await saveProfiles();
  });

  exportButton.addEventListener("click", exportProfiles);

  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0] ? importInput.files[0] : null;
    if (!file) {
      return;
    }

    importProfiles(file);
    importInput.value = "";
  });

  init();
})();
