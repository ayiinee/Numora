# ADR-013 — Encrypted off-host application archives

- **Status:** Proposed operator profile; tooling implemented for review, no storage deployment approved/performed.
- **Date:** 16 November 2026.
- **Label:** PROPOSED — engineering profile for the owner's continuing PostgreSQL VPS migration preparation.

## Context

The verified application dump in PR 3 is compressed but unencrypted. A copy on the API/database VPS shares its failure domain. PRs 4–5 prepare mapped restore and runtime checks; neither supplies an independently recoverable storage copy. RPO/RTO/retention and storage-account/operator choices remain subject to OPEN-09 and operational review.

## Proposed profile

Wrap the existing immutable archive in a restic encrypted repository on a separately reviewed HTTPS S3-compatible bucket/prefix. Use a separately escrowed repository password and scoped storage credentials, both outside application env/Git. Pin the endpoint, prefix, full repository ID and supported client version. Current tooling is tested against restic 0.19.1 and repository format 2; changing that profile requires compatibility/security review and tests.

Publish only already verified archives. Record the committed full snapshot ID, manifest checksum and deployment alias. Recovery selects that exact snapshot and an independently recorded manifest checksum, decrypts into a fresh private directory, and repeats archive verification. Publication, archive retrieval, logical DB restore, runtime QA and cutover remain distinct evidence stages.

## Consequences

No custom encryption format is introduced. The operator wrapper never initializes a repository, prunes/forgets snapshots, bypasses repository locks, changes database state or activates a timer. Ordinary restic operations still create and release their own locks. Retention/deletion credentials, immutable/versioned storage policy, password escrow, actual S3 integration and independent restore acceptance require separate operator review. Encryption does not prevent an authorized storage credential from deleting objects; losing the password can prevent recovery.

Logical archives do not add WAL/PITR or cover Supabase Auth accounts, R2 object bytes, service secrets, certificates or external IRT assets. Those retain their own recovery obligations. The [operator runbook](../operations/POSTGRES_VPS_OFFHOST_BACKUP.md) records the procedure and limits.

## Alternatives considered

Unencrypted object copies and a VPS-only archive do not satisfy this profile. A custom cryptographic envelope would add avoidable implementation/key-management complexity. Physical backups/WAL/PITR and provider-native replication may be evaluated separately; this wrapper does not claim their recovery precision.

References: [restic repository/encryption design](https://restic.readthedocs.io/en/stable/100_references.html#design), [S3 configuration](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage), [restic 0.19.1 release](https://github.com/restic/restic/releases/tag/v0.19.1).
