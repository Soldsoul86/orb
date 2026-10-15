package chat.veil

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val PurposeMint=Color(0xFFB5F4CF)
private val PurposeMuted=Color(0xFF91A5AF)
private fun contactStatus(s:String)=when(s) {
    "RESERVED" -> "Preparing request"
    "PENDING" -> "Awaiting approval"
    "APPROVED" -> "Approved"
    "REJECTED" -> "Request declined"
    "BLOCKED" -> "Blocked"
    "REVOKED" -> "Access revoked"
    "EXPIRED" -> "Expired"
    else -> "Unavailable"
}

@Composable fun ColumnScope.PurposeHome(a:MainActivity) {
    val s=a.purposeSnapshot
    var editing by remember { mutableStateOf(false) }
    var editFacet by remember { mutableStateOf<PurposeFacet?>(null) }
    var contactId by remember { mutableStateOf<String?>(null) }
    var qrLink by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(a.section) { contactId=null;editing=false;editFacet=null;qrLink=null }
    BackHandler(editing || contactId!=null || a.purposeTarget!=null || qrLink!=null) { editing=false;editFacet=null;contactId=null;a.closePurposeTarget();qrLink=null }
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        if(a.purposeNotice.isNotEmpty()) Text(a.purposeNotice,color=Color(0xFFFFD5A0),fontSize=12.sp)
        if(s==null) { Text("Opening your purposes…",color=PurposeMuted);return@Column }
        if(!s.ready) {
            Spacer(Modifier.height(20.dp))
            Text("Your identity is private.\nAccess is yours to shape.",fontSize=30.sp,lineHeight=36.sp,fontWeight=FontWeight.SemiBold)
            Text("Create separate ways to reach you—work, family or a temporary enquiry. No phone number or email needed.",color=PurposeMuted)
            Button(a::setupPurposes,enabled=!a.busy,modifier=Modifier.fillMaxWidth()) { Text("Get started") }
            Text("Uses your configured Veil server. Purpose support must be installed there. This pilot supports text conversations; files and recovery are not available yet.",color=PurposeMuted,fontSize=12.sp)
            Text("Losing this app’s data loses its identities and access. There is no password reset or recovery backup yet.",color=Color(0xFFFFD5A0),fontSize=12.sp)
            return@Column
        }
        if(qrLink!=null) {
            val bitmap=remember(qrLink) { PurposeQr.render(qrLink!!) }
            DisposableEffect(bitmap) { onDispose { bitmap.recycle() } }
            TextButton({qrLink=null}) { Text("‹ Back") }
            Text("Scan to request contact",fontSize=24.sp)
            Image(bitmap.asImageBitmap(),contentDescription="Purpose invitation QR code",modifier=Modifier.fillMaxWidth().aspectRatio(1f))
            Text("This QR contains the same purpose link. Sharing the link allows a request, not unrestricted messaging.",color=PurposeMuted)
            return@Column
        }
        if(editing) {
            PurposeEditor(editFacet,onCancel={editing=false;editFacet=null}) { p,consent ->
                val f=editFacet
                if(f==null)a.createPurpose(p,consent) else a.editPurpose(f.id,p,consent)
                editing=false;editFacet=null
            }
            return@Column
        }
        val contact=s.contacts.firstOrNull { it.id==contactId }
        if(contact!=null) {
            PurposeConversation(a,contact) { contactId=null }
            return@Column
        }
        val target=a.purposeTarget
        if(a.section==1 && target!=null) {
            var text by remember(target.id) { mutableStateOf("") }
            TextButton(a::closePurposeTarget) { Text("‹ Discover") }
            Text(target.policy.displayName,fontSize=28.sp,fontWeight=FontWeight.SemiBold)
            Text(target.policy.summary(),color=PurposeMuted)
            Text("First contact is encrypted to the key supplied by this directory. Their real-world identity is not yet verified. Compare safety numbers through a trusted channel before sharing sensitive information.",fontSize=12.sp,color=Color(0xFFFFD5A0))
            OutlinedTextField(text,{if(it.length<=4000)text=it},label={Text("Your introduction")},minLines=3,modifier=Modifier.fillMaxWidth())
            Button({a.requestPurpose(target,text)},enabled=!a.busy && text.isNotBlank() && target.policy.requests!=RequestMode.DISABLED,modifier=Modifier.fillMaxWidth()) { Text("Send encrypted request") }
            TextButton({a.reportPurpose(target.id)},enabled=!a.busy) { Text("Report this listing") }
            return@Column
        }
        when(a.section) {
            0 -> {
                Text("Your conversations",fontSize=28.sp,fontWeight=FontWeight.SemiBold)
                Text("Each purpose has its own permissions.",color=PurposeMuted)
                if(s.contacts.isEmpty()) Text("Find a purpose in Discover, or create your own under My identity.",color=PurposeMuted)
                s.contacts.forEach { c ->
                    PurposePanel {
                        Text(c.policy.displayName,fontSize=20.sp,fontWeight=FontWeight.Medium)
                        Text("${if(c.owner) "Your purpose" else "Contacted purpose"} · ${contactStatus(c.status)}",color=PurposeMint,fontSize=12.sp)
                        Text("Contact ${c.id.take(8)}",color=PurposeMuted,fontSize=11.sp)
                        Text(if(c.compared) "Safety number compared" else "Identity not compared",color=PurposeMuted,fontSize=12.sp)
                        Button({contactId=c.id},modifier=Modifier.fillMaxWidth()) { Text(if(c.owner && c.status=="PENDING") "Review request" else "Open conversation") }
                    }
                }
            }
            1 -> {
                var query by remember { mutableStateOf("") }
                Text("Discover a purpose",fontSize=28.sp,fontWeight=FontWeight.SemiBold)
                Text("Only profiles their owners chose to publish. No phone numbers or contact uploads.",color=PurposeMuted)
                OutlinedTextField(query,{if(it.length<=80)query=it},label={Text("Search services or names")},singleLine=true,modifier=Modifier.fillMaxWidth())
                Button({a.searchPurposes(query)},enabled=!a.busy) { Text("Search directory") }
                OutlinedTextField(a.purposeLinkInput,{if(it.length<=500)a.purposeLinkInput=it},label={Text("Purpose link or exact alias")},modifier=Modifier.fillMaxWidth())
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    OutlinedButton({a.lookupPurpose(a.purposeLinkInput)},enabled=!a.busy && a.purposeLinkInput.isNotBlank()) { Text("Open link") }
                    TextButton(a::pickPurposeQr,enabled=!a.busy) { Text("Read QR image") }
                }
                Text("For a live QR scan, use your phone’s camera and open the link. In-app camera scanning is not available yet.",color=PurposeMuted,fontSize=11.sp)
                a.purposeListings.forEach { l -> PurposePanel {
                    Text(l.policy.displayName,fontSize=20.sp,fontWeight=FontWeight.Medium)
                    Text(l.policy.description,color=PurposeMuted)
                    Text("${l.policy.timezone} · ${if(l.policy.requests==RequestMode.DISABLED) "Requests closed" else "Requests open"}",fontSize=12.sp,color=PurposeMint)
                    OutlinedButton({a.choosePurpose(l)}) { Text("See rules & request contact") }
                } }
            }
            else -> {
                Text("My purposes",fontSize=28.sp,fontWeight=FontWeight.SemiBold)
                Text("Separate addresses. Different boundaries.",color=PurposeMuted)
                Text("Early pilot · four first contacts per purpose. Invitation replenishment is not available yet.",color=PurposeMuted,fontSize=11.sp)
                Button({editing=true;editFacet=null},enabled=!a.busy && s.facets.size<8,modifier=Modifier.fillMaxWidth()) { Text("Create contact purpose") }
                s.facets.forEach { f -> PurposePanel {
                    Text(f.policy.displayName,fontSize=21.sp,fontWeight=FontWeight.Medium)
                    Text(PurposePolicy.discoveryLabel(f.policy.discovery)+" · "+(if(f.policy.expiresAt>0 && f.policy.expiresAt<=now()/1000) "expired" else f.policy.status.name.lowercase()),color=PurposeMint,fontSize=12.sp)
                    Text("${f.policy.timezone} · ${s.contacts.count { it.facet==f.id && it.status=="PENDING" }} pending requests",color=PurposeMuted,fontSize=12.sp)
                    if(!f.published)Text("Activation pending. Open Veil while connected to retry.",color=Color(0xFFFFD5A0),fontSize=12.sp)
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        TextButton({a.sharePurpose(f.link)},enabled=f.link.isNotEmpty() && f.policy.status==PurposeStatus.ACTIVE) { Text("Share") }
                        TextButton({a.copyPurpose(f.link)},enabled=f.link.isNotEmpty() && f.policy.status==PurposeStatus.ACTIVE) { Text("Copy link") }
                        TextButton({qrLink=f.link},enabled=f.link.isNotEmpty() && f.policy.status==PurposeStatus.ACTIVE) { Text("QR") }
                    }
                    if(f.policy.status!=PurposeStatus.REVOKED) {
                        OutlinedButton({editFacet=f;editing=true},enabled=!a.busy) { Text("Edit rules / pause / revoke") }
                    }
                } }
                PurposePanel {
                    Text("Identity security",fontWeight=FontWeight.Medium)
                    Text("Keys stay in this app’s encrypted storage. No phone, email or public account-wide ID. The operator can still link your purposes through routing metadata.",color=PurposeMuted,fontSize=12.sp)
                    Text("Recovery is not available in this pilot. Do not clear app data or uninstall a working installation. A lost device cannot be restored from a password.",color=Color(0xFFFFD5A0),fontSize=12.sp)
                    OutlinedButton({},enabled=false) { Text("Encrypted recovery · not available") }
                }
            }
        }
        Spacer(Modifier.height(18.dp))
    }
}

@Composable private fun PurposeConversation(a:MainActivity,c:PurposeContact,back:()->Unit) {
    var text by remember(c.id) { mutableStateOf("") }
    var identity by remember(c.id) { mutableStateOf(false) }
    var confirmRevoke by remember(c.id) { mutableStateOf(false) }
    TextButton(back) { Text("‹ Chats") }
    Text(c.policy.displayName,fontSize=26.sp,fontWeight=FontWeight.SemiBold)
    Text("${contactStatus(c.status)} · ${c.policy.timezone} · text only",color=PurposeMint,fontSize=12.sp)
    Text("Messages expire seven days after sending, including queued time. Receiving requires Veil open and unlocked.",color=PurposeMuted,fontSize=11.sp)
    TextButton({identity=!identity}) { Text("Contact ${c.id.take(8)}",color=PurposeMuted,fontSize=11.sp)
                        Text(if(c.compared) "Safety number compared" else "Identity not compared · check number") }
    if(identity) {
        Text("Compare every group in person or on a trusted call. Both phones must show the same number.",fontSize=12.sp,color=PurposeMuted)
        Text(c.safetyNumber.chunked(5).chunked(3).joinToString("\n") { it.joinToString(" ") },fontFamily=FontFamily.Monospace,fontSize=18.sp)
        OutlinedButton({a.comparePurpose(c.id)},enabled=!a.busy && c.safetyNumber.length==60) { Text("We compared · it matches") }
    }
    if(c.owner && c.status=="PENDING") {
        Text("One introduction only. Approval gives access to this purpose, never to your other purposes.",color=PurposeMuted)
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            Button({a.decidePurpose(c.id,"APPROVED")},enabled=!a.busy) { Text("Approve") }
            TextButton({a.decidePurpose(c.id,"REJECTED")},enabled=!a.busy) { Text("Reject") }
            TextButton({a.decidePurpose(c.id,"BLOCKED")},enabled=!a.busy) { Text("Block") }
        }
    }
    if(c.messages.isEmpty())Text("Nothing available yet. Outside hours, introductions and messages remain concealed on the relay until this purpose opens.",color=PurposeMuted,fontSize=12.sp)
    c.messages.forEach { MessageBubble(it) {} }
    if(c.status=="APPROVED") {
        OutlinedTextField(text,{if(it.length<=4000)text=it},label={Text("Message this purpose")},maxLines=5,modifier=Modifier.fillMaxWidth())
        Button({a.sendPurpose(c.id,text) {text=""}},enabled=!a.busy && text.isNotBlank() && c.policy.status==PurposeStatus.ACTIVE) { Text("Send encrypted text") }
        Text(if(c.policy.outside==OutsideHours.ACCEPT_AND_QUEUE) "Outside hours: accepted ciphertext waits until open." else "Outside hours: server rejects new messages.",color=PurposeMuted,fontSize=11.sp)
        if(c.owner) {
            TextButton({confirmRevoke=!confirmRevoke}) { Text("Revoke access") }
            if(confirmRevoke) {
                Text("This permanently closes this grant and deletes undelivered messages. Already received copies can remain on their device.",color=Color(0xFFFFD5A0),fontSize=12.sp)
                OutlinedButton({a.decidePurpose(c.id,"REVOKED")},enabled=!a.busy) { Text("Confirm revocation") }
            }
        }
    }
}

@Composable internal fun PurposeEditor(existing:PurposeFacet?,onCancel:()->Unit,portable:Boolean=false,confirm:(PurposePolicy,Boolean)->Unit) {
    var p by remember(existing?.id) { mutableStateOf(existing?.policy ?: PurposePolicy.template("Professional").let { if(portable)it.copy(timezone=java.time.ZoneId.systemDefault().id) else it }) }
    var description by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }
    var instructionPending by remember { mutableStateOf(false) }
    var preview by remember { mutableStateOf(false) }
    var consent by remember { mutableStateOf(false) }
    var start by remember(p.start) { mutableStateOf("%02d:%02d".format(java.util.Locale.ROOT,p.start/60,p.start%60)) }
    var end by remember(p.end) { mutableStateOf("%02d:%02d".format(java.util.Locale.ROOT,p.end/60,p.end%60)) }
    var inactivity by remember(p.inactivityDays) { mutableStateOf(p.inactivityDays.toString()) }
    TextButton({if(preview)preview=false else onCancel()}) { Text("‹ Back") }
    Text(if(preview) "Review your rules" else if(existing==null) "Create a purpose" else "Edit your purpose",fontSize=27.sp,fontWeight=FontWeight.SemiBold)
    if(preview) {
        Text(p.summary(),lineHeight=24.sp)
        Text("Status: ${p.status.name.lowercase()}. ${if(p.status==PurposeStatus.REVOKED) "Revocation is permanent and deletes queued ciphertext." else "Changing this purpose does not affect your other purposes."}",color=PurposeMuted,fontSize=12.sp)
        if(p.discovery==DiscoveryMode.PUBLIC_SEARCHABLE) {
            Row { Checkbox(consent,{consent=it});Text("Publish this name, description and rules in the shared directory.",fontSize=13.sp) }
        }
        Button({confirm(p,consent)},enabled=p.discovery!=DiscoveryMode.PUBLIC_SEARCHABLE || consent,modifier=Modifier.fillMaxWidth()) { Text("Confirm these rules") }
        return
    }
    if(existing==null) {
        Row(horizontalArrangement=Arrangement.spacedBy(4.dp)) {
            listOf("Professional","Personal","Temporary sale").forEach { name -> TextButton({p=PurposePolicy.template(name).let {if(portable)it.copy(timezone=java.time.ZoneId.systemDefault().id) else it};problem="";description="";instructionPending=false},contentPadding=PaddingValues(4.dp)) { Text(name,fontSize=11.sp) } }
        }
        OutlinedTextField(description,{if(it.length<=500)description=it;instructionPending=it.isNotBlank()},label={Text("Describe your rules (optional)")},modifier=Modifier.fillMaxWidth())
        TextButton({runCatching { if(portable) PurposePolicy.interpretGlobal(description) else PurposePolicy.interpret(description) }.onSuccess { p=it;problem="";instructionPending=false }.onFailure { instructionPending=true;problem=it.message.orEmpty() }}) { Text("Interpret supported wording") }
        if(instructionPending)TextButton({description="";problem="";instructionPending=false}) { Text("Discard instruction and use the form") }
        Text(if(portable) "Supported example: Weekdays, 9-6 local time; intro allowed, further messages require approval; text only." else "Supported example: Weekdays, 9-6 India time; intro allowed, further messages require approval; text only.",fontSize=11.sp,color=PurposeMuted)
    }
    if(problem.isNotEmpty())Text(problem,color=Color(0xFFFFD5A0),fontSize=12.sp)
    OutlinedTextField(p.displayName,{p=p.copy(displayName=it.take(60))},label={Text("Purpose name")},modifier=Modifier.fillMaxWidth())
    OutlinedTextField(p.description,{p=p.copy(description=it.take(240))},label={Text("Description / search keywords")},modifier=Modifier.fillMaxWidth())
    Text("Who can discover this?",fontWeight=FontWeight.Medium)
    DiscoveryMode.entries.forEach { d -> FilterChip(p.discovery==d,{p=p.copy(discovery=d)},label={Text(PurposePolicy.discoveryLabel(d))}) }
    Text("Contact requests",fontWeight=FontWeight.Medium)
    listOf(RequestMode.REQUEST_APPROVAL to "One intro, then approval",RequestMode.AUTO_ACCEPT_WITH_LIMITS to "Auto-approve, with rate limits",RequestMode.DISABLED to "No new requests").filter { !portable || it.first!=RequestMode.AUTO_ACCEPT_WITH_LIMITS }.forEach { (r,label) -> FilterChip(p.requests==r,{p=p.copy(requests=r)},label={Text(label)}) }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        FilterChip(p.weekdays==(1..5).toList(),{p=p.copy(weekdays=(1..5).toList())},label={Text("Weekdays")})
        FilterChip(p.weekdays==(1..7).toList(),{p=p.copy(weekdays=(1..7).toList())},label={Text("Every day")})
    }
    OutlinedTextField(p.timezone,{p=p.copy(timezone=it)},label={Text("IANA timezone, e.g. Europe/London")},modifier=Modifier.fillMaxWidth())
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(start,{start=it.take(5)},label={Text("From HH:MM")},modifier=Modifier.weight(1f))
        OutlinedTextField(end,{end=it.take(5)},label={Text("Until HH:MM")},modifier=Modifier.weight(1f))
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        FilterChip(p.outside==OutsideHours.ACCEPT_AND_QUEUE,{p=p.copy(outside=OutsideHours.ACCEPT_AND_QUEUE)},label={Text("Queue outside hours")})
        FilterChip(p.outside==OutsideHours.REJECT,{p=p.copy(outside=OutsideHours.REJECT)},label={Text("Reject")})
    }
    OutlinedTextField(inactivity,{inactivity=it.take(2)},label={Text("Expire access after inactive days (1–90)")},modifier=Modifier.fillMaxWidth())
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        FilterChip(p.expiresAt==0L,{p=p.copy(expiresAt=0)},label={Text("No purpose expiry")})
        FilterChip(p.expiresAt>0,{p=p.copy(expiresAt=now()/1000+7*86400)},label={Text("Expires in 7 days")})
    }
    if(existing!=null) PurposeStatus.entries.forEach { status -> FilterChip(p.status==status,{p=p.copy(status=status)},label={Text(status.name.lowercase().replaceFirstChar { it.uppercase() })}) }
    Text(if(portable) "Text only · one introduction · silent in-app delivery. Encrypted recovery preserves control and approved grants, not message history. Original chat media remains available." else "Text only · one introduction · silent in-app delivery. Documents, media, holidays and recovery are not enabled for purposes yet. Original chat media remains available.",fontSize=12.sp,color=PurposeMuted)
    Button({
        runCatching {
            fun minutes(v:String):Int { require(v.matches(Regex("[0-9]{2}:[0-9]{2}")));val parts=v.split(':').map(String::toInt);require(parts[1] in 0..59);return parts[0]*60+parts[1] }
            p.copy(start=minutes(start),end=minutes(end),inactivityDays=inactivity.toInt(),version=if(existing==null)1 else existing.policy.version+1).validate()
        }.onSuccess { p=it;preview=true;consent=false;problem="" }.onFailure { problem="Check the name, timezone, hours and expiry. Nothing has been activated." }
    },enabled=!instructionPending,modifier=Modifier.fillMaxWidth()) { Text("Review rules") }
}

@Composable private fun PurposePanel(content:@Composable ColumnScope.()->Unit) {
    Column(Modifier.fillMaxWidth().background(Color(0xFF141E24),RoundedCornerShape(20.dp)).padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp),content=content)
}
