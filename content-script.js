// content-script.js - Сканирование страницы на адреса

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