chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['enabled'], (data) => {
    if (data.enabled === undefined) {
      chrome.storage.local.set({ enabled: true });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'setEnabled') {
    chrome.storage.local.set({ enabled: msg.enabled });
    broadcastToTabs({ type: 'toggle', enabled: msg.enabled });
    sendResponse({ ok: true });
  } else if (msg.type === 'setErjianMode') {
    chrome.storage.local.set({ erjianMode: msg.erjian });
    broadcastToTabs({ type: 'setErjian', erjian: msg.erjian });
    sendResponse({ ok: true });
  }
  return true; // async response
});

function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}
