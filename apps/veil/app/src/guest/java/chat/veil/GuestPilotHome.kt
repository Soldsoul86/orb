package chat.veil

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.json.JSONObject

internal const val guestPilotEnabled=true

@Composable internal fun ColumnScope.GuestPilotHome(a:MainActivity) {
    var snapshot by remember{mutableStateOf<JSONObject?>(null)}
    var owner by remember{mutableStateOf("")};var origin by remember{mutableStateOf("")};var web by remember{mutableStateOf("")}
    var user by remember{mutableStateOf("")};var password by remember{mutableStateOf("")}
    var name by remember{mutableStateOf("")};var purpose by remember{mutableStateOf("")}
    var selected by remember{mutableStateOf("")};var text by remember(selected){mutableStateOf("")};var qr by remember{mutableStateOf(false)}
    fun action(block:GuestOwner.()->Unit={}) {
        a.contactAction({val guest=GuestOwner(this,a.filesDir);val outcome=runCatching{guest.block()};guest.snapshot().put("action_failed",outcome.isFailure)}){snapshot=it}
    }
    LaunchedEffect(Unit){action()}
    LaunchedEffect(snapshot?.optBoolean("configured")) {
        while(true){delay(3000);if(a.unlocked && !a.busy && snapshot?.optBoolean("configured")==true)action{refresh()}}
    }
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        TextButton({a.contactPage="home"}){Text("‹ Back")}
        Text("Browser messages",style=MaterialTheme.typography.headlineMedium)
        Text("Private pilot · encrypted guest channel")
        Text("Requests arrive while this inbox is open and unlocked. No background notifications or message previews.")
        if(a.portableNotice.isNotEmpty())Text(a.portableNotice)
        if(snapshot?.optBoolean("action_failed")==true)Text("Action incomplete. Check the connection and permissions. Refresh retries the saved operation.")
        if(snapshot?.optBoolean("configured")!=true) {
            Text("Choose a purpose or create a disposable pilot identity. Your existing Veil installation is separate.")
            if(contactEntries(a.portableSnapshot?.optJSONArray("facets")).isEmpty()) {
                OutlinedTextField(name,{name=it.take(60)},label={Text("Your chosen name")})
                OutlinedTextField(purpose,{purpose=it.take(240)},label={Text("What can people contact you about?")})
                Button({a.contactAction({
                    if(!ready())createIdentity()
                    createFacet(PurposePolicy(name,description=purpose,timezone="UTC",discovery=DiscoveryMode.LINK_ONLY),web,false)
                }){owner=it}},enabled=!a.busy && name.isNotBlank() && web.startsWith("https://")){Text("Create pilot purpose")}
            }
            contactEntries(a.portableSnapshot?.optJSONArray("facets")).forEach {f->
                OutlinedButton({owner=f.getString("id")},enabled=!a.busy){Text((if(owner==f.getString("id"))"✓ " else "")+f.getJSONObject("policy").getString("display_name"))}
            }
            OutlinedTextField(origin,{origin=it},label={Text("Private service origin")})
            OutlinedTextField(web,{web=it},label={Text("Private browser origin")})
            OutlinedTextField(user,{user=it},label={Text("Pilot technical account")})
            OutlinedTextField(password,{password=it},label={Text("Pilot account password")},visualTransformation=androidx.compose.ui.text.input.PasswordVisualTransformation())
            Button({val secret=password;password="";action{configure(owner,origin,web,user,secret)}},enabled=!a.busy && listOf(owner,origin,web,user,password).all{it.isNotBlank()}){Text("Enable private pilot")}
        } else {
            val link=snapshot!!.optString("link")
            if(link.isNotBlank()) {
                Button({qr=!qr}){Text(if(qr)"Hide QR" else "Show browser QR")}
                if(qr) {
                    val bitmap=remember(link){PurposeQr.render(link)}
                    androidx.compose.foundation.Image(bitmap.asImageBitmap(),"Browser contact QR",Modifier.fillMaxWidth().height(280.dp))
                }
                TextButton({a.copyContactLink(link)}){Text("Copy browser contact link")}
                Text("One-hour invitation. Share only with pilot participants. No app or phone number needed.")
            }
            OutlinedButton({action{refresh()}},enabled=!a.busy,modifier=Modifier.testTag("guest-refresh")){Text("Refresh / retry")}
            val conversations=contactEntries(snapshot!!.getJSONArray("conversations"))
            if(conversations.isEmpty())Text("No browser requests yet.")
            conversations.forEachIndexed {index,c->OutlinedButton({selected=c.getString("id")},modifier=Modifier.testTag("guest-conversation-$index")){Text("Browser visitor ${index+1} · ${c.getString("status")}")}}
            val c=conversations.firstOrNull{it.getString("id")==selected}
            if(c!=null) {
                val status=c.getString("status")
                Text(status.replaceFirstChar{it.uppercase()},Modifier.testTag("guest-status"))
                Text("Browser identity · no real-world identity verification")
                contactEntries(c.getJSONArray("messages")).forEach{m->Text((if(m.getBoolean("mine"))"You: " else "Visitor: ")+m.getString("text"))}
                if(c.optBoolean("pending"))Text("Action waiting for service confirmation. Refresh to retry.")
                if(status=="pending" && c.getJSONArray("messages").length()>0) {
                    Button({action{decide(selected,"approved")}},enabled=!a.busy && !c.optBoolean("pending"),modifier=Modifier.testTag("guest-approve")){Text("Approve")}
                    OutlinedButton({action{decide(selected,"declined")}},enabled=!a.busy,modifier=Modifier.testTag("guest-decline")){Text("Decline")}
                }
                if(status in setOf("pending","approved")) {
                    OutlinedButton({action{decide(selected,"blocked")}},enabled=!a.busy,modifier=Modifier.testTag("guest-block")){Text("Block this browser identity")}
                    if(status=="approved") {
                        OutlinedTextField(text,{text=it.take(4000)},label={Text("Reply")},modifier=Modifier.testTag("guest-reply"))
                        Button({val body=text;action{reply(selected,body)}},enabled=!a.busy && text.isNotBlank() && !c.optBoolean("pending"),modifier=Modifier.testTag("guest-send")){Text("Send reply")}
                        OutlinedButton({action{decide(selected,"revoked")}},enabled=!a.busy,modifier=Modifier.testTag("guest-revoke")){Text("End access")}
                    }
                }
                if(c.optString("receipt").isNotBlank())Text(c.getString("receipt"))
                Text("Either person can copy or capture messages. Ending access cannot recall messages already received.")
            }
        }
    }
}
