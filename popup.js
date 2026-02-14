// popup.js - Логика интерфейса расширения

const DEFAULT_SETTINGS = { 
    enabled: true, 
    failOpen: true,
    smallTransferThresholdWei: '1000000000000000' // 0.001 ETH in wei
};
// Cached regex pattern for better performance
const ETHEREUM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
// BigInt constant for wei to ETH conversion
const WEI_PER_ETH = 1000000000000000000n;

function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
        document.getElementById('enabled').checked = !!items.enabled;
        document.getElementById('failOpen').checked = !!items.failOpen;
        
        // Load threshold from wei, convert to ETH for display using BigInt for precision
        const thresholdWei = items.smallTransferThresholdWei || '1000000000000000';
        const weiBig = BigInt(thresholdWei);
        const ethBig = weiBig / WEI_PER_ETH;
        const fracWei = weiBig % WEI_PER_ETH;
        const thresholdEth = Number(ethBig) + Number(fracWei) / 1e18;
        document.getElementById('smallTransferThreshold').value = thresholdEth;
        
        document.getElementById('status').textContent = 'Settings loaded';
    });
}

function saveSettings() {
    const enabled = document.getElementById('enabled').checked;
    const failOpen = document.getElementById('failOpen').checked;
    
    // Convert ETH threshold to wei string for storage using BigInt for precision
    const thresholdEth = parseFloat(document.getElementById('smallTransferThreshold').value) || 0.001;
    // Use BigInt multiplication to avoid floating point precision issues
    const thresholdWei = (BigInt(Math.floor(thresholdEth * 1e6)) * BigInt(1e12)).toString();
    
    chrome.storage.sync.set({ enabled, failOpen, smallTransferThresholdWei: thresholdWei }, () => {
        document.getElementById('status').textContent = 'Settings saved';
    });
}

// Функция для проверки формата адреса Ethereum
function isValidEthereumAddress(address) {
    return ETHEREUM_ADDRESS_PATTERN.test(address);
}

// Когда нажимают на кнопку "Проверить"
document.getElementById('checkAddressBtn').addEventListener('click', async () => {
    const address = document.getElementById('addressInput').value.trim();
    const resultBox = document.getElementById('result');

    // Проверяем, что пользователь ввел адрес
    if (!address) {
        resultBox.textContent = '⚠️ Введи адрес кошелька';
        resultBox.className = 'result-box warning';
        return;
    }

    // Проверяем формат адреса
    if (!isValidEthereumAddress(address)) {
        resultBox.textContent = '❌ Неверный формат адреса!\nАдрес должен начинаться с 0x и содержать 40 символов';
        resultBox.className = 'result-box danger';
        return;
    }

    // Показываем "загружается"
    resultBox.textContent = '🔄 Анализируем адрес...';
    resultBox.className = 'result-box loading';

    try {
        // Отправляем адрес на проверку background скрипту
        const response = await chrome.runtime.sendMessage({
            action: 'analyzeAddress',
            address: address
        });

        // Показываем результат
        if (response.isSafe) {
            resultBox.textContent = `✅ БЕЗОПАСНО\n\nАдрес выглядит легитимным`;
            resultBox.className = 'result-box safe';
        } else {
            resultBox.textContent = `⛔ ОПАСНО!\n\nВероятность скама: ${(response.riskScore * 100).toFixed(1)}%\n\nПричина: ${response.reason}`;
            resultBox.className = 'result-box danger';
        }
    } catch (error) {
        resultBox.textContent = `❌ Ошибка: ${error.message}`;
        resultBox.className = 'result-box warning';
        console.error('Error:', error);
    }
});

// Загружаем статистику при открытии окна
document.addEventListener('DOMContentLoaded', async () => {
    // Load settings
    loadSettings();
    document.getElementById('enabled').addEventListener('change', saveSettings);
    document.getElementById('failOpen').addEventListener('change', saveSettings);
    document.getElementById('smallTransferThreshold').addEventListener('change', saveSettings);

    const statsBox = document.getElementById('stats');
    
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getStatus'
        });
        statsBox.textContent = `✅ Расширение активно\n\nПроверено адресов: ${response.checkedCount}\nОпасных адресов: ${response.suspiciousCount}`;
        statsBox.className = 'result-box safe';
    } catch (error) {
        statsBox.textContent = '⚠️ Расширение загружается...';
        statsBox.className = 'result-box warning';
        console.error('Status error:', error);
    }
});