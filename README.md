# Программа защиты криптовалют

## Описание проекта
Программа защиты криптовалют - это инструмент, который помогает пользователям защитить свои цифровые активы. Она включает в себя различные функции для мониторинга и предотвращения несанкционированного доступа.

## AI Risk Detector

The extension now includes a local AI risk detector that analyzes transactions and signatures before you approve them in your wallet.

### What it does:
- Analyzes transaction data for risky patterns:
  - Unlimited token approvals (MAX_UINT)
  - Full NFT operator access (setApprovalForAll)
  - Admin-sensitive operations (ownership transfers, contract upgrades)
  - High-value transfers (>= 1 ETH)
  - Transaction simulation failures
- Analyzes EIP-712 typed data signatures:
  - Permit-like signatures that grant spending permissions
  - Suspicious spender addresses
  - Value and deadline fields
- Computes a risk score (0-100) and assigns a risk level (low/medium/high)
- Provides human-readable reasons for warnings
- Recommends an action (allow/warn/block)

### Configuration (popup settings):
- **Enable Guard**: Master switch for all protection features
- **Fail Open**: If enabled, allows transactions when guard encounters errors
- **RPC URL**: Optional Ethereum RPC endpoint for gas simulation (e.g., Alchemy, Infura)
- **Chain ID**: Network chain ID (default: 0x1 for Ethereum mainnet)
- **Enable AI Risk Detector**: Toggle AI analysis on/off
- **AI Sensitivity**: 
  - **Low**: Only warns on very risky transactions (high threshold)
  - **Medium**: Balanced protection (recommended)
  - **High**: More cautious, warns on medium-risk transactions

### Privacy:
- Runs locally in your browser
- No external AI API calls by default
- No private keys or sensitive data transmitted
- Only uses provided RPC URL for gas estimation if configured

## Инструкции по установке
1. Клонируйте репозиторий на ваш локальный компьютер:
   ```bash
   git clone https://github.com/kaikakai016/ai-crypto-guard.git
   ```
2. Загрузите расширение в Chrome:
   - Откройте chrome://extensions/
   - Включите "Режим разработчика"
   - Нажмите "Загрузить распакованное расширение"
   - Выберите папку с проектом

## Руководство по использованию
1. Нажмите на иконку расширения в Chrome
2. Настройте параметры AI в разделе "AI Settings"
3. Введите RPC URL для дополнительной проверки транзакций (опционально)
4. Расширение автоматически проверит транзакции и подписи при использовании кошелька