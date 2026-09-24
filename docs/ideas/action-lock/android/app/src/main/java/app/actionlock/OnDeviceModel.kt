package app.actionlock

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * The on-device model (Gemini Nano through Android's AICore, via ML Kit's
 * Prompt API): a Reasoner that never leaves the phone. Android downloads and
 * runs the model; Orb only sends it a masked prompt and reads the reply.
 * On phones without it, status says so and Orb uses rules or, with your yes,
 * a cloud AI app.
 */
class OnDeviceModel(private val scope: CoroutineScope) {
    private val model: GenerativeModel? = runCatching { Generation.getClient() }.getOrNull()

    @Volatile
    var status: String = "checking"
        private set

    fun refresh(done: () -> Unit) {
        val m = model ?: run {
            status = "unavailable"
            return done()
        }
        scope.launch {
            status = runCatching {
                when (m.checkStatus()) {
                    FeatureStatus.AVAILABLE -> "available"
                    FeatureStatus.DOWNLOADABLE -> "downloadable"
                    FeatureStatus.DOWNLOADING -> "downloading"
                    else -> "unavailable"
                }
            }.getOrDefault("unavailable")
            done()
        }
    }

    /** Asks Android to fetch the model (AICore downloads it; Orb itself stays offline). */
    fun download(done: () -> Unit) {
        val m = model ?: return done()
        scope.launch {
            runCatching {
                m.download().collect { s ->
                    status = when (s) {
                        is DownloadStatus.DownloadCompleted -> "available"
                        is DownloadStatus.DownloadFailed -> "unavailable"
                        else -> "downloading"
                    }
                }
            }
            done()
        }
    }

    fun generate(prompt: String, done: (reply: String?, error: String?) -> Unit) {
        val m = model ?: return done(null, "No on-device model on this phone.")
        scope.launch {
            val r = runCatching { m.generateContent(prompt).candidates.firstOrNull()?.text }
            done(r.getOrNull(), r.exceptionOrNull()?.message)
        }
    }
}
