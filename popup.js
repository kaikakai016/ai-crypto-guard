// popup.js - Логика интерфейса расширения с настройками

// Default settings
const DEFAULT_SETTINGS = {
    enabled: true,
    failOpen: false,
    rpcUrl: '',
    chainId: '0x1'
};

// Функция для проверки формата адреса Ethereum
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Load settings on popup open
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved settings
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        document.getElementById('enabled').checked = settings.enabled;
        document.getElementById('failOpen').checked = settings.failOpen;
        document.getElementById('rpcUrl').value = settings.rpcUrl;
        document.getElementById('chainId').value = settings.chainId;
    });

    // Load statistics
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

// Save settings button
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const settings = {
        enabled: document.getElementById('enabled').checked,
        failOpen: document.getElementById('failOpen').checked,
        rpcUrl: document.getElementById('rpcUrl').value.trim(),
        chainId: document.getElementById('chainId').value.trim()
    };

    chrome.storage.sync.set(settings, () => {
        const statusEl = document.getElementById('settingsStatus');
        statusEl.textContent = '✅ Settings saved successfully!';
        statusEl.className = 'status-message success';
        
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
    });
});

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
