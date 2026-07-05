const STORAGE_PREFIX = "ytbili:";
const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;
const DEFAULT_SETTINGS = {
  autoSearch: true,
  strictness: "careful",
  likeBeforeOpen: false
};

const autoSearch = document.getElementById("autoSearch");
const strictness = document.getElementById("strictness");
const likeBeforeOpen = document.getElementById("likeBeforeOpen");
const clearCache = document.getElementById("clearCache");
const status = document.getElementById("status");

init();

async function init() {
  const settings = await getSettings();
  autoSearch.checked = Boolean(settings.autoSearch);
  strictness.value = settings.strictness || "careful";
  likeBeforeOpen.checked = Boolean(settings.likeBeforeOpen);

  autoSearch.addEventListener("change", saveFromForm);
  strictness.addEventListener("change", saveFromForm);
  likeBeforeOpen.addEventListener("change", saveFromForm);
  clearCache.addEventListener("click", clearConfirmRecords);
}

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = data[SETTINGS_KEY] || {};
  return {
    ...DEFAULT_SETTINGS,
    autoSearch: stored.autoSearch ?? DEFAULT_SETTINGS.autoSearch,
    strictness: stored.strictness || DEFAULT_SETTINGS.strictness,
    likeBeforeOpen: Boolean(stored.likeBeforeOpen)
  };
}

async function saveFromForm() {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      autoSearch: autoSearch.checked,
      strictness: strictness.value,
      likeBeforeOpen: likeBeforeOpen.checked
    }
  });
  flash("已保存，刷新 YouTube 页面后生效。");
}

async function clearConfirmRecords() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((key) => key.startsWith(`${STORAGE_PREFIX}video:`));
  if (keys.length) await chrome.storage.local.remove(keys);
  flash(keys.length ? "已清除确认和忽略记录。" : "目前没有确认记录。");
}

function flash(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 2600);
}
