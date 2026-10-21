# Search quality and limits

[gold.json](tests/gold.json) has 80 authored cases, 20 grouped under each launch category, including 15 ambiguous/cross-category cases and 16 hard negatives. Expected profile IDs and explicit hard constraints are committed, with judgment rationale. [fixtures.py](tests/fixtures.py) defines 16 synthetic TEST identities with explicit fixture consent; none are real professionals. Derivable test-only keys must never be imported into a real wallet.

The parser and ranker do not import the evaluation dataset or fixture identities. They use curated service synonyms, category specificity/coverage and task order; learning and interface-design intent receive documented precedence. Omitted fields stay unknown. Prices, availability, credentials and language fluency are never inferred. Negated/unsupported hard requirements and vague urgent dates fail closed with a clarification. Supported starting time is expressed as “within N days/weeks.” Currency conversion, semantic free-form location matching, fuzzy names, typos and full multilingual understanding are not implemented. Spanish learning synonyms and language constraints have explicit coverage.

PostgreSQL GIN `tsvector('simple', ...)` retrieves public unexpired candidates using controlled service lexemes; a deterministic scorer applies hard filters and ranks service coverage, budget fit, owner-stated acceptance, language/location fit and evidence, then full controller ID as a stable tie break. No paid boosts, follower count or opaque model. Unknown hard-fit fields exclude a profile. Hard budget comparison conservatively checks the **maximum** of the owner's stated range in the same currency/unit; “under” is exclusive. Soft budgets remain explanatory preferences.

[Measured output](evidence/search-evaluation.json):

| Metric | Local development result |
|---|---:|
| Exact expected result sets | 80/80 |
| Precision@3, fixed denominator 3, positive queries | 0.4635 |
| Precision among returned top-3 results, positive queries | 1.0000 |
| Recall@5, positive queries | 1.0000 |
| Zero-result precision | 1.0000 |
| Hard-constraint violations (independent authored labels) | 0 |
| Relevance violations | 0 |

Fixed-denominator Precision@3 is deliberately reported rather than silently pretending an empty slot is relevant. The small inventory often has one or two relevant people. No 70% real-supply success claim follows from these numbers. This is an in-sample development set, **not a held-out benchmark**: an initial run exposed five failed cases; general location, remote and phrase-priority rules were corrected against it. Pilot data, independent relevance judgments and a held-out set remain necessary. The 200-candidate cap can reduce recall at scale and is disclosed in the API/UI.

Evaluation invokes real PostgreSQL search, not an in-memory replacement. Reproduce with `DISCOVERY_TEST_DATABASE_URL` pointing to a disposable loopback `veil_discovery_test` DB and `python tests/evaluate.py`. That command resets only the discovery schema in the guarded test DB. The UI does not fabricate results when supply or hard constraints yield none.

No analytics collector is implemented. If later approved, useful daily aggregate counters would be: search completed (count only), search returned any match, verified public profile opened, disabled-contact view opened, owner publish succeeded/failed. Do not include raw queries, controller IDs, cross-purpose visitor IDs, message content, phone/email, or individual response/reply behavior. Encrypted request/reply success metrics cannot exist until that channel works.
