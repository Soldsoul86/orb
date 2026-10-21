package chat.veil

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.portableidentity.core.DiscoveryPublication

/** Additive signing handoff; no web private-key import and no guest transport. */
@Composable fun ColumnScope.DiscoveryOwner(a:MainActivity,facets:List<JSONObject>) {
    var selected by remember {mutableStateOf("")};var raw by remember {mutableStateOf("")}
    var preview by remember {mutableStateOf<JSONObject?>(null)};var error by remember {mutableStateOf("")}
    var advanced by remember(selected) {mutableStateOf(false)}
    var consent by remember {mutableStateOf(false)};var exported by remember {mutableStateOf("")}
    BackHandler {a.contactPage="home"}
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        TextButton({a.contactPage="home"}){Text("‹ Reach me")}
        Text("Be found",style=MaterialTheme.typography.headlineLarge)
        Text("Prepare your profile in the discovery web preview. Paste its draft here, choose a purpose, and review exactly what you will disclose. Your private keys stay in Veil.")
        Text("Secure messaging is not available yet in the browser. Signing this profile does not enable it.")
        facets.forEach {f -> FilterChip(selected==f.getString("id"),{selected=f.getString("id");preview=null;consent=false;exported=""},label={Text(f.getJSONObject("policy").getString("display_name"))})}
        if(facets.isEmpty())Text("Create a purpose using the existing identity controls first.")
        OutlinedTextField(raw,{if(it.length<=12000){raw=it;preview=null;consent=false}},label={Text("Profile draft from discovery")},modifier=Modifier.fillMaxWidth(),maxLines=6)
        Button({runCatching {DiscoveryPublication.request(raw)}.onSuccess {preview=it;error="";consent=false}.onFailure {error="This draft is invalid. Return to discovery and prepare it again."}},enabled=selected.isNotEmpty()&&!a.busy){Text("Review exact disclosure")}
        if(error.isNotEmpty())Text(error,color=MaterialTheme.colorScheme.error)
        if(a.portableNotice.isNotBlank())Text(a.portableNotice,color=MaterialTheme.colorScheme.error)
        val p=preview;val facet=facets.firstOrNull {it.getString("id")==selected}
        if(p!=null&&facet!=null) {
            Text("Visibility: ${p.getString("visibility")}")
            val profile=p.getJSONObject("profile")
            profile.keys().asSequence().sorted().forEach {k -> Text("$k: ${profile.get(k)}")}
            Text("Existing contact rules (also public in the signed route):")
            Text(PurposePolicy.from(facet.getJSONObject("policy")).summary())
            Text("Route: ${facet.getString("route")}")
            Text("Purpose contact link: ${facet.getString("route")}/g/${facet.getString("id").substringAfterLast(':')}")
            TextButton({advanced=!advanced}){Text("Advanced identity details")}
            if(advanced)Text("Purpose controller: ${facet.getString("id")}")
            Text("Visibility will change to the selected option. ${if(p.optBoolean("pause"))"This also pauses purpose access at your provider." else "Other contact permissions stay as shown."}")
            Text("Public content may be cached elsewhere. Unpublishing cannot erase copied content. The export must be submitted to each directory you used. Removing a listing does not revoke existing contact approvals.")
            Row {Checkbox(consent,{consent=it});Text("I approve these fields, existing rules, route and visibility change.")}
            Button({val id=selected;val draft=DiscoveryPublication.canonical(p);a.contactAction({signDiscovery(id,draft)}){exported=it;consent=false}},enabled=consent&&!a.busy){Text("Authorize signed export")}
        }
        if(selected.isNotEmpty())OutlinedButton({a.contactAction({discoveryExport(selected)}){exported=it}},enabled=!a.busy){Text("Recover last signed export")}
        if(exported.isNotBlank()) {
            Text("Signed locally. Return this export to discovery, review its authenticated preview, and explicitly publish. Directory publication is not yet confirmed.")
            OutlinedTextField(exported,{},readOnly=true,label={Text("Signed profile export")},modifier=Modifier.fillMaxWidth(),maxLines=4)
            Button({a.sharePurpose(exported)}){Text("Share signed export")}
        }
    }
}
