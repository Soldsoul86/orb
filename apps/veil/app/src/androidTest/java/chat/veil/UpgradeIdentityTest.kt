package chat.veil

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.MessageDigest

/** Run against v5, install actual v6 -r, then v7 -r, verifying each transition; never uninstall between stages. */
class UpgradeIdentityTest {
    @Test fun stage() {
        val args=InstrumentationRegistry.getArguments();val stage=args.getString("upgradeStage") ?: return
        require(args.getString("disposableFixture")=="true")
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val proof=File(context.filesDir,"upgrade-proof.json")
        fun hash(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
        fun vaultHash(name:String)=hash(File(context.noBackupFilesDir,name).readBytes())
        if(stage=="seed") {
            assertFalse(proof.exists())
            val sender=JSONObject();val receiver=JSONObject();SignalSession.initialize(sender);SignalSession.initialize(receiver)
            sender.put("peer",PurposeCipher.bundle(receiver));receiver.put("peer",PurposeCipher.bundle(sender))
            val sealed=SignalSession(sender).encrypt("Before update".toByteArray())
            assertEquals("Before update",String(SignalSession(receiver).decrypt(sealed)))
            Vault(context).write(JSONObject().put("sender",sender).put("receiver",receiver))
            Vault(context,"purposes.v1").write(JSONObject().put("upgrade_fixture","preserve-existing-purpose-vault"))
            val v=Vault(context,"identity.v1");val p=PortableSession(v.read(),v::write,{_,_,_->error("No network for upgrade")})
            p.createIdentity();p.createFacet(PurposePolicy("Existing identity"),"https://upgrade.invalid",false)
            val record=JSONObject().put("wallet",p.snapshot().getString("wallet_id")).put("controller",p.snapshot().getJSONArray("facets").getJSONObject(0).getString("id"))
            listOf("vault.v1","purposes.v1","identity.v1").forEach{record.put(it,vaultHash(it))}
            proof.writeText(record.toString())
        } else {
            require(stage=="check");val before=JSONObject(proof.readText())
            listOf("vault.v1","purposes.v1","identity.v1").forEach{assertEquals("Encrypted file unchanged: $it",before.getString(it),vaultHash(it))}
            val v=Vault(context,"identity.v1");val p=PortableSession(v.read(),v::write,{_,_,_->error("No network for upgrade")})
            assertEquals(before.getString("wallet"),p.snapshot().getString("wallet_id"));assertEquals(before.getString("controller"),p.snapshot().getJSONArray("facets").getJSONObject(0).getString("id"))
            assertEquals("preserve-existing-purpose-vault",Vault(context,"purposes.v1").read().getString("upgrade_fixture"))
            val pair=Vault(context).read();val sealed=SignalSession(pair.getJSONObject("sender")).encrypt("After update".toByteArray())
            assertEquals("After update",String(SignalSession(pair.getJSONObject("receiver")).decrypt(sealed)))
            // Persist ratchet progression and the next upgrade's expected encrypted bytes.
            Vault(context).write(pair)
            listOf("vault.v1","purposes.v1","identity.v1").forEach{before.put(it,vaultHash(it))}
            proof.writeText(before.toString())
        }
        println("PASS upgrade $stage: encrypted vaults, ownership/controller keys and established Signal session; no private values printed")
    }
}
