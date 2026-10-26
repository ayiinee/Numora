# Admin permission matrix — PRD v0.6

**PRD RULE:** [PRD v0.6 §3.2–3.3 and §19](../product/sources/PRD_Numora_v0.6.docx.md) defines exactly three subroles. Content, Data & Moderation is one combined subrole, not three separate accounts or permissions. The API reads the current database assignment/status for each privileged request; browser menus are presentation only.

| Capability                              | Super Admin                        | Admin Operasional                                  | Admin Content, Data & Moderation |
| --------------------------------------- | ---------------------------------- | -------------------------------------------------- | -------------------------------- |
| Admin accounts, assignment and recovery | Full                               | Denied                                             | Denied                           |
| Schools, Teachers and credentials       | Full                               | Full                                               | Limited read only                |
| Classes and memberships                 | Full                               | Full operational view                              | Limited read only                |
| Student data                            | Full within implemented admin APIs | Operational identities, affiliation and membership | Aggregates only                  |
| Content, assessment, media and videos   | Full                               | Denied                                             | Full                             |
| Reports, moderation and IRT operations  | Full                               | Denied                                             | Full                             |
| Analytics                               | Full                               | Operational aggregates                             | Aggregates                       |
| Student ban/unban                       | Denied                             | Denied                                             | Denied                           |

“Full” does not authorize changing product formulas, rewriting historical academic results, bypassing academic approval or taking over Teacher-only ban/unban. The MVP Operations class API is a reader, not a new class-ownership editor.

## Limited operational view

**ENGINEERING DECISION:** Content's `/admin/structures` is explicitly labelled “baca saja”. School responses contain school ID/name/code/status, class/verified-Teacher/student counts and counts of AVAILABLE/USED/EXPIRED/REVOKED credentials. Class responses contain class/school structure, active-Teacher availability, member count and lifecycle timestamps. No mutation action is offered. Credential counts use the same status precedence as the operational reader: used, revoked, expired, available.

Neither limited response exposes individual Student/Teacher identifiers, names, email, roster, membership history, class join code, credential token/hash/consumer or answers. Content cannot use `/admin/users`, `/admin/classes/:id/roster`, `/admin/schools` or the credential issuance/reissue/revoke endpoints. A class view appearing in Content is expected under §3.3; a management action or individual roster would be a permission defect.

Content audit stays scoped to content/moderation/IRT entities. Non-Admin actor identifiers are returned as `null`; actor filters use the same masked projection so they cannot recover Student/Teacher identities. Admin actors remain identifiable for review accountability. Super retains the full audit; Operations retains its operational-domain audit.

## Analytics boundary

**ENGINEERING DECISION:** all three roles can read aggregate student affiliation and assessment start/completion counts without individual identifiers or scores. Operations additionally reads verification/credential aggregates and operational batch publication/SLA counts. Content additionally reads content/report coverage and IRT failure counts. Super receives both. Operations does not query or receive IRT request diagnostics or content/moderation counts. Unreadable sources remain `null` with an unavailable reason.

## QA identities and verification

The Development fixture key `accounts.admin` maps to `CONTENT_DATA_MODERATION`; `accounts.adminOperations` maps to `OPERATIONS`; `accounts.adminSuper` maps to `SUPER_ADMIN`. Email or vault key never grants permission. The identity API and persisted assignment remain authoritative. Null/unknown assignment or disabled status grants no privileged access, including with an unchanged Auth token.

Regression coverage: direct HTTP allow/deny matrix, forbidden mutations before service execution, unchanged-token assignment changes, disabled accounts, all-role rejection of Teacher ban/unban, exact limited-response fields and credential status counts in isolated PostgreSQL, Content navigation/read-only actions, direct-route denial and browser viewport checks. Real scientific publication, SMTP and media acceptance remain separate from this permission correction.
