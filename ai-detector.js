// Local AI risk detector (rule-weighted scoring)
(function() {
  function featuresForTx(tx, sim) {
    const data = tx?.data || '0x';
    const selector = data.startsWith('0x') ? data.slice(0, 10) : '';
    const last64 = data.slice(-64);
    const SELECTORS = {
      approve: '0x095ea7b3',
      setApprovalForAll: '0xa22cb465',
      transferOwnership: '0xf2fde38b',
      upgradeTo: '0x3659cfe6',
      upgradeToAndCall: '0x4f1ef286',
    };
    const unlimitedApprove = data.startsWith(SELECTORS.approve) && /^f{64}$/i.test(last64);
    const setApprovalForAll = data.startsWith(SELECTORS.setApprovalForAll);
    const adminOp = [SELECTORS.transferOwnership, SELECTORS.upgradeTo, SELECTORS.upgradeToAndCall].includes(selector);
    let highValue = false;
    try {
      const v = BigInt(tx?.value || '0x0');
      highValue = v >= BigInt('0xde0b6b3a7640000'); // >= 1 ETH
    } catch (_) {}
    const simFail = sim?.ok === false;
    const simHighGas = sim?.ok === false && /high gas/i.test(sim?.message || '');
    return { selector, unlimitedApprove, setApprovalForAll, adminOp, highValue, simFail, simHighGas };
  }

  function featuresForTyped(typed) {
    const types = Object.keys(typed?.types || {});
    const msg = typed?.message || {};
    const domain = typed?.domain || {};
    const isPermit = types.some(t => /Permit/i.test(t)) || 'spender' in msg;
    const spender = msg.spender || null;
    const value = msg.value || msg.amount || null;
    const deadline = msg.deadline || msg.expiry || null;
    // Chain ID validation could be added here if needed
    return { isPermit, spender, value, deadline };
  }

  function score(features, sensitivity) {
    let s = 0;
    const reasons = [];
    if (features.unlimitedApprove) { s += 35; reasons.push('Unlimited allowance (MAX_UINT).'); }
    if (features.setApprovalForAll) { s += 40; reasons.push('Full NFT operator access (setApprovalForAll).'); }
    if (features.adminOp) { s += 30; reasons.push('Admin-sensitive operation (ownership/upgrade).'); }
    if (features.highValue) { s += 20; reasons.push('High-value transfer (>= 1 ETH).'); }
    if (features.simFail) { s += 30; reasons.push('Gas estimation failed (possible revert).'); }
    if (features.simHighGas) { s += 15; reasons.push('Very high gas estimate.'); }
    // Typed data flags
    if (features.isPermit) { s += 25; reasons.push('Permit-like signature (spender can spend tokens).'); }
    if (features.spender && !/^0x[0-9a-fA-F]{40}$/.test(features.spender)) { s += 10; reasons.push('Unknown/malformed spender.'); }
    // Normalize max 100
    if (s > 100) s = 100;
    let level = 'low';
    const thresholds = sensitivity === 'high' ? { medium: 25, high: 45 } : sensitivity === 'low' ? { medium: 40, high: 65 } : { medium: 33, high: 50 };
    if (s >= thresholds.high) level = 'high'; else if (s >= thresholds.medium) level = 'medium';
    return { score: s, level, reasons };
  }

  function recommendAction(level, sensitivity) {
    if (level === 'high') return 'warn';
    if (level === 'medium') return sensitivity === 'high' ? 'warn' : 'allow';
    return 'allow';
  }

  function analyze(inputs) {
    const sensitivity = inputs?.sensitivity || 'medium';
    let f = {};
    if (inputs?.kind === 'tx') {
      f = featuresForTx(inputs.tx, inputs.sim);
    } else if (inputs?.kind === 'typed') {
      const typed = inputs.typed || {};
      const tf = featuresForTyped(typed);
      // merge with tx features keys to reuse scoring
      f = Object.assign({ unlimitedApprove: false, setApprovalForAll: false, adminOp: false, highValue: false, simFail: false, simHighGas: false }, tf);
    }
    const res = score(f, sensitivity);
    const action = recommendAction(res.level, sensitivity);
    return { score: res.score, level: res.level, reasons: res.reasons, action };
  }

  // Export for background.js
  if (typeof module !== 'undefined') {
    module.exports = { analyze };
  } else {
    window.AICryptoGuardDetector = { analyze };
  }
})();