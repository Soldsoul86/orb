# Creative Memory verification

The compile workflow pins Gradle/AGP/Kotlin/ORT/model revision, prepares the local
model pack plus ground-truth test corpus, then runs JVM tests, lint and Android
builds. See `.github/workflows/keep-local-compile.yml` at repository root.
The signing workflow consumes an exact unsigned artifact and public detached
signatures, verifies the retained certificate and tests actual in-place updates.

`CreativeMemoryTest` verifies v1-to-v2 data preservation and stable IDs, deletion
races, model checksum installation, reference BPE tokenization, real-photo visual
retrieval, montage timestamps/video distractor and the real search/preview UI.
`MediaExportTest` preserves the existing sharing/Gallery/Files suite. Notes/FTS,
permission boundaries, cancellation and large-copy tests remain included.

`scripts/creative-emulator.sh` runs only on a disposable emulator, installs the
baseline, seeds a known original, updates without uninstalling, disables radios,
executes instrumentation and verifies original bytes after restart. Never use
the fixture-seeding scripts on a phone containing real recordings.

Metrics and screenshots are retained as evidence. The corpus is four real photos
and two constructed videos; it does not prove temporal action recognition or
real flagship performance. Detailed executed results and limitations are in
`docs/CREATIVE_RESULTS.txt`. Historical reports describe their own app versions.
