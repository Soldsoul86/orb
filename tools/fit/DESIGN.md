# tools/fit — design

## Why it exists

Rule changes to message reading used to need a phone round-trip: build an APK, install, press Record, export, read.
The probe runs the same code on the real backup in the container, so a rule change is measured in seconds, and the
phone round-trip becomes confirmation rather than the experiment.

## Decisions

* **The app's code, not a re-implementation.** `FitProbe.java.in` is compiled with the app's sources and calls the
  same `MessagesFile.parse` and `LoopFit` the phone does. A probe with its own copy of the rules would measure the
  copy.
* **One source list.** `apps/pixel/orb/tests/run.sh` gained two hooks, `ORB_EXTRA_SOURCES` and `ORB_MAIN` (and passes
  its arguments through). `probe.sh` sets them. The list of app sources is therefore kept once.
* **Counts only, by construction.** The probe prints only what `LoopFit.Report` exposes: counts by name, and brands
  (non-numeric sender ids). It has no code path that prints a body or a name; the test plants a canary string in
  the input and fails if it appears.
* **Deterministic.** Output is a function of the file.

## Risks

* Sender ids that are *not* phone numbers can still be a person's name saved as a contact; the report lists the
  top ids it could not place. Read it as the operator, do not paste it elsewhere.
* The raw-text dump class used during rule development (printing message bodies to a file) is deliberately **not**
  here. Reading text is a person's call on their own device, not a tool's.
