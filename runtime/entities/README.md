# @orb/entities

**Handles**: the phone numbers, sites, UPI ids, emails, amounts and dates a text names, found by rules. Text in, a short
list out — **nothing is stored** (`docs/ENTITIES_PHONE.md`, DR-19).

```ts
extractHandles("call 9876543210, pay ravi@oksbi, ₹1,200 on 12/10/2026");
// [ {kind:"phone",value:"+919876543210"}, {kind:"upi",value:"ravi@oksbi"},
//   {kind:"amount",value:"INR 1200"}, {kind:"date",value:"2026-10-12"} ]
```

No dependencies. The phone's Kotlin (`runtime/brain`, `Handles.kt`) is held to the same hand-written cases by shared vectors.
