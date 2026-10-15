package chat.veil
import org.junit.Assert.*
import org.junit.Test
class PurposeLinkTest {
    @Test fun exactAliasAndLinkResolveWithoutPublishingPrivateInviteInUrlPath() {
        val alias="p-"+"a".repeat(32);val invite="b".repeat(43);val relay="https://relay.example"
        val link=PurposeLink.create(relay,alias,invite)
        assertEquals(alias to invite,PurposeLink.parse(link,relay))
        assertEquals(alias to "",PurposeLink.parse(alias,relay))
        assertFalse(java.net.URI(link).rawPath.contains(invite))
    }
    @Test fun hostileOriginCredentialsAndQueryAreNotAccepted() {
        val relay="https://relay.example";val alias="p-"+"a".repeat(32)
        listOf("http://relay.example/p/$alias","https://evil.example/p/$alias","https://user@relay.example/p/$alias", "$relay/p/$alias?token=x", "$relay/p/$alias#secret").forEach {
            assertTrue(runCatching { PurposeLink.parse(it,relay) }.isFailure)
        }
    }
}
