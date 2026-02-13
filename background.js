// background.js - Фоновая работа расширения

let checkedAddresses = 0;
let suspiciousAddresses = new Set();

// Basic settings via chrome.storage (failOpen: if true, default allow on errors/timeouts)
const DEFAULT_SETTINGS = { enabled: true, failOpen: true };

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => resolve(items));
  });
}

// Хранилище известных опасных адресов
const KNOWN_SCAM_ADDRESSES = new Set([
    // Примеры известных скам адресов (можно добавить свои)
]);

// Слушаем сообщения от popup.js и content-script.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle pre-sign risk checks
    if (request.type === 'AI_GUARD_CHECK') {
        (async () => {
            const { enabled, failOpen } = await getSettings();
            if (!enabled) return sendResponse({ action: 'allow', message: 'Guard disabled' });

            try {
                const args = request.payload || {};
                const method = args.method;
                const params = args.params || [];

                if (method === 'eth_sendTransaction') {
                    const tx = params[0] || {};
                    const to = (tx.to || '').toLowerCase();
                    const data = tx.data || '0x';
                    const valueHex = tx.value || '0x0';

                    // Quick checks
                    if (!to) {
                        return sendResponse({ action: 'warn', message: 'No destination address. High risk.' });
                    }

                    const selector = (data.startsWith('0x') ? data.slice(0, 10) : '');
                    // Known selectors
                    const SELECTORS = {
                        approve: '0x095ea7b3', // approve(address,uint256)
                        setApprovalForAll: '0xa22cb465', // setApprovalForAll(address,bool)
                        transferOwnership: '0xf2fde38b', // transferOwnership(address)
                        upgradeTo: '0x3659cfe6', // upgradeTo(address)
                        upgradeToAndCall: '0x4f1ef286', // upgradeToAndCall(address,bytes)
                    };

                    // Detect unlimited approve
                    function isUnlimitedApprove(dataHex) {
                        if (!dataHex || !dataHex.startsWith('0x')) return false;
                        if (dataHex.slice(0, 10) !== SELECTORS.approve) return false;
                        // params: address (32 bytes = 64 hex chars), amount (32 bytes = 64 hex chars)
                        // After selector (10 chars), address is next 64 chars, so amount starts at 10 + 64 = 74
                        const amountHex = dataHex.slice(74);
                        // MAX_UINT256 = 0xffff... (64 f's)
                        const last64 = dataHex.slice(-64);
                        return /^f{64}$/i.test(last64);
                    }

                    function isSetApprovalForAll(dataHex) {
                        return dataHex && dataHex.startsWith(SELECTORS.setApprovalForAll);
                    }

                    if (isUnlimitedApprove(data)) {
                        return sendResponse({ action: 'warn', message: 'Unlimited token allowance detected. Prefer a limited amount.' });
                    }
                    if (isSetApprovalForAll(data)) {
                        return sendResponse({ action: 'warn', message: 'setApprovalForAll grants full NFT access to the operator. Proceed only if trusted.' });
                    }
                    if (selector === SELECTORS.transferOwnership || selector === SELECTORS.upgradeTo || selector === SELECTORS.upgradeToAndCall) {
                        return sendResponse({ action: 'warn', message: 'Sensitive admin operation detected (ownership/upgrade). Ensure this is intended.' });
                    }

                    // Large value transfer (heuristic): warn if >= 1 ETH
                    try {
                        const bigint = BigInt(valueHex);
                        if (bigint >= BigInt('0xde0b6b3a7640000')) { // 1e18 wei
                            return sendResponse({ action: 'warn', message: 'High-value transfer (>= 1 ETH). Double-check recipient and context.' });
                        }
                    } catch (_) {}

                    return sendResponse({ action: 'allow' });
                }

                if (method === 'eth_signTypedData_v4') {
                    // EIP-712: try to parse and detect Permit-like patterns
                    // params[0] is address, params[1] is typed data
                    if (!params[1]) {
                        return sendResponse({ action: 'warn', message: 'Missing typed data in signature request.' });
                    }
                    try {
                        const typed = JSON.parse(params[1] || '{}');
                        const domainName = typed?.domain?.name || '';
                        const types = Object.keys(typed?.types || {});
                        const msg = typed?.message || {};

                        const isPermit = types.some(t => /Permit/i.test(t)) || 'spender' in msg;
                        if (isPermit) {
                            const spender = msg.spender || '(unknown)';
                            const value = msg.value || msg.amount || '(unknown)';
                            return sendResponse({ action: 'warn', message: `Permit-like signature detected. Spender ${spender} may spend up to ${value}.` });
                        }
                    } catch (e) {
                        // If parsing fails, err on caution
                        return sendResponse({ action: 'warn', message: 'Opaque typed data signature. Review carefully before signing.' });
                    }
                    return sendResponse({ action: 'allow' });
                }

                if (method === 'personal_sign' || method === 'eth_sign') {
                    return sendResponse({ action: 'warn', message: 'Raw signature can be reused in phishing attacks. Proceed only if you trust the site.' });
                }

                return sendResponse({ action: 'allow' });
            } catch (e) {
                const { failOpen } = await getSettings();
                const fallback = failOpen ? { action: 'allow', message: 'Guard error, fail-open.' } : { action: 'warn', message: 'Guard error. Please review manually.' };
                return sendResponse(fallback);
            }
        })();
        return true; // async response
    }

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
