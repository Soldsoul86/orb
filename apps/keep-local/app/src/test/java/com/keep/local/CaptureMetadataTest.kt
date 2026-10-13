package com.keep.local.next
import org.junit.Assert.*
import org.junit.Test
class CaptureMetadataTest {
    @Test fun preserveLocalClockAndValidateExplicitOffset(){
        val local=CaptureMetadata.parse("2023:11:14 22:13:20",null)!!
        assertEquals(1700000000000L,local.time);assertEquals("exif_local_time",local.basis)
        val offset=CaptureMetadata.parse("2023:11:14 22:13:20","+05:30")!!
        assertEquals(local.time-19800000,offset.time);assertEquals("capture_time",offset.basis)
        assertNull(CaptureMetadata.parse("2023:02:30 22:13:20",null));assertNull(CaptureMetadata.parse(null,null))
    }
}
