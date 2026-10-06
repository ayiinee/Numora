// Generated from packages/contracts/openapi/openapi.json. Do not edit by hand.
// Run pnpm contracts:types after changing NestJS DTOs.

export type ImportBodyDto = { "expectedSourceVersionId"?: string; "revisionReason"?: string; "sourceNamespace": string; "questions": (Record<string, unknown>)[]; };

export type PretestDraftDto = { "familyCode": string; "packageVersion": number; "name": string; "chapterId": string; "blueprintVersionId"?: Record<string, unknown> | null; "questionVersionIds": (string)[]; };

export type PretestEditDto = { "name": string; "blueprintVersionId"?: Record<string, unknown> | null; "questionVersionIds": (string)[]; };

export type PretestReviewDto = { "reason": string; };

export type PretestDto = { "id": string; "familyCode": string; "packageVersion": number; "name": string; "chapterId": string; "blueprintVersionId": string | null; "state": "DRAFT" | "REVIEWED" | "ARCHIVED"; "manifestDigest": string | null; "questionVersionIds": (string)[]; "reviewBlockers": (string)[]; "publicationBlockers": (string)[]; };

export type PretestsDto = { "items": (PretestDto)[]; };

export type PretestBlueprintDto = { "id": string; "code": string; "version": number; "approvalReference": string; "approvedAt": string; };

export type PretestBlueprintsDto = { "items": (PretestBlueprintDto)[]; };

export type AdminAssessmentPolicyDto = { "id": string; "code": string; "version": number; "assessmentType": "DRILL" | "TRYOUT"; "approvedByUserId": string | null; "approvedAt": string | null; "approvalReference": string; };

export type AdminAssessmentPoliciesDto = { "items": (AdminAssessmentPolicyDto)[]; };

export type PublishTryoutPackageDto = { "scoringPolicyVersionId": string; "releaseAt": string; "durationSeconds": number; };

export type ReviewContentDto = { "status": "READY" | "REVISION" | "ARCHIVED"; "expectedStatus": "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; "reason": string; };

export type AdminReportDetailDto = { "id": string; "kind": "QUESTION" | "VIDEO"; "referenceId": string; "category": string; "details": string | null; "status": "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED"; "followUp": string | null; "reportedAt": string; "question": ContentVersionDetailDto | null; "video": AdminVideoReportTargetDto | null; "revisionQuestionVersionId": string | null; };

export type AdminVideoReportTargetDto = { "title": string; "url": string; "source": string; "videoId": string; "subchapterId": string; "recommendationOrder": number; "evidence": "REPORT_SNAPSHOT" | "CURRENT_METADATA"; };

export type ContentReadinessDto = { "canReviewReady": boolean; "contentBlockers": (string)[]; "publicationBlockers": (string)[]; };

export type ContentReviewEventDto = { "id": string; "actorId": string | null; "at": string; "status": string; "reason": string; };

export type ContentVersionDetailDto = { "reviews": (ContentReviewEventDto)[]; "id": string; "questionId": string; "versionNumber": number; "status": "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; "revisedFromId": string | null; "sourceNamespace": string | null; "reviewedByUserId": string | null; "reviewedAt": string | null; "payload": Record<string, unknown>; "readiness": ContentReadinessDto; };

export type CreateMediaUploadDto = { "externalId": string; "assetId": string; "contentVersion"?: number; "contentType": "image/png" | "image/jpeg" | "image/webp"; "byteLength": number; "sha256": string; };

export type MediaUploadReceiptDto = { "uploadId": string; "status": "PENDING" | "VERIFIED"; "externalId": string; "assetId": string; "bucket": string; "objectKey": string; "contentType": string; "byteLength": number; "sha256": string; "verifiedAt": string | null; };

export type MediaUploadReservationDto = { "uploadId": string; "status": "PENDING" | "VERIFIED"; "externalId": string; "assetId": string; "bucket": string; "objectKey": string; "contentType": string; "byteLength": number; "sha256": string; "verifiedAt": string | null; "uploadUrl": string | null; "method": "PUT" | null; "headers": Record<string, string> | null; "expiresAt": string; };

export type ImportItemDto = { "externalId": string; "canImportDraft": boolean; "canPreview": boolean; "blockers": (string)[]; "outcome": "VALIDATED" | "CREATED" | "CREATED_REVISION" | "SKIPPED_UNCHANGED" | "INVALID"; "questionVersionId": string | null; };

export type ImportReportDto = { "id": string | null; "sourceNamespace": string; "canImportDraft": boolean; "items": (ImportItemDto)[]; };

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

export type AdminTaxonDto = { "materialCategory"?: "algebra" | "geometry" | "numbers" | "statistics" | null; "id": string; "kind": "CHAPTER" | "SUBCHAPTER" | "COMPETENCY" | "LEVEL"; "parentId": string | null; "code": string; "slug"?: string | null; "name": string; "displayOrder": number; "status": "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type AdminUserDto = { "id": string; "displayName": string; "role": "STUDENT" | "TEACHER" | "ADMIN"; "status": "ACTIVE" | "DISABLED"; "createdAt": string; };

export type AdminUserDetailDto = { "id": string; "displayName": string; "role": "STUDENT" | "TEACHER" | "ADMIN"; "status": "ACTIVE" | "DISABLED"; "createdAt": string; "email": string; "affiliation": "MANDIRI" | "SCHOOL" | null; "teacherVerified": boolean | null; };

export type AdminMembershipDto = { "id": string; "schoolId": string; "schoolName": string; "classId": string | null; "className": string | null; "startedAt": string; "endedAt": string | null; "active": boolean; };

export type AdminMembershipsDto = { "items": (AdminMembershipDto)[]; "nextOffset": number | null; };

export type AdminRosterMemberDto = { "id": string; "displayName": string; "role": "STUDENT" | "TEACHER" | "ADMIN"; "status": "ACTIVE" | "DISABLED"; "createdAt": string; "membershipId": string; "joinedAt": string; "leftAt": string | null; };

export type AdminRosterDto = { "items": (AdminRosterMemberDto)[]; "nextOffset": number | null; };

export type AdminStructureSchoolDto = { "id": string; "name": string; "code": string; "status": "ACTIVE" | "INACTIVE"; "classCount": number; "activeTeacherCount": number; "availableCredentialCount": number; "usedCredentialCount": number; "expiredCredentialCount": number; "revokedCredentialCount": number; "studentCount": number; };

export type AdminStructureSchoolsDto = { "items": (AdminStructureSchoolDto)[]; "nextOffset": number | null; };

export type AdminStructureClassDto = { "id": string; "name": string; "schoolId": string; "schoolName": string; "studentCount": number; "teacherActive": boolean; "createdAt": string; "archivedAt": string | null; };

export type AdminStructureClassesDto = { "items": (AdminStructureClassDto)[]; "nextOffset": number | null; };

export type AdminAccountDto = { "id": string; "displayName": string; "email": string; "adminRole": "SUPER_ADMIN" | "OPERATIONS" | "CONTENT_DATA_MODERATION" | null; "status": "ACTIVE" | "DISABLED"; "createdAt": string; };

export type AdminAccountsDto = { "items": (AdminAccountDto)[]; "nextOffset": number | null; };

export type AdminInvitationDto = { "id": string; "email": string; "displayName": string; "targetRole": "SUPER_ADMIN" | "OPERATIONS" | "CONTENT_DATA_MODERATION"; "status": "RESERVED" | "SENDING" | "INVITED" | "FAILED" | "ACCEPTED" | "CANCELLED"; "userId": string | null; "failureCode": string | null; "createdAt": string; "updatedAt": string; };

export type AdminRecoveryDto = { "id": string; "status": "RESERVED" | "SENDING" | "SENT" | "FAILED"; "failureCode": string | null; };

export type AdminInvitationsDto = { "items": (AdminInvitationDto)[]; "nextOffset": number | null; };

export type InviteAdminDto = { "email": string; "displayName": string; "adminRole": "SUPER_ADMIN" | "OPERATIONS" | "CONTENT_DATA_MODERATION"; };

export type UpdateAdminAccountDto = { "adminRole"?: "SUPER_ADMIN" | "OPERATIONS" | "CONTENT_DATA_MODERATION"; "status"?: "ACTIVE" | "DISABLED"; };

export type AdminUserListDto = { "items": (AdminUserDto)[]; "nextOffset": number | null; };

export type AdminClassDto = { "id": string; "name": string; "schoolId": string; "schoolName": string; "teacherId": string | null; "teacherName": string | null; "teacherActive": boolean; "studentCount": number; "createdAt": string; "archivedAt": string | null; };

export type AdminClassListDto = { "items": (AdminClassDto)[]; "nextOffset": number | null; };

export type AdminCurriculumDto = { "items": (AdminTaxonDto)[]; };

export type AdminVersionDto = { "imported"?: boolean; "id": string; "questionId": string; "primaryCompetencyId": string; "curriculumLevelNumber"?: number | null; "variantId": string; "variantCode": string; "variantKind": "ORIGINAL" | "VARIANT"; "originalVariantId": string | null; "versionNumber": number; "questionType": string; "stem": string; "options": (ContentOptionDto)[]; "answerOptionId": string | null; "explanation": string; "difficulty": string | null; "contentStatus": "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; "questionStatus": "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; "reviewedByUserId": string | null; "reviewedAt": string | null; };

export type AdminVersionsDto = { "items": (AdminVersionDto)[]; };

export type AdminVideoDto = { "id": string; "mappingId": string; "subchapterId": string; "title": string; "url": string; "source": string; "recommendationOrder": number; "status": "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type AdminVideosDto = { "items": (AdminVideoDto)[]; };

export type ContentMutationDto = { "id": string; };

export type CreateChapterDto = { "code": string; "slug"?: string; "name": string; "description"?: string; "displayOrder": number; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; "materialCategory"?: "algebra" | "geometry" | "numbers" | "statistics" | null; };

export type UpdateChapterDto = { "code"?: string; "slug"?: string; "name"?: string; "description"?: string; "displayOrder"?: number; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; "materialCategory"?: "algebra" | "geometry" | "numbers" | "statistics" | null; };

export type CreateSubchapterDto = { "code": string; "slug"?: string; "name": string; "description"?: string; "displayOrder": number; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; "chapterId": string; };

export type UpdateSubchapterDto = { "code"?: string; "slug"?: string; "name"?: string; "description"?: string; "displayOrder"?: number; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type CreateCompetencyDto = { "subchapterId": string; "code": string; "description": string; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type UpdateCompetencyDto = { "code"?: string; "description"?: string; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type CreateLevelDto = { "subchapterId": string; "levelNumber": number; "description"?: string; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type UpdateLevelDto = { "description"?: string; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type QuestionContentDto = { "stem": string; "options": (ContentOptionDto)[]; "answerOptionId": string; "explanation": string; "difficulty": string; };

export type CreateQuestionDto = { "stem": string; "options": (ContentOptionDto)[]; "answerOptionId": string; "explanation": string; "difficulty": string; "primaryCompetencyId": string; "curriculumLevelNumber"?: number; "sourceRef"?: string; "variantCode": string; };

export type CreateVariantDto = { "stem": string; "options": (ContentOptionDto)[]; "answerOptionId": string; "explanation": string; "difficulty": string; "originalVariantId": string; "variantCode": string; };

export type CreateVideoDto = { "title": string; "url": string; "source": string; "subchapterId": string; "recommendationOrder": number; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type UpdateVideoDto = { "title"?: string; "url"?: string; "source"?: string; "subchapterId"?: string; "recommendationOrder"?: number; "status"?: "DRAFT" | "READY" | "ARCHIVED" | "REVISION"; };

export type AdminReportDto = { "id": string; "kind": "QUESTION" | "VIDEO"; "referenceId": string; "category": string; "details": string | null; "status": "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED"; "followUp": string | null; "reportedAt": string; };

export type AdminReportsDto = { "items": (AdminReportDto)[]; "nextOffset": number | null; };

export type ResolveReportDto = { "revisionQuestionVersionId"?: string; "status": "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED"; "followUp": string; };

export type AdminAnalyticsMetricDto = { "key": string; "label": string; "domain": "STRUCTURE" | "STUDENTS" | "OPERATIONS" | "CONTENT" | "RELEASE"; "value": number | null; "unavailableReason": string | null; };

export type AdminAnalyticsDto = { "generatedAt": string; "source": "POSTGRESQL"; "metrics": (AdminAnalyticsMetricDto)[]; };

export type IrtApprovedConfigurationDto = { "approvalId": string; "digest": string; "code": string; "version": number; "kind": string; "contextId": string | null; "approvedAt": string; };

export type IrtBatchHealthDto = { "id": string; "packageId": string; "title": string; "status": string; "contextId": string | null; "closesAt": string; "dueAt": string; "overdue": boolean; "activeAttemptCount": number; "finalizedAttemptCount": number; "publicationMode": string | null; "publicationVersion": number | null; "publishedAt": string | null; "prepareBlockers": (string)[]; "publicationBlockers": (string)[]; };

export type IrtOperationalOptionsDto = { "enabled": boolean; "configurations": (IrtApprovedConfigurationDto)[]; };

export type IrtBatchHealthListDto = { "items": (IrtBatchHealthDto)[]; };

export type AdminIrtItemDto = { "id": string; "batchId": string; "questionVersionId": string; "modelVersion": string; "batchStatus": string; "sampleSize": number; "dataStatus": string; "difficultyB": string | null; "discriminationA": string | null; "guessingC": string | null; };

export type AdminIrtDto = { "items": (AdminIrtItemDto)[]; };

export type IrtConfigurationPinDto = { "approvalId": string; "digest": string; };

export type PrepareIrtRequestDto = { "contextId": string; "configurationPins": (IrtConfigurationPinDto)[]; };

export type IrtRequestExecutionDto = { "id": string; "status": "RUNNING" | "SUCCEEDED" | "FAILED" | "EXPIRED"; "attemptNumber": number; "leaseExpired": boolean; "failureCode": string | null; };

export type IrtRequestArtifactDto = { "id": string; "digest": string; "scientificDecision": string; };

export type IrtRequestDto = { "id": string; "contractVersion": 3; "contextId": string; "configurationPins": (IrtConfigurationPinDto)[]; "packageId": string; "status": "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED"; "inputDigest": string; "snapshotId": string; "snapshotDigest": string; "rowCount": number; "dispatchGeneration": number; "dueAt": string; "overdue": boolean; "acceptedExecutionId": string | null; "execution": IrtRequestExecutionDto | null; "failureCode": string | null; "artifacts": (IrtRequestArtifactDto)[]; };

export type IrtRequestsDto = { "items": (IrtRequestDto)[]; };

export type AdminIrtBatchDto = { "id": string; "packageId": string | null; "batchKind": string; "modelVersion": string; "status": "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED"; "startedAt": string; "finishedAt": string | null; "resultReleasedAt": string | null; "failureCode": string | null; };

export type AdminIrtBatchesDto = { "items": (AdminIrtBatchDto)[]; };

export type AdminAuditDto = { "id": string; "actorUserId": string | null; "action": string; "entityType": string; "entityId": string | null; "createdAt": string; };

export type AdminAuditListDto = { "items": (AdminAuditDto)[]; };

export type AdminDashboardDto = { "schools": number; "chapters": number | null; "questions": number | null; "readyVersions": number | null; "openReports": number | null; };

export type CreateTryoutDraftDto = { "familyCode": string; "packageVersion": number; "name": string; "questionVersionIds": (string)[]; };

export type UpdateTryoutDraftDto = { "name": string; "questionVersionIds": (string)[]; };

export type AdminTryoutDraftDto = { "id": string; "familyCode": string; "packageVersion": number; "name": string; "status": string; "questionVersionIds": (string)[]; };

export type AdminTryoutDraftsDto = { "items": (AdminTryoutDraftDto)[]; };

export type CreateDrillPackageDto = { "familyCode": string; "packageVersion": number; "name": string; "levelId": string; "variantIndex": number; "scoringPolicyVersionId": string; "questionVersionIds": (string)[]; };

export type UpdateDrillPackageDto = { "name": string; "scoringPolicyVersionId": string; "questionVersionIds": (string)[]; };

export type AdminDrillPackageDto = { "id": string; "familyCode": string; "packageVersion": number; "name": string; "levelId": string; "variantIndex": number | null; "scoringPolicyVersionId": string | null; "status": "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED"; "releaseAt": string | null; "questionVersionIds": (string)[]; };

export type AdminDrillPackagesDto = { "items": (AdminDrillPackageDto)[]; };
