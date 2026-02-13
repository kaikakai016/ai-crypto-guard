// background.js - Фоновая работа расширения

let checkedAddresses = 0;
let suspiciousAddresses = new Set();

// Хранилище известных опасных адресов
const KNOWN_SCAM_ADDRESSES = new Set([
    // Примеры известных скам адресов (можно добавить свои)
]);

// Слушаем сообщения от popup.js и content-script.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeAddress') {
        analyzeAddress(request.address).then(result => {
            checkedAddresses++;
            if (!result.isSafe) {
                suspiciousAddresses.add(request.address);
            }
            sendResponse(result);
        });
        return true; // Асинхронный ответ
    }

    if (request.action === 'getStatus') {
        sendResponse({
            checkedCount: checkedAddresses,
            suspiciousCount: suspiciousAddresses.size
        });
    }

    if (request.action === 'checkPageAddresses') {
        // Проверяем адреса найденные на странице
        request.addresses.forEach(address => {
            analyzeAddress(address).then(result => {
                if (!result.isSafe) {
                    // Уведомляем о опасном адресе
                    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: 'highlightAddress',
                                address: address,
                                risk: result.riskScore
                            }).catch(() => {
                                // Ошибка игнорируется
                            });
                        }
                    });
                }
            });
        });
    }
});

// Анализируем адрес на опасность
async function analyzeAddress(address) {
    // Проверяем формат
    if (!isValidEthereumAddress(address)) {
        return {
            isSafe: false,
            riskScore: 0.95,
            reason: 'Неверный формат адреса Ethereum'
        };
    }

    // Вычисляем уровень риска
    const riskScore = calculateRiskScore(address);

    return {
        isSafe: riskScore < 0.5,
        riskScore: riskScore,
        reason: getRiskReason(riskScore)
    };
}

// Проверяем валидность адреса Ethereum
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Вычисляем риск адреса
function calculateRiskScore(address) {
    let riskScore = 0.2; // Базовый риск

    // Если адрес в черном списке
    if (KNOWN_SCAM_ADDRESSES.has(address)) {
        return 0.95;
    }

    // Если адрес уже проверялся и был опасным
    if (suspiciousAddresses.has(address)) {
        return 0.85;
    }

    // Если адрес имеет подозрительные паттерны
    if (address.match(/0{10,}/)) {
        riskScore += 0.3; // Много нулей - подозрительно
    }

    // Если адрес нулевой (burn address)
    if (address === '0x0000000000000000000000000000000000000000') {
        riskScore = 0.1; // Это известный безопасный адрес
    }

    return Math.min(riskScore, 1.0);
}

// Объяснение уровня риска
function getRiskReason(score) {
    if (score > 0.8) return 'Очень высокий риск скама';
    if (score > 0.6) return 'Высокий риск скама';
    if (score > 0.4) return 'Средний риск';
    if (score > 0.2) return 'Низкий риск';
    return 'Адрес выглядит безопасным';
}
