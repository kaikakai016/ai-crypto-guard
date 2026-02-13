# AI Crypto Guard - Features

## Pre-Sign Risk Protection

The AI Crypto Guard extension now includes comprehensive pre-sign transaction analysis to protect users from dangerous crypto operations.

### Transaction Interception

Automatically intercepts and analyzes:
- `eth_sendTransaction` - Standard Ethereum transactions
- `eth_signTypedData_v4` - Structured data signing (EIP-712)
- `personal_sign` - Message signing
- `eth_sign` - Raw data signing

### Security Heuristics

Detects and warns about:

1. **Unlimited Token Approvals**
   - Identifies MAX_UINT256 approvals
   - Prevents unlimited access to your tokens

2. **NFT Collection Approvals**
   - Detects setApprovalForAll calls
   - Warns when granting full collection access

3. **Contract Admin Operations**
   - transferOwnership detection
   - Contract upgrade detection (upgradeTo)

4. **High-Value Transfers**
   - Warns on transfers ≥1 ETH
   - Prevents accidental large transfers

### Gas Simulation

When RPC URL is configured:
- Estimates gas before transaction execution
- Warns if gas > 1,000,000 (expensive operation)
- Detects likely transaction reverts

### User Settings

Configurable options:
- **Enable Guard**: Toggle protection on/off
- **Fail-Open Mode**: Allow transactions on analysis errors
- **RPC URL**: Configure gas estimation endpoint
- **Chain ID**: Set blockchain network (default: 0x1)

### Privacy & Security

- All analysis performed locally
- No transaction data sent to external servers
- RPC calls only to user-configured endpoint
- Fail-closed by default for maximum safety

## How It Works

1. Extension intercepts transaction requests before they reach your wallet
2. Analyzes transaction data for known dangerous patterns
3. Optionally estimates gas via configured RPC endpoint
4. Shows clear warnings for risky operations
5. Allows you to approve or reject based on analysis

## Safety Features

- **Fail-Closed by Default**: Blocks suspicious transactions
- **User Control**: You decide the final action
- **Transparent Warnings**: Clear explanations of detected risks
- **Configurable**: Adjust settings to your risk tolerance
