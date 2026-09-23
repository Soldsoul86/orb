package app.actionlock

import java.io.File

/**
 * One text file in app-private storage (the journal, the profile).
 * Writes go to a temporary file first and are then renamed over the old one,
 * so a crash mid-write never leaves a half-written file.
 */
class PrivateFile(dir: File, name: String, private val empty: String) {
    private val file = File(dir, name)
    private val tmp = File(dir, "$name.tmp")

    @Synchronized
    fun read(): String = if (file.exists()) file.readText() else empty

    @Synchronized
    fun write(text: String) {
        if (text.isEmpty()) {
            file.delete()
            return
        }
        tmp.writeText(text)
        if (!tmp.renameTo(file)) {
            file.delete()
            check(tmp.renameTo(file)) { "Could not save $name" }
        }
    }
}
