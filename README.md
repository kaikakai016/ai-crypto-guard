# Программа защиты криптовалют

## Описание проекта
Программа защиты криптовалют - это инструмент, который помогает пользователям защитить свои цифровые активы. Она включает в себя различные функции для мониторинга и предотвращения несанкционированного доступа.

## Инструкции по установке
1. Клонируйте репозиторий на ваш локальный компьютер:
   ```bash
   git clone https://github.com/kaikakai016/ai-crypto-guard.git
   ```
2. Установите необходимые зависимости:
   ```bash
   pip install -r requirements.txt
   ```

## Руководство по использованию
1. Запустите программу:
   ```bash
   python main.py
   ```
2. Следуйте инструкциям на экране для настройки и использования функций программы.
## New Features - Pre-Sign Risk Guard

### Transaction Protection
The AI Crypto Guard now includes comprehensive pre-sign transaction analysis to protect users from dangerous crypto operations before they are executed.

#### Automatic Detection
- **Unlimited Token Approvals**: Prevents granting unlimited access to your tokens (MAX_UINT256)
- **NFT Collection Approvals**: Warns when granting full collection access (setApprovalForAll)
- **Admin Operations**: Detects contract ownership transfers and upgrades
- **High-Value Transfers**: Alerts on transfers ≥1 ETH
- **Gas Estimation**: Predicts transaction costs and likely failures

#### User Configuration
Access settings by clicking the extension icon:
- **Enable Guard**: Toggle protection on/off (default: ON)
- **Fail-Open Mode**: Choose behavior on analysis errors (default: fail-closed for safety)
- **RPC URL**: Configure your Ethereum RPC endpoint for gas simulation
- **Chain ID**: Set your blockchain network (default: 0x1 for Ethereum mainnet)

Settings are automatically saved and synced across your Chrome browsers.

#### How It Works
1. Extension intercepts transaction requests before they reach your wallet
2. Analyzes transaction data for known dangerous patterns
3. Estimates gas costs via your configured RPC endpoint (optional)
4. Shows clear warnings for risky operations
5. You make the final decision to approve or reject

#### Privacy & Security
- All analysis performed locally in your browser
- No transaction data sent to external servers
- RPC calls only to your configured endpoint
- Fail-closed by default for maximum safety
- No new permissions required

#### Supported Transaction Types
- `eth_sendTransaction` - Standard transactions
- `eth_signTypedData_v4` - Structured data signing (EIP-712)
- `personal_sign` - Message signing
- `eth_sign` - Raw data signing

### Installation Instructions
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. Click the extension icon to configure settings

### Testing
A test page is available at `/tmp/test.html` for testing various transaction scenarios:
- Simple transactions
- Unlimited approvals
- High-value transfers
- Personal signatures

For detailed testing instructions, see `/tmp/TESTING_GUIDE.md`.
