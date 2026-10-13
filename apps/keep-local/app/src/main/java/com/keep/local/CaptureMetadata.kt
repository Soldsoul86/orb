package com.keep.local.next

import android.content.Context
import android.media.ExifInterface
import android.net.Uri
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle

/** Read only explicitly recorded original-capture metadata; never use file mtime. */
object CaptureMetadata {
    data class Stamp(val time:Long,val basis:String)
    fun parse(raw:String?,offset:String?):Stamp?=runCatching {
        val clock=LocalDateTime.parse(requireNotNull(raw).trim(),DateTimeFormatter.ofPattern("uuuu:MM:dd HH:mm:ss").withResolverStyle(ResolverStyle.STRICT))
        val zone=offset?.trim()?.takeIf{it.matches(Regex("[+-]\\d{2}:\\d{2}"))}?.let{ZoneOffset.of(it)}
        Stamp(clock.toInstant(zone?:ZoneOffset.UTC).toEpochMilli(),if(zone==null)"exif_local_time" else "capture_time")
    }.getOrNull()
    fun read(c:Context,uri:Uri):Stamp?=runCatching {
        c.contentResolver.openInputStream(uri)?.use { input->
            val exif=ExifInterface(input)
            parse(exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL),exif.getAttribute("OffsetTimeOriginal"))
        }
    }.getOrNull()
}
