(function() {
  try {
    if (!window.ethereum || typeof window.ethereum.request !== 'function') {
      return;
    }

    const originalRequest = window.ethereum.request.bind(window.ethereum);

    async function getVerdict(args) {
      // Send to extension via window messaging; content-script will forward to background
      window.postMessage({ type: 'AI_GUARD_CHECK', payload: args }, '*');
      return new Promise((resolve) => {
        const handler = (ev) => {
          if (ev.source !== window) return;
          const data = ev.data;
          if (data && data.type === 'AI_GUARD_VERDICT') {
            window.removeEventListener('message', handler);
            resolve(data.verdict || { action: 'allow' });
          }
        };
        window.addEventListener('message', handler);
        // Fallback in case extension doesn't respond
        setTimeout(() => {
          try { window.removeEventListener('message', handler); } catch (_) {}
          resolve({ action: 'allow', reason: 'timeout' });
        }, 2500);
      });
    }

    window.ethereum.request = async (args) => {
      // Intercept risky methods and ask guard for a verdict
      const riskyMethods = ['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign', 'eth_sign'];
      if (args && riskyMethods.includes(args.method)) {
        const verdict = await getVerdict(args);
        if (verdict.action === 'block') {
          throw new Error(verdict.message || 'Operation blocked by AI Crypto Guard');
        }
        if (verdict.action === 'warn') {
          const confirmMsg = verdict.message || 'Risk detected. Proceed?';
          const ok = window.confirm(confirmMsg);
          if (!ok) {
            throw new Error('Operation cancelled by user after warning');
          }
        }
      }
      return originalRequest(args);
    };
  } catch (e) {
    // Fail silently to avoid breaking dApps
    console.debug('AI Crypto Guard inpage interception error:', e);
  }
})();
