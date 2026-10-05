// Generated from packages/contracts/openapi/openapi.json. Do not edit by hand.
// Run pnpm contracts:types after changing NestJS DTOs.

export type StudentMaterialsDto = { "chapters": (MaterialChapterDto)[]; "recentChapterId": string | null; };

export type MaterialChapterDto = { "id": string; "title": string; "order": number; "category": "algebra" | "geometry" | "numbers" | "statistics" | null; "totalLevels": number; "completedLevels": number; "continueSubchapterId": string | null; "subchapters": (MaterialSubchapterDto)[]; };

export type MaterialSubchapterDto = { "id": string; "title": string; "order": number; "totalLevels": number; "completedLevels": number; "availableLevels": number; "latestScore": number | null; "bestScore": number | null; };

export type NotificationActionDto = { "type": "feedback" | "pvp" | "tryout" | "result" | "roadmap" | "unavailable"; "enabled": boolean; "status": string | null; "feedbackId"?: string; "inviteId"?: string; "matchId"?: string; "packageId"?: string; "attemptId"?: string; "chapterId"?: string; "subchapterId"?: string; };

export type NotificationDto = { "id": string; "kind": "FEEDBACK_RECEIVED" | "PVP_INVITED" | "TRYOUT_OPENED" | "TRYOUT_RESULT_READY" | "LEVEL_UNLOCKED"; "title": string; "body": string; "occurredAt": string; "readAt": string | null; "archived": boolean; "action": NotificationActionDto; };

export type NotificationsDto = { "items": (NotificationDto)[]; "nextCursor": string | null; };

export type NotificationSummaryDto = { "total": number; "unread": number; };

export type NotificationReadDto = { "updated": number; };

export type ChapterDto = { "id": string; "slug"?: string; "title": string; "order": number; };

export type SubchapterDto = { "id": string; "slug"?: string; "chapterId": string; "title": string; "order": number; };

export type LevelDto = { "id": string; "title": string; "order": number; "status": "locked" | "open" | "inProgress" | "completed"; "latestScore": number | null; "bestScore": number | null; "latestStars"?: number | null; "bestStars"?: number | null; };

export type CatalogDto = { "chapters": (ChapterDto)[]; };

export type ChapterDetailDto = { "chapter": ChapterDto; "subchapters": (SubchapterDto)[]; };

export type SubchapterDetailDto = { "subchapter": SubchapterDto; "levels": (LevelDto)[]; };

export type StudentProgressDto = { "completedLevels": number; "totalLevels": number; "latestScore": number | null; };

export type OptionDto = { "id": string; "text": string; };

export type RichContentDto = { "text": string; };

export type PreviewOptionDto = { "id": string; "content": RichContentDto; };

export type PreviewCategoryDto = { "id": string; "label": string; };

export type PreviewMediaDto = { "instanceId": string; "assetId": string; "altText": string; "url": string; "expiresAt": string; };

export type MediaLinksDto = { "media": (PreviewMediaDto)[]; };

export type DrillQuestionDto = { "type"?: "SINGLE_CHOICE" | "MULTIPLE_CHOICE_MULTIPLE_ANSWER" | "CATEGORY"; "richStem"?: RichContentDto; "richOptions"?: (PreviewOptionDto)[]; "categories"?: (PreviewCategoryDto)[]; "answer"?: { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "questionInstanceId": string; "stem": string; "options": (OptionDto)[]; "selectedOptionId": string | null; };

export type DrillAttemptDto = { "id": string; "levelId": string; "levelTitle": string; "status": "inProgress" | "completed"; "startedAt": string; "serverTime"?: string; "isDemo": boolean; "questions": (DrillQuestionDto)[]; };

export type SavedAnswerDto = { "answer"?: { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "questionInstanceId": string; "selectedOptionId": string | null; };

export type ReviewedQuestionDto = { "type"?: "SINGLE_CHOICE" | "MULTIPLE_CHOICE_MULTIPLE_ANSWER" | "CATEGORY"; "richStem"?: RichContentDto; "richOptions"?: (PreviewOptionDto)[]; "categories"?: (PreviewCategoryDto)[]; "answer"?: { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "questionInstanceId": string; "stem": string; "options": (OptionDto)[]; "selectedOptionId": string | null; "correctOptionId": string | null; "explanation": string; "richExplanation"?: RichContentDto; "answerKey"?: { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "fullyCorrect"?: boolean; };

export type RecommendedVideoDto = { "id": string; "title": string; "url": string; "source": string; };

export type DrillRewardDto = { "policyCode": string; "policyVersion": number; "baseXp": number; "bonusXp": number; "totalXp": number; "durationSeconds": number; };

export type DrillResultDto = { "xp"?: number | null; "attemptId": string; "levelId": string; "levelTitle": string; "score": number; "rawPoints": number; "correctCount": number; "questionCount": number; "mastered": boolean; "stars": number | null; "drillPolicyVersion"?: number | null; "reward"?: DrillRewardDto | null; "unlockedLevelId": string | null; "isDemo": boolean; "explanationState": "available" | "expired"; "questions": (ReviewedQuestionDto)[]; "recommendations": (RecommendedVideoDto)[]; };

export type AssessmentRecordDto = { "attemptId": string; "activity": "drill" | "pretest" | "tryout"; "title": string; "isDemo": boolean; "chapterId"?: string | null; "chapterTitle"?: string | null; "subchapterId"?: string | null; "subchapterTitle"?: string | null; "levelId"?: string | null; "levelTitle"?: string | null; "xpState"?: "ready" | "legacy" | "pending" | "notApplicable"; "starsState"?: "ready" | "legacy" | "pending" | "notApplicable"; "xp"?: number | null; "stars"?: number | null; "drillPolicyVersion"?: number | null; "tryoutXpPolicyVersion"?: number | null; "submittedAt": string; "resultState": "ready" | "waitingIrt"; "score": number | null; };

export type AssessmentHistoryDto = { "records": (AssessmentRecordDto)[]; "nextCursor": string | null; };

export type CurrentTryoutDto = { "id"?: string; "title"?: string; "releaseAt"?: string; "state": "unavailable" | "open" | "inProgress" | "waitingIrt" | "resultReady"; "eligible"?: boolean; "attemptId"?: string | null; "questionCount"?: number | null; "durationSeconds"?: number | null; };

export type TryoutAttemptDto = { "xp"?: number | null; "xpPolicyVersion"?: number | null; "serverTime"?: string; "id": string; "packageId": string; "packageTitle": string; "status": "inProgress" | "submitted"; "deadlineAt": string | null; "questions": (DrillQuestionDto)[]; };

export type TryoutSubmitDto = { "xpPolicyVersion"?: number | null; "state": "waitingIrt"; "xp"?: number | null; };

export type TryoutReviewedQuestionDto = { "type"?: "SINGLE_CHOICE" | "MULTIPLE_CHOICE_MULTIPLE_ANSWER" | "CATEGORY"; "richOptions"?: (PreviewOptionDto)[]; "categories"?: (PreviewCategoryDto)[]; "richStem"?: RichContentDto; "richExplanation"?: RichContentDto; "answer"?: { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "answerKey"?: { "optionId": string; } | { "optionIds": (string)[]; } | { "categoryByStatementId": Record<string, string>; } | null; "fullyCorrect"?: boolean; "questionInstanceId": string; "stem": string; "selectedOptionId": string | null; "correctOptionId": string | null; "explanation": string; };

export type TryoutResultDto = { "xp"?: number | null; "xpPolicyVersion"?: number | null; "attemptId": string; "packageTitle": string; "score": number | null; "mode"?: "IRT" | "FALLBACK" | "UNSCORABLE" | "DEMO"; "publicationVersion"?: number | null; "correctCount": number; "questionCount": number; "explanation": (TryoutReviewedQuestionDto)[]; };

export type DashboardClassDto = { "id": string; "name": string; "schoolName": string; };

export type DashboardDrillDto = { "attemptId": string; "levelId": string | null; "title": string; };

export type StudentFeaturesDto = { "drill": boolean; "tryout": boolean; "pretest": boolean; "pvp": boolean; "classLeaderboard": boolean; "pendingPolicies": (string)[]; };

export type StudentDashboardDto = { "displayName": string; "affiliation": "MANDIRI" | "SCHOOL"; "class": DashboardClassDto | null; "classes"?: (DashboardClassDto)[]; "completedLevels": number; "availableLevels": number; "latestDrillScore": number | null; "bestDrillScore": number | null; "activities": (AssessmentRecordDto)[]; "activeDrill": DashboardDrillDto | null; "features": StudentFeaturesDto; };

export type PvpAvailabilityDto = { "available": boolean; "reasonCode": string | null; "message": string; };

export type StudentPeerDto = { "studentId": string; "displayName": string; };

export type StudentPeersDto = { "classmates": (StudentPeerDto)[]; };

export type PvpPlayerDto = { "studentId": string; "displayName": string; "slot": number; "ready": boolean; "connectionStatus": string; "reconnectDeadlineAt": string | null; "points": number; "result": string | null; };

export type PvpQuestionDto = { "id": string; "order": number; "stem": string; "options": (OptionDto)[]; "deadlineAt": string; "durationSeconds": number; "answered": boolean; "selectedOptionId": string | null; };

export type PvpSnapshotDto = { "matchId": string; "roomCode": string; "creatorStudentId": string; "difficulty": "easy" | "medium" | "hard"; "status": "WAITING" | "READY" | "RUNNING" | "FINISHED" | "CANCELLED"; "serverTime": string; "isDemo": boolean; "recordEligible": boolean; "endReason": string | null; "players": (PvpPlayerDto)[]; "question": PvpQuestionDto | null; };

export type PvpInviteDto = { "id": string; "matchId": string; "roomCode": string; "senderName": string; "expiresAt": string | null; };

export type PvpInvitesDto = { "invites": (PvpInviteDto)[]; };

export type LeaderboardEntryDto = { "studentId": string; "displayName": string; "points": number; "rank": number; };

export type LeaderboardPeriodDto = { "startsAt": string; "endsAt": string; "timezone": string; };

export type LeaderboardDto = { "policyPending": boolean; "reasonCode": string | null; "className": string | null; "classId"?: string | null; "unit": "points" | "xp"; "period": LeaderboardPeriodDto; "updatedAt": string | null; "entries": (LeaderboardEntryDto)[]; "ownEntry": LeaderboardEntryDto | null; };

export type StudentVideoDto = { "mappingId": string; "title": string; "url": string; "source": string; };

export type StudentVideosDto = { "items": (StudentVideoDto)[]; };

export type StudentQuestionReportDto = { "clientRequestId"?: string; "category": "QUESTION" | "OPTION" | "ANSWER_KEY" | "EXPLANATION"; "details"?: string; "attemptItemId": string; };

export type StudentVideoReportDto = { "clientRequestId"?: string; "category": string; "details"?: string; "attemptId": string; "mappingId": string; };

export type LearningInteractionDto = { "clientRequestId": string; "eventName": "tryout_opened" | "tryout_detail_viewed" | "explanation_viewed" | "video_clicked"; "attemptId"?: string; "mappingId"?: string; "packageId"?: string; };

export type LearningInteractionReceiptDto = { "state": "recorded" | "policyPending"; };
