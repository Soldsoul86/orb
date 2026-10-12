package com.keep.local;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.widget.TextView;

/** Separate test APK/UID with platform-only dependencies, absent from the product. */
public class ShareReceiverActivity extends Activity {
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String result;
        try {
            Uri uri = getIntent().getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri == null || !"content".equals(uri.getScheme())) throw new IllegalStateException("URI");
            String title;
            try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("Metadata");
                title = cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME));
            }
            try (ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(uri, "r")) {
                if (descriptor == null || descriptor.getStatSize() <= 0) throw new IllegalStateException("Bytes");
            }
            try (MediaMetadataRetriever retriever = new MediaMetadataRetriever()) {
                retriever.setDataSource(this, uri);
                if (Long.parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)) <= 0)
                    throw new IllegalStateException("Duration");
                android.graphics.Bitmap frame = retriever.getFrameAtTime(0);
                if (frame == null) throw new IllegalStateException("Frame");
                frame.recycle();
            }
            result = "Received playable video: " + title;
        } catch (Exception error) {
            android.util.Log.e("KeepLocalReceiver", "Receive failed", error);
            result = "Receive failed: " + error.getClass().getSimpleName();
        }
        TextView view = new TextView(this);
        view.setText(result);
        view.setTextSize(20);
        setContentView(view);
    }
}
