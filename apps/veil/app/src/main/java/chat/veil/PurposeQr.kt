package chat.veil

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatReader
import com.google.zxing.MultiFormatWriter
import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.io.InputStream
import java.io.ByteArrayOutputStream

object PurposeQr {
    fun render(link:String):Bitmap { require(link.length<=500);return renderPortable(link) }
    fun renderPortable(link:String):Bitmap {
        require(link.toByteArray().size<=2500)
        val matrix=MultiFormatWriter().encode(link,BarcodeFormat.QR_CODE,1024,1024)
        val pixels=IntArray(1024*1024) { if(matrix[it%1024,it/1024]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }
        return Bitmap.createBitmap(pixels,1024,1024,Bitmap.Config.ARGB_8888)
    }
    fun read(input:InputStream):String = readBounded(input,500)
    fun readPortable(input:InputStream):String = readBounded(input,2500)
    private fun readBounded(input:InputStream,limit:Int):String {
        val out=ByteArrayOutputStream();val buffer=ByteArray(8192)
        while(true) { val n=input.read(buffer);if(n<0)break;require(out.size()+n<=4*1024*1024);out.write(buffer,0,n) }
        val bytes=out.toByteArray()
        try {
            val options=BitmapFactory.Options().apply { inJustDecodeBounds=true }
            BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)
            require(options.outWidth in 1..4096 && options.outHeight in 1..4096 && options.outWidth.toLong()*options.outHeight<=8_000_000)
            options.inJustDecodeBounds=false
            while(options.outWidth/options.inSampleSize.coerceAtLeast(1)>1600 || options.outHeight/options.inSampleSize.coerceAtLeast(1)>1600)options.inSampleSize=options.inSampleSize.coerceAtLeast(1)*2
            val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,options) ?: error("Invalid QR image")
            try {
                val pixels=IntArray(bitmap.width*bitmap.height);bitmap.getPixels(pixels,0,bitmap.width,0,0,bitmap.width,bitmap.height)
                return MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(bitmap.width,bitmap.height,pixels))), mapOf(com.google.zxing.DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),com.google.zxing.DecodeHintType.TRY_HARDER to true)).text.also { require(it.length<=limit) }
            } finally { bitmap.recycle() }
        } finally { bytes.fill(0) }
    }
}
