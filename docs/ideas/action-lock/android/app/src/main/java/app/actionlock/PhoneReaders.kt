package app.actionlock

import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.Settings
import android.provider.Telephony
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Sensors: read what Android already keeps (SMS, call log, contacts, installed
 * apps, screen time) and hand it to the page as text in the same formats the
 * TypeScript readers parse from `adb` (the tested code does the interpreting).
 * Read-only. Nothing is copied out of the app.
 */
class PhoneReaders(private val context: Context) {

    private val resolver get() = context.contentResolver
    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)

    /** Rows like `adb shell content query`: "Row: 0 address=…, date=…, body=…" (body last). */
    fun sms(): String = rows(Telephony.Sms.Inbox.CONTENT_URI, arrayOf("address", "date", "body"), "date DESC")

    fun calls(): String = rows(
        CallLog.Calls.CONTENT_URI,
        arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE),
        "${CallLog.Calls.DATE} DESC",
        names = arrayOf("number", "date", "duration", "type"),
    )

    fun contacts(): String = rows(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER, ContactsContract.Contacts.DISPLAY_NAME),
        null,
        names = arrayOf("data1", "display_name"),
    )

    private fun rows(uri: android.net.Uri, columns: Array<String>, order: String?, names: Array<String> = columns): String {
        val out = StringBuilder()
        resolver.query(uri, columns, null, null, order)?.use { c ->
            var i = 0
            while (c.moveToNext()) {
                out.append("Row: ").append(i++).append(' ')
                for (k in columns.indices) {
                    if (k > 0) out.append(", ")
                    out.append(names[k]).append('=').append(c.getString(k) ?: "NULL")
                }
                out.append('\n')
            }
        }
        return out.toString()
    }

    private fun installed(): List<PackageInfo> =
        if (Build.VERSION.SDK_INT >= 33) {
            context.packageManager.getInstalledPackages(PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstalledPackages(PackageManager.GET_PERMISSIONS)
        }

    /** Like `pm list packages`. */
    fun apps(): String = installed().joinToString("\n") { "package:${it.packageName}" }

    private fun installerOf(pkg: String): String? = try {
        if (Build.VERSION.SDK_INT >= 30) {
            context.packageManager.getInstallSourceInfo(pkg).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstallerPackageName(pkg)
        }
    } catch (_: Exception) {
        null
    }

    /** The "##orb phone 1" sections the phone check reads (see src/import/phone.ts). */
    fun phone(): String {
        val out = StringBuilder("##orb phone 1\n##orb packages\n")
        val third = installed().filter { (it.applicationInfo?.flags ?: 0) and ApplicationInfo.FLAG_SYSTEM == 0 && it.packageName != context.packageName }
        for (p in third) out.append("package:${p.packageName}  installer=${installerOf(p.packageName) ?: "null"}\n")
        for (p in third) {
            out.append("##orb app ${p.packageName}\n")
            val perms = p.requestedPermissions ?: emptyArray()
            val flags = p.requestedPermissionsFlags ?: IntArray(0)
            for (i in perms.indices) {
                if (i < flags.size && flags[i] and PackageInfo.REQUESTED_PERMISSION_GRANTED != 0) out.append("      ${perms[i]}: granted=true\n")
            }
            out.append("    firstInstallTime=${stamp.format(Date(p.firstInstallTime))}\n")
        }
        out.append("##orb accessibility\n").append(secure(Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)).append('\n')
        out.append("##orb notification_listeners\n").append(secure("enabled_notification_listeners")).append('\n')
        out.append("##orb sms_app\n").append(Telephony.Sms.getDefaultSmsPackage(context) ?: "null").append('\n')
        out.append("##orb device_admins\n")
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        dpm?.activeAdmins?.forEach { out.append("ComponentInfo{${it.packageName}\n") }
        return out.toString()
    }

    private fun secure(key: String): String = try {
        Settings.Secure.getString(resolver, key) ?: "null"
    } catch (_: Exception) {
        "null"
    }

    fun hasUsageAccess(): Boolean {
        val ops = context.getSystemService(AppOpsManager::class.java) ?: return false
        @Suppress("DEPRECATION")
        return ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED
    }

    /** "##orb usage": foreground events of the last week and time per app over 30 days, dumpsys-style. */
    fun usage(): String {
        if (!hasUsageAccess()) return ""
        val usm = context.getSystemService(UsageStatsManager::class.java) ?: return ""
        val now = System.currentTimeMillis()
        val out = StringBuilder("##orb usage\n")
        val events = usm.queryEvents(now - 7 * 86_400_000L, now)
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            val type = when (e.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> "ACTIVITY_RESUMED"
                UsageEvents.Event.SCREEN_INTERACTIVE -> "SCREEN_INTERACTIVE"
                UsageEvents.Event.KEYGUARD_HIDDEN -> "KEYGUARD_HIDDEN"
                else -> null
            } ?: continue
            out.append("time=\"${stamp.format(Date(e.timeStamp))}\" type=$type package=${e.packageName}\n")
        }
        val totals = HashMap<String, Long>()
        for (s in usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 30 * 86_400_000L, now)) {
            totals[s.packageName] = (totals[s.packageName] ?: 0L) + s.totalTimeInForeground
        }
        for ((pkg, ms) in totals) {
            if (ms <= 0) continue
            val secs = ms / 1000
            out.append("package=$pkg totalTimeUsed=\"${secs / 3600}:${"%02d".format((secs / 60) % 60)}:${"%02d".format(secs % 60)}\"\n")
        }
        return out.toString()
    }
}
