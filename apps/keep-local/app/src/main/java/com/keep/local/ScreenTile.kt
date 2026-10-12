package com.keep.local

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.TileService

/** User adds this tile manually to Quick Settings; it opens the consent UI. */
class ScreenTile : TileService() {
    // PendingIntent overload exists only on API 34+. The guarded legacy call
    // is required for supported Android 10–13 phones.
    @SuppressLint("StartActivityAndCollapseDeprecated")
    @Suppress("DEPRECATION")
    override fun onClick() {
        super.onClick()
        val activity = Intent(this, MainActivity::class.java)
            .setAction(MainActivity.TILE_CAPTURE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 33, activity,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        } else {
            startActivityAndCollapse(activity)
        }
    }
}
