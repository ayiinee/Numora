// Generated from packages/contracts/openapi/openapi.json. Do not edit by hand.
// Run pnpm contracts:types after changing NestJS DTOs.

export type IdentityProfileDto = { "adminRole"?: "SUPER_ADMIN" | "OPERATIONS" | "CONTENT_DATA_MODERATION" | null; "capabilities"?: ("CONTENT_MANAGE")[]; "id": string; "role": "STUDENT" | "TEACHER" | "ADMIN"; "profilePhotoObjectKey"?: string | null; "status": "ACTIVE" | "DISABLED"; "displayName": string; "email": string; "teacherVerified": boolean | null; "studentAffiliation": "MANDIRI" | "SCHOOL" | null; };

export type RegisterProfileDto = { "role": "STUDENT" | "TEACHER"; };

export type SchoolDto = { "id": string; "name": string; };

export type SchoolListDto = { "items": (SchoolDto)[]; };

export type VerifyTeacherDto = { "token": string; };

export type VerifiedDto = { "verified": boolean; };

export type ClassSummaryDto = { "id": string; "name": string; "joinCode"?: string; };

export type CreatedClassDto = { "id": string; "name": string; "joinCode": string; };

export type CreateClassDto = { "schoolId"?: string; "name": string; };

export type JoinClassDto = { "joinCode": string; };

export type JoinedClassDto = { "class": ClassSummaryDto; "joined": boolean; };

export type StudentSummaryDto = { "id": string; "displayName": string; };

export type ClassesResponseDto = { "items": (ClassSummaryDto)[]; };

export type ClassStudentsResponseDto = { "class": ClassSummaryDto; "items": (StudentSummaryDto)[]; };

export type ClassDto = { "id": string; "name": string; };

export type StudentDto = { "id": string; "displayName": string; };

export type MonitoredLevelDto = { "levelId": string; "chapterLabel": string; "subchapterLabel": string; "levelLabel": string; "accessStatus": "LOCKED" | "UNLOCKED"; "inProgress": boolean; "latestDrillScore": number | null; "bestDrillScore": number | null; };

export type TeacherStudentProgressDto = { "class": ClassDto; "student": StudentDto; "latestDrillScore": number | null; "levels": (MonitoredLevelDto)[]; };

export type AdminSchoolDto = { "id": string; "code": string; "name": string; "status": "ACTIVE" | "INACTIVE"; };

export type AdminSchoolsDto = { "items": (AdminSchoolDto)[]; };

export type CreateSchoolDto = { "code": string; "name": string; };

export type UpdateSchoolDto = { "name"?: string; "status"?: "ACTIVE" | "INACTIVE"; };

export type TokenDto = { "id": string; "token": string; "expiresAt": string; };

export type TokenSummaryDto = { "id": string; "expiresAt": string; "usedAt": string | null; "revokedAt": string | null; };

export type TokenListDto = { "items": (TokenSummaryDto)[]; };

export type RevokedDto = { "revoked": boolean; };

export type CreateFeedbackDto = { "clientRequestId": string; "body": string; };

export type FeedbackDto = { "id": string; "classId": string; "studentId": string; "teacherName": string; "body": string; "sentAt": string; "readAt": string | null; };

export type FeedbackListDto = { "items": (FeedbackDto)[]; "nextOffset": number | null; };

export type FeedbackSummaryDto = { "unreadCount": number; "latest": (FeedbackDto)[]; };

export type ReadFeedbackDto = { "id": string; "readAt": string; };
