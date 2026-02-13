// background.js - Фоновая работа расширения с пред-подписными проверками

let checkedAddresses = 0;
let suspiciousAddresses = new Set();

// Хранилище известных опасных адресов
const KNOWN_SCAM_ADDRESSES = new Set([
    // Примеры известных скам адресов (можно добавить свои)
]);

// Constants for risk detection
const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const HIGH_VALUE_THRESHOLD = '1000000000000000000'; // 1 ETH in wei

// Sensitive admin function selectors
const ADMIN_SELECTORS = {
    'transferOwnership': '0xf2fde38b',
    'upgradeTo': '0x3659cfe6',
    'upgradeToAndCall': '0x4f1ef286',
    'setApprovalForAll': '0xa22cb465'
};

// Default settings
const DEFAULT_SETTINGS = {
    enabled: true,
    failOpen: false,
    rpcUrl: '',
    chainId: '0x1'
};

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

    if (request.action === 'checkTransaction') {
        checkTransaction(request.method, request.params).then(result => {
            sendResponse(result);
        }).catch(error => {
            console.error('Transaction check error:', error);
            // Get settings to determine fail-open vs fail-closed
            chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
                sendResponse({
                    allowed: settings.failOpen,
                    reason: settings.failOpen 
                        ? 'Analysis error (allowed by fail-open): ' + error.message
                        : 'Analysis error (blocked by fail-closed): ' + error.message
                });
            });
        });
        return true; // Асинхронный ответ
    }
});

// Check transaction for risks before signing
async function checkTransaction(method, params) {
    // Get settings
    const settings = await new Promise((resolve) => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
    });

    // If guard is disabled, allow all
    if (!settings.enabled) {
        return { allowed: true, reason: 'Guard disabled' };
    }

    const risks = [];

    try {
        // Parse transaction parameters based on method
        let txData = null;
        
        if (method === 'eth_sendTransaction' && params && params[0]) {
            txData = params[0];
        } else if (method === 'eth_signTypedData_v4' && params && params[1]) {
            // Parse typed data for risks
            const typedData = JSON.parse(params[1]);
            return await checkTypedData(typedData, settings);
        }

        if (!txData) {
            return { allowed: true, reason: 'No transaction data to check' };
        }

        // Check 1: High value transfer (>= 1 ETH)
        if (txData.value) {
            const valueBigInt = BigInt(txData.value);
            const thresholdBigInt = BigInt(HIGH_VALUE_THRESHOLD);
            
            if (valueBigInt >= thresholdBigInt) {
                const ethValue = Number(valueBigInt) / 1e18;
                risks.push(`High value transfer: ${ethValue.toFixed(4)} ETH`);
            }
        }

        // Check 2: Analyze transaction data for risks
        if (txData.data && txData.data !== '0x') {
            const dataRisks = analyzeTransactionData(txData.data);
            risks.push(...dataRisks);
        }

        // Check 3: Gas estimation (if RPC URL is configured)
        if (settings.rpcUrl && txData) {
            try {
                const gasRisk = await estimateGas(txData, settings.rpcUrl);
                if (gasRisk) {
                    risks.push(gasRisk);
                }
            } catch (gasError) {
                console.error('Gas estimation error:', gasError);
                risks.push('Gas estimation failed - transaction may revert');
            }
        }

        // If any risks found, block or warn based on settings
        if (risks.length > 0) {
            return {
                allowed: false,
                reason: 'Security risks detected:\n' + risks.join('\n')
            };
        }

        return { allowed: true, reason: 'Transaction appears safe' };

    } catch (error) {
        console.error('Error in checkTransaction:', error);
        // Fail-closed by default unless failOpen is enabled
        return {
            allowed: settings.failOpen,
            reason: settings.failOpen 
                ? 'Analysis error (allowed by fail-open)'
                : 'Analysis error (blocked by fail-closed)'
        };
    }
}

// Analyze transaction data for risks
function analyzeTransactionData(data) {
    const risks = [];
    
    if (data.length < 10) {
        return risks; // Not enough data
    }

    // Extract function selector (first 4 bytes = 8 hex chars after 0x)
    const selector = data.slice(0, 10).toLowerCase();

    // Check for admin functions
    for (const [funcName, funcSelector] of Object.entries(ADMIN_SELECTORS)) {
        if (selector === funcSelector) {
            risks.push(`Sensitive admin function: ${funcName}`);
        }
    }

    // Check for ERC20 approve with unlimited allowance
    const approveSelector = '0x095ea7b3';
    if (selector === approveSelector && data.length >= 74) {
        // Extract allowance value (second parameter)
        const allowance = '0x' + data.slice(74, 138);
        if (allowance.toLowerCase() === MAX_UINT256.toLowerCase()) {
            risks.push('Unlimited token approval (MAX_UINT256)');
        }
    }

    // Check for setApprovalForAll (ERC721/1155)
    const setApprovalForAllSelector = '0xa22cb465';
    if (selector === setApprovalForAllSelector && data.length >= 74) {
        // Check if approved is true (second parameter)
        const approved = data.slice(74, 138);
        if (approved.endsWith('1')) {
            risks.push('SetApprovalForAll: granting unlimited NFT access');
        }
    }

    return risks;
}

// Check typed data for risks (EIP-712 signatures)
async function checkTypedData(typedData, settings) {
    const risks = [];

    try {
        // Check for permit signatures (unlimited approvals via signature)
        if (typedData.primaryType === 'Permit') {
            const message = typedData.message;
            if (message && message.value) {
                const valueBigInt = BigInt(message.value);
                const maxUintBigInt = BigInt(MAX_UINT256);
                if (valueBigInt === maxUintBigInt) {
                    risks.push('Permit signature with unlimited approval (MAX_UINT256)');
                }
            }
        }

        // Check for suspicious domain
        if (typedData.domain && typedData.domain.verifyingContract) {
            const contract = typedData.domain.verifyingContract;
            if (!isValidEthereumAddress(contract)) {
                risks.push('Invalid verifying contract address');
            }
        }

        if (risks.length > 0) {
            return {
                allowed: false,
                reason: 'Typed data risks detected:\n' + risks.join('\n')
            };
        }

        return { allowed: true, reason: 'Typed data appears safe' };

    } catch (error) {
        console.error('Error checking typed data:', error);
        return {
            allowed: settings.failOpen,
            reason: settings.failOpen 
                ? 'Typed data analysis error (allowed by fail-open)'
                : 'Typed data analysis error (blocked by fail-closed)'
        };
    }
}

// Estimate gas using RPC
async function estimateGas(txData, rpcUrl) {
    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_estimateGas',
                params: [txData],
                id: 1
            })
        });

        const result = await response.json();

        if (result.error) {
            return 'Gas estimation failed - transaction may revert: ' + result.error.message;
        }

        if (result.result) {
            const gasEstimate = parseInt(result.result, 16);
            const GAS_THRESHOLD = 1000000;

            if (gasEstimate > GAS_THRESHOLD) {
                return `High gas estimate: ${gasEstimate} (exceeds ${GAS_THRESHOLD})`;
            }
        }

        return null; // No gas-related risks

    } catch (error) {
        console.error('Gas estimation fetch error:', error);
        return 'Gas estimation network error';
    }
}

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
