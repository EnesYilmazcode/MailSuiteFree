const DEFAULTS = { enabled: true, keepUnsubscribe: true, removed: 0 };

const enabled = document.getElementById('enabled');
const keepUnsubscribe = document.getElementById('keepUnsubscribe');
const removed = document.getElementById('removed');

chrome.storage.local.get(DEFAULTS).then((s) => {
  enabled.checked = s.enabled;
  keepUnsubscribe.checked = s.keepUnsubscribe;
  removed.textContent = s.removed;
});

for (const box of [enabled, keepUnsubscribe]) {
  box.addEventListener('change', () => {
    chrome.storage.local.set({ [box.id]: box.checked });
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.removed) removed.textContent = changes.removed.newValue;
});
