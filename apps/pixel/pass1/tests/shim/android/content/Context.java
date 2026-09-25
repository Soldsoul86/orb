package android.content;

import java.io.File;

/**
 * A stand-in for Android's Context, present only on the test classpath.
 *
 * The probe's Java is the code that actually runs on the device, and until now
 * none of it was executed anywhere but the phone -- which is how a defect in
 * `Journal.restore()` reached a real run and had to be caught by the hash chain
 * instead of by a test (`DEVICE_LOOP.md` section 5d).
 *
 * `Journal` touches Android in exactly one place: it asks a Context for a
 * directory. Supplying that one method here lets the shipped source compile and
 * run unmodified on a desktop JVM. Nothing in `src/` is changed or conditioned
 * on being under test, so what the tests exercise is what the phone runs.
 */
public class Context {
    private final File directory;

    public Context(File directory) {
        this.directory = directory;
    }

    public File getExternalFilesDir(String type) {
        return directory;
    }

    public File getFilesDir() {
        return directory;
    }
}
