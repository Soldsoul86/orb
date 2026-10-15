package chat.veil

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** One authenticated, atomically replaced snapshot: identity, ratchet, outbox and messages. */
class Vault(context: Context, fileName: String = "vault.v1") {
    private val directory = context.noBackupFilesDir
    private val file = AtomicFile(File(context.noBackupFilesDir, fileName.also {
        require(it in setOf("vault.v1", "purposes.v1", "identity.v1"))
    }))
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("veil-vault-v1", null) as? SecretKey)?.let { return it }
        check(!File(directory, "vault.v1").exists() && !File(directory, "purposes.v1").exists() && !File(directory, "identity.v1").exists()) { "Vault key missing. Recovery required." }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("veil-vault-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setUnlockedDeviceRequired(true).build())
        }.generateKey()
    }
    fun read(): JSONObject {
        val bytes = try { file.readFully() } catch (_: java.io.FileNotFoundException) { return JSONObject() }
        require(bytes.size >= 29 && bytes[0] == 1.toByte())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
        cipher.updateAAD("veil-vault-v1".toByteArray())
        val plain = cipher.doFinal(bytes, 13, bytes.size - 13)
        return try { JSONObject(plain.toString(Charsets.UTF_8)) } finally { plain.fill(0) }
    }
    fun write(state: JSONObject) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD("veil-vault-v1".toByteArray())
        val plain = state.toString().toByteArray()
        val encrypted = try { cipher.doFinal(plain) } finally { plain.fill(0) }
        val stream = file.startWrite()
        try {
            stream.write(byteArrayOf(1)); stream.write(cipher.iv); stream.write(encrypted)
            file.finishWrite(stream)
        } catch (e: Exception) { file.failWrite(stream); throw e }
    }
}
