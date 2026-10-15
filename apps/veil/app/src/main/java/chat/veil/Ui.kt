package chat.veil

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay

private val Ink = Color(0xFF0B1014)
private val Panel = Color(0xFF141E24)
private val Mint = Color(0xFFB5F4CF)
private val Muted = Color(0xFF91A5AF)
private val Shape = RoundedCornerShape(22.dp)

@Composable fun VeilApp(activity: MainActivity) {
    // Read in this scope, not only inside Surface's child composition or SideEffect.
    // Otherwise unlocking can recompose the screen without rerunning the curtain effect.
    val unlocked = activity.unlocked
    SideEffect { activity.contentCommitted(unlocked) }
    MaterialTheme(colorScheme = darkColorScheme(primary = Mint, background = Ink, surface = Panel, onSurface = Color(0xFFE8F0F2), secondary = Mint)) {
        Surface(Modifier.fillMaxSize(), color = Ink) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(horizontal = 22.dp)) {
                Row(Modifier.fillMaxWidth().padding(vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("veil", fontSize = 30.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-1).sp)
                    Spacer(Modifier.weight(1f)); Text("A LITTLE MORE PRIVATE", color = Mint, fontSize = 9.sp, letterSpacing = 1.5.sp)
                }
                if (!unlocked) {
                    Spacer(Modifier.weight(1f))
                    Text("Just between\nyou two.", fontSize = 43.sp, lineHeight = 48.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(20.dp))
                    Text("Private conversations. Media that stays under your touch.", color = Muted, fontSize = 17.sp, lineHeight = 25.sp)
                    Spacer(Modifier.height(32.dp))
                    Button(onClick = activity::unlock, modifier = Modifier.fillMaxWidth().height(54.dp)) { Text("Unlock Veil") }
                    Text(activity.notice, color = Muted, modifier = Modifier.padding(top = 14.dp))
                    Spacer(Modifier.weight(1f))
                    Text("Screens can still be photographed.\nPrivacy is a shared responsibility.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 24.dp))
                } else {
                    if (activity.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                    if (activity.notice.isNotEmpty()) Text(activity.notice, color = Color(0xFFFFD5A0), fontSize = 12.sp, modifier = Modifier.padding(vertical = 8.dp))
                    val snap = activity.snapshot
                    when {
                        snap == null -> Text("Opening your private space…", color = Muted)
                        !snap.ready -> Setup(activity)
                        !snap.paired -> Pairing(activity)
                        !snap.verified -> Identity(activity, snap)
                        activity.viewer != null -> Viewer(activity)
                        else -> Conversations(activity, snap)
                    }
                }
            }
        }
    }
}

@Composable private fun Setup(a: MainActivity) {
    var relay by remember { mutableStateOf("") }
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Spacer(Modifier.height(28.dp))
        Text("A quiet place\nfor two.", fontSize = 36.sp, lineHeight = 41.sp, fontWeight = FontWeight.SemiBold)
        Text("Connect both phones to the same relay. It delivers encrypted envelopes; your keys stay on your phones.", color = Muted, lineHeight = 23.sp)
        OutlinedTextField(relay, { relay = it }, label = { Text("Relay HTTPS address") }, placeholder = { Text("https://relay.example.com") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
        Button({ a.setup(relay) }, enabled = !a.busy && relay.startsWith("https://"), modifier = Modifier.fillMaxWidth()) { Text("Create my private inbox") }
        PrivacyCard("01  Pair privately", "Exchange invitations, then compare identity codes together.")
        PrivacyCard("02  Choose the moment", "Protected is the default. Eyes-Only adds hold-to-read text and concealed media.")
        Text("Early development build · one conversation per installation", fontSize = 12.sp, color = Muted)
    }
}
@Composable private fun Pairing(a: MainActivity) {
    var invite by remember { mutableStateOf("") }
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Invite one person.", fontSize = 30.sp, fontWeight = FontWeight.SemiBold)
        Text("Both phones exchange an invitation. Share yours before importing theirs. Invitations expire after 24 hours.", color = Muted)
        Button(a::createInvite, enabled = !a.busy, modifier = Modifier.fillMaxWidth()) { Text("Prepare my invitation") }
        if (a.invitation.isNotEmpty()) {
            Text("Invitation ready. Send it through a trusted channel, or transfer it in person.", color = Mint)
            OutlinedButton(a::shareInvite, modifier = Modifier.fillMaxWidth()) { Text("Share invitation") }
        }
        OutlinedTextField(invite, { if (it.length < 8192) invite = it }, label = { Text("Their invitation") }, minLines = 3, maxLines = 5, modifier = Modifier.fillMaxWidth())
        Button({ a.pair(invite.trim()) }, enabled = !a.busy && invite.startsWith("veil1:"), modifier = Modifier.fillMaxWidth()) { Text("Connect this person") }
        Text("Invitations contain public encryption keys and permission to send to your inbox. They never contain your private keys.", color = Muted, fontSize = 12.sp)
    }
}
@Composable private fun Identity(a: MainActivity, s: Snapshot) {
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("Make sure it’s them.", fontSize = 30.sp, fontWeight = FontWeight.SemiBold)
        Text("Compare these complete codes in person or on a trusted call. Your code must match “Their identity” on their phone, and vice versa.", color = Muted)
        PrivacyCard("Your identity", s.localFingerprint.chunked(4).joinToString(" "))
        PrivacyCard("Their identity", s.peerFingerprint.chunked(4).joinToString(" "))
        Button(a::verify, enabled = !a.busy, modifier = Modifier.fillMaxWidth()) { Text("We compared both codes · they match") }
        Text("If either code differs, stop. Reset app data and exchange new invitations. Veil will not silently accept a changed identity.", color = Muted, fontSize = 12.sp)
    }
}
@Composable private fun ColumnScope.Conversations(a: MainActivity, s: Snapshot) {
    var chat by remember { mutableStateOf(false) }
    var identity by remember { mutableStateOf(false) }
    BackHandler(chat || identity) { chat = false; identity = false }
    if (identity) {
        TextButton({ identity = false }) { Text("‹ Conversation") }
        PrivacyCard("Your identity", s.localFingerprint.chunked(4).joinToString(" "))
        Spacer(Modifier.height(16.dp))
        PrivacyCard("Their identity", s.peerFingerprint.chunked(4).joinToString(" "))
    } else if (!chat) {
        Spacer(Modifier.height(24.dp))
        Text("Your conversations", fontSize = 27.sp, fontWeight = FontWeight.SemiBold)
        Text("Small circle. Clear boundaries.", color = Muted, modifier = Modifier.padding(top = 8.dp, bottom = 28.dp))
        Surface(onClick = { chat = true }, shape = Shape, color = Panel, modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(22.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).background(Mint.copy(alpha = .1f), RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) { Text("◈", fontSize = 26.sp, color = Mint) }
                Column(Modifier.weight(1f).padding(start = 16.dp)) {
                    Text("Your person", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                    Text("Identity compared · ${s.peerFingerprint.take(8)}", color = Muted, fontSize = 11.sp)
                    Text(if (s.pending > 0) "${s.pending} queued" else "Tap to open privately", color = Mint, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                }
                Text("›", fontSize = 28.sp, color = Muted)
            }
        }
        Spacer(Modifier.height(28.dp))
        PrivacyCard("Made for the moment", "Hold protected media to reveal it. Let go and it disappears from view. Moving marks remind us who it was meant for.")
    } else Chat(a, s, { chat = false }, { identity = true })
}
@Composable private fun ColumnScope.Chat(a: MainActivity, s: Snapshot, back: () -> Unit, identity: () -> Unit) {
    var text by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(Mode.PROTECTED) }
    var ttl by remember { mutableLongStateOf(3_600_000L) }
    var viewLimit by remember { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(back) { Text("‹") }
        Column(Modifier.weight(1f)) { Text("Your person", fontWeight = FontWeight.SemiBold, fontSize = 21.sp); Text("Signal encryption · identity compared", fontSize = 11.sp, color = Mint) }
        TextButton(identity) { Text("Identity", fontSize = 11.sp) }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Mode.entries.forEach { item -> FilterChip(mode == item, { mode = item }, label = { Text(item.label, fontSize = 11.sp) }) }
    }
    Text(when (mode) {
        Mode.NORMAL -> "Open on tap. Capture restrictions stay on in Veil."
        Mode.PROTECTED -> "Hold media to reveal · moving recipient watermark"
        Mode.EYES_ONLY -> "Hold text and media to reveal · release to conceal"
    }, color = Muted, fontSize = 11.sp, modifier = Modifier.padding(bottom = 8.dp))
    LazyColumn(Modifier.weight(1f).fillMaxWidth(), reverseLayout = true, verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(vertical = 12.dp)) {
        items(s.messages.asReversed(), key = { it.id }) { m -> MessageBubble(m) { a.open(m.id) } }
        if (s.messages.isEmpty()) item { PrivacyCard("Say something worth keeping private.", "Messages disappear after the time you choose. There are no previews outside Veil.") }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Disappears in", color = Muted, fontSize = 11.sp)
        listOf(60_000L to "1m", 3_600_000L to "1h", 86_400_000L to "1d").forEach { (value, label) ->
            TextButton({ ttl = value }, contentPadding = PaddingValues(6.dp)) { Text(label, color = if (ttl == value) Mint else Muted) }
        }
    }
    if (a.attachment != null) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (a.attachment!!.first.startsWith("video")) "Video attached" else "Photo attached", Modifier.weight(1f), color = Mint)
            TextButton(a::removeAttachment) { Text("Remove") }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(viewLimit, { viewLimit = it }); Text("15 seconds from first opening", color = Muted, fontSize = 12.sp)
        }
    }
    Row(Modifier.padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(a::attach, enabled = !a.busy, contentPadding = PaddingValues(0.dp), modifier = Modifier.size(48.dp)) { Text("+", fontSize = 26.sp) }
        OutlinedTextField(text, { if (it.length <= 4000) text = it }, placeholder = { Text("Just for them", fontSize = 13.sp) }, modifier = Modifier.weight(1f), maxLines = 4, shape = RoundedCornerShape(24.dp),
            keyboardOptions = KeyboardOptions(autoCorrectEnabled = false))
        Button({ a.send(text, mode, ttl, if (viewLimit) 15_000 else 0) { text = "" } }, enabled = !a.busy && (text.isNotBlank() || a.attachment != null), contentPadding = PaddingValues(0.dp), modifier = Modifier.size(48.dp)) { Text("↑", fontSize = 24.sp) }
    }
    Text("JPEG / PNG / WebP / MP4 · up to 5 MiB · video up to 15s", color = Muted, fontSize = 9.sp, modifier = Modifier.padding(bottom = 8.dp))
}
@Composable private fun MessageBubble(m: ChatMessage, open: () -> Unit) {
    var held by remember(m.id) { mutableStateOf(false) }
    var clock by remember { mutableLongStateOf(now()) }
    LaunchedEffect(m.expires) { while (true) { delay(250); clock = now() } }
    if (clock >= m.expires) return
    val visible = m.mode != Mode.EYES_ONLY || held
    val gesture = if (m.kind == "text" && m.mode == Mode.EYES_ONLY) Modifier.pointerInput(m.id) {
        detectTapGestures(onPress = { held = true; try { tryAwaitRelease() } finally { held = false } })
    } else if (m.kind != "text") Modifier.clickable(onClick = open) else Modifier
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (m.mine) Arrangement.End else Arrangement.Start) {
        Column(Modifier.widthIn(max = 300.dp).background(if (m.mine) Color(0xFF1E3632) else Panel, Shape).then(gesture).padding(16.dp)) {
            Text(if (m.kind == "text") { if (visible) m.text else "Hold to read" } else if (m.kind == "photo") "◈  Private photo\nTap to open" else "▷  Private video\nTap to open", lineHeight = 22.sp)
            Spacer(Modifier.height(8.dp))
            val remaining = ((m.expires-clock)/1000).coerceAtLeast(0)
            Text("${m.mode.label} · ${if (remaining >= 60) "${remaining/60}m" else "${remaining}s"} · ${m.status}", color = Muted, fontSize = 9.sp)
        }
    }
}
@Composable private fun ColumnScope.Viewer(a: MainActivity) {
    val data = a.viewer ?: return
    BackHandler { a.closeViewer() }
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(a::closeViewer) { Text("‹ Close") }
        Spacer(Modifier.weight(1f)); Text(data.first.mode.label, color = Mint, fontSize = 13.sp)
    }
    Text("Meant for ${data.first.watermark}", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(vertical = 12.dp))
    AndroidView(factory = { context ->
        android.widget.FrameLayout(context).apply {
            try {
                val media = SecureMediaView(context, data.first, data.second) { a.closeViewer() }
                addView(media, android.widget.FrameLayout.LayoutParams(-1, -1))
                a.concealPlayer = media::conceal
            } catch (_: Exception) {
                addView(android.widget.TextView(context).apply { this.text = "This media could not be opened." })
            }
        }
    }, modifier = Modifier.weight(1f).fillMaxWidth(), onReset = null, onRelease = {
        (it.getChildAt(0) as? SecureMediaView)?.dispose(); a.concealPlayer = null
    })
    Text(if (data.first.viewMs > 0) "15-second opening · release to hide" else "Release to hide · leave the app to lock", color = Mint, fontSize = 12.sp, modifier = Modifier.padding(top = 18.dp))
    Text("Moving marks discourage sharing. They aren’t proof of who made a copy. Another camera can still capture this screen.", color = Muted, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.padding(vertical = 16.dp))
}
@Composable private fun PrivacyCard(title: String, body: String) {
    Column(Modifier.fillMaxWidth().background(Panel, Shape).border(1.dp, Color(0xFF243239), Shape).padding(20.dp)) {
        Text(title, color = Mint, fontWeight = FontWeight.Medium)
        Text(body, color = Muted, fontSize = 14.sp, lineHeight = 21.sp, modifier = Modifier.padding(top = 10.dp))
    }
}
