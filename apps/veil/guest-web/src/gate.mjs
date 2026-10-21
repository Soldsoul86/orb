// Release blocker is code-reviewed, not a query-string, localStorage or environment switch.
export const capabilities=Object.freeze({guestMessaging:false, browserE2ee:false, sessionTransfer:false, backgroundNotifications:false});
export async function sendGuestMessage() { throw new Error('BROWSER_CRYPTO_UNAVAILABLE'); }
export const blockers=Object.freeze(['Reviewed Matrix-native guest adapters with verified purpose/device binding; existing Signal sessions stay separate', 'Browser-to-Android encrypted request/reply proof and provider permission enforcement', 'Independent security review of key binding, storage and web delivery plus physical-device verification']);
