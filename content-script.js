// content-script.js - Сканирование страницы на адреса + инжект inpage.js

// Inject inpage.js into the page context
function injectInpageScript() {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('inpage.js');
        script.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
        console.log('[AI Crypto Guard] Inpage script injected');
    } catch (error) {
        console.error('[AI Crypto Guard] Failed to inject inpage script:', error);
    }
}

// Inject as early as possible
injectInpageScript();

// Bridge messages between page and background
window.addEventListener('message', async (event) => {
    // Only accept messages from the same window
    if (event.source !== window) {
        return;
    }

    const data = event.data;
    
    // Handle check requests from inpage.js
    if (data.type === 'AI_GUARD_CHECK') {
        console.log('[AI Crypto Guard] Received check request:', data);
        
        try {
            // Forward to background script for analysis
            const response = await chrome.runtime.sendMessage({
                action: 'checkTransaction',
                method: data.method,
                params: data.params,
                timestamp: data.timestamp
            });

            // Send verdict back to inpage.js
            window.postMessage({
                type: 'AI_GUARD_VERDICT',
                requestTimestamp: data.timestamp,
                allowed: response.allowed,
                reason: response.reason
            }, window.location.origin);
        } catch (error) {
            console.error('[AI Crypto Guard] Error checking transaction:', error);
            
            // Send error verdict (fail-closed by default)
            window.postMessage({
                type: 'AI_GUARD_VERDICT',
                requestTimestamp: data.timestamp,
                allowed: false,
                reason: 'Error during security check: ' + error.message
            }, window.location.origin);
        }
    }
});

// Функция для поиска всех адресов Ethereum на странице
function scanForEthereumAddresses() {
    const pageText = document.body.innerText;
    const addressPattern = /0x[a-fA-F0-9]{40}/g;
    const addresses = pageText.match(addressPattern) || [];
    
    if (addresses.length > 0) {
        // Удаляем дубликаты
        const uniqueAddresses = [...new Set(addresses)];
        console.log('Найденные адреса на странице:', uniqueAddresses);
        
        // Отправляем адреса на проверку в background скрипт
        chrome.runtime.sendMessage({
            action: 'checkPageAddresses',
            addresses: uniqueAddresses
        }).catch(error => {
            console.log('Background script не готов');
        });
    }
}

// Запускаем сканирование при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanForEthereumAddresses);
} else {
    // Если страница уже загружена
    setTimeout(scanForEthereumAddresses, 1000);
}

// Слушаем указания от background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'highlightAddress') {
        // Выделяем опасный адрес на странице красным
        highlightAddress(request.address, request.risk);
    }
});

// Функция для выделения адреса на странице
function highlightAddress(address, riskScore) {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    const nodesToReplace = [];
    let node;

    while (node = walker.nextNode()) {
        if (node.textContent.includes(address)) {
            nodesToReplace.push(node);
        }
    }

    nodesToReplace.forEach(node => {
        const span = document.createElement('span');
        span.innerHTML = node.textContent.replace(
            address,
            `<span style=\"background-color: #ffcccc; border: 2px solid #ff0000; padding: 2px; border-radius: 3px;\" title=\"Риск скама: ${(riskScore * 100).toFixed(1)}%\">${address}</span>`
        );
        node.parentNode.replaceChild(span, node);
    });
}