# Android entry points

Application ID: `com.keep.local`; minimum Android API 29, target 36.
MainActivity accepts user-initiated SEND/SEND_MULTIPLE text and content URIs.
System document picker imports bytes into private storage. MediaProvider serves
read-only per-item URIs to explicitly granted viewers. Recording services are
not exported. Screen recording requires fresh Android MediaProjection consent;
microphone capture requires RECORD_AUDIO. No network API exists.

## Media export

`MediaExport.sendIntent(context, item)` returns ACTION_SEND with a read-only
per-item content URI, correct MIME, EXTRA_STREAM and ClipData. The caller opens
the native chooser after explicit user action. `saveToGallery` and
`saveToDocument` stream original bytes with CancellationSignal and never write
back to the source or MemoryDb. `ExportNames.filename` supplies sanitized names.

`MediaProvider` remains non-exported, grants only explicit temporary read access,
and exposes sanitized display names and current file sizes. Package and URI
identity are unchanged. See docs/SHARE_EXPORT.txt for the signing release blocker.
