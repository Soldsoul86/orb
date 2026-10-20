package chat.veil

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import org.json.JSONObject

internal fun contactEntries(a:JSONArray?):List<JSONObject> = if(a==null)emptyList() else (0 until a.length()).map(a::getJSONObject)

@Composable private fun Heading(title:String,detail:String) {
    Text(title,fontSize=30.sp,lineHeight=36.sp,fontWeight=FontWeight.SemiBold)
    Text(detail,color=MaterialTheme.colorScheme.onSurfaceVariant,fontSize=16.sp,lineHeight=23.sp)
}
@Composable private fun Action(label:String,enabled:Boolean=true,onClick:()->Unit) {
    Button(onClick,enabled=enabled,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp)){Text(label,fontSize=16.sp)}
}
@Composable internal fun InvitationSummary(kind:ContactExperience.Kind,p:PurposePolicy) {
    Text("Private invitation · not listed publicly",fontSize=14.sp)
    Text("Invitation expires 7 days after creation.",fontSize=16.sp)
    Text("After you accept a request, access lasts ${ContactExperience.accessSeconds(kind)/86400} days.",fontSize=16.sp)
    Text("Text messages only. You approve each person. Sharing does not reserve the link for one recipient.",fontSize=14.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
    if(kind==ContactExperience.Kind.WORK) {
        Text("${if(p.weekdays==(1..5).toList())"Monday–Friday" else "Selected days"} · %02d:%02d–%02d:%02d".format(p.start/60,p.start%60,p.end/60,p.end%60),fontSize=16.sp)
        Text("Times use ${p.timezone}, following local daylight-saving changes. Introductions can be submitted any time. ${if(p.outside==OutsideHours.ACCEPT_AND_QUEUE)"Outside hours, messages wait for delivery." else "Outside hours, new messages are rejected."} You see them during contact hours. Notifications are silent and in-app only.",fontSize=14.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Ordinary navigation exposes actions and time limits; signed identity machinery stays underneath. */
@Composable fun ColumnScope.ContactHome(a:MainActivity) {
    val s=a.portableSnapshot
    val facets=contactEntries(s?.optJSONArray("facets"));val contacts=contactEntries(s?.optJSONArray("contacts"))
    val page=a.contactPage
    val scroll=rememberScrollState()
    LaunchedEffect(page,a.section){scroll.scrollTo(0)}
    BackHandler(page!="home") {a.dismissContactLink()}
    if(page in setOf("backup","import","advanced","migrate","address","oldchat")) {
        val advancedPage=when(page){"advanced"->"home";"address"->"card";"oldchat"->"chat";else->page}
        PortableHome(a,advancedPage,a.contactSelected){a.contactPage="home"}
        return
    }
    LaunchedEffect(Unit) {if(s==null && !a.busy)a.contactAction({})}
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        if(page!="home")TextButton({a.dismissContactLink()},modifier=Modifier.heightIn(min=48.dp)){Text("‹ Back",fontSize=16.sp)}
        if(a.portableNotice.isNotBlank())Surface(color=MaterialTheme.colorScheme.secondaryContainer,shape=MaterialTheme.shapes.medium) {
            Text(a.portableNotice,Modifier.padding(14.dp),fontSize=14.sp,color=MaterialTheme.colorScheme.onSecondaryContainer)
        }
        when(page) {
            "new" -> {
                Heading("New contact","Choose how this person can reach you.")
                ContactExperience.Kind.entries.forEach {kind ->
                    Card(onClick={a.contactPage="draft:${kind.name}"},modifier=Modifier.fillMaxWidth().heightIn(min=72.dp),enabled=!a.busy) {
                        Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
                            Text(kind.title,fontSize=21.sp,fontWeight=FontWeight.Medium);Text(kind.detail,fontSize=15.sp)
                        }
                    }
                }
                Text("No phone number or email needed. Your identity is created on this device when you make a QR code.",fontSize=14.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
            "invitation" -> {
                val f=facets.firstOrNull {it.getString("id")==a.contactSelected};val invite=f?.optJSONObject("invitation")
                Heading("Your invitation QR","Let your friend scan this with their phone camera.")
                if(invite==null) {Text("Opening invitation…");Action("Refresh",!a.busy){a.contactAction({})}}
                else {
                    val link=invite.optString("link")
                    Text(if(invite.optBoolean("cancel_pending"))"Cancellation waiting to send" else if(invite.optBoolean("canceled"))"Invitation canceled" else "Invitation expires ${ContactExperience.date(invite.getLong("expires"))}")
                    Text("Accepted access lasts ${invite.getLong("access_seconds")/86400} days from approval. Canceling the invitation does not end already accepted access.",fontSize=14.sp)
                    if(link.isNotBlank()) {
                        val bitmap=remember(link){PurposeQr.renderPortable(link)}
                        DisposableEffect(bitmap){onDispose{bitmap.recycle()}}
                        Image(bitmap.asImageBitmap(),"Invitation QR code",Modifier.fillMaxWidth().aspectRatio(1f))
                        Text("No Veil yet? The QR opens a download page. After installing, return to that page and tap Continue in Veil.",fontSize=15.sp)
                        Text("Already installed? Scan to review the invitation and request contact. You approve before chatting.",fontSize=14.sp)
                        OutlinedButton(a::shareContactLink,enabled=!a.busy,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text("Share link instead")}
                        TextButton({a.copyContactLink(link)},modifier=Modifier.heightIn(min=48.dp)){Text("Copy link")}
                        TextButton({val id=a.contactSelected;a.contactAction({cancelInvitation(id)})},enabled=!a.busy,modifier=Modifier.heightIn(min=48.dp)){Text("Cancel invitation")}
                    } else if(!invite.optBoolean("ready") && !invite.optBoolean("canceled") && invite.getLong("expires")>System.currentTimeMillis()/1000) {
                        Text("This invitation has not finished setting up. Retry with the same saved identity.",fontSize=14.sp)
                        Action("Resume invitation",!a.busy){a.resumeContact(a.contactSelected)}
                    } else Text("This link can no longer accept new requests. Create a new contact to invite again.")
                    if(invite.optBoolean("cancel_pending")) {
                        Text("The link may still accept requests until cancellation reaches the service.",fontSize=14.sp)
                        Action("Retry cancellation",!a.busy){val id=a.contactSelected;a.contactAction({cancelInvitation(id)})}
                    }
                }
            }
            "open","receive" -> {
                var input by remember {mutableStateOf("")};var intro by remember {mutableStateOf("")}
                Heading("An invitation to talk","Review the rules before requesting contact.")
                if(page=="open") {
                    OutlinedTextField(input,{input=it.take(2500)},label={Text("Paste invitation link")},modifier=Modifier.fillMaxWidth())
                    Action("Preview invitation",!a.busy && input.isNotBlank()){a.openContactLink(input)}
                } else {
                    val preview=a.contactPreview
                    if(preview==null) {
                        Text("If this link has expired or was canceled, ask for a new invitation. Opening a link never sends a request.",fontSize=14.sp)
                        Action("Retry preview",!a.busy){a.openContactLink(a.contactIncoming)}
                    } else {
                        val p=PurposePolicy.from(preview.getJSONObject("policy"))
                        Text(p.displayName,fontSize=24.sp)
                        Text("Invitation expires ${ContactExperience.date(preview.getLong("expires"))}")
                        Text(ContactExperience.summary(p,preview.getLong("access_seconds")),fontSize=16.sp)
                        Text("The name is chosen by the sender. Confirm who shared this link through a trusted channel.",fontSize=14.sp)
                        Text("${p.timezone} · Contact hours %02d:%02d–%02d:%02d".format(p.start/60,p.start%60,p.end/60,p.end%60),fontSize=14.sp)
                        Text("One introduction may be submitted any time. Further messages need acceptance. Delivery follows their contact hours; notifications are silent in-app.",fontSize=14.sp)
                        OutlinedTextField(intro,{intro=it.take(4000)},label={Text("Introduce yourself")},modifier=Modifier.fillMaxWidth(),minLines=2)
                        Action("Request contact",!a.busy && intro.isNotBlank()){a.requestContact(intro)}
                    }
                }
            }
            "chat" -> {
                val c=contacts.firstOrNull {it.getString("id")==a.contactSelected}
                if(c==null){Text("Opening conversation…");Action("Refresh",!a.busy){a.contactAction({})}}
                else ContactChat(a,c)
            }
            "move" -> {
                Heading("Move my identity","Keep your identity when you change services.")
                Text("Old chat history does not move. Send each contact your new contact address through another trusted channel after moving. Reconnection is not automatic.",fontSize=16.sp)
                facets.forEach {f->OutlinedButton({a.contactSelected=f.getString("id");a.contactPage="migrate"},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text(f.getJSONObject("policy").getString("display_name"))}}
                if(facets.isEmpty())Text("Create a contact before moving an identity.")
            }
            else -> if(page.startsWith("draft:")) {
                val kind=ContactExperience.Kind.valueOf(page.substringAfter(':'))
                var p by remember(page){mutableStateOf(ContactExperience.policy(kind))}
                var rules by remember {mutableStateOf(false)}
                Heading(if(kind==ContactExperience.Kind.TEMPORARY)"Temporary contact" else kind.title,"Talk privately without sharing your phone number or email.")
                InvitationSummary(kind,p)
                if(rules) ContactRules(p,{p=it;rules=false},{rules=false})
                else {
                    Action(if(a.busy)"Preparing invitation…" else "Create QR invitation",!a.busy){a.prepareContact(kind,p)}
                    TextButton({rules=true},enabled=!a.busy,modifier=Modifier.heightIn(min=48.dp)){Text("Change rules")}
                    Text(if(a.busy)"Connecting securely. The service can take up to a minute to wake up." else "If setup fails, retry here. Veil keeps the same saved invitation.",fontSize=14.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else when(a.section) {
                0 -> {
                    Heading("Chats","A small circle. On your terms.")
                    Action("New contact",!a.busy,a::newContact)
                    if(contacts.isEmpty())Text("Your conversations will appear here. Start by creating an invitation QR.",fontSize=16.sp)
                    contacts.sortedBy {if(it.getString("status")=="PENDING")0 else 1}.forEach {c ->
                        Card(onClick={a.contactSelected=c.getString("id");a.contactPage="chat"},modifier=Modifier.fillMaxWidth().heightIn(min=76.dp)) {
                            Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(6.dp)) {
                                Text(c.getJSONObject("policy").getString("display_name"),fontSize=19.sp,fontWeight=FontWeight.Medium)
                                Text(ContactExperience.status(c),fontSize=14.sp)
                                if(c.getString("status")=="PENDING" && c.getString("local")==c.getString("owner"))Text("Review request",fontSize=14.sp)
                            }
                        }
                    }
                    TextButton({a.contactPage="open"},enabled=!a.busy,modifier=Modifier.heightIn(min=48.dp)){Text("Open an invitation")}
                    OutlinedButton({a.contactPage="personal"},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text("Personal media chat")}
                    Text("Photos, videos and Eyes-Only are available in personal media chat. New contact invitations currently support text.",fontSize=14.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
                1 -> {
                    Heading("Ways to reach me","Private invitations with clear boundaries.")
                    Action("New contact",!a.busy,a::newContact)
                    facets.filter {it.has("invitation")}.forEach {f ->
                        OutlinedButton({a.contactSelected=f.getString("id");a.contactPage="invitation"},modifier=Modifier.fillMaxWidth().heightIn(min=56.dp)) {
                            Text(f.getJSONObject("policy").getString("display_name"))
                        }
                    }
                    if(facets.none {it.has("invitation")})Text("Create your first invitation QR to choose who can reach you.")
                    Text("Each invitation has its own identity. Your contacts do not receive a universal profile or ownership key.",fontSize=14.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
                else -> {
                    Heading("Settings","Your identity stays yours.")
                    Action("Back up my identity",!a.busy){if(s?.optBoolean("ready")==true)a.contactPage="backup" else a.contactAction({createIdentity()}){a.contactPage="backup"}}
                    OutlinedButton({a.contactPage="import"},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text("Restore my identity")}
                    OutlinedButton({a.contactPage="move"},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text("Move my identity")}
                    Text("Keep the recovery key separately from the encrypted backup. We cannot reset it. Backups preserve identity and relationships, not message history.",fontSize=14.sp)
                    HorizontalDivider()
                    Text("Capture protection is on. Another camera can still photograph your screen. Contacts must compare safety numbers before relying on a name.",fontSize=14.sp)
                    TextButton({a.contactPage="advanced"},modifier=Modifier.heightIn(min=48.dp)){Text("Advanced identity controls")}
                }
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable private fun ContactChat(a:MainActivity,c:JSONObject) {
    val id=c.getString("id");val owner=c.getString("local")==c.getString("owner")
    var text by remember(id){mutableStateOf("")};var details by remember(id){mutableStateOf(false)};var end by remember(id){mutableStateOf(false)}
    Heading(c.getJSONObject("policy").getString("display_name"),ContactExperience.status(c))
    if(c.getString("status")=="APPROVED" && c.optLong("access_expires")>0)Text("Access ends ${ContactExperience.date(c.getLong("access_expires"))}",fontSize=14.sp)
    Text("Encrypted text · messages expire after 7 days",fontSize=14.sp)
    if(c.optBoolean("access_change_pending"))Text("This access change has not reached the service. Tap Refresh / retry to send it.",fontSize=14.sp)
    OutlinedButton({a.contactAction({syncContact(id)})},enabled=!a.busy,modifier=Modifier.heightIn(min=48.dp)){Text("Refresh / retry")}
    contactEntries(c.optJSONArray("messages")).forEach {m->Card(Modifier.fillMaxWidth()) {Column(Modifier.padding(16.dp)) {
        Text(if(m.optBoolean("mine"))"You" else "Contact",fontSize=14.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
        Text(m.getString("text"),fontSize=17.sp)
    }}}
    if(owner && c.getString("status")=="PENDING") {
        Text("Accepting starts ${c.optLong("access_seconds",ContactExperience.WEEK)/86400} days of access.",fontSize=14.sp)
        Action("Accept",!a.busy){a.contactAction({decide(id,"APPROVED")})}
        OutlinedButton({a.contactAction({decide(id,"REJECTED")})},enabled=!a.busy,modifier=Modifier.heightIn(min=48.dp)){Text("Decline")}
    }
    if(c.getString("status")=="APPROVED" && c.optLong("access_expires")>System.currentTimeMillis()/1000) {
        if(end) {
            // Keep confirmation inside the secured Activity. A separate Dialog window
            // would correctly trigger the app's conceal-on-focus-loss protection.
            Card(Modifier.fillMaxWidth()) {Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Text("End access?",fontSize=21.sp,fontWeight=FontWeight.Medium)
                Text("This person will no longer be able to send or fetch messages through this relationship. Copies they already made cannot be removed.",fontSize=15.sp)
                Action("End access",!a.busy){end=false;a.contactAction({decide(id,"REVOKED")})}
                TextButton({end=false},modifier=Modifier.heightIn(min=48.dp)){Text("Keep access")}
            }}
        } else {
            OutlinedTextField(text,{text=it.take(4000)},label={Text("Message")},modifier=Modifier.fillMaxWidth(),maxLines=5)
            Action("Send",!a.busy && text.isNotBlank() && !c.optBoolean("pending")){val body=text;a.contactAction({send(id,body)}){text=""}}
            if(owner)TextButton({end=true},enabled=!a.busy,modifier=Modifier.heightIn(min=48.dp)){Text("End access")}
        }
    }
    TextButton({details=!details},modifier=Modifier.heightIn(min=48.dp)){Text(if(details)"Hide details" else "Contact details")}
    if(details) {
        Text("Compare every group with your contact through a trusted channel. A name or shared link alone does not verify a person.",fontSize=14.sp)
        Text(c.getString("safety").chunked(5).chunked(3).joinToString("\n"){it.joinToString(" ")},fontFamily=FontFamily.Monospace,fontSize=16.sp)
        TextButton({a.contactPage="oldchat"},modifier=Modifier.heightIn(min=48.dp)){Text("Update contact address / advanced details")}
    }
}

@Composable private fun ContactRules(p:PurposePolicy,save:(PurposePolicy)->Unit,cancel:()->Unit) {
    var name by remember{mutableStateOf(p.displayName)};var zone by remember{mutableStateOf(p.timezone)}
    var start by remember{mutableStateOf("%02d:%02d".format(p.start/60,p.start%60))};var finish by remember{mutableStateOf("%02d:%02d".format(p.end/60,p.end%60))}
    var weekdays by remember{mutableStateOf(p.weekdays==(1..5).toList())};var queue by remember{mutableStateOf(p.outside==OutsideHours.ACCEPT_AND_QUEUE)}
    var error by remember{mutableStateOf("")}
    OutlinedTextField(name,{name=it.take(60)},label={Text("Contact name")},modifier=Modifier.fillMaxWidth())
    OutlinedTextField(zone,{zone=it.take(80)},label={Text("Timezone, for example Asia/Kolkata")},modifier=Modifier.fillMaxWidth())
    OutlinedTextField(start,{start=it.take(5)},label={Text("Start time · 24-hour HH:mm")},modifier=Modifier.fillMaxWidth())
    OutlinedTextField(finish,{finish=it.take(5)},label={Text("End time · 24-hour HH:mm")},modifier=Modifier.fillMaxWidth())
    Row {Checkbox(weekdays,{weekdays=it});Text("Weekdays only",Modifier.padding(top=12.dp))}
    Row {Checkbox(queue,{queue=it});Text("Queue outside hours",Modifier.padding(top=12.dp))}
    Text("Invitations remain private and require approval. Only text is supported. The invitation and accepted-access timers stay separate.",fontSize=14.sp)
    if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error)
    Action("Apply rules") {
        fun time(v:String):Int {require(v.matches(Regex("[0-9]{2}:[0-9]{2}")));val h=v.take(2).toInt();val m=v.takeLast(2).toInt();require(h in 0..24 && m in 0..59 && (h<24 || m==0));return h*60+m}
        runCatching{p.copy(displayName=name,timezone=zone,start=time(start),end=time(finish),weekdays=if(weekdays)(1..5).toList() else (1..7).toList(),outside=if(queue)OutsideHours.ACCEPT_AND_QUEUE else OutsideHours.REJECT).validate()}.onSuccess(save).onFailure{error="Use a valid timezone and a start time before the end time. Overnight hours are not supported."}
    }
    TextButton(cancel,modifier=Modifier.heightIn(min=48.dp)){Text("Cancel changes")}
}
