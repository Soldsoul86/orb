"""Private QR handoff. Invitation stays in the browser fragment, never the APK URL."""
import base64
import hashlib

APK_URL = 'https://github.com/Soldsoul86/orb/releases/download/veil-contact-v7/veil-contact-preview.apk'
_SCRIPT = """const open = document.getElementById('open');
const status = document.getElementById('status');
function invitation() {
  const fragment = location.hash.slice(1);
  const valid = /^[A-Za-z0-9_-]{43}$/.test(fragment);
  open.hidden = !valid;
  open.removeAttribute('href');
  if (valid) {
    open.href = 'veil-contact://open?link=' + encodeURIComponent(location.origin + '/i#' + fragment);
    status.textContent = 'Your invitation is ready. Install Veil, then return to this page to continue.';
  } else {
    status.textContent = 'This invitation is incomplete. Ask your contact to show their invitation QR again.';
  }
}
invitation();
window.addEventListener('hashchange', invitation);
document.getElementById('download').addEventListener('click', () => {
  document.getElementById('install-help').hidden = false;
});
"""
CSP = "default-src 'none'; script-src 'sha256-" + base64.b64encode(hashlib.sha256(_SCRIPT.encode()).digest()).decode() + "'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
HTML = ('''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Your Veil invitation</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{font:18px/1.6 system-ui,sans-serif;background:#0b1014;color:#eef6f0;margin:0;padding:32px 20px}main{max-width:30rem;margin:4vh auto}header{color:#a8d7c3;letter-spacing:.12em;font-weight:700}h1{font-size:clamp(30px,7vw,42px);line-height:1.15;margin:32px 0 20px}h2{font-size:22px;margin:0 0 10px}p{margin:12px 0;color:#cedbd4}.step{border:1px solid #35483f;border-radius:20px;padding:22px;margin:20px 0;background:#111c18}.action{display:block;text-align:center;background:#b5f4cf;color:#10251b;font-weight:700;text-decoration:none;border-radius:28px;padding:14px 18px;margin-top:18px;min-height:52px}.secondary{background:#243b30;color:#dcf8e8;border:1px solid #789d8a}a:focus-visible{outline:3px solid #fff;outline-offset:4px}.fine{font-size:15px;color:#b6c7bc}summary{cursor:pointer;padding:12px 0;min-height:48px}details a{color:#b5f4cf;overflow-wrap:anywhere}[hidden]{display:none!important}
</style></head><body><main><header>VEIL · PRIVATE BY CHOICE</header><h1>Someone wants to connect.</h1>
<p id="status" role="status">Install Veil, then return to this page to open your invitation.</p>
<section class="step" aria-labelledby="install"><h2 id="install">1. Get Veil</h2><p>Download the Android app. No account or phone number needed.</p>
<a id="download" class="action" href="''' + APK_URL + '''" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Download Veil</a>
<p class="fine">Android 9 or later · Development preview v7</p>
<div id="install-help" hidden role="status"><p>Open the downloaded APK and tap Install. If Android asks, allow installation from your browser.</p><p><strong>Keep this invitation tab open.</strong> After installing, come back here for step 2. If the download did not start, tap Download Veil again.</p></div></section>
<section class="step" aria-labelledby="continue"><h2 id="continue">2. Open your invitation</h2><p>Already installed? You can continue now.</p>
<a id="open" class="action secondary" hidden>Continue in Veil</a>
<p class="fine">Unlock Veil, review the invitation and request contact. The other person approves before you can chat.</p></section>
<p class="fine">Scanning does not request access or start a conversation. This page cannot detect installation; return here and tap Continue in Veil when ready.</p>
<details><summary>Need help?</summary><p>If you opened Veil from Android's installer and see Chats, return to this browser tab and tap Continue in Veil.</p><p>If your browser blocks opening apps, open this page in your normal browser. You can also scan the same QR again after installing.</p><p>Keep existing Veil data: install this preview as an update to Veil Purposes Preview. Do not uninstall it. Older personal Veil installations use a separate app.</p></details>
<noscript><p>Enable JavaScript to open this invitation, or install Veil and paste this page's complete address into Open an invitation in Veil.</p></noscript>
</main><script>''' + _SCRIPT + '''</script></body></html>''').encode()
ASSETLINKS=[{'relation':['delegate_permission/common.handle_all_urls'],'target':{'namespace':'android_app','package_name':'chat.veil.purposes.preview','sha256_cert_fingerprints':['E2:41:AD:4E:30:DE:78:12:46:9E:70:F7:20:65:96:0E:AF:D5:EE:3F:2F:AB:08:9A:C4:0A:89:78:36:47:F6:A4']}}]
