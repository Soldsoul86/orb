package dev.orb.probe;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.widget.TextView;

/**
 * Orb device probe — DEVICE_LOOP.md P0.
 *
 * Reports what the device says about itself, so that a successful install is
 * self-evidencing: the screen carries the model and API level the result
 * should be recorded against. It does nothing else, on purpose.
 */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        String body =
            "Orb probe — P0\n\n"
            + "A self-signed APK installs on this device.\n\n"
            + "Model:    " + Build.MODEL + "\n"
            + "Device:   " + Build.DEVICE + "\n"
            + "Android:  " + Build.VERSION.RELEASE + "  (API " + Build.VERSION.SDK_INT + ")\n"
            + "Security patch: " + Build.VERSION.SECURITY_PATCH + "\n"
            + "Build:    " + Build.DISPLAY + "\n\n"
            + "No permissions. No services. No network.";

        TextView view = new TextView(this);
        view.setText(body);
        view.setTextSize(16);
        view.setPadding(56, 140, 56, 56);
        setContentView(view);
    }
}
