const toggle = document.getElementById('toggle');
const status = document.getElementById('status');
const erjianToggle = document.getElementById('erjianToggle');
const fontModeSelect = document.getElementById('fontMode');
const excludedDomains = document.getElementById('excludedDomains');
const saveDomains = document.getElementById('saveDomains');

function updateUI(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? 'ON' : 'OFF';
  status.className = 'status' + (enabled ? ' on' : '');
}

chrome.storage.local.get(['enabled', 'excludedDomains', 'fontMode', 'erjianMode'], (data) => {
  updateUI(data.enabled !== false);
  erjianToggle.checked = !!data.erjianMode;
  fontModeSelect.value = data.fontMode || 'auto';
  if (data.excludedDomains) {
    excludedDomains.value = data.excludedDomains.join('\n');
  }
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  updateUI(enabled);
  chrome.runtime.sendMessage({ type: 'setEnabled', enabled });
});

erjianToggle.addEventListener('change', () => {
  const erjian = erjianToggle.checked;
  chrome.runtime.sendMessage({ type: 'setErjianMode', erjian });
});

fontModeSelect.addEventListener('change', () => {
  const mode = fontModeSelect.value;
  chrome.storage.local.set({ fontMode: mode });
});

saveDomains.addEventListener('click', () => {
  const domains = excludedDomains.value
    .split('\n')
    .map((d) => d.trim())
    .filter(Boolean);
  chrome.storage.local.set({ excludedDomains: domains }, () => {
    saveDomains.textContent = '保存しました';
    setTimeout(() => {
      saveDomains.textContent = '保存';
    }, 1200);
  });
});
