// popup.js - Settings UI for AI Crypto Guard

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  failOpen: false,
  rpcUrl: '',
  chainId: '0x1'
};

// Load settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load settings from chrome.storage.sync
    const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    
    // Update UI with loaded settings
    document.getElementById('enabled').checked = result.enabled;
    document.getElementById('failOpen').checked = result.failOpen;
    document.getElementById('rpcUrl').value = result.rpcUrl;
    document.getElementById('chainId').value = result.chainId;
    
    showStatus('Settings loaded', 'success');
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
});

// Save settings when changed
document.getElementById('enabled').addEventListener('change', saveSettings);
document.getElementById('failOpen').addEventListener('change', saveSettings);
document.getElementById('rpcUrl').addEventListener('input', debounce(saveSettings, 500));
document.getElementById('chainId').addEventListener('input', debounce(saveSettings, 500));

async function saveSettings() {
  try {
    const settings = {
      enabled: document.getElementById('enabled').checked,
      failOpen: document.getElementById('failOpen').checked,
      rpcUrl: document.getElementById('rpcUrl').value.trim(),
      chainId: document.getElementById('chainId').value.trim()
    };
    
    // Save to chrome.storage.sync
    await chrome.storage.sync.set(settings);
    
    showStatus('Settings saved', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = type;
  
  // Clear status after 3 seconds
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
  }, 3000);
}

// Debounce helper for input fields
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
