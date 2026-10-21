package chat.veil

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import org.portableidentity.core.DiscoveryPublication
import org.portableidentity.core.IdentityCore

/** Native disclosure review and direct publication. Keys remain in the vault. */
@Composable fun ColumnScope.DiscoveryOwner(a:MainActivity,facets:List<JSONObject>) {
    var selected by remember {mutableStateOf("")}
    var alias by remember(selected) {mutableStateOf("")}
    var purpose by remember(selected) {mutableStateOf("")}
    var category by remember(selected) {mutableStateOf(DiscoveryPublication.tags.keys.first())}
    var tags by remember(selected) {mutableStateOf(setOf<String>())}
    var public by remember(selected) {mutableStateOf(false)}
    var remote by remember(selected) {mutableStateOf(true)}
    var directory by remember(selected) {mutableStateOf(facets.firstOrNull{it.getString("id")==selected}?.optJSONObject("discovery")?.optString("directory") ?: "")}
    var preview by remember(selected) {mutableStateOf<JSONObject?>(null)}
    var consent by remember(selected) {mutableStateOf(false)}
    var advanced by remember(selected) {mutableStateOf(false)}
    var raw by remember(selected) {mutableStateOf("")}
    var exported by remember(selected) {mutableStateOf("")}
    var notice by remember(selected) {mutableStateOf("")}
    var link by remember(selected) {mutableStateOf("")}
    fun changed(){preview=null;consent=false;notice="";link=""}
    fun review(request:JSONObject) {
        runCatching {DiscoveryPublication.request(request.toString())}.onSuccess {preview=it;consent=false;notice=""}
            .onFailure {notice="Check your name, description and selected services."}
    }
    val facet=facets.firstOrNull{it.getString("id")==selected}
    BackHandler {a.contactPage="home"}
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        TextButton({a.contactPage="home"}){Text("‹ Reach me")}
        Text("Be found",style=MaterialTheme.typography.headlineLarge)
        Text("Describe how you can help. Review your profile and contact rules before publishing. Nothing is public until you confirm.")
        Text("Experimental discovery preview. Browser messaging is not available yet.")
        facets.forEach {f -> FilterChip(selected==f.getString("id"),{selected=f.getString("id")},label={Text(f.getJSONObject("policy").getString("display_name"))})}
        if(facets.isEmpty())Text("Create a purpose in Reach me first, then return here.")
        if(facet!=null) {
            OutlinedTextField(alias,{if(it.length<=60){alias=it;changed()}},label={Text("Public name")},modifier=Modifier.fillMaxWidth())
            OutlinedTextField(purpose,{if(it.length<=240){purpose=it;changed()}},label={Text("How can you help?")},modifier=Modifier.fillMaxWidth(),minLines=3)
            Text("Category")
            DiscoveryPublication.tags.keys.forEach {c -> FilterChip(category==c,{category=c;tags=emptySet();changed()},label={Text(c.lowercase().replaceFirstChar{it.uppercase()})})}
            Text("Services you offer")
            DiscoveryPublication.tags.getValue(category).forEach {t -> FilterChip(t in tags,{tags=if(t in tags)tags-t else tags+t;changed()},label={Text(t.replace('-',' '))})}
            Row {Checkbox(remote,{remote=it;changed()});Text("Available for remote work")}
            Row {Checkbox(public,{public=it;changed()},modifier=Modifier.testTag("discovery-public"));Text("Make this profile searchable")}
            Text(if(public)"People can find your public profile. Your statements are self-declared." else "Private by default. Applying this choice removes an existing public listing.")
            OutlinedTextField(directory,{directory=it.trim();changed()},label={Text("Preview directory HTTPS address")},modifier=Modifier.fillMaxWidth())
            Button({review(JSONObject().put("v",1).put("visibility",if(public)"PUBLIC" else "PRIVATE").put("profile",if(public)JSONObject()
                .put("alias",alias.trim()).put("purpose",purpose.trim()).put("category",category).put("tags",JSONArray(tags.sorted()))
                .put("remote",remote).put("accepting",PurposePolicy.from(facet.getJSONObject("policy")).let{it.status==PurposeStatus.ACTIVE && it.requests==RequestMode.REQUEST_APPROVAL}) else JSONObject()))},enabled=!a.busy){Text("Review profile")}
            val p=preview
            if(p!=null) {
                Text("Review before publishing",style=MaterialTheme.typography.titleLarge)
                Text(if(p.getString("visibility")=="PUBLIC")"Searchable public profile" else "Remove from public discovery")
                val profile=p.getJSONObject("profile")
                if(profile.length()>0) {
                    Text(profile.getString("alias"));Text(profile.getString("purpose"));Text(profile.getString("category"))
                    Text((0 until profile.getJSONArray("tags").length()).joinToString {profile.getJSONArray("tags").getString(it)})
                    if(profile.optBoolean("remote"))Text("Remote projects")
                }
                Text(PurposePolicy.from(facet.getJSONObject("policy")).summary())
                if(p.optBoolean("pause"))Text("This change also pauses purpose access at your provider.")
                if(advanced)Text(DiscoveryPublication.canonical(profile))
                Text("Publishing changes discovery visibility as shown. Public profiles expire within 30 days or when your purpose expires, whichever is sooner. Copied profiles cannot be recalled.")
                Row {Checkbox(consent,{consent=it},modifier=Modifier.testTag("discovery-consent"));Text("I approve this profile, contact rules and visibility.")}
                Button({val draft=DiscoveryPublication.canonical(p);a.contactAction({publishDiscovery(selected,draft,directory)}){link=it;notice=if(it.isEmpty())"Public listing removed." else "Published. Your profile is searchable.";consent=false}},enabled=consent&&directory.isNotBlank()&&!a.busy){Text(if(p.getString("visibility")=="PUBLIC")"Publish" else "Unpublish")}
            }
            if(facet.optJSONObject("discovery")?.optBoolean("pending")==true) {
                Text("Publication awaiting confirmation. Retrying sends the same signed change.")
                OutlinedButton({a.contactAction({retryDiscovery(selected)}){link=it;notice="Publication confirmed."}},enabled=!a.busy){Text("Retry saved publication")}
            }
            OutlinedButton({a.contactAction({recoverDiscovery(selected,directory)}){exported=it;val d=IdentityCore.verify(JSONObject(it).getString("publication"),selected,DiscoveryPublication.TYPE);val profile=d.getJSONObject("profile");alias=profile.getString("alias");purpose=profile.getString("purpose");category=profile.getString("category");tags=(0 until profile.getJSONArray("tags").length()).map{profile.getJSONArray("tags").getString(it)}.toSet();remote=profile.optBoolean("remote");public=true;changed();notice="Latest signed profile recovered. Review before publishing. Restored devices may need an authenticated provider move first."}},enabled=directory.isNotBlank()&&!a.busy){Text("Recover latest signed profile")}
            if(exported.isNotBlank() && runCatching{IdentityCore.verify(JSONObject(exported).getString("publication"),selected,DiscoveryPublication.TYPE).getString("visibility")=="PUBLIC"}.getOrDefault(false))OutlinedButton({val d=IdentityCore.verify(JSONObject(exported).getString("publication"),selected,DiscoveryPublication.TYPE);val profile=JSONObject(d.getJSONObject("profile").toString()).put("accepting",false);review(JSONObject().put("v",1).put("visibility","PUBLIC").put("profile",profile).put("pause",true))},enabled=!a.busy){Text("Review pause")}
            TextButton({advanced=!advanced}){Text("Advanced identity details")}
            if(advanced) {
                Text("Purpose controller: $selected");Text("Signed contact route: ${facet.getString("route")}")
                OutlinedTextField(raw,{raw=it.take(12000);changed()},label={Text("Profile draft from discovery")},modifier=Modifier.fillMaxWidth(),maxLines=4)
                TextButton({runCatching{DiscoveryPublication.request(raw)}.onSuccess{preview=it;consent=false}.onFailure{notice="Invalid publication draft."}}){Text("Review exact disclosure")}
                if(preview!=null)OutlinedButton({a.contactAction({signDiscovery(selected,DiscoveryPublication.canonical(preview!!))}){exported=it;notice="Signed export prepared. This does not confirm directory publication."}},enabled=consent&&!a.busy){Text("Authorize signed export")}
                TextButton({a.contactAction({discoveryExport(selected)}){exported=it}}){Text("Recover last signed export")}
                if(exported.isNotBlank())Button({a.sharePurpose(exported)}){Text("Share signed export")}
            }
        }
        if(notice.isNotBlank())Text(notice)
        if(a.portableNotice.isNotBlank())Text(a.portableNotice,color=MaterialTheme.colorScheme.error)
        if(link.isNotBlank()) {
            val bitmap=remember(link){PurposeQr.renderPortable(link)}
            DisposableEffect(bitmap){onDispose{bitmap.recycle()}}
            Image(bitmap.asImageBitmap(),"Profile QR code",Modifier.size(240.dp),filterQuality=FilterQuality.None)
            Text(link);Button({a.sharePurpose(link)}){Text("Share profile link")}
        }
    }
}
