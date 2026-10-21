"""Report local Matrix experiment prerequisites; never authorize guest release."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import urllib.request


def run(network=False):
    checks = []

    def record(name, ok, detail):
        checks.append({"check": name, "status": "PASS" if ok else "BLOCKED", "detail": detail})

    for executable in ("node", "java", "gradle", "adb", "sdkmanager"):
        record(executable, shutil.which(executable) is not None, "Executable on PATH" if shutil.which(executable) else "Not on PATH")

    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    record("android_platform_35", bool(sdk and (Path(sdk) / "platforms/android-35/android.jar").is_file()), "Requires installed Android API 35; SDK path is not printed")
    record("python_playwright", importlib.util.find_spec("playwright") is not None, "Python package only; browser launch is a separate acceptance test")

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
        record("loopback_listener", True, "Ephemeral IPv4 loopback listener opened and closed")
    except OSError as error:
        record("loopback_listener", False, f"{type(error).__name__}; errno={error.errno}")

    try:
        result = subprocess.run(
            ["node", "--input-type=module", "-e", "await import('matrix-js-sdk');"],
            cwd=Path(__file__).resolve().parent,
            capture_output=True, timeout=15, check=False,
        )
        record("matrix_js_import", result.returncode == 0, f"Module import exit={result.returncode}; no package installation attempted")
    except (OSError, subprocess.TimeoutExpired) as error:
        record("matrix_js_import", False, type(error).__name__)

    if network:
        # Use the environment's configured HTTPS proxy and CA trust. Never
        # bypass them or expose exception strings that may contain credentials.
        for name, url in (
            ("npm_registry_https", "https://registry.npmjs.org/matrix-js-sdk/44.0.0"),
            ("maven_central_https", "https://repo.maven.apache.org/maven2/org/matrix/rustcomponents/sdk-android/maven-metadata.xml"),
        ):
            try:
                with urllib.request.urlopen(url, timeout=10) as response:
                    response.read(1)
                    record(name, response.status == 200, f"HTTP {response.status}; body not logged")
            except Exception as error:
                record(name, False, f"{type(error).__name__}; configured-proxy request failed")

    blocked = any(check["status"] == "BLOCKED" for check in checks)
    return {
        "scope": "local experiment prerequisites only",
        "status": "BLOCKED" if blocked else "PASS",
        "message_e2ee": "NOT TESTED",
        "public_guest_send": False,
        "checks": checks,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--network", action="store_true", help="Read public npm/Maven metadata through the configured proxy")
    result = run(parser.parse_args().network)
    print(json.dumps(result, indent=2))
    raise SystemExit(2 if result["status"] == "BLOCKED" else 0)
