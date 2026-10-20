package chat.veil

import java.io.IOException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLHandshakeException
import org.junit.Assert.*
import org.junit.Test

class ContactErrorsTest {
    @Test fun errorsDistinguishRecoveryWithoutExposingPrivateMessages() {
        assertTrue(ContactErrors.message(RelayRejected(410)).contains("new QR"))
        assertTrue(ContactErrors.message(SocketTimeoutException("secret-invite" )).contains("TIMEOUT"))
        assertTrue(ContactErrors.message(IOException("secret-invite")).contains("NETWORK"))
        assertTrue(ContactErrors.message(SSLHandshakeException("secret-invite")).contains("TLS"))
        assertTrue(ContactErrors.message(ContactIdentityLimit()).contains("8 contact identities"))
        listOf(IOException("secret-invite"),IllegalStateException("secret-invite"),SSLHandshakeException("secret-invite")).forEach {
            assertFalse(ContactErrors.message(it).contains("secret-invite"))
        }
    }
}
