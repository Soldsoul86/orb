package chat.veil

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import org.json.JSONArray
import org.portableidentity.core.IdentityCore as Core

private fun entries(a:JSONArray?):List<JSONObject> = if(a==null)emptyList() else (0 until a.length()).map(a::getJSONObject)
private val PortableMuted=Color(0xFF91A5AF)

/** No private keys are supplied to this composition. Recovery secret exists only while unlocked. */
@Composable fun ColumnScope.PortableHome(a:MainActivity) {
    val s=a.portableSnapshot
    var page by remember {mutableStateOf("home")}
    var selected by remember {mutableStateOf("")}
    var editor by remember {mutableStateOf<PurposeFacet?>(null)}
    var origin by remember {mutableStateOf("")}
    var card by remember {mutableStateOf("")}
    var introduction by remember {mutableStateOf("")}
    var recovery by remember {mutableStateOf("")}
    var keyAgain by remember {mutableStateOf("")}
    var backedUp by remember {mutableStateOf(false)}
    var results by remember {mutableStateOf<List<String>>(emptyList())}
    var problem by remember {mutableStateOf("")}
    LaunchedEffect(Unit) {a.portableAction()}
    BackHandler(page!="home") {page="home";recovery="";keyAgain="";problem=""}
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        if(page!="home")TextButton({page="home";recovery="";keyAgain="";problem=""}) {Text("‹ My identity")}
        if(a.portableNotice.isNotBlank())Text(a.portableNotice,color=Color(0xFFFFD5A0),fontSize=12.sp)
        if(problem.isNotEmpty())Text(problem,color=Color(0xFFFFD5A0),fontSize=12.sp)
        if(s==null) {Text("Opening your identity…");TextButton({a.portableAction()},enabled=!a.busy){Text("Retry")};return@Column}
        val facets=entries(s.optJSONArray("facets"));val contacts=entries(s.optJSONArray("contacts"))
        when(page) {
            "create","edit" -> {
                if(page=="create") {
                    Text("Choose a compatible provider",fontSize=24.sp)
                    OutlinedTextField(origin,{origin=it.take(2000)},label={Text("Provider HTTPS origin")},modifier=Modifier.fillMaxWidth())
                    Text("This portable beta needs a pi/1 provider. Your existing personal-chat server is unchanged and does not yet offer this service.",color=PortableMuted,fontSize=12.sp)
                }
                PurposeEditor(editor,onCancel={page="home"},portable=true) {p,consent ->
                    val route=runCatching {RelayClient(origin).base}
                    if(page=="create" && route.isFailure)problem="Enter a valid HTTPS provider origin."
                    else {
                        val id=editor?.id
                        a.portableAction {if(id==null)createFacet(p,route.getOrThrow(),consent) else updatePolicy(id,p,consent)}
                        page="home";problem=""
                    }
                }
            }
            "backup" -> {
                Text("Keep your identity",fontSize=28.sp)
                Text("This backup preserves identity control and signed relationships. It does not contain chat history, live Signal sessions or old pending messages.",color=PortableMuted)
                Text("Write this recovery key somewhere safe, separately from the backup. Anyone with both can control these identities. We cannot reset it.",color=Color(0xFFFFD5A0))
                Text(recovery,fontFamily=FontFamily.Monospace,fontSize=16.sp)
                OutlinedTextField(keyAgain,{keyAgain=it.take(100)},label={Text("Retype the complete recovery key")},visualTransformation=PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth())
                Row {Checkbox(backedUp,{backedUp=it});Text("I saved the key separately. Losing it loses this backup.",fontSize=12.sp)}
                Button({a.savePortableBackup(recovery)},enabled=!a.busy && backedUp && keyAgain==recovery){Text("Save encrypted backup")}
                Text("Returning from the file picker locks the app. The recovery key will be cleared from this screen.",color=PortableMuted,fontSize=12.sp)
            }
            "import" -> {
                Text("Restore your identity",fontSize=28.sp)
                Text("Use your encrypted package and separate recovery key. Import is offline. Afterwards, choose a new provider for each purpose you want to move.",color=PortableMuted)
                Button(a::choosePortableFile,enabled=!a.busy){Text("Choose encrypted package")}
                Text(a.portableFileName,color=PortableMuted)
                OutlinedTextField(recovery,{recovery=it.take(100)},label={Text("Recovery key")},visualTransformation=PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth())
                Button({val encrypted=a.portableBackup;val key=recovery;a.portableAction {importIdentity(encrypted,key)};recovery="";page="home"},enabled=!a.busy && a.portableBackup.isNotEmpty() && recovery.length==43){Text("Restore control")}
                Text("An old backup can omit later revocations. Review every grant before moving a purpose. Existing personal chats and earlier pilot data are not overwritten.",color=Color(0xFFFFD5A0),fontSize=12.sp)
            }
            "connect" -> {
                var query by remember {mutableStateOf("")}
                Text("Reach a purpose",fontSize=28.sp)
                Text("Choose the purpose you will present. A directory can show a name, but a cryptographic key alone does not prove who the person is.",color=PortableMuted)
                facets.forEach {f -> FilterChip(selected==f.getString("id"),{selected=f.getString("id")},label={Text(f.getJSONObject("policy").getString("display_name"))})}
                OutlinedTextField(origin,{origin=it.take(2000)},label={Text("Directory HTTPS origin")},modifier=Modifier.fillMaxWidth())
                OutlinedTextField(query,{query=it.take(80)},label={Text("Name or service")},modifier=Modifier.fillMaxWidth())
                Button({val actor=selected;val target=origin;val term=query;a.portableAction {results=search(actor,RelayClient(target).base,term)}},enabled=!a.busy && selected.isNotBlank()){Text("Search opted-in purposes")}
                results.forEach {value -> val state=Core.verifyState(JSONObject(value).getString("state"));OutlinedButton({card=value}){Text(state.getJSONObject("policy").getString("display_name"))}}
                OutlinedTextField(card,{if(it.length<=16000)card=it},label={Text("Or paste a signed invitation / route card")},maxLines=5,modifier=Modifier.fillMaxWidth())
                val state=remember(card) {runCatching {Core.verifyState(JSONObject(card).getString("state"))}.getOrNull()}
                if(state!=null) {
                    Text(PurposePolicy.from(state.getJSONObject("policy")).summary(),color=PortableMuted,fontSize=13.sp)
                    Text("Controller: ${state.getString("id")}",fontFamily=FontFamily.Monospace,fontSize=10.sp)
                    OutlinedTextField(introduction,{introduction=it.take(4000)},label={Text("One introduction")},modifier=Modifier.fillMaxWidth())
                    Button({val actor=selected;val invite=card;val text=introduction;a.portableAction {request(actor,invite,text)};page="home"},enabled=!a.busy && selected.isNotBlank() && introduction.isNotBlank()){Text("Request contact with these rules")}
                }
            }
            "migrate" -> {
                val f=facets.firstOrNull {it.getString("id")==selected}
                if(f!=null) {
                    var consent by remember {mutableStateOf(false)}
                    Text("Replace this provider",fontSize=28.sp)
                    Text("Your purpose key stays the same. Approved, unexpired grants move; old messages do not. Contacts need your new signed route card through another trusted channel, then must explicitly accept fresh Signal sessions.",color=PortableMuted)
                    Text("Current provider: ${f.getString("route")}",fontSize=12.sp)
                    OutlinedTextField(origin,{origin=it.take(2000)},label={Text("New provider HTTPS origin")},modifier=Modifier.fillMaxWidth())
                    Text(PurposePolicy.from(f.getJSONObject("policy")).summary(),color=PortableMuted,fontSize=12.sp)
                    Row {Checkbox(consent,{consent=it});Text("I reviewed the restored grants and authorize these rules and any public listing at this provider.",fontSize=12.sp)}
                    Button({val id=selected;val route=origin;a.portableAction {migrate(id,RelayClient(route).base,true)};page="home"},enabled=!a.busy && consent && origin.isNotBlank()){Text("Move this purpose")}
                }
            }
            "card" -> {
                val f=facets.firstOrNull {it.getString("id")==selected}
                if(f!=null) {
                    val value=f.getString("card")
                    Text("Your signed purpose card",fontSize=26.sp)
                    Text("Share privately. It contains this purpose’s name, rules, key and route. It never includes your wallet key or other purposes.",color=PortableMuted)
                    Button({a.sharePurpose(value)}){Text("Share invitation / new route")}
                    val bitmap=remember(value){runCatching {PurposeQr.renderPortable(value)}.getOrNull()}
                    if(bitmap!=null) {
                        DisposableEffect(bitmap){onDispose {bitmap.recycle()}}
                        Image(bitmap.asImageBitmap(),"Signed purpose invitation QR",Modifier.fillMaxWidth().aspectRatio(1f))
                        Text("This QR contains the same signed card. Scan and paste its text, or share the card remotely.",fontSize=12.sp,color=PortableMuted)
                    } else Text("This card is too large for a readable QR. Use Share to send the complete signed card.",fontSize=12.sp,color=PortableMuted)
                    Text(f.getString("id"),fontFamily=FontFamily.Monospace,fontSize=11.sp)
                }
            }
            "chat" -> {
                val c=contacts.firstOrNull {it.getString("id")==selected}
                if(c!=null) {
                    var text by remember(selected){mutableStateOf("")}
                    var newRoute by remember(selected){mutableStateOf("")}
                    var revoke by remember(selected){mutableStateOf(false)}
                    val owner=c.getString("local")==c.getString("owner")
                    Text(c.getJSONObject("policy").getString("display_name"),fontSize=28.sp)
                    Text("${c.getString("status")} · encrypted text · 7-day messages",color=PortableMuted,fontSize=12.sp)
                    Text(c.getString("route"),fontSize=11.sp,color=PortableMuted)
                    Button({val id=c.getString("local");a.portableAction {sync(id)}},enabled=!a.busy){Text("Refresh & retry delivery")}
                    if(c.optBoolean("pending"))Text("A delivery or permission update is pending. Refresh to retry.",fontSize=12.sp,color=Color(0xFFFFD5A0))
                    Text("Compare this entire safety number through a trusted channel. It changes after migration; the signed purpose key must also match the pinned contact.",fontSize=12.sp,color=PortableMuted)
                    Text(c.getString("safety").chunked(5).chunked(3).joinToString("\n"){it.joinToString(" ")},fontFamily=FontFamily.Monospace,fontSize=16.sp)
                    entries(c.getJSONArray("messages")).forEach {m -> Card(Modifier.fillMaxWidth()) {Column(Modifier.padding(12.dp)){Text(if(m.optBoolean("mine"))"You" else "Contact",fontSize=11.sp,color=PortableMuted);Text(m.getString("text"))}}}
                    if(owner && c.getString("status")=="PENDING") {
                        Row {Button({val id=selected;a.portableAction {decide(id,"APPROVED")}},enabled=!a.busy){Text("Approve")};TextButton({val id=selected;a.portableAction {decide(id,"REJECTED")}},enabled=!a.busy){Text("Reject")}}
                    }
                    if(c.getString("status")=="APPROVED") {
                        OutlinedTextField(text,{text=it.take(4000)},label={Text("Message")},modifier=Modifier.fillMaxWidth())
                        Button({val id=selected;val body=text;a.portableAction {send(id,body)};text=""},enabled=!a.busy && text.isNotBlank() && !c.optBoolean("pending")){Text("Send encrypted text")}
                        if(owner) {
                            TextButton({revoke=!revoke}){Text("Revoke access")}
                            if(revoke)OutlinedButton({val id=selected;a.portableAction {decide(id,"REVOKED")}},enabled=!a.busy){Text("Permanently revoke this grant")}
                        }
                    }
                    if(!owner) {
                        HorizontalDivider()
                        Text("Contact moved providers?",fontSize=20.sp)
                        OutlinedTextField(newRoute,{if(it.length<=16000)newRoute=it},label={Text("Their new signed route card")},maxLines=4,modifier=Modifier.fillMaxWidth())
                        Text("Accepting replaces this conversation’s old session and local messages. Only a newer card signed by the same pinned controller is accepted.",fontSize=12.sp,color=PortableMuted)
                        Button({val id=selected;val value=newRoute;a.portableAction {acceptRoute(id,value)};newRoute=""},enabled=!a.busy && newRoute.isNotBlank()){Text("Verify identity & accept new session")}
                        TextButton({val id=selected;a.portableAction {reconnect(id)}},enabled=!a.busy){Text("Retry accepted route")}
                    }
                }
            }
            else -> {
                Text("Identity is yours.",fontSize=30.sp)
                Text("Access is programmable.\nServices are replaceable.",color=PortableMuted,fontSize=18.sp)
                Text("Portable beta · no phone number, email or company account. Compatible provider required for messaging.",color=PortableMuted,fontSize=12.sp)
                if(!s.optBoolean("ready")) {
                    Button({a.portableAction {createIdentity()}},enabled=!a.busy,modifier=Modifier.fillMaxWidth()){Text("Create identity on this device")}
                    OutlinedButton({page="import"},enabled=!a.busy){Text("Restore encrypted identity")}
                } else {
                    Text("Private ownership key created locally. Each purpose has an independent public key.",color=PortableMuted,fontSize=12.sp)
                    Button({editor=null;page="create"},enabled=!a.busy && facets.size<8){Text("Create a purpose")}
                    OutlinedButton({page="connect"},enabled=facets.isNotEmpty()){Text("Find a purpose / open invitation")}
                    facets.forEach {f -> Card(Modifier.fillMaxWidth()) {Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                        val p=PurposePolicy.from(f.getJSONObject("policy"));val id=f.getString("id")
                        Text(p.displayName,fontSize=22.sp);Text("${PurposePolicy.discoveryLabel(p.discovery)} · ${p.status.name.lowercase()}",color=PortableMuted,fontSize=12.sp)
                        Text("${p.timezone} · revision ${f.getLong("revision")}",fontSize=12.sp,color=PortableMuted)
                        if(f.optBoolean("needs_migration"))Text("Restored locally. Choose a new provider before using this purpose.",color=Color(0xFFFFD5A0),fontSize=12.sp)
                        if(!f.optBoolean("published") && !f.optBoolean("needs_migration"))Button({a.portableAction {publish(id)}},enabled=!a.busy && p.status==PurposeStatus.ACTIVE){Text("Activate with provider")}
                        if(f.optBoolean("published"))Row {TextButton({a.portableAction {sync(id)}},enabled=!a.busy){Text("Refresh inbox")};TextButton({selected=id;page="card"}){Text("Share card / QR")}}
                        if(p.status!=PurposeStatus.REVOKED) {
                            TextButton({editor=PurposeFacet(id,"",p,"",f.optBoolean("published"));origin=f.getString("route");page="edit"}){Text("Edit / pause / revoke purpose")}
                            TextButton({a.portableAction {rotateDevice(id)}},enabled=!a.busy && !f.optBoolean("needs_migration")){Text("Rotate operational device key")}
                            TextButton({selected=id;origin="";page="migrate"}){Text("Move to another provider")}
                        }
                    }}}
                    Text("Requests & conversations",fontSize=22.sp)
                    contacts.forEach {c -> OutlinedButton({selected=c.getString("id");page="chat"},modifier=Modifier.fillMaxWidth()){Text("${c.getJSONObject("policy").getString("display_name")} · ${c.getString("status")}")}}
                    Button({recovery=Core.secret();keyAgain="";backedUp=false;page="backup"},enabled=!a.busy){Text("Create encrypted recovery backup")}
                    Text("Controller keys cannot rotate while keeping the same fingerprint. If compromised, create a new purpose and verify it with contacts independently. Rotate the device key only when the controller remains safe.",color=Color(0xFFFFD5A0),fontSize=12.sp)
                }
                TextButton({a.portableScreen=false}){Text("Open earlier purpose pilot")}
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}
