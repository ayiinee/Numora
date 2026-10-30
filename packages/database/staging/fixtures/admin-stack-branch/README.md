# Published Admin migration fork

Immutable SQL and original timestamps from `feat/admin-content-workspace` (PRs #73-#79). The canonical journal retains main 0000-0030 and appends the same SQL hashes at 0031-0039. Original snapshots remain in the source branch; canonical snapshots include both schemas. This fixture is used only to rehearse upgrades, never as a separate production migration command.

See [integration evidence](../../../../../docs/development/ADMIN_MAIN_SYNC_2026-10-07.md).
