package com.keep.local

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object RecordingNotifications {
    private const val CHANNEL = "capture_active"

    fun make(context: Context, heading: String, message: String, action: String, serviceClass: Class<*>): Notification {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Recording status", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(context, 1, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(context, if (serviceClass == ScreenService::class.java) 2 else 3,
            Intent(context, serviceClass).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(heading)
            .setContentText(message)
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Stop and save", stop).build())
            .build()
    }
}
