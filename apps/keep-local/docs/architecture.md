# Architecture and trust boundaries

```
 USER INTENT   Android share chooser / system picker / note / mic / MediaProjection consent
      ↓
 CAPTURE       On-device APIs; large media is streamed or encoded to app-private files
      ↓
 EVIDENCE      MemoryDb row (original source text, immutable physical recording) + file
      ↓
 INTERPRET     Bounded OCR job for imported images and video frame samples; tiny rule flags
      ↓
 RETRIEVE      SQLite FTS4 (title, user note, extracted text, source) → original + timestamps
```

- **No cloud inference.** No INTERNET permission, remote identifiers, telemetry or accounts.
- **One database authority.** SQLite (`memories.db`) is the source of record for metadata. Original media lives in `<filesDir>/media/`, accessible via validated relative paths only.
- **Keep observation and interpretation separate.** `body` is user-authored or shared evidence; `extracted` is OCR output. `suggestion` always says **Possible ... — verify**. No AI-generated statement silently replaces the evidence.
- **Controlled lifecycle.** Recorded media uses `.pending.mp4`/`.pending.m4a` while writing. Final rename and DB insert happen after a successful encoder stop. Old failed pending files are deleted after 24 hours. Invalid/short recordings are discarded and not claimed saved.
- **Consent.** MediaProjection consent is new for each capture session; microphone permission required if microphone included. Quick Settings tile opens consent UI rather than recording invisibly. No full-screen overlays/accessibility service.
- **Nonblocking work.** OCR runs under JobScheduler and on a single background worker, decoding at most 12 scaled frame images per video. Media recording uses hardware encoders.
- **Resource limits.** 1 GiB/file import cap, 500 MiB free-space floor, screen encoding 1.6 Mbit/s at 24 fps, <=1280x720, 30 minutes/1 GiB. No model is kept alive between app interactions.
- **MVP source limits.** Indexing is OCR/metadata; audio recordings aren't automatically transcribed. Device support may vary. Testing across hardware is mandatory.

## Memory table

`id`, `kind`, `title`, `body`, `extracted`, `source`, `path`, `mime`, `created_at`, `bytes`, `duration_ms`, `pinned`, `suggestion`.

An FTS4 index is updated by SQLite INSERT/UPDATE/DELETE triggers; no sync queue or index server. Search escapes raw queries into bounded tokenized prefix terms.

## Next improvements after device proof

1. CPU/RAM-verified **on-device speech-to-text on saved recordings** with an optional compressed multilingual model (and Android-free fallback). Model must never be downloaded silently.
2. Per-app **notification import candidates** behind explicit permission and per-source opt-in, with approval before promoting a candidate to memory. Do not collect OTPs or sensitive notifications.
3. User-exportable encrypted archive with restore tests, so uninstall/data loss doesn't destroy memories.
4. Better video capture compatibility + internal audio where Android and the source app legally permit it; keep user consent each time.
5. Low-resource semantic retrieval using a small quantized model after correctness, memory, and thermal tests.
