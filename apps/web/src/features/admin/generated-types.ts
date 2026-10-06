// Generated from packages/contracts/openapi/openapi.json. Do not edit by hand.
// Run pnpm contracts:types after changing NestJS DTOs.

export type ImportBodyDto = { "target"?: PackageTargetDto; "sourceNamespace": string; "questions": (Record<string, unknown>)[]; };

export type PackageTargetDto = { "packageId": string; "expectedRevision": number; "fileName"?: string; };

export type WorkbookBindingDto = { "packageId": string; "familyCode": string; "packageVersion": number; "assessmentType": "DRILL" | "PRETEST" | "TRYOUT"; "chapterCode": string | null; "subchapterCode": string | null; "levelNumber": number | null; "sourceNamespace": string; "sourceName": string; "sourceReference": string; "isDemo": boolean; };

export type PackageSourceDto = { "sourceNamespace": string; "sourceName": string; "sourceReference": string; };

export type PackageCheckDto = { "code": string; "passed": boolean; "detail": string; };

export type PackageValidationDto = { "packageId": string; "contentRevision": number; "canSaveDraft": boolean; "canPublish": boolean; "expectedCount": number; "actualCount": number; "blockers": (string)[]; "removedVersionIds": (string)[]; "checks": (PackageCheckDto)[]; };

export type CreateContentPackageDto = { "familyCode": string; "packageVersion": number; "name": string; "assessmentType": "DRILL" | "PRETEST" | "TRYOUT"; "chapterId"?: string; "levelId"?: string; "isDemo": boolean; "source": PackageSourceDto; };

export type UpdateContentPackageDto = { "expectedRevision": number; "name": string; "questionVersionIds": (string)[]; };

export type ContentPackageDto = { "id": string; "familyCode": string; "packageVersion": number; "name": string; "assessmentType": "DRILL" | "PRETEST" | "TRYOUT"; "contentRevision": number; "status": string; "isDemo": boolean; "source": PackageSourceDto | null; "chapterId": string | null; "levelId": string | null; "chapterCode": string | null; "chapterName": string | null; "subchapterCode": string | null; "subchapterName": string | null; "levelNumber": number | null; };

export type ContentPackagesDto = { "items": (ContentPackageDto)[]; };

export type ContentPackageDetailDto = { "id": string; "familyCode": string; "packageVersion": number; "name": string; "assessmentType": "DRILL" | "PRETEST" | "TRYOUT"; "contentRevision": number; "status": string; "isDemo": boolean; "source": PackageSourceDto | null; "chapterId": string | null; "levelId": string | null; "chapterCode": string | null; "chapterName": string | null; "subchapterCode": string | null; "subchapterName": string | null; "levelNumber": number | null; "items": (ContentPackageItemDto)[]; "readiness": PackageValidationDto; "distribution": (ContentDistributionDto)[]; };

export type ContentPackageItemDto = { "questionVersionId": string; "questionId": string; "displayOrder": number; "usageType": "DRILL" | "PRETEST" | "TRYOUT" | null; "contentStatus": string; "reviewedAt": string | null; "reviewedByUserId": string | null; "question": ExcelQuestionDto | null; };

export type ContentDistributionDto = { "dimension": string; "value": string; "count": number; };

export type ClassifyQuestionDto = { "usageType": "DRILL" | "PRETEST" | "TRYOUT"; };

export type ReviewImportedQuestionDto = { "packageId": string; "confirmed": true; "notes": string; };

export type ExcelParseDto = { "envelope": ExcelEnvelopeDto; "media": (ExcelMediaDto)[]; "issues": (ExcelIssueDto)[]; "report": ImportReportDto | null; };

export type ExcelEnvelopeDto = { "binding"?: WorkbookBindingDto; "schemaVersion": 2; "sourceNamespace": string; "questions": (ExcelQuestionDto)[]; };

export type ExcelQuestionDto = { "externalId": string; "type": "SINGLE_CHOICE" | "MULTIPLE_CHOICE_MULTIPLE_ANSWER" | "CATEGORY"; "chapterCode": string; "subchapterCode": string; "competencyCode": string; "difficulty": "EASY" | "MEDIUM" | "HARD" | null; "stem": RichContentDto; "options": (PreviewOptionDto)[]; "answer": { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; }; "explanation": RichContentDto; "metadata": ExcelMetadataDto; };

export type ExcelMetadataDto = { "sourceLevelNumber": number; "sourceOrder"?: number; "sourceQuestionId"?: string; "sourceSheet": string; "sourceRowNumber": number; "assetManifest": (ExcelAssetDto)[]; "categories"?: (PreviewCategoryDto)[]; };

export type ExcelAssetDto = { "externalId": string; "assetId": string; "textMarker": string; "placement": "STEM" | "OPTION" | "STATEMENT" | "EXPLANATION"; "itemId": string | null; "assetOrder": number; "altText": string; "objectKey": string | null; "sha256": string; "contentType": string; "byteLength": number; "bucket": string; };

export type ExcelIssueDto = { "sheet": string; "row": number; "cell": string; "code": string; "detail": string; };

export type ExcelMediaDto = { "externalId": string; "assetId": string; "base64": string; };

export type CreateMediaUploadDto = { "externalId": string; "assetId": string; "contentVersion"?: number; "contentType": "image/png" | "image/jpeg" | "image/webp"; "byteLength": number; "sha256": string; };

export type MediaUploadReceiptDto = { "uploadId": string; "status": "PENDING" | "VERIFIED"; "externalId": string; "assetId": string; "bucket": string; "objectKey": string; "contentType": string; "byteLength": number; "sha256": string; "verifiedAt": string | null; };

export type MediaUploadReservationDto = { "uploadId": string; "status": "PENDING" | "VERIFIED"; "externalId": string; "assetId": string; "bucket": string; "objectKey": string; "contentType": string; "byteLength": number; "sha256": string; "verifiedAt": string | null; "uploadUrl": string | null; "method": "PUT" | null; "headers": Record<string, unknown> | null; "expiresAt": string; };

export type ImportItemDto = { "issues"?: (ImportIssueDto)[]; "externalId": string; "canImportDraft": boolean; "canPreview": boolean; "blockers": (string)[]; "outcome": "VALIDATED" | "CREATED" | "CREATED_REVISION" | "SKIPPED_UNCHANGED" | "INVALID"; "questionVersionId": string | null; "change"?: "ADD" | "REVISE" | "KEEP" | "REUSE" | "INVALID"; };

export type ImportIssueDto = { "code": string; "detail": string; "sheet": string | null; "row": number | null; };

export type ImportReportDto = { "id": string | null; "sourceNamespace": string; "canImportDraft": boolean; "items": (ImportItemDto)[]; "package"?: PackageValidationDto; };

export type CreatePreviewDto = { "questionVersionIds": (string)[]; };

export type SavePreviewAnswerDto = { "answer": { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "expectedRevision": number; };

export type PreviewAckDto = { "instanceId": string; "answer": { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "revision": number; "serverSavedAt": string; };

export type RichContentDto = { "text": string; };

export type PreviewOptionDto = { "id": string; "content": RichContentDto; };

export type PreviewCategoryDto = { "id": string; "label": string; };

export type PreviewMediaDto = { "instanceId": string; "assetId": string; "altText": string; "url": string; "expiresAt": string; };

export type PreviewItemDto = { "instanceId": string; "answer": { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "revision": number; "serverSavedAt": string; "questionVersionId": string; "externalId": string; "type": "SINGLE_CHOICE" | "MULTIPLE_CHOICE_MULTIPLE_ANSWER" | "CATEGORY"; "stem": RichContentDto; "options": (PreviewOptionDto)[]; "categories": (PreviewCategoryDto)[]; "answerKey"?: { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "explanation"?: RichContentDto; "score": number | null; };

export type PreviewSessionDto = { "id": string; "state": "IN_PROGRESS" | "SUBMITTED"; "scoringStatus": "NOT_SCORED"; "score": number | null; "items": (PreviewItemDto)[]; "media": (PreviewMediaDto)[]; };

export type MediaLinkRequestDto = { "phase": "WORK" | "REVIEW"; "instanceId": string; "assetIds": (string)[]; };

export type MediaLinksDto = { "media": (PreviewMediaDto)[]; };

export type ContentOptionDto = { "id": string; "text": string; };

export type AdminTaxonDto = { "materialCategory"?: "algebra" | "geometry" | "numbers" | "statistics" | null; "id": string; "kind": "CHAPTER" | "SUBCHAPTER" | "COMPETENCY" | "LEVEL"; "parentId": string | null; "code": string; "slug"?: string | null; "name": string; "displayOrder": number; "status": "DRAFT" | "READY" | "ARCHIVED"; };

export type AdminUserDto = { "id": string; "displayName": string; "role": "STUDENT" | "TEACHER" | "ADMIN"; "status": "ACTIVE" | "DISABLED"; "createdAt": string; };

export type AdminUserListDto = { "items": (AdminUserDto)[]; "nextOffset": number | null; };

export type AdminClassDto = { "id": string; "name": string; "schoolId": string; "schoolName": string; "teacherId": string; "teacherName": string; "studentCount": number; "createdAt": string; "archivedAt": string | null; };

export type AdminClassListDto = { "items": (AdminClassDto)[]; "nextOffset": number | null; };

export type AdminCurriculumDto = { "items": (AdminTaxonDto)[]; };

export type AdminVersionDto = { "sourceName"?: string | null; "sourceReference"?: string | null; "sourceNamespace"?: string | null; "sourceFileName"?: string | null; "usageType"?: "DRILL" | "PRETEST" | "TRYOUT" | null; "sourceQuestionId"?: string | null; "imported"?: boolean; "id": string; "questionId": string; "primaryCompetencyId": string; "curriculumLevelNumber"?: number | null; "variantId": string; "variantCode": string; "variantKind": "ORIGINAL" | "VARIANT"; "originalVariantId": string | null; "versionNumber": number; "questionType": string; "stem": string; "options": (ContentOptionDto)[]; "answerOptionId": string | null; "explanation": string; "difficulty": string | null; "contentStatus": "DRAFT" | "READY" | "ARCHIVED"; "questionStatus": "DRAFT" | "READY" | "ARCHIVED"; "reviewedByUserId": string | null; "reviewedAt": string | null; };

export type AdminVersionsDto = { "items": (AdminVersionDto)[]; };

export type AdminVideoDto = { "id": string; "mappingId": string; "subchapterId": string; "title": string; "url": string; "source": string; "recommendationOrder": number; "status": "DRAFT" | "READY" | "ARCHIVED"; };

export type AdminVideosDto = { "items": (AdminVideoDto)[]; };

export type ContentMutationDto = { "id": string; };

export type CreateChapterDto = { "code": string; "slug"?: string; "name": string; "description"?: string; "displayOrder": number; "status"?: "DRAFT" | "READY" | "ARCHIVED"; "materialCategory"?: "algebra" | "geometry" | "numbers" | "statistics" | null; };

export type UpdateChapterDto = { "code"?: string; "slug"?: string; "name"?: string; "description"?: string; "displayOrder"?: number; "status"?: "DRAFT" | "READY" | "ARCHIVED"; "materialCategory"?: "algebra" | "geometry" | "numbers" | "statistics" | null; };

export type CreateSubchapterDto = { "code": string; "slug"?: string; "name": string; "description"?: string; "displayOrder": number; "status"?: "DRAFT" | "READY" | "ARCHIVED"; "chapterId": string; };

export type UpdateSubchapterDto = { "code"?: string; "slug"?: string; "name"?: string; "description"?: string; "displayOrder"?: number; "status"?: "DRAFT" | "READY" | "ARCHIVED"; };

export type CreateCompetencyDto = { "subchapterId": string; "code": string; "description": string; "status"?: "DRAFT" | "READY" | "ARCHIVED"; };

export type UpdateCompetencyDto = { "code"?: string; "description"?: string; "status"?: "DRAFT" | "READY" | "ARCHIVED"; };

export type CreateLevelDto = { "subchapterId": string; "levelNumber": number; "description"?: string; "status"?: "DRAFT" | "READY" | "ARCHIVED"; };

export type UpdateLevelDto = { "description"?: string; "status"?: "DRAFT" | "READY" | "ARCHIVED"; };

export type QuestionContentDto = { "stem": string; "options": (ContentOptionDto)[]; "answerOptionId": string; "explanation": string; "difficulty": string; };

export type CreateQuestionDto = { "stem": string; "options": (ContentOptionDto)[]; "answerOptionId": string; "explanation": string; "difficulty": string; "usageType"?: "DRILL" | "PRETEST" | "TRYOUT"; "primaryCompetencyId": string; "curriculumLevelNumber"?: number; "sourceRef"?: string; "variantCode": string; };

export type CreateVariantDto = { "stem": string; "options": (ContentOptionDto)[]; "answerOptionId": string; "explanation": string; "difficulty": string; "originalVariantId": string; "variantCode": string; };

export type CreateVideoDto = { "title": string; "url": string; "source": string; "subchapterId": string; "recommendationOrder": number; "status"?: "DRAFT" | "READY" | "ARCHIVED"; };

export type UpdateVideoDto = { "title"?: string; "url"?: string; "source"?: string; "subchapterId"?: string; "recommendationOrder"?: number; "status"?: "DRAFT" | "READY" | "ARCHIVED"; };

export type AdminReportDto = { "id": string; "kind": "QUESTION" | "VIDEO"; "referenceId": string; "category": string; "details": string | null; "status": "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED"; "followUp": string | null; "reportedAt": string; };

export type AdminReportsDto = { "items": (AdminReportDto)[]; };

export type ResolveReportDto = { "status": "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED"; "followUp": string; };

export type AdminIrtItemDto = { "id": string; "batchId": string; "questionVersionId": string; "modelVersion": string; "batchStatus": string; "sampleSize": number; "dataStatus": string; "difficultyB": string | null; "discriminationA": string | null; "guessingC": string | null; };

export type AdminIrtDto = { "items": (AdminIrtItemDto)[]; };

export type IrtConfigurationPinDto = { "approvalId": string; "digest": string; };

export type PrepareIrtRequestDto = { "contextId": string; "configurationPins": (IrtConfigurationPinDto)[]; };

export type IrtRequestExecutionDto = { "id": string; "status": "RUNNING" | "SUCCEEDED" | "FAILED" | "EXPIRED"; "attemptNumber": number; "leaseExpired": boolean; "failureCode": string | null; };

export type IrtRequestArtifactDto = { "id": string; "digest": string; "scientificDecision": string; };

export type IrtRequestDto = { "id": string; "contractVersion": 3; "contextId": string; "packageId": string; "status": "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED"; "inputDigest": string; "snapshotId": string; "snapshotDigest": string; "rowCount": number; "dispatchGeneration": number; "dueAt": string; "overdue": boolean; "acceptedExecutionId": string | null; "execution": IrtRequestExecutionDto | null; "failureCode": string | null; "artifacts": (IrtRequestArtifactDto)[]; };

export type IrtRequestsDto = { "items": (IrtRequestDto)[]; };

export type AdminIrtBatchDto = { "id": string; "packageId": string | null; "batchKind": string; "modelVersion": string; "status": "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED"; "startedAt": string; "finishedAt": string | null; "resultReleasedAt": string | null; "failureCode": string | null; };

export type AdminIrtBatchesDto = { "items": (AdminIrtBatchDto)[]; };

export type AdminAuditDto = { "id": string; "actorUserId": string | null; "action": string; "entityType": string; "entityId": string | null; "createdAt": string; };

export type AdminAuditListDto = { "items": (AdminAuditDto)[]; };

export type AdminDashboardDto = { "schools": number; "chapters": number; "questions": number; "readyVersions": number; "openReports": number; };

export type CreateTryoutDraftDto = { "familyCode": string; "packageVersion": number; "name": string; "questionVersionIds": (string)[]; };

export type UpdateTryoutDraftDto = { "name": string; "questionVersionIds": (string)[]; };

export type AdminTryoutDraftDto = { "id": string; "familyCode": string; "packageVersion": number; "name": string; "status": string; "questionVersionIds": (string)[]; };

export type AdminTryoutDraftsDto = { "items": (AdminTryoutDraftDto)[]; };

export type CreateDrillPackageDto = { "familyCode": string; "packageVersion": number; "name": string; "levelId": string; "variantIndex": number; "scoringPolicyVersionId": string; "questionVersionIds": (string)[]; };

export type UpdateDrillPackageDto = { "name": string; "scoringPolicyVersionId": string; "questionVersionIds": (string)[]; };

export type AdminDrillPackageDto = { "id": string; "familyCode": string; "packageVersion": number; "name": string; "levelId": string; "variantIndex": number | null; "scoringPolicyVersionId": string | null; "status": "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED"; "releaseAt": string | null; "questionVersionIds": (string)[]; };

export type AdminDrillPackagesDto = { "items": (AdminDrillPackageDto)[]; };
