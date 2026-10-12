# Android entry points

Application ID: `com.keep.local`; minimum Android API 29, target 36.
MainActivity accepts user-initiated SEND/SEND_MULTIPLE text and content URIs.
System document picker imports bytes into private storage. MediaProvider serves
read-only per-item URIs to explicitly granted viewers. Recording services are
not exported. Screen recording requires fresh Android MediaProjection consent;
microphone capture requires RECORD_AUDIO. No network API exists.
