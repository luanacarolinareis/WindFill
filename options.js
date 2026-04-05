(function initOptionsPage() {
  "use strict";

  const shared = globalThis.ControllerAutofillShared;

  const profilesList = document.getElementById("profilesList");
  const saveButton = document.getElementById("saveButton");
  const addProfileButton = document.getElementById("addProfileButton");
  const seedProfilesButton = document.getElementById("seedProfilesButton");
  const exportButton = document.getElementById("exportButton");
  const importInput = document.getElementById("importInput");
  const saveStatus = document.getElementById("saveStatus");
  const profileTemplate = document.getElementById("profileTemplate");
  const themeToggle = document.getElementById("themeToggle");

  const state = {
    profiles: []
  };

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

  function renderProfiles() {
    profilesList.innerHTML = "";

    if (state.profiles.length === 0) {
      const emptyState = document.createElement("article");
      emptyState.className = "empty-state";
      emptyState.innerHTML =
        "<h2>No profiles yet</h2><p>Add a profile or reset the starter list to begin.</p>";
      profilesList.appendChild(emptyState);
      return;
    }

    state.profiles.forEach((profile, index) => {
      const fragment = profileTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".profile-card");

      fragment.querySelector(".card-index").textContent = "Controller " + (index + 1);
      fragment.querySelector(".card-title").textContent = profile.name || "Unnamed controller";

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

          if (field === "name") {
            card.querySelector(".card-title").textContent = input.value || "Unnamed controller";
          }
        });

        input.addEventListener("change", () => {
          const nextValue = isCheckbox ? input.checked : input.value;
          updateProfile(profile.id, field, nextValue);
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

      card.querySelector(".remove-profile").addEventListener("click", () => {
        state.profiles = state.profiles.filter((entry) => entry.id !== profile.id);
        renderProfiles();
      });

      profilesList.appendChild(fragment);
    });
  }

  async function saveProfiles() {
    const normalized = state.profiles.map((profile, index) => shared.normalizeProfile(profile, index));
    await shared.saveProfiles(normalized);
    state.profiles = normalized;
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
    renderProfiles();
    setStatus("Unsaved changes.", "info");
  });

  seedProfilesButton.addEventListener("click", async () => {
    const confirmed = window.confirm("Replace the current list with a fresh starter profile?");
    if (!confirmed) {
      return;
    }

    state.profiles = shared.createSeedProfiles(shared.INITIAL_PROFILE_COUNT);
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
