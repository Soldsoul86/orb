# Keep Local — creative memory

Keep Local is an independent native Kotlin product hosted in the Orb repository.
It preserves its existing editable/deletable local SQLite contract and does not
change Orb's runtime, journal or identities.

Version 0.3.0 adds an additive asset/representation/relationship layer while
preserving existing source IDs, paths and user metadata. Visual interpretations
reference originals and a model version. They are disposable; originals are not.

The first visual slice uses CLIP image/text embeddings through ONNX Runtime CPU.
Models are explicit local-file installs with pinned hashes. Images and video
frames become vector representations, never fabricated captions. Video timestamps
refer to sampled frames, not certified actions or inferred identities.

Indexing is incremental and opt-in. It pauses for battery/storage/thermal pressure,
checks cancellation, and resumes from committed checkpoints. Model instances are
closed after work. Source deletion and visual-index removal cannot resurrect a
late preview from an in-flight indexing operation. Original export/share flows
remain intact.

Flagship-first is the product strategy. There are no budget-phone/RAM product
constraints. Hardware acceleration and stronger models require actual compatibility
and quality measurements; CPU emulator success does not establish NPU/phone speed.

See docs/CREATIVE_MEMORY.txt, docs/MODELS_AND_LICENSES.txt and
 docs/CREATIVE_RESULTS.txt for exact scope, evidence and unverified gates.
