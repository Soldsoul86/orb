// Release blocker is code-reviewed, not a query-string, localStorage or environment switch.
export const capabilities=Object.freeze({guestMessaging:false, browserE2ee:false, sessionTransfer:false, backgroundNotifications:false});
export async function sendGuestMessage() { throw new Error('BROWSER_CRYPTO_UNAVAILABLE'); }
export const blockers=Object.freeze(['Reviewed browser Signal adapter compatible with Veil libsignal 0.105.0', 'Browser-to-Android encrypted request/reply proof and adversarial tests', 'Independent security review of the adapter, key binding, storage and web delivery']);
