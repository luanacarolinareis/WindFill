(function initControllerAutofillShared(global) {
  "use strict";

  const STORAGE_KEY = "profiles";
  const THEME_STORAGE_KEY = "themePreference";
  const AUTOSAVE_STORAGE_KEY = "autoSaveEnabled";
  const VIEW_MODE_STORAGE_KEY = "detailedViewEnabled";
  const INITIAL_PROFILE_COUNT = 1;
  const DEFAULT_THEME = "dark";
  const DEFAULT_AUTOSAVE = true;
  const DEFAULT_DETAILED_VIEW = true;

  const USERNAME_KEYWORDS = [
    "user",
    "username",
    "login",
    "account",
    "email",
    "mail",
    "operator",
    "admin"
  ];

  const PASSWORD_KEYWORDS = [
    "pass",
    "password",
    "pwd",
    "secret"
  ];

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(result);
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve();
      });
    });
  }

  function makeId() {
    return [
      "profile",
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 8)
    ].join("-");
  }

  function createEmptyProfile(index) {
    return {
      id: makeId(),
      name: "Controller " + index,
      matchPattern: "",
      username: "",
      password: "",
      usernameSelector: "",
      passwordSelector: "",
      submitSelector: "",
      autoSubmit: false,
      enabled: true,
      overwriteExisting: true
    };
  }

  function createSeedProfiles(count) {
    const profileCount = Number.isFinite(count) ? count : INITIAL_PROFILE_COUNT;
    return Array.from({ length: profileCount }, (_, index) => createEmptyProfile(index + 1));
  }

  function normalizeProfile(profile, index) {
    const source = profile && typeof profile === "object" ? profile : {};
    const fallback = createEmptyProfile(index + 1);

    return {
      id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : fallback.id,
      name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : fallback.name,
      matchPattern: typeof source.matchPattern === "string" ? source.matchPattern.trim() : "",
      username: typeof source.username === "string" ? source.username : "",
      password: typeof source.password === "string" ? source.password : "",
      usernameSelector: typeof source.usernameSelector === "string" ? source.usernameSelector.trim() : "",
      passwordSelector: typeof source.passwordSelector === "string" ? source.passwordSelector.trim() : "",
      submitSelector: typeof source.submitSelector === "string" ? source.submitSelector.trim() : "",
      autoSubmit: Boolean(source.autoSubmit),
      enabled: source.enabled !== false,
      overwriteExisting: source.overwriteExisting !== false
    };
  }

  function normalizeProfiles(rawProfiles) {
    if (!Array.isArray(rawProfiles)) {
      return [];
    }

    return rawProfiles.map((profile, index) => normalizeProfile(profile, index));
  }

  async function loadProfiles() {
    const result = await storageGet([STORAGE_KEY]);
    return normalizeProfiles(result[STORAGE_KEY]);
  }

  function normalizeTheme(theme) {
    if (theme === "light" || theme === "dark") {
      return theme;
    }

    return DEFAULT_THEME;
  }

  async function loadTheme() {
    const result = await storageGet([THEME_STORAGE_KEY]);
    return normalizeTheme(result[THEME_STORAGE_KEY]);
  }

  function normalizeAutoSavePreference(value) {
    return value === false ? false : DEFAULT_AUTOSAVE;
  }

  async function loadAutoSavePreference() {
    const result = await storageGet([AUTOSAVE_STORAGE_KEY]);
    return normalizeAutoSavePreference(result[AUTOSAVE_STORAGE_KEY]);
  }

  function normalizeDetailedViewPreference(value) {
    return value !== false;
  }

  async function loadDetailedViewPreference() {
    const result = await storageGet([VIEW_MODE_STORAGE_KEY]);
    return normalizeDetailedViewPreference(result[VIEW_MODE_STORAGE_KEY]);
  }

  async function saveTheme(theme) {
    const normalizedTheme = normalizeTheme(theme);
    await storageSet({
      [THEME_STORAGE_KEY]: normalizedTheme
    });
    return normalizedTheme;
  }

  async function saveAutoSavePreference(value) {
    const normalizedValue = normalizeAutoSavePreference(value);
    await storageSet({
      [AUTOSAVE_STORAGE_KEY]: normalizedValue
    });
    return normalizedValue;
  }

  async function saveDetailedViewPreference(value) {
    const normalizedValue = normalizeDetailedViewPreference(value);
    await storageSet({
      [VIEW_MODE_STORAGE_KEY]: normalizedValue
    });
    return normalizedValue;
  }

  function applyTheme(theme, root) {
    const targetRoot = root || document.documentElement;
    const normalizedTheme = normalizeTheme(theme);

    if (targetRoot) {
      targetRoot.dataset.theme = normalizedTheme;
    }

    return normalizedTheme;
  }

  async function saveProfiles(profiles) {
    await storageSet({
      [STORAGE_KEY]: normalizeProfiles(profiles)
    });
  }

  async function ensureSeedProfiles() {
    const existingProfiles = await loadProfiles();
    if (existingProfiles.length > 0) {
      return existingProfiles;
    }

    const seedProfiles = createSeedProfiles(INITIAL_PROFILE_COUNT);
    await saveProfiles(seedProfiles);
    return seedProfiles;
  }

  function splitPatterns(matchPattern) {
    return String(matchPattern || "")
      .split(/[\r\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function wildcardToRegExp(pattern) {
    return new RegExp(
      "^" +
        escapeRegExp(pattern)
          .replace(/\\\*/g, ".*")
          .replace(/\\\?/g, ".") +
        "$",
      "i"
    );
  }

  function isUrlPattern(pattern) {
    return pattern.includes("://") || pattern.includes("/");
  }

  function matchesSinglePattern(pattern, currentUrl) {
    if (!pattern) {
      return false;
    }

    try {
      const url = new URL(currentUrl);
      const regex = wildcardToRegExp(pattern);

      if (isUrlPattern(pattern)) {
        return regex.test(currentUrl);
      }

      return regex.test(url.hostname);
    } catch (error) {
      return false;
    }
  }

  function matchesProfile(profile, currentUrl) {
    if (!profile || !profile.enabled) {
      return false;
    }

    return splitPatterns(profile.matchPattern).some((pattern) => matchesSinglePattern(pattern, currentUrl));
  }

  function profileScore(profile) {
    const pattern = profile && typeof profile.matchPattern === "string" ? profile.matchPattern : "";
    const wildcardPenalty = (pattern.match(/\*/g) || []).length * 10;
    return pattern.length - wildcardPenalty;
  }

  function findMatchingProfiles(currentUrl, profiles) {
    return normalizeProfiles(profiles)
      .filter((profile) => matchesProfile(profile, currentUrl))
      .sort((left, right) => profileScore(right) - profileScore(left));
  }

  function isVisibleElement(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    if (element.hidden || element.disabled || element.readOnly) {
      return false;
    }

    const type = String(element.getAttribute("type") || "").toLowerCase();
    if (type === "hidden") {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function safeQuery(selector, root) {
    if (!selector) {
      return null;
    }

    try {
      return (root || document).querySelector(selector);
    } catch (error) {
      return null;
    }
  }

  function getElementDescriptorText(element) {
    if (!element) {
      return "";
    }

    const labels = element.labels ? Array.from(element.labels).map((label) => label.textContent || "") : [];

    return [
      element.id,
      element.name,
      element.placeholder,
      element.getAttribute("aria-label"),
      element.getAttribute("autocomplete"),
      labels.join(" "),
      element.closest("label") ? element.closest("label").textContent : ""
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function scoreUsernameField(element) {
    if (!isVisibleElement(element)) {
      return Number.NEGATIVE_INFINITY;
    }

    const type = String(element.getAttribute("type") || "text").toLowerCase();
    if (type === "password") {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;
    const descriptor = getElementDescriptorText(element);

    if (type === "text" || type === "email" || type === "search" || type === "tel") {
      score += 10;
    }

    if (element.getAttribute("autocomplete") === "username") {
      score += 20;
    }

    USERNAME_KEYWORDS.forEach((keyword) => {
      if (descriptor.includes(keyword)) {
        score += 8;
      }
    });

    if (descriptor.includes("password")) {
      score -= 10;
    }

    return score;
  }

  function scorePasswordField(element) {
    if (!isVisibleElement(element)) {
      return Number.NEGATIVE_INFINITY;
    }

    const type = String(element.getAttribute("type") || "").toLowerCase();
    let score = 0;
    const descriptor = getElementDescriptorText(element);

    if (type === "password") {
      score += 25;
    }

    PASSWORD_KEYWORDS.forEach((keyword) => {
      if (descriptor.includes(keyword)) {
        score += 10;
      }
    });

    return score;
  }

  function pickBest(elements, scorer) {
    const ranked = Array.from(elements)
      .map((element) => ({ element, score: scorer(element) }))
      .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
      .sort((left, right) => right.score - left.score);

    return ranked.length > 0 ? ranked[0].element : null;
  }

  function findUsernameField(profile, root) {
    const queryRoot = root || document;
    const explicitField = safeQuery(profile.usernameSelector, queryRoot);
    if (explicitField && isVisibleElement(explicitField)) {
      return explicitField;
    }

    return pickBest(queryRoot.querySelectorAll("input"), scoreUsernameField);
  }

  function findPasswordField(profile, root) {
    const queryRoot = root || document;
    const explicitField = safeQuery(profile.passwordSelector, queryRoot);
    if (explicitField && isVisibleElement(explicitField)) {
      return explicitField;
    }

    return pickBest(queryRoot.querySelectorAll("input"), scorePasswordField);
  }

  function findSubmitTarget(profile, passwordField, root) {
    const queryRoot = root || document;
    const explicitTarget = safeQuery(profile.submitSelector, queryRoot);
    if (explicitTarget && isVisibleElement(explicitTarget)) {
      return explicitTarget;
    }

    const form = passwordField && passwordField.form ? passwordField.form : null;
    if (form) {
      const submitButton = form.querySelector(
        'button[type="submit"], input[type="submit"], button:not([type]), input[type="button"]'
      );
      if (submitButton && isVisibleElement(submitButton)) {
        return submitButton;
      }
    }

    const genericButton = pickBest(
      queryRoot.querySelectorAll("button, input[type='submit'], input[type='button']"),
      (element) => {
        if (!isVisibleElement(element)) {
          return Number.NEGATIVE_INFINITY;
        }

        const descriptor = (
          element.textContent ||
          element.value ||
          element.getAttribute("aria-label") ||
          ""
        ).toLowerCase();

        if (
          descriptor.includes("login") ||
          descriptor.includes("log in") ||
          descriptor.includes("sign in") ||
          descriptor.includes("entrar")
        ) {
          return 25;
        }

        return 1;
      }
    );

    if (genericButton) {
      return genericButton;
    }

    return form;
  }

  function findValueSetter(element) {
    let prototype = element ? Object.getPrototypeOf(element) : null;

    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor && typeof descriptor.set === "function") {
        return descriptor.set;
      }

      prototype = Object.getPrototypeOf(prototype);
    }

    return null;
  }

  function setNativeValue(element, value) {
    if (!element) {
      return false;
    }

    const nextValue = String(value);
    const valueSetter = findValueSetter(element);

    if (valueSetter) {
      valueSetter.call(element, nextValue);
    }

    if (element.value !== nextValue) {
      element.value = nextValue;
    }

    if (element.value !== nextValue && typeof element.setAttribute === "function") {
      element.setAttribute("value", nextValue);
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    return element.value === nextValue;
  }

  function isEditableTextField(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return false;
    }

    if (!isVisibleElement(element)) {
      return false;
    }

    const type = String(element.getAttribute("type") || "text").toLowerCase();
    return ![
      "hidden",
      "password",
      "button",
      "submit",
      "reset",
      "checkbox",
      "radio",
      "file"
    ].includes(type);
  }

  function focusField(element) {
    if (!element || typeof element.focus !== "function") {
      return;
    }

    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }
  }

  function buildFillResult(targetProfile, ok, reason) {
    return {
      ok: ok,
      reason: reason,
      profileId: targetProfile.id,
      profileName: targetProfile.name
    };
  }

  function maybeFillField(field, value, overwriteExisting) {
    if (!field || value === "") {
      return false;
    }

    if (!overwriteExisting && field.value) {
      return false;
    }

    return setNativeValue(field, value);
  }

  function finalizeFilledFields(targetProfile, usernameField, passwordField) {
    if (usernameField) {
      usernameField.dataset.controllerAutofill = targetProfile.id;
    }

    if (passwordField) {
      passwordField.dataset.controllerAutofill = targetProfile.id;
    }

    if (targetProfile.autoSubmit) {
      const submitTarget = findSubmitTarget(targetProfile, passwordField, document);

      window.setTimeout(() => {
        if (!submitTarget) {
          return;
        }

        if (submitTarget instanceof HTMLFormElement) {
          if (typeof submitTarget.requestSubmit === "function") {
            submitTarget.requestSubmit();
            return;
          }

          submitTarget.submit();
          return;
        }

        if (typeof submitTarget.click === "function") {
          submitTarget.click();
        }
      }, 120);
    }

    return buildFillResult(targetProfile, true, "Fields filled.");
  }

  function resolveContextStartElement(startElement, usernameField, passwordField) {
    if (!isEditableTextField(startElement)) {
      return null;
    }

    if (startElement === usernameField) {
      return startElement;
    }

    const startForm = startElement.form || null;
    const usernameForm = usernameField && usernameField.form ? usernameField.form : null;
    const passwordForm = passwordField && passwordField.form ? passwordField.form : null;

    if (startForm && (startForm === usernameForm || startForm === passwordForm)) {
      return startElement;
    }

    return null;
  }

  function fillProfile(profile) {
    const targetProfile = normalizeProfile(profile, 0);
    const usernameField = findUsernameField(targetProfile, document);
    const passwordField = findPasswordField(targetProfile, document);
    let appliedChanges = false;

    if (!usernameField || !passwordField) {
      return buildFillResult(targetProfile, false, "Login fields not found yet.");
    }

    appliedChanges = maybeFillField(usernameField, targetProfile.username, targetProfile.overwriteExisting) || appliedChanges;

    appliedChanges = maybeFillField(passwordField, targetProfile.password, targetProfile.overwriteExisting) || appliedChanges;

    if (!appliedChanges) {
      return buildFillResult(
        targetProfile,
        false,
        targetProfile.username === "" && targetProfile.password === ""
          ? "Matching profile found, but no username or password is saved yet."
          : "Matching profile found, but no new values were applied."
      );
    }

    return finalizeFilledFields(targetProfile, usernameField, passwordField);
  }

  function fillProfileFromContext(profile, startElement) {
    const targetProfile = normalizeProfile(profile, 0);
    const usernameField = findUsernameField(targetProfile, document);
    const passwordField = findPasswordField(targetProfile, document);
    const contextStartElement = resolveContextStartElement(startElement, usernameField, passwordField);
    let appliedChanges = false;

    if (!usernameField || !passwordField) {
      return buildFillResult(targetProfile, false, "Login fields not found yet.");
    }

    if (!contextStartElement) {
      return fillProfile(targetProfile);
    }

    focusField(contextStartElement);
    appliedChanges = maybeFillField(contextStartElement, targetProfile.username, targetProfile.overwriteExisting) || appliedChanges;

    if (passwordField !== contextStartElement) {
      focusField(passwordField);
    }

    appliedChanges = maybeFillField(passwordField, targetProfile.password, targetProfile.overwriteExisting) || appliedChanges;

    if (!appliedChanges) {
      return buildFillResult(
        targetProfile,
        false,
        targetProfile.username === "" && targetProfile.password === ""
          ? "Matching profile found, but no username or password is saved yet."
          : "Matching profile found, but no new values were applied."
      );
    }

    return finalizeFilledFields(targetProfile, contextStartElement, passwordField);
  }

  global.ControllerAutofillShared = {
    STORAGE_KEY,
    THEME_STORAGE_KEY,
    AUTOSAVE_STORAGE_KEY,
    VIEW_MODE_STORAGE_KEY,
    INITIAL_PROFILE_COUNT,
    DEFAULT_THEME,
    DEFAULT_AUTOSAVE,
    DEFAULT_DETAILED_VIEW,
    createEmptyProfile,
    createSeedProfiles,
    normalizeProfile,
    normalizeProfiles,
    loadProfiles,
    normalizeTheme,
    normalizeAutoSavePreference,
    loadTheme,
    loadAutoSavePreference,
    loadDetailedViewPreference,
    saveProfiles,
    saveTheme,
    saveAutoSavePreference,
    saveDetailedViewPreference,
    applyTheme,
    ensureSeedProfiles,
    splitPatterns,
    matchesProfile,
    findMatchingProfiles,
    fillProfile,
    fillProfileFromContext
  };
})(globalThis);
