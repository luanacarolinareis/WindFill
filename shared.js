(function initControllerAutofillShared(global) {
  "use strict";

  const STORAGE_KEY = "profiles";
  const THEME_STORAGE_KEY = "themePreference";
  const AUTOSAVE_STORAGE_KEY = "autoSaveEnabled";
  const VIEW_MODE_STORAGE_KEY = "detailedViewEnabled";
  const SORT_BY_STORAGE_KEY = "profileSortBy";
  const SORT_DIRECTION_STORAGE_KEY = "profileSortDirection";
  const MATCH_PREFERENCE_STORAGE_KEY = "matchPreferenceSettings";
  const INITIAL_PROFILE_COUNT = 0;
  const DEFAULT_THEME = "dark";
  const DEFAULT_AUTOSAVE = true;
  const DEFAULT_DETAILED_VIEW = true;
  const DEFAULT_SORT_BY = "manual";
  const DEFAULT_SORT_DIRECTION = "asc";
  const MATCH_PRIORITY_RULE_IDS = ["patternSpecificity", "creationDate", "savedData"];
  const DEFAULT_MATCH_PRIORITY_RULE_ORDER = ["patternSpecificity", "savedData", "creationDate"];
  const DEFAULT_MATCH_CREATION_DATE_MODE = "newest";
  const DEFAULT_MATCH_SAVED_DATA_MODE = "complete";
  const ENCRYPTED_EXPORT_FORMAT = "windfill-encrypted-export";
  const ENCRYPTED_EXPORT_VERSION = 1;
  const EXPORT_KDF_ITERATIONS = 250000;
  const EXPORT_KDF_HASH = "SHA-256";

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
    const now = new Date().toISOString();
    return {
      id: makeId(),
      name: "Controller " + index,
      createdAt: now,
      lastModifiedAt: now,
      matchPattern: "",
      username: "",
      password: "",
      notes: "",
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
    const createdAtTimestamp = Date.parse(source.createdAt);
    const lastModifiedAtTimestamp = Date.parse(source.lastModifiedAt);

    return {
      id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : fallback.id,
      name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : fallback.name,
      createdAt: Number.isFinite(createdAtTimestamp) ? new Date(createdAtTimestamp).toISOString() : fallback.createdAt,
      lastModifiedAt: Number.isFinite(lastModifiedAtTimestamp)
        ? new Date(lastModifiedAtTimestamp).toISOString()
        : (
          Number.isFinite(createdAtTimestamp)
            ? new Date(createdAtTimestamp).toISOString()
            : fallback.lastModifiedAt
        ),
      matchPattern: typeof source.matchPattern === "string" ? source.matchPattern.trim() : "",
      username: typeof source.username === "string" ? source.username : "",
      password: typeof source.password === "string" ? source.password : "",
      notes: typeof source.notes === "string" ? source.notes : "",
      usernameSelector: typeof source.usernameSelector === "string" ? source.usernameSelector.trim() : "",
      passwordSelector: typeof source.passwordSelector === "string" ? source.passwordSelector.trim() : "",
      submitSelector: typeof source.submitSelector === "string" ? source.submitSelector.trim() : "",
      autoSubmit: Boolean(source.autoSubmit),
      enabled: source.enabled !== false,
      overwriteExisting: source.overwriteExisting !== false
    };
  }

  function cloneProfile(profile, index) {
    const normalized = normalizeProfile(profile, Number.isFinite(index) ? index : 0);
    const now = new Date().toISOString();
    return {
      ...normalized,
      id: makeId(),
      createdAt: now,
      lastModifiedAt: now,
      name: normalized.name ? normalized.name + " copy" : "Controller " + ((index || 0) + 1)
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

  function normalizeSortBy(value) {
    return value === "name" || value === "lastModifiedAt" || value === "manual"
      ? value
      : DEFAULT_SORT_BY;
  }

  function normalizeSortDirection(value) {
    return value === "desc" || value === "asc"
      ? value
      : DEFAULT_SORT_DIRECTION;
  }

  function normalizeMatchRuleOrder(value) {
    const source = Array.isArray(value) ? value : [];
    const unique = [];

    source.forEach((ruleId) => {
      if (!MATCH_PRIORITY_RULE_IDS.includes(ruleId) || unique.includes(ruleId)) {
        return;
      }

      unique.push(ruleId);
    });

    MATCH_PRIORITY_RULE_IDS.forEach((ruleId) => {
      if (!unique.includes(ruleId)) {
        unique.push(ruleId);
      }
    });

    return unique;
  }

  function normalizeMatchCreationDateMode(value) {
    return value === "oldest" || value === "newest"
      ? value
      : DEFAULT_MATCH_CREATION_DATE_MODE;
  }

  function normalizeMatchSavedDataMode(value) {
    return value === "missing" || value === "complete"
      ? value
      : DEFAULT_MATCH_SAVED_DATA_MODE;
  }

  function createDefaultMatchPreferenceSettings() {
    return {
      ruleOrder: [...DEFAULT_MATCH_PRIORITY_RULE_ORDER],
      creationDateMode: DEFAULT_MATCH_CREATION_DATE_MODE,
      savedDataMode: DEFAULT_MATCH_SAVED_DATA_MODE
    };
  }

  function normalizeMatchPreferenceSettings(value) {
    const source = value && typeof value === "object" ? value : {};

    return {
      ruleOrder: normalizeMatchRuleOrder(source.ruleOrder),
      creationDateMode: normalizeMatchCreationDateMode(source.creationDateMode),
      savedDataMode: normalizeMatchSavedDataMode(source.savedDataMode)
    };
  }

  async function loadDetailedViewPreference() {
    const result = await storageGet([VIEW_MODE_STORAGE_KEY]);
    return normalizeDetailedViewPreference(result[VIEW_MODE_STORAGE_KEY]);
  }

  async function loadSortByPreference() {
    const result = await storageGet([SORT_BY_STORAGE_KEY]);
    return normalizeSortBy(result[SORT_BY_STORAGE_KEY]);
  }

  async function loadSortDirectionPreference() {
    const result = await storageGet([SORT_DIRECTION_STORAGE_KEY]);
    return normalizeSortDirection(result[SORT_DIRECTION_STORAGE_KEY]);
  }

  async function loadMatchPreferenceSettings() {
    const result = await storageGet([MATCH_PREFERENCE_STORAGE_KEY]);
    return normalizeMatchPreferenceSettings(result[MATCH_PREFERENCE_STORAGE_KEY]);
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

  async function saveSortByPreference(value) {
    const normalizedValue = normalizeSortBy(value);
    await storageSet({
      [SORT_BY_STORAGE_KEY]: normalizedValue
    });
    return normalizedValue;
  }

  async function saveSortDirectionPreference(value) {
    const normalizedValue = normalizeSortDirection(value);
    await storageSet({
      [SORT_DIRECTION_STORAGE_KEY]: normalizedValue
    });
    return normalizedValue;
  }

  async function saveMatchPreferenceSettings(value) {
    const normalizedValue = normalizeMatchPreferenceSettings(value);
    await storageSet({
      [MATCH_PREFERENCE_STORAGE_KEY]: normalizedValue
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

  function getCryptoApi() {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error("Web Crypto API unavailable.");
    }

    return global.crypto;
  }

  function encodeUtf8(text) {
    return new TextEncoder().encode(String(text || ""));
  }

  function decodeUtf8(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }

    return global.btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = global.atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  async function deriveExportKey(passphrase, salt, usages) {
    const cryptoApi = getCryptoApi();
    const keyMaterial = await cryptoApi.subtle.importKey(
      "raw",
      encodeUtf8(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return cryptoApi.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: EXPORT_KDF_ITERATIONS,
        hash: EXPORT_KDF_HASH
      },
      keyMaterial,
      {
        name: "AES-GCM",
        length: 256
      },
      false,
      usages
    );
  }

  function isEncryptedExportPayload(payload) {
    return Boolean(
      payload &&
      typeof payload === "object" &&
      payload.format === ENCRYPTED_EXPORT_FORMAT &&
      Number(payload.version) === ENCRYPTED_EXPORT_VERSION &&
      typeof payload.salt === "string" &&
      typeof payload.iv === "string" &&
      typeof payload.ciphertext === "string"
    );
  }

  async function encryptProfilesExport(profiles, passphrase) {
    const normalizedProfiles = normalizeProfiles(profiles);
    const trimmedPassphrase = String(passphrase || "");

    if (!trimmedPassphrase) {
      throw new Error("A passphrase is required to encrypt this export.");
    }

    const cryptoApi = getCryptoApi();
    const salt = cryptoApi.getRandomValues(new Uint8Array(16));
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const key = await deriveExportKey(trimmedPassphrase, salt, ["encrypt"]);
    const plaintext = encodeUtf8(JSON.stringify(normalizedProfiles));
    const ciphertextBuffer = await cryptoApi.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      plaintext
    );

    return {
      format: ENCRYPTED_EXPORT_FORMAT,
      version: ENCRYPTED_EXPORT_VERSION,
      cipher: "AES-GCM-256",
      kdf: "PBKDF2-SHA-256",
      iterations: EXPORT_KDF_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer))
    };
  }

  async function decryptProfilesExport(payload, passphrase) {
    const trimmedPassphrase = String(passphrase || "");

    if (!trimmedPassphrase) {
      throw new Error("A passphrase is required to decrypt this export.");
    }

    if (!isEncryptedExportPayload(payload)) {
      throw new Error("This file is not a supported WindFill encrypted export.");
    }

    try {
      const cryptoApi = getCryptoApi();
      const salt = base64ToBytes(payload.salt);
      const iv = base64ToBytes(payload.iv);
      const ciphertext = base64ToBytes(payload.ciphertext);
      const key = await deriveExportKey(trimmedPassphrase, salt, ["decrypt"]);
      const plaintextBuffer = await cryptoApi.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv
        },
        key,
        ciphertext
      );
      const parsed = JSON.parse(decodeUtf8(new Uint8Array(plaintextBuffer)));

      if (!Array.isArray(parsed)) {
        throw new Error("Encrypted export payload did not contain a profile list.");
      }

      return normalizeProfiles(parsed);
    } catch (error) {
      throw new Error("Could not decrypt the WindFill export. Check the passphrase and file.");
    }
  }

  function getIncompleteProfileDetails(profile) {
    const normalized = normalizeProfile(profile, 0);
    const missing = [];

    if (splitPatterns(normalized.matchPattern).length === 0) {
      missing.push("pattern");
    }

    if (!normalized.username) {
      missing.push("username");
    }

    if (!normalized.password) {
      missing.push("password");
    }

    return {
      complete: missing.length === 0,
      missing: missing
    };
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

  function getMatchedPattern(profile, currentUrl) {
    const patterns = splitPatterns(profile && profile.matchPattern);
    const matches = patterns.filter((pattern) => matchesSinglePattern(pattern, currentUrl));

    if (matches.length === 0) {
      return "";
    }

    return matches.sort((left, right) => profileScore({ matchPattern: right }) - profileScore({ matchPattern: left }))[0];
  }

  function profileScore(profile) {
    const pattern = profile && typeof profile.matchPattern === "string" ? profile.matchPattern : "";
    const wildcardPenalty = (pattern.match(/\*/g) || []).length * 10;
    return pattern.length - wildcardPenalty;
  }

  function getSavedDataScore(profile) {
    let score = 0;

    if (profile && typeof profile.username === "string" && profile.username !== "") {
      score += 1;
    }

    if (profile && typeof profile.password === "string" && profile.password !== "") {
      score += 1;
    }

    return score;
  }

  function compareProfilesByMatchPreferences(left, right, preferences) {
    const settings = normalizeMatchPreferenceSettings(preferences);

    for (const ruleId of settings.ruleOrder) {
      let comparison = 0;

      if (ruleId === "patternSpecificity") {
        comparison =
          profileScore({ matchPattern: right.matchedPattern || right.matchPattern }) -
          profileScore({ matchPattern: left.matchedPattern || left.matchPattern });
      } else if (ruleId === "creationDate") {
        const leftTime = Date.parse(left.lastModifiedAt);
        const rightTime = Date.parse(right.lastModifiedAt);
        const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
        const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
        comparison = settings.creationDateMode === "oldest"
          ? normalizedLeftTime - normalizedRightTime
          : normalizedRightTime - normalizedLeftTime;
      } else if (ruleId === "savedData") {
        const leftScore = getSavedDataScore(left);
        const rightScore = getSavedDataScore(right);
        comparison = settings.savedDataMode === "missing"
          ? leftScore - rightScore
          : rightScore - leftScore;
      }

      if (comparison !== 0) {
        return comparison;
      }
    }

    return 0;
  }

  function findMatchingProfiles(currentUrl, profiles, preferences) {
    return normalizeProfiles(profiles)
      .filter((profile) => matchesProfile(profile, currentUrl))
      .map((profile) => ({
        ...profile,
        matchedPattern: getMatchedPattern(profile, currentUrl)
      }))
      .sort((left, right) => compareProfilesByMatchPreferences(left, right, preferences));
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

  function describeElement(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return "";
    }

    const tagName = element.tagName.toLowerCase();
    if (element.id) {
      return tagName + "#" + element.id;
    }

    if (element.getAttribute("name")) {
      return tagName + "[name=\"" + element.getAttribute("name") + "\"]";
    }

    if (element.getAttribute("type")) {
      return tagName + "[type=\"" + element.getAttribute("type") + "\"]";
    }

    return tagName;
  }

  function getExplicitVisibleMatch(selector, root) {
    const explicitMatch = safeQuery(selector, root);
    return explicitMatch && isVisibleElement(explicitMatch) ? explicitMatch : null;
  }

  function testProfileSelectors(profile, root) {
    const queryRoot = root || document;
    const targetProfile = normalizeProfile(profile, 0);
    const usernameExplicit = targetProfile.usernameSelector
      ? getExplicitVisibleMatch(targetProfile.usernameSelector, queryRoot)
      : null;
    const passwordExplicit = targetProfile.passwordSelector
      ? getExplicitVisibleMatch(targetProfile.passwordSelector, queryRoot)
      : null;
    const usernameField = usernameExplicit || pickBest(queryRoot.querySelectorAll("input"), scoreUsernameField);
    const passwordField = passwordExplicit || pickBest(queryRoot.querySelectorAll("input"), scorePasswordField);
    const needsSubmit = Boolean(targetProfile.autoSubmit || targetProfile.submitSelector);
    const submitExplicit = targetProfile.submitSelector
      ? getExplicitVisibleMatch(targetProfile.submitSelector, queryRoot)
      : null;
    const submitTarget = needsSubmit
      ? submitExplicit || findSubmitTarget(targetProfile, passwordField, queryRoot)
      : null;

    return {
      ok: Boolean(usernameField && passwordField && (!needsSubmit || submitTarget)),
      username: {
        selector: targetProfile.usernameSelector,
        usingSelector: Boolean(targetProfile.usernameSelector),
        explicitMatched: Boolean(usernameExplicit),
        found: Boolean(usernameField),
        source: usernameExplicit ? "selector" : usernameField ? "auto" : "missing",
        matchedElement: describeElement(usernameField)
      },
      password: {
        selector: targetProfile.passwordSelector,
        usingSelector: Boolean(targetProfile.passwordSelector),
        explicitMatched: Boolean(passwordExplicit),
        found: Boolean(passwordField),
        source: passwordExplicit ? "selector" : passwordField ? "auto" : "missing",
        matchedElement: describeElement(passwordField)
      },
      submit: {
        selector: targetProfile.submitSelector,
        usingSelector: Boolean(targetProfile.submitSelector),
        explicitMatched: Boolean(submitExplicit),
        required: needsSubmit,
        found: Boolean(submitTarget),
        source: submitExplicit ? "selector" : submitTarget ? "auto" : "missing",
        matchedElement: describeElement(submitTarget)
      }
    };
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
    SORT_BY_STORAGE_KEY,
    SORT_DIRECTION_STORAGE_KEY,
    MATCH_PREFERENCE_STORAGE_KEY,
    INITIAL_PROFILE_COUNT,
    DEFAULT_THEME,
    DEFAULT_AUTOSAVE,
    DEFAULT_DETAILED_VIEW,
    DEFAULT_SORT_BY,
    DEFAULT_SORT_DIRECTION,
    MATCH_PRIORITY_RULE_IDS,
    DEFAULT_MATCH_PRIORITY_RULE_ORDER,
    DEFAULT_MATCH_CREATION_DATE_MODE,
    DEFAULT_MATCH_SAVED_DATA_MODE,
    ENCRYPTED_EXPORT_FORMAT,
    ENCRYPTED_EXPORT_VERSION,
    createEmptyProfile,
    createSeedProfiles,
    cloneProfile,
    normalizeProfile,
    normalizeProfiles,
    loadProfiles,
    normalizeTheme,
    normalizeAutoSavePreference,
    normalizeSortBy,
    normalizeSortDirection,
    normalizeMatchRuleOrder,
    normalizeMatchCreationDateMode,
    normalizeMatchSavedDataMode,
    createDefaultMatchPreferenceSettings,
    normalizeMatchPreferenceSettings,
    loadTheme,
    loadAutoSavePreference,
    loadDetailedViewPreference,
    loadSortByPreference,
    loadSortDirectionPreference,
    loadMatchPreferenceSettings,
    saveProfiles,
    encryptProfilesExport,
    decryptProfilesExport,
    isEncryptedExportPayload,
    getIncompleteProfileDetails,
    saveTheme,
    saveAutoSavePreference,
    saveDetailedViewPreference,
    saveSortByPreference,
    saveSortDirectionPreference,
    saveMatchPreferenceSettings,
    applyTheme,
    ensureSeedProfiles,
    splitPatterns,
    getMatchedPattern,
    matchesProfile,
    findMatchingProfiles,
    testProfileSelectors,
    fillProfile,
    fillProfileFromContext
  };
})(globalThis);
