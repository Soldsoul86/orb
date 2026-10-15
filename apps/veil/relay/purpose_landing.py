"""Static install/open handoff only. No browser messaging or third-party resources."""
import base64
import hashlib
SCRIPT="document.getElementById('open').href='veil-purpose://open?link='+encodeURIComponent(location.href);"
CSP="default-src 'none'; script-src 'sha256-"+base64.b64encode(hashlib.sha256(SCRIPT.encode()).digest()).decode()+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
HTML=("<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
      "<title>Veil purpose invitation</title><body><h1>A private way to get in touch</h1>"
      "<p>Open this link in a purpose-enabled Veil build to see the rules before requesting contact.</p>"
      "<p><a id=open>Open Veil</a></p><p>If the app does not open, paste this full link in Discover.</p>"
      "<p>This page cannot send messages. The original Veil 0.1 app does not support purposes. "
      "A compatible production-signed update is not available yet; keep existing installations intact.</p>"
      "<script>"+SCRIPT+"</script></body></html>").encode()
