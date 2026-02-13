// background.js - Background service worker for AI Crypto Guard

let checkedAddresses = 0;
let suspiciousAddresses = new Set();

// Constants for transaction analysis
const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const HIGH_GAS_THRESHOLD = 1000000;
const HIGH_VALUE_THRESHOLD = '1000000000000000000'; // 1 ETH in wei
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';
const ERC721_SET_APPROVAL_SELECTOR = '0xa22cb465';
const TRANSFER_OWNERSHIP_SELECTOR = '0xf2fde38b';
const UPGRADE_TO_SELECTOR = '0x3659cfe6';

// Хранилище известных опасных адресов
const KNOWN_SCAM_ADDRESSES = new Set([
    // Примеры известных скам адресов (можно добавить свои)
]);

// RPC call helper
async function rpcCall(rpcUrl, method, params) {
  if (!rpcUrl) {
    throw new Error('RPC URL not configured');
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

// Try to estimate gas for a transaction
async function tryEstimateGas(rpcUrl, tx) {
  if (!rpcUrl) {
    return { success: false, error: 'RPC URL not configured' };
  }

  try {
    const gasEstimate = await rpcCall(rpcUrl, 'eth_estimateGas', [tx]);
    const gasInt = parseInt(gasEstimate, 16);
    
    return {
      success: true,
      gas: gasInt,
      warning: gasInt > HIGH_GAS_THRESHOLD ? `High gas estimate: ${gasInt} (>${HIGH_GAS_THRESHOLD})` : null
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      warning: 'Transaction likely to revert: ' + error.message
    };
  }
}

// Decode transaction data to check for risky patterns
function analyzeTransactionData(tx) {
  const warnings = [];
  
  if (!tx.data || tx.data === '0x') {
    // Simple ETH transfer
    if (tx.value) {
      const valueInt = BigInt(tx.value);
      const thresholdInt = BigInt(HIGH_VALUE_THRESHOLD);
      if (valueInt >= thresholdInt) {
        warnings.push(`High value transfer: ${(Number(valueInt) / 1e18).toFixed(4)} ETH`);
      }
    }
    return warnings;
  }

  const data = tx.data.toLowerCase();
  const selector = data.substring(0, 10);

  // Check for unlimited approval
  if (selector === ERC20_APPROVE_SELECTOR) {
    // Extract amount: selector(4) + address(32) + amount(32 bytes) = chars 10 to 10+128
    // Amount starts at byte 36 = char 10 + 36*2 = 82
    if (data.length >= 138) {
      const amount = '0x' + data.substring(74, 138);
      if (amount.toLowerCase() === MAX_UINT256.toLowerCase()) {
        warnings.push('⚠️ CRITICAL: Unlimited token approval detected (MAX_UINT256)');
      }
    }
  }

  // Check for setApprovalForAll
  if (selector === ERC721_SET_APPROVAL_SELECTOR) {
    // Extract approved boolean: selector(4) + address(32) + bool(32 bytes)
    if (data.length >= 138) {
      const approvedHex = data.substring(106, 138);
      // Check if any bit is set (not all zeros)
      if (parseInt(approvedHex, 16) !== 0) {
        warnings.push('⚠️ WARNING: setApprovalForAll - granting full NFT collection access');
      }
    }
  }

  // Check for ownership transfer
  if (selector === TRANSFER_OWNERSHIP_SELECTOR) {
    warnings.push('⚠️ CRITICAL: Contract ownership transfer detected');
  }

  // Check for upgradeTo (proxy upgrade)
  if (selector === UPGRADE_TO_SELECTOR) {
    warnings.push('⚠️ CRITICAL: Contract upgrade detected');
  }

  return warnings;
}

// Analyze transaction for risks
async function analyzeTransaction(settings, method, params) {
  const warnings = [];
  let tx = null;

  // Extract transaction object based on method
  if (method === 'eth_sendTransaction') {
    tx = params[0];
  } else if (method === 'eth_signTypedData_v4') {
    // For typed data, we'd need to parse the message
    warnings.push('Signing structured data - please review carefully');
  } else if (method === 'personal_sign' || method === 'eth_sign') {
    warnings.push('Signing message - ensure you trust the site');
  }

  // Analyze transaction if available
  if (tx) {
    // Check transaction data for risky patterns
    const dataWarnings = analyzeTransactionData(tx);
    warnings.push(...dataWarnings);

    // Try gas estimation if RPC is configured
    if (settings.rpcUrl) {
      const gasResult = await tryEstimateGas(settings.rpcUrl, tx);
      if (gasResult.warning) {
        warnings.push(gasResult.warning);
      }
    }
  }

  return warnings;
}

// Main transaction analysis handler
async function handleTransactionAnalysis(request) {
  // Load settings once at the start
  const settings = await chrome.storage.sync.get({
    enabled: true,
    failOpen: false,
    rpcUrl: '',
    chainId: '0x1'
  });

  try {
    // If guard is disabled, allow everything
    if (!settings.enabled) {
      return { allowed: true, reason: 'Guard disabled' };
    }

    // Analyze transaction
    const warnings = await analyzeTransaction(settings, request.method, request.params);

    // If there are warnings, block the transaction
    if (warnings.length > 0) {
      return {
        allowed: false,
        reason: 'Security warnings detected:\n' + warnings.join('\n')
      };
    }

    // No warnings - allow transaction
    return { allowed: true, reason: 'No security issues detected' };

  } catch (error) {
    console.error('Transaction analysis error:', error);
    
    if (settings.failOpen) {
      // Fail-open: allow on error
      return {
        allowed: true,
        reason: 'Analysis error (fail-open): ' + error.message
      };
    } else {
      // Fail-closed: block on error
      return {
        allowed: false,
        reason: 'Analysis error (fail-closed): ' + error.message
      };
    }
  }
}

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

    if (request.action === 'analyzeTransaction') {
        handleTransactionAnalysis(request).then(result => {
            sendResponse(result);
        }).catch(error => {
            console.error('Transaction analysis failed:', error);
            sendResponse({
                allowed: false,
                reason: 'Analysis failed: ' + error.message
            });
        });
        return true; // Асинхронный ответ
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
