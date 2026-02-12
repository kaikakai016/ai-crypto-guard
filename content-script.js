// content-script.js

// Function to scan the page for Ethereum addresses.
function scanForEthereumAddresses() {
    const regex = /0x[a-fA-F0-9]{40}/g; // regex for Ethereum addresses
    const bodyText = document.body.innerText;
    const addresses = bodyText.match(regex);
    if (addresses) {
        reportAddresses(addresses);
    }
}

// Function to report found addresses to the background script.
function reportAddresses(addresses) {
    chrome.runtime.sendMessage({action: 'reportAddresses', addresses: addresses});
}

// Run the scan when the content script is loaded.
scanForEthereumAddresses();