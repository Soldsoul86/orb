package app.actionlock

import java.io.File

/**
 * Stores the lock's event history as one JSON file in app-private storage.
 * Writes go to a temporary file first and are then renamed over the old one,
 * so a crash mid-write never leaves a half-written history.
 */
class JournalFile(dir: File) {
    private val file = File(dir, "journal.json")
    private val tmp = File(dir, "journal.json.tmp")

    @Synchronized
    fun read(): String = if (file.exists()) file.readText() else "[]"

    @Synchronized
    fun write(json: String) {
        tmp.writeText(json)
        if (!tmp.renameTo(file)) {
            file.delete()
            check(tmp.renameTo(file)) { "Could not save the journal" }
        }
    }
}
