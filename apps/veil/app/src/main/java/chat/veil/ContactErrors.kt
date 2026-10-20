package chat.veil

import java.io.IOException
import java.io.InterruptedIOException
import javax.net.ssl.SSLException

class RelayRejected(val status:Int):IOException("Relay status $status")
class ContactIdentityLimit:IllegalStateException()
class InvitationUnavailable:IllegalStateException()

/** Only fixed messages and HTTP status codes reach the UI; never server text or request URLs. */
object ContactErrors {
    fun message(error:Throwable):String = when(error) {
        is InvitationRulesChanged -> "This invitation already has saved rules. Resume it from Reach me, or start a new contact to choose different rules."
        is ContactIdentityLimit -> "This preview has reached its limit of 8 contact identities. Open Reach me to use an existing invitation. Nothing has been deleted. (CONTACT-LIMIT)"
        is InvitationUnavailable -> "This invitation has expired or was canceled. Create a new QR invitation. (INVITE-ENDED)"
        is RelayRejected -> when(error.status) {
            410 -> "This invitation has expired, was canceled or is unavailable. Ask your contact for a new QR code. (HTTP-410)"
            429 -> "The service has reached a request or capacity limit. Wait a minute and retry the same invitation. (HTTP-429)"
            502,503,504 -> "The service is temporarily unavailable. Wait a minute, then retry the same invitation. (HTTP-${error.status})"
            401 -> "The service could not verify this request. Check your phone's automatic date and time, then retry. (HTTP-401)"
            403 -> "This action is not allowed by the contact's rules or current access. Ask your contact to check the invitation. (HTTP-403)"
            404 -> "This invitation or contact could not be found. Ask your contact for a new QR code. (HTTP-404)"
            409 -> "The contact information has changed. Refresh and retry. (HTTP-409)"
            else -> "The service could not accept this action. Your saved identity has not been reset. (HTTP-${error.status})"
        }
        is SSLException -> "A secure connection could not be established. Check your connection and automatic date and time. (TLS)"
        is InterruptedIOException -> "The service took too long to respond. It may be waking up. Retry here; your saved invitation is kept. (TIMEOUT)"
        is IOException -> "Could not reach Veil. Check your internet connection, then retry here. (NETWORK)"
        else -> "This action could not be completed or verified. Retry; if it continues, report this code. Your saved identity has not been reset. (CHECK-FAILED)"
    }
}
