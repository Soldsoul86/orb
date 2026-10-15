package chat.veil

import java.net.URI

object PurposeLink {
    fun create(relay:String,alias:String,invite:String=""):String {
        require(alias.matches(Regex("p-[a-f0-9]{32}")))
        require(invite.isEmpty() || invite.matches(Regex("[A-Za-z0-9_-]{43}")))
        return "$relay/p/$alias"+(if(invite.isNotEmpty()) "#invite=$invite" else "")
    }
    fun parse(input:String,relay:String):Pair<String,String> {
        val value=input.trim();require(value.length<=500)
        if(value.matches(Regex("p-[a-f0-9]{32}")))return value to ""
        val uri=URI(value);val base=URI(relay)
        require(uri.scheme=="https" && uri.host==base.host && uri.port==base.port && uri.userInfo==null && uri.query==null) { "Use a purpose link from your configured server" }
        val alias=uri.path.removePrefix("/p/")
        require(uri.path=="/p/$alias" && alias.matches(Regex("p-[a-f0-9]{32}")))
        val invite=uri.rawFragment?.let { require(it.startsWith("invite="));it.removePrefix("invite=") } ?: ""
        require(invite.isEmpty() || invite.matches(Regex("[A-Za-z0-9_-]{43}")))
        return alias to invite
    }
}
