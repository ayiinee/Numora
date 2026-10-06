# Excel import

Use `/admin/content/imports` and download **NUMORA_EXCEL_V3.xlsx** from the Admin screen. The canonical parser is `apps/api/src/modules/content/excel-import.service.ts`; parsing and validation are authenticated NestJS endpoints.

The earlier standalone prototype scripts and their sample workbooks were preserved locally in `.tmp/excel-parser-legacy/`. They are not production import/upload paths. Their row heuristics, handwritten R2 signer and direct batch writes have been replaced by the canonical parser and existing verified-media/transactional importer.

See [template specification](../../docs/content/EXCEL_IMPORT_TEMPLATE_SPEC.md) and [Admin guide](../../docs/content/EXCEL_TEMPLATE_GUIDE.md). Independent XLSX compatibility fixture: `apps/api/src/modules/content/fixtures/excel-v3-mixed.xlsx`.
