# Excel import V3

**ENGINEERING DECISION — approved scope, 5 October 2026.** Excel adapts the existing question import v2 contract. NestJS controls access, validation and persistence; Supabase in the browser remains authentication-only. No additional Excel-specific database tables are required.

**PRD RULE:** Super Admin and Content, Data & Moderation manage content. DRAFT preview does not publish, score, update XP or run IRT. Academic review/publication and OPEN decisions retain their existing boundaries.

## Workbook

Download the current template through authenticated GET /api/v1/admin/content/excel-template. Sheets: Panduan, PG, MCMA, Kategori, Kurikulum (current backend master). Row 1 contains headers; subsequent rows contain one question each. Empty rows are ignored; reference/instruction sheets never become questions.

Common columns: external_id, no, chapter_code, subchapter_code, competency_code, source_level, difficulty, stem, img_stem, alt_stem, explanation, img_explanation, alt_explanation.

| Sheet    | Items                                                  | Key                                                  |
| -------- | ------------------------------------------------------ | ---------------------------------------------------- |
| PG       | opt_A … opt_D, companion img_A/alt_A …                 | answer: one ID, e.g. A                               |
| MCMA     | Same option columns                                    | answer: comma-separated IDs, e.g. A,C; no duplicates |
| Kategori | statement_A … statement_D, companion image/alt columns | category_1/2: labels; key_A … key_D: C1 or C2        |

Matching item/category columns can be extended within the v2 limit of 2–100. Empty trailing items are ignored. Stem, active options/statements and explanation require original text; pictures complement text. Difficulty is EASY, MEDIUM, HARD or blank. Source level is a positive integer present in the scoped chapter/subchapter/competency master. No curriculum/difficulty defaults are guessed.

external_id remains stable across edits/reimports. Legacy sheets Template, Soal and Soal dengan Gambar accept original aliases such as Chapter Code, Chapter, Lv, Stem (Soal), Option A, A, Ans, Pembahasan and Gambar. Without an explicit ID, identity derives from curriculum codes + level + stable positive No. Shifted/corrupt cells are reported, never repaired heuristically. Legacy floating pictures can use the text cell when the dedicated img_* header is absent. Alt text is still mandatory; use V3 for the separate text/image layout.

## Pictures and limits

Floating pictures map by their OOXML top-left native row/column, converting zero-based XML directly to Excel cell addresses. Fractional offsets order pictures within a cell; they never round a picture into another row. Pictures on empty/instruction rows, outside image columns, or without cell anchors block saving.

Native Excel Place in Cell follows cell.vm → valueMetadata → XLRICHVALUE futureMetadata → rich value/structure → local-image relationship → embedded bytes. It does not use floating-image/media enumeration order. Separate text/image columns are required because Place in Cell replaces the cell value. alt_* overrides embedded Alt Text, including rich-value deduplication of identical images.

Supported: local embedded PNG/JPEG/WebP. Unsupported: IMAGE() formulas, external images/workbook links, macros, .xls and unsupported rich-value structures.

Limits: XLSX 10 MiB, 100 questions, picture 5 MiB, extracted media total 20 MiB, actual expanded ZIP 50 MiB, 2,000 ZIP entries, 10,000 rows/512 columns per question sheet, generated question JSON 2 MiB. Boundaries and image signatures are checked before import.

## API and persistence

POST /api/v1/admin/content/excel-parses accepts multipart file/sourceNamespace (1–128 letters/digits/underscore/hyphen). Both Excel endpoints use ContentAdminGuard and CONTENT_IMPORT_PREVIEW_ENABLED=true. Parsing has no storage/database writes. Response: envelope {schemaVersion:2, sourceNamespace, questions}, separate media [{externalId,assetId,base64}], cell-local issues, existing validation report when structural parsing succeeds.

Workflow: parse → local preview → reserve media → PUT exact bytes to signed R2 URL → complete/verify checksum/signature → apply VERIFIED receipt bucket/objectKey → validate → existing transactional DRAFT importer with stable retry key. Browser credentials go only to NestJS. Verified receipts are reused; expired pending reservations are replaced. Failed upload/verification prevents the Excel screen from committing questions.

Export contains stable asset IDs, markers, placement/item/order, alt text, SHA-256 and permanent bucket/objectKey. Binary base64 and signed URLs are separate, never exported as question references. Export before upload retains null object keys and is labeled media not uploaded. Import API body contains only sourceNamespace/questions; schemaVersion belongs to the exported envelope.

R2/PostgreSQL do not share a transaction. Failed DB import after successful upload can leave reusable verified media. Existing importer preserves content/scoring versions and historical attempts. Asset IDs contain a namespace hash; final keys contain question ID and image SHA-256.

## Verification and deployment

Independent fixture: apps/api/src/modules/content/fixtures/excel-v3-mixed.xlsx, generated with XlsxWriter 3.2.9. It covers all three types, native Place in Cell/floating, reordered columns, row gaps, and stem/item/explanation pictures. Tests read the committed XLSX; Python/XlsxWriter is needed only to rebuild it. Parser/HTTP tests cover access, formats, boundaries/errors. Web tests cover preview, failed PUT, retry/verified receipt reuse and import sequencing.

Deployment requires the existing feature flag, authorized Admin, configured R2_* settings, bucket CORS allowing the Admin origin PUT/Content-Type, and scoped curriculum master records. Missing credentials/master data are prerequisites; fixture tests do not certify live Supabase/Cloudflare readiness.

Verified locally on 5 October 2026: lint, workspace typecheck/build (Turbo concurrency 1), contract validation/generated-type checks, 205 frontend tests, backend unit/HTTP tests, and the Excel browser E2E for failed PUT/retry/DRAFT/JSON export. Final parser/HTTP check: 10 tests passed. Tests requiring dedicated local PostgreSQL/Redis were skipped because TEST_DATABASE_URL/TEST_REDIS_URL are unset. Live R2 upload and official curriculum scope remain unverified because credentials/master configuration are absent in this workspace. No shared/cloud database migration was applied.
