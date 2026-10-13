# Android interfaces

Application ID and provider authority stay `com.keep.local.next` and
`com.keep.local.next.media`. Minimum API 29, target 36. No network API exists.
MainActivity accepts explicit SEND/SEND_MULTIPLE and document-picker imports.
Recording services remain private; screen capture requires fresh system consent.

`MemoryDb` v2 preserves original memories and adds `assets`, `representations`
and `asset_relationships`. `CreativeSchema.create` backfills stable IDs once.
`VisualEncoder` exposes normalized image/text vectors and model version, keeping
inference separate from original records. `VisualIndexJob.indexOne` commits one
frame/checkpoint; interrupted steps do not advance it. `CreativeSearch` combines
visual rankings with separately labeled existing text/metadata results.

`ModelPack.install` accepts a local ZIP, verifies each allowed file against the
bundled descriptor, then atomically installs it. No arbitrary model code is
executed and no user data is uploaded. See docs/MODELS_AND_LICENSES.txt for the
specific model/runtime and current limitations.

`MediaExport.sendIntent` uses a read-only item content URI, correct MIME,
EXTRA_STREAM and ClipData. Gallery and Files exports stream original bytes with
cancellation. The non-exported provider grants only item-scoped temporary reads.
Derived visual results never change originals; explicit deletion cascades their
index rows and clears cached previews.
