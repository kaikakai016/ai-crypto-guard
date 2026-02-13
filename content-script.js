// content-script.js - Сканирование страницы на адреса

// Inject inpage.js into the page context
(function injectInpage() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inpage.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  } catch (e) {
    console.debug('AI Crypto Guard: failed to inject inpage.js', e);
  }
})();

// Bridge window messages to background and back
const messageHandler = (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.type !== 'AI_GUARD_CHECK') return;
  chrome.runtime.sendMessage({ type: 'AI_GUARD_CHECK', payload: msg.payload }, (response) => {
    // Send verdict back to page
    window.postMessage({ type: 'AI_GUARD_VERDICT', verdict: response }, '*');
  });
};

window.addEventListener('message', messageHandler);

// Clean up event listener before unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
  window.removeEventListener('message', messageHandler);
});

// Функция для поиска всех адресов Ethereum на странице
function scanForEthereumAddresses() {
    // Use textContent instead of innerText for better performance (no layout reflow)
    const pageText = document.body.textContent;
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
    // Если страница уже загружена, небольшая задержка для стабилизации DOM
    setTimeout(scanForEthereumAddresses, 100);
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
        {
            acceptNode: function(node) {
                // Skip script and style elements for performance
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Only process nodes that contain the address
                return node.textContent.includes(address) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        },
        false
    );

    const nodesToReplace = [];
    let node;

    while (node = walker.nextNode()) {
        nodesToReplace.push(node);
    }

    nodesToReplace.forEach(node => {
        const parent = node.parentNode;
        const text = node.textContent;
        const parts = text.split(address);
        
        // Create a document fragment to safely build the new content
        const fragment = document.createDocumentFragment();
        
        parts.forEach((part, index) => {
            // Add the text part
            if (part) {
                fragment.appendChild(document.createTextNode(part));
            }
            
            // Add the highlighted address (except after the last part)
            if (index < parts.length - 1) {
                const highlightSpan = document.createElement('span');
                highlightSpan.style.backgroundColor = '#ffcccc';
                highlightSpan.style.border = '2px solid #ff0000';
                highlightSpan.style.padding = '2px';
                highlightSpan.style.borderRadius = '3px';
                highlightSpan.title = `Риск скама: ${(riskScore * 100).toFixed(1)}%`;
                highlightSpan.textContent = address;
                fragment.appendChild(highlightSpan);
            }
        });
        
        parent.replaceChild(fragment, node);
    });
}