# Numora product presentation cleanup

**ENGINEERING DECISION — owner approved, 6 October 2026:** remove obsolete demo presentation from normal authentication, Student, Teacher and Admin flows. Prepared Development accounts use ordinary display names and authorization. The unlinked, project-restricted `/qa/login` remains internal tooling.

The Supabase project `pkamenfnwmoeisccnrnk` remains Development despite its dashboard name. Synthetic content requires explicit server opt-in and a verified Development or isolated test target. Production receives no cleanup writes. Curriculum approval, PGK rubrics and IRT release dependencies remain OPEN; removing branding never approves academic content.

Historical fixture presentation may use exact-ID, exact-original-value overrides. Stored questions, answers, results, scoring policy pins, XP and audit history remain intact. Cleanup uses proven seeder identities, expected values, a backup and isolated restore rehearsal; uncertain records are left untouched. Obsolete packages are archived rather than deleted.

## Audit before implementation

| Classification | Finding                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REMOVE         | Demo badges/notices in learning, history, PvP and leaderboards; unused DemoEntry; QA link on regular login; Admin Demo checkbox and synthetic-example download controls |
| REPLACE        | Stale scoring help; demo-oriented names, question prefixes, feedback and notifications                                                                                  |
| REFACTOR       | Synthetic-content eligibility, Pretest capability checks, historical presentation, versioned development seeding                                                        |
| DATA_CLEANUP   | Verified mutable fixture copy and obsolete showcase packages                                                                                                            |
| KEEP_INTERNAL  | Fixture provenance, historical migrations/policy pins, test mocks, statistical sampleSize, legitimate input examples and TKA simulation disclosures                     |

Read-only Development audit: 43 published packages (all synthetic), 332 attempts, 8 labelled profiles, 5 labelled chapters, 1 labelled school, 2 labelled classes, 161 marked question versions, 42 marked feedback bodies, 110 marked notification titles. Production has no application tables in the inspected schemas. These counts are a snapshot, not a deletion manifest. Baseline targeted frontend checks: 4 suites / 31 tests passed.

Implementation and verification evidence will be appended as work completes. This cleanup establishes clean presentation and supported-flow verification, not production academic readiness.
