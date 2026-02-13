// inpage.js - Intercepts window.ethereum.request calls for pre-sign risk analysis

(function() {
  'use strict';

  // Don't inject if ethereum is not available
  if (!window.ethereum) {
    return;
  }

  const INTERCEPT_METHODS = [
    'eth_sendTransaction',
    'eth_signTypedData_v4',
    'personal_sign',
    'eth_sign'
  ];

  // Store original request method
  const originalRequest = window.ethereum.request.bind(window.ethereum);

  // Override ethereum.request
  window.ethereum.request = async function(args) {
    // Only intercept specific methods
    if (!INTERCEPT_METHODS.includes(args.method)) {
      return originalRequest(args);
    }

    console.log('[AI Crypto Guard] Intercepting request:', args.method);

    // Send check request to content script
    return new Promise((resolve, reject) => {
      const requestId = `guard_${Date.now()}_${Math.random()}`;
      
      // Listen for verdict
      const verdictListener = (event) => {
        if (event.data.type !== 'AI_GUARD_VERDICT' || event.data.requestId !== requestId) {
          return;
        }
        
        window.removeEventListener('message', verdictListener);
        
        if (event.data.allowed) {
          console.log('[AI Crypto Guard] Request allowed');
          // Proceed with original request
          originalRequest(args).then(resolve).catch(reject);
        } else {
          console.log('[AI Crypto Guard] Request blocked:', event.data.reason);
          // Reject with user-friendly error
          reject(new Error(`Transaction blocked by AI Crypto Guard: ${event.data.reason}`));
        }
      };
      
      window.addEventListener('message', verdictListener);
      
      // Send check request
      window.postMessage({
        type: 'AI_GUARD_CHECK',
        requestId: requestId,
        method: args.method,
        params: args.params
      }, '*');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('message', verdictListener);
        // On timeout, apply fail-open/fail-closed based on settings
        // We'll let the content script handle this via verdict
        reject(new Error('AI Crypto Guard analysis timeout'));
      }, 30000);
    });
  };

  console.log('[AI Crypto Guard] Inpage script injected');
})();
