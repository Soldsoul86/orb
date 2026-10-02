# Design — @orb/entities

**Rules, not a model.** A phone number, a site, a UPI id, an email, an amount and a date name themselves; a person's name does
not, and is not attempted (it needs a model or the person's contacts — `docs/ENTITIES_PHONE.md` §2).

**Never stored.** An entity recorded in a journal that cannot seal its payloads would write content in the clear (AD-12).
Handles are computed when asked, from words the caller has open, so they cannot outlive an erase (DR-19).

**Strict.** An unknown format is *not found*, never guessed. A digit run that passes the card check is excluded and never
returned. A mobile does not start with 5, is not eleven digits, and is not after `#` or `-` (ids). A version number is not a date.

**One pass order, one claim per character.** Cards (excluded), sites, emails, UPI ids, amounts, dates, phones; a span taken
earlier is not read again. So a number in a link is the link's, and `9876543210@ybl` is a UPI id and not a phone.

**Normalised.** `+91 98765 43210`, `09876543210` and `9876543210` are one value; `₹1,200` and `Rs 1200.00` are `INR 1200`;
dates are `YYYY-MM-DD`, read day first.

**Bounded.** The first million characters; at most 200 distinct handles.

**Known limits.** Landline and STD numbers are not found; two-digit years are not guessed; relative dates ("Friday") are not read;
a ten-digit order number starting 6–9 is indistinguishable from a mobile. Regional formats beyond India's are found only as `+country…`.
