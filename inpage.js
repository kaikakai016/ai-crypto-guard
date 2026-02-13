// inpage.js - Intercepts wallet calls before they reach the wallet
// This script runs in the page context to intercept ethereum provider calls

(function() {
    'use strict';

    // Don't inject if already injected
    if (window.__AI_CRYPTO_GUARD_INJECTED__) {
        return;
    }
    window.__AI_CRYPTO_GUARD_INJECTED__ = true;

    // Store the original ethereum provider
    const originalProvider = window.ethereum;
    
    if (!originalProvider) {
        console.log('[AI Crypto Guard] No ethereum provider found');
        return;
    }

    // Methods we want to intercept for security checks
    const INTERCEPTED_METHODS = [
        'eth_sendTransaction',
        'eth_signTypedData_v4',
        'personal_sign',
        'eth_sign'
    ];

    // Create a proxy for the ethereum provider
    const providerProxy = new Proxy(originalProvider, {
        get(target, prop) {
            if (prop === 'request') {
                return async function(args) {
                    const method = args.method || args;
                    const params = args.params || [];

                    // Check if this method should be intercepted
                    if (INTERCEPTED_METHODS.includes(method)) {
                        console.log(`[AI Crypto Guard] Intercepting ${method}`, params);

                        try {
                            // Send check request to content script
                            const checkRequest = {
                                type: 'AI_GUARD_CHECK',
                                method: method,
                                params: params,
                                timestamp: Date.now()
                            };

                            window.postMessage(checkRequest, window.location.origin);

                            // Wait for verdict from content script
                            const verdict = await waitForVerdict(checkRequest.timestamp);

                            if (!verdict.allowed) {
                                console.warn('[AI Crypto Guard] Transaction blocked:', verdict.reason);
                                throw new Error(`AI Crypto Guard: ${verdict.reason}`);
                            }

                            console.log('[AI Crypto Guard] Transaction allowed');
                        } catch (error) {
                            console.error('[AI Crypto Guard] Error during check:', error);
                            throw error;
                        }
                    }

                    // Call the original method
                    return target.request.apply(target, arguments);
                };
            }

            // For other properties, return the original value
            return target[prop];
        }
    });

    // Function to wait for verdict from the extension
    function waitForVerdict(requestTimestamp) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for AI Crypto Guard verdict'));
            }, 10000); // 10 second timeout

            const messageHandler = (event) => {
                // Only accept messages from the same origin
                if (event.origin !== window.location.origin) {
                    return;
                }

                const data = event.data;
                if (data.type === 'AI_GUARD_VERDICT' && data.requestTimestamp === requestTimestamp) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', messageHandler);
                    resolve(data);
                }
            };

            window.addEventListener('message', messageHandler);
        });
    }

    // Replace the ethereum provider with our proxy
    Object.defineProperty(window, 'ethereum', {
        value: providerProxy,
        writable: false,
        configurable: false
    });

    console.log('[AI Crypto Guard] Wallet interception enabled');
})();
