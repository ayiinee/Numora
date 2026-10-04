# Question Contract — Data/AI ↔ Software

## Purpose

Question content is expected to be generated/supplied by Data/AI workflows and validated by Curriculum/Admin before it becomes usable. Software must not wait for final real questions to build the platform.

This document defines semantic expectations for **Data/AI question import**. Draft machine-readable schemas already exist at `packages/contracts/questions/question.schema.json` and `question-variant.schema.json`. They describe import envelopes, not the internal demo-question fixture format and not the Student-facing API response. The contract gate now compiles the committed JSON Schemas, including references and formats, and tests sample instances. Production import-boundary validation and complete semantic payload rules still need implementation before relying on imported content.

## Workflow

```text
Data / AI Generator
      ↓
Question JSON
      ↓ schema validation
DRAFT
      ↓ Curriculum/Admin review
READY
      ↓ packaging
Student/PvP usage
```

AI generation does not imply content approval.

**ENGINEERING IMPLEMENTATION (review PR #17):** New Drill attempts require an already published package. Non-demo packages require `READY` questions and pinned versions; archived questions/versions cannot start a new attempt. Explicit demo packages may use draft fixtures for development. This exception does not waive Curriculum review before a school trial. Completed results retain their original question snapshots after source content is archived.

For the first school prototype trial, Software and Curriculum will prepare 10 clearly labeled demo `SINGLE_CHOICE` Level-1 questions. Each has exactly four options labeled `A`–`D`; simple mathematical expressions use inline LaTeX within text. Curriculum reviews the stem, four options, answer key, and explanation before real school participants use them. These demo fixtures are not the final Curriculum-approved question bank. The four-option and inline-LaTeX choices are **prototype fixture decisions confirmed by the Software Engineering coordinator**, not general constraints on the Data/AI import schemas or final academic policy. The fixture storage/seed shape should be defined with the assessment/content implementation; do not assume an import envelope is a Student-facing response or expose the answer key before submission.

## Supported conceptual question types

The data model/schema should be able to represent:

- `SINGLE_CHOICE` (PG)
- `MULTIPLE_CHOICE_MULTIPLE_ANSWER` (PGK MCMA)
- `CATEGORY` (PGK Kategori)

**PRD RULE — TryOut v1.1:** MVP requires PG, PGK MCMA and PGK Category, 35 questions per package. PG-only runtime is an implementation gap, not an approved final scope reduction. Rubrics/rounding remain OPEN-04; do not invent partial-credit or all-or-nothing semantics.

## Required semantic groups

A candidate question should include or resolve:

### Identity

- external/source identifier;
- logical question identity when imported repeatedly;
- version/variant identity assigned by platform as needed.

### Taxonomy

**USER CLARIFICATION — 3 October 2026:** competency means curriculum indicator. Learner levels remain under subchapters; a subchapter Level N draws from indicator Level N question families. The importer maps the preserved `metadata.sourceLevelNumber` to `questions.curriculumLevelNumber`, separately from difficulty. Slugs are master-data navigation fields and do not replace chapterCode/subchapterCode in this import envelope. See [migration mapping](CURRICULUM_SLUG_LEVEL_MIGRATIONS_2026-10-03.md).

- chapter;
- subchapter;
- competency;
- level where applicable;
- difficulty.

### Content

- stem/content blocks;
- options/statements/categories according to type;
- optional owned media references.

### Scoring context

- correct answer/key representation;
- point metadata if applicable;
- scoring type/policy compatibility.

### Explanation

- explanation for the concrete version/variant;
- enough context to explain correct/incorrect choices according to product requirements.

### Generation/provenance metadata

Recommended:

- generation source/model/version;
- generation timestamp;
- prompt/template version if relevant;
- reviewer/validation status;
- import batch ID.

These fields help trace AI-generated content quality but do not replace academic review.

## Example Data/AI import envelope

This illustrative object follows the field names and required top-level structure of the current draft `question.schema.json`. It is not one of the Curriculum-reviewed demo questions. The draft schema still treats `answer` as an unconstrained object; the `correctOptionIds` shape below is illustrative, not yet enforced. Codes are examples, not an approved Curriculum taxonomy.

```json
{
  "externalId": "EXAMPLE-Q-00001",
  "type": "SINGLE_CHOICE",
  "chapterCode": "EXAMPLE-BAB",
  "subchapterCode": "EXAMPLE-SUBBAB",
  "competencyCode": "EXAMPLE-KOMP",
  "levelCode": "EXAMPLE-L1",
  "difficulty": "EASY",
  "stem": {"text": "Berapakah hasil $2+3$?"},
  "options": [
    {"id": "A", "content": {"text": "4"}},
    {"id": "B", "content": {"text": "5"}},
    {"id": "C", "content": {"text": "6"}},
    {"id": "D", "content": {"text": "7"}}
  ],
  "answer": {"correctOptionIds": ["B"]},
  "explanation": {"text": "Karena $2+3=5$, jawaban yang benar adalah B."},
  "metadata": {
    "source": "EXAMPLE",
    "generationModel": null,
    "generationBatchId": null
  }
}
```

## Versioning

Published/used content must never be silently overwritten. Corrections create a new version/archived state while historical attempts retain their original context.

## Variants

A variant changes numbers/variables/case while preserving:

- competency;
- intended difficulty;
- question type;
- conceptual learning target.

Each concrete variant needs matching answer key and explanation.

## OPEN dependencies

- exact taxonomy and level structure: OPEN-01;
- PGK scoring semantics: OPEN-04;
- number of variants/packages: OPEN-10; retry pool fallback DRL-OPEN-09;
- TryOut duration, composition and TKA scale: TRY-TBC-01/02; fixed 35 questions and three supported formats are already FINAL.

Schema should remain flexible without pretending these decisions are final.

## Latest feature content boundary

See [PRD reconciliation](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md). Curriculum supplies banks/packages; Admin CRUD is outside the Drill/TryOut feature scope. A retry must preserve competency, form and difficulty; use a different equivalent package if available, without inventing fallback policy. Navigation/resume must not regenerate items inside an attempt. MCMA and Category need explicit validated answer/scoring representations, pinned rubrics and explanations; an extensible enum alone is not final support. Published results retain their original content and scoring/model versions.
