# Standalone Keep Local MVP

User-authorized import of `keep-local-android-mvp.zip` for independent Android
build verification. Keep Local is a separate product hosted in this repository;
it does not use or change the Orb runtime, Event Journal, package IDs or data.
The supplied product contract uses editable/deletable local SQLite memories.
Integrating it into Orb would require a separate architectural decision.

See docs/architecture.md for the existing design. This milestone fixes FTS4
prefix syntax, limits list previews, handles target-36 window insets, preserves
editor view state, avoids destroyed-activity callbacks and releases failed
recorders. No new AI capabilities are added.
