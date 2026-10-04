# tools/fit — API

`tools/fit/probe.sh <file>` — exit `0` ok · `64` wrong arguments · `66` no such file · non-zero from the build or the JVM otherwise.

Standard output, one line each, in this order:

```
messages N service N conversational N other N
<name>=<n>  <name>=<n> ...                      every count, sorted by name
unmapped% N  notALoop N
topUnmapped {BRAND=n, ...}                      up to 25
topAmbiguous {a+b=n, ...}                       up to 12
candidates N                                    sender-mark candidates (>=50 messages and >=90% unread)
quiet-candidates: unmapped N (N%) hid N of N messages from N senders; <cost line>
roles-sum N of N ok|MISMATCH                    every service message has exactly one role
```

Environment: `ORB_EXTRA_SOURCES`, `ORB_MAIN` are set by `probe.sh` for `tests/run.sh`; callers do not set them.
