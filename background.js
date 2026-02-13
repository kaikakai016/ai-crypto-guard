// background.js - Pre-sign guard with AI risk detector

// Import AI detector
importScripts('ai-detector.js');

let checkedAddresses = 0;
let suspiciousAddresses = new Set();

// Хранилище известных опасных адресов
const KNOWN_SCAM_ADDRESSES = new Set([
    // Примеры известных скам адресов (можно добавить свои)
]);

// Settings include AI
const DEFAULT_SETTINGS = { 
    enabled: true, 
    failOpen: false, 
    rpcUrl: '', 
    chainId: '0x1', 
    aiEnabled: true, 
    aiSensitivity: 'medium' 
};

async function getSettings() {
    return new Promise((resolve) => chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => resolve(items)));
}

// Gas estimation helper
async function tryEstimateGas(rpcUrl, tx) {
    if (!rpcUrl) return null;
    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_estimateGas',
                params: [tx],
                id: 1
            })
        });
        const data = await response.json();
        if (data.error) {
            return { ok: false, message: data.error.message || 'Gas estimation failed' };
        }
        const gasHex = data.result;
        const gasInt = parseInt(gasHex, 16);
        if (gasInt > 500000) {
            return { ok: false, message: 'High gas estimate detected' };
        }
        return { ok: true, gas: gasInt };
    } catch (e) {
        return { ok: false, message: 'RPC error: ' + e.message };
    }
}

// AI analysis functions
function aiAnalyzeTx(tx, sim, sensitivity) {
    try {
        if (typeof AICryptoGuardDetector !== 'undefined' && AICryptoGuardDetector.analyze) {
            return AICryptoGuardDetector.analyze({ kind: 'tx', tx, sim, sensitivity });
        }
    } catch (_) {}
    return null;
}

function aiAnalyzeTyped(typed, sensitivity) {
    try {
        if (typeof AICryptoGuardDetector !== 'undefined' && AICryptoGuardDetector.analyze) {
            return AICryptoGuardDetector.analyze({ kind: 'typed', typed, sensitivity });
        }
    } catch (_) {}
    return null;
}

// Main message listener for AI guard checks
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Legacy address checking support
    if (msg.action === 'analyzeAddress') {
        analyzeAddress(msg.address).then(result => {
            checkedAddresses++;
            if (!result.isSafe) {
                suspiciousAddresses.add(msg.address);
            }
            sendResponse(result);
        });
        return true;
    }

    if (msg.action === 'getStatus') {
        sendResponse({
            checkedCount: checkedAddresses,
            suspiciousCount: suspiciousAddresses.size
        });
        return false;
    }

    if (msg.action === 'checkPageAddresses') {
        msg.addresses.forEach(address => {
            analyzeAddress(address).then(result => {
                if (!result.isSafe) {
                    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: 'highlightAddress',
                                address: address,
                                risk: result.riskScore
                            }).catch(() => {});
                        }
                    });
                }
            });
        });
        return false;
    }

    // AI Guard check for wallet requests
    if (!msg || msg.type !== 'AI_GUARD_CHECK') return;
    
    (async () => {
        const { enabled, failOpen, rpcUrl, aiEnabled, aiSensitivity } = await getSettings();
        if (!enabled) return sendResponse({ action: 'allow', message: 'Guard disabled' });
        
        try {
            const args = msg.payload || {};
            const method = args.method;
            const params = args.params || [];

            if (method === 'eth_sendTransaction') {
                const tx = params[0] || {};
                let sim = null;
                if (rpcUrl) {
                    const simTx = { to: tx.to, from: tx.from, data: tx.data, value: tx.value };
                    sim = await tryEstimateGas(rpcUrl, simTx);
                    if (sim && !sim.ok) {
                        const msgWarn = sim.message || 'Gas estimation problem';
                        if (!aiEnabled) return sendResponse({ action: 'warn', message: msgWarn });
                    }
                }
                if (aiEnabled) {
                    const ai = aiAnalyzeTx(tx, sim, aiSensitivity);
                    if (ai && (ai.action === 'warn' || ai.action === 'block')) {
                        return sendResponse({ 
                            action: 'warn', 
                            message: (ai.reasons && ai.reasons.length ? ai.reasons.join(' ') : 'AI risk detected.') 
                        });
                    }
                }
                return sendResponse({ action: 'allow' });
            }

            if (method === 'eth_signTypedData_v4') {
                try {
                    const typed = JSON.parse(params[1] || '{}');
                    if (aiEnabled) {
                        const ai = aiAnalyzeTyped(typed, aiSensitivity);
                        if (ai && (ai.action === 'warn' || ai.action === 'block')) {
                            return sendResponse({ 
                                action: 'warn', 
                                message: (ai.reasons && ai.reasons.length ? ai.reasons.join(' ') : 'AI risk detected for typed data.') 
                            });
                        }
                    }
                } catch (e) {
                    return sendResponse({ action: 'warn', message: 'Opaque typed data signature. Review carefully before signing.' });
                }
                return sendResponse({ action: 'allow' });
            }

            if (method === 'personal_sign' || method === 'eth_sign') {
                return sendResponse({ action: 'warn', message: 'Raw signature can be reused in phishing attacks. Proceed only if you trust the site.' });
            }

            return sendResponse({ action: 'allow' });
        } catch (e) {
            const fallback = failOpen ? 
                { action: 'allow', message: 'Guard error, fail-open.' } : 
                { action: 'warn', message: 'Guard error. Please review manually.' };
            return sendResponse(fallback);
        }
    })();
    return true;
});

// Legacy address analysis functions
async function analyzeAddress(address) {
    if (!isValidEthereumAddress(address)) {
        return {
            isSafe: false,
            riskScore: 0.95,
            reason: 'Неверный формат адреса Ethereum'
        };
    }

    const riskScore = calculateRiskScore(address);

    return {
        isSafe: riskScore < 0.5,
        riskScore: riskScore,
        reason: getRiskReason(riskScore)
    };
}

function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function calculateRiskScore(address) {
    let riskScore = 0.2;

    if (KNOWN_SCAM_ADDRESSES.has(address)) {
        return 0.95;
    }

    if (suspiciousAddresses.has(address)) {
        return 0.85;
    }

    if (address.match(/0{10,}/)) {
        riskScore += 0.3;
    }

    if (address === '0x0000000000000000000000000000000000000000') {
        riskScore = 0.1;
    }

    return Math.min(riskScore, 1.0);
}

function getRiskReason(score) {
    if (score > 0.8) return 'Очень высокий риск скама';
    if (score > 0.6) return 'Высокий риск скама';
    if (score > 0.4) return 'Средний риск';
    if (score > 0.2) return 'Низкий риск';
    return 'Адрес выглядит безопасным';
}
