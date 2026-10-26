# Ferdi Admin FE — synthetic browser evidence

26 October 2026. Screenshots use isolated Auth/HTTP fixtures on localhost:3300, synthetic school/account data and test-only credentials. They do not prove connected Development, real Google OAuth, cloud publication or independent QA acceptance.

The CSS/component extraction preserved eight school/content screenshots pixel for pixel at all four widths. Importer screenshots additionally verify the source panel at each width; history/empty state and overflow are checked by the same browser cases. Pending/cancel/Escape/focus recovery and operational URL/Back/reload are covered in `apps/web/e2e/ferdi-admin.spec.ts`.

| Width | Schools / token context    | Content workbench           | Import source             |
| ----- | -------------------------- | --------------------------- | ------------------------- |
| 320   | [School](schools-320.png)  | [Content](content-320.png)  | [Import](import-320.png)  |
| 390   | [School](schools-390.png)  | [Content](content-390.png)  | [Import](import-390.png)  |
| 768   | [School](schools-768.png)  | [Content](content-768.png)  | [Import](import-768.png)  |
| 1440  | [School](schools-1440.png) | [Content](content-1440.png) | [Import](import-1440.png) |

Full evidence and unresolved integration/QA gates: [Ferdi implementation ledger](../../../development/FERDI_ADMIN_FE_2026-10-26.md).
