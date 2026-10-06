import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('packages/contracts/openapi/openapi.json');
const names = [
  'StudentMaterialsDto',
  'MaterialChapterDto',
  'MaterialSubchapterDto',
  'NotificationActionDto',
  'NotificationDto',
  'NotificationsDto',
  'NotificationSummaryDto',
  'NotificationReadDto',
  'ChapterDto',
  'SubchapterDto',
  'LevelDto',
  'CatalogDto',
  'ChapterDetailDto',
  'SubchapterDetailDto',
  'StudentProgressDto',
  'OptionDto',
  'SaveDrillAnswerDto',
  'AssessmentXpDetailDto',
  'RichContentDto',
  'PreviewOptionDto',
  'PreviewCategoryDto',
  'PreviewMediaDto',
  'MediaLinksDto',
  'DrillQuestionDto',
  'DrillAttemptDto',
  'SavedAnswerDto',
  'ReviewedQuestionDto',
  'ReviewOptionDto',
  'ReviewStatementDto',
  'RecommendedVideoDto',
  'DrillRewardDto',
  'DrillResultDto',
  'AssessmentRecordDto',
  'AssessmentHistoryDto',
  'CurrentTryoutDto',
  'TryoutPackageDto',
  'TryoutPackagesDto',
  'StartPretestDto',
  'SavePretestAnswerDto',
  'PretestSavedAnswerDto',
  'PretestChapterDto',
  'PretestQuestionDto',
  'PretestAttemptDto',
  'PretestUnlockedLevelDto',
  'PretestResultDto',
  'TryoutAttemptDto',
  'TryoutSubmitDto',
  'TryoutReviewedQuestionDto',
  'TryoutResultDto',
  'DashboardClassDto',
  'DashboardDrillDto',
  'StudentFeaturesDto',
  'StudentDashboardDto',
  'PvpAvailabilityDto',
  'PvpDifficultyAvailabilityDto',
  'StudentPeerDto',
  'StudentPeersDto',
  'PvpPlayerDto',
  'PvpQuestionDto',
  'PvpSnapshotDto',
  'PvpInviteDto',
  'PvpInvitesDto',
  'LeaderboardEntryDto',
  'LeaderboardPeriodDto',
  'LeaderboardDto',
  'LeaderboardPeriodsDto',
  'StudentVideoDto',
  'StudentVideosDto',
  'StudentQuestionReportDto',
  'StudentVideoReportDto',
  'LearningInteractionDto',
  'LearningInteractionReceiptDto',
];
const groups = [
  {
    target: 'apps/web/src/lib/generated-api-types.ts',
    names: [
      'IdentityProfileDto',
      'RegisterProfileDto',
      'SchoolDto',
      'SchoolListDto',
      'VerifyTeacherDto',
      'VerifiedDto',
      'ClassSummaryDto',
      'CreatedClassDto',
      'CreateClassDto',
      'JoinClassDto',
      'JoinedClassDto',
      'StudentSummaryDto',
      'ClassesResponseDto',
      'ClassStudentsResponseDto',
      'ClassDto',
      'StudentDto',
      'MonitoredLevelDto',
      'TeacherStudentProgressDto',
      'AdminSchoolDto',
      'AdminSchoolsDto',
      'CreateSchoolDto',
      'UpdateSchoolDto',
      'TokenDto',
      'TokenSummaryDto',
      'TokenListDto',
      'RevokedDto',
      'CreateFeedbackDto',
      'FeedbackDto',
      'FeedbackListDto',
      'FeedbackSummaryDto',
      'ReadFeedbackDto',
    ],
  },
  { target: 'apps/web/src/features/core-learning/generated-types.ts', names },
  {
    target: 'apps/web/src/features/admin/generated-types.ts',
    names: [
      'ImportBodyDto',
      'PackageTargetDto',
      'WorkbookBindingDto',
      'PackageSourceDto',
      'PackageCheckDto',
      'PackageValidationDto',
      'CreateContentPackageDto',
      'UpdateContentPackageDto',
      'ContentPackageDto',
      'ContentPackagesDto',
      'ContentPackageDetailDto',
      'ContentPackageItemDto',
      'ContentDistributionDto',
      'ClassifyQuestionDto',
      'ReviewImportedQuestionDto',
      'ExcelParseDto',
      'ExcelEnvelopeDto',
      'ExcelQuestionDto',
      'ExcelMetadataDto',
      'ExcelAssetDto',
      'ExcelIssueDto',
      'ExcelMediaDto',
      'PretestDraftDto',
      'PretestEditDto',
      'PretestReviewDto',
      'PretestDto',
      'PretestsDto',
      'PretestBlueprintDto',
      'PretestBlueprintsDto',
      'AdminAssessmentPolicyDto',
      'AdminAssessmentPoliciesDto',
      'PublishTryoutPackageDto',
      'ReviewContentDto',
      'AdminReportDetailDto',
      'AdminVideoReportTargetDto',
      'ContentReadinessDto',
      'ContentReviewEventDto',
      'ContentVersionDetailDto',
      'CreateMediaUploadDto',
      'MediaUploadReceiptDto',
      'MediaUploadReservationDto',
      'ImportItemDto',
      'ImportIssueDto',
      'ImportReportDto',
      'CreatePreviewDto',
      'SavePreviewAnswerDto',
      'PreviewAckDto',
      'RichContentDto',
      'PreviewOptionDto',
      'PreviewCategoryDto',
      'PreviewMediaDto',
      'PreviewItemDto',
      'PreviewSessionDto',
      'MediaLinkRequestDto',
      'MediaLinksDto',
      'ContentOptionDto',
      'AdminTaxonDto',
      'AdminUserDto',
      'AdminUserDetailDto',
      'AdminMembershipDto',
      'AdminMembershipsDto',
      'AdminRosterMemberDto',
      'AdminRosterDto',
      'AdminStructureSchoolDto',
      'AdminStructureSchoolsDto',
      'AdminStructureClassDto',
      'AdminStructureClassesDto',
      'AdminAccountDto',
      'AdminAccountsDto',
      'AdminInvitationDto',
      'AdminRecoveryDto',
      'AdminInvitationsDto',
      'InviteAdminDto',
      'UpdateAdminAccountDto',
      'AdminUserListDto',
      'AdminClassDto',
      'AdminClassListDto',
      'AdminCurriculumDto',
      'AdminVersionDto',
      'AdminVersionsDto',
      'AdminVideoDto',
      'AdminVideosDto',
      'ContentMutationDto',
      'CreateChapterDto',
      'UpdateChapterDto',
      'CreateSubchapterDto',
      'UpdateSubchapterDto',
      'CreateCompetencyDto',
      'UpdateCompetencyDto',
      'CreateLevelDto',
      'UpdateLevelDto',
      'QuestionContentDto',
      'CreateQuestionDto',
      'CreateVariantDto',
      'CreateVideoDto',
      'UpdateVideoDto',
      'AdminReportDto',
      'AdminReportsDto',
      'ResolveReportDto',
      'AdminAnalyticsMetricDto',
      'AdminAnalyticsDto',
      'IrtApprovedConfigurationDto',
      'IrtBatchHealthDto',
      'IrtOperationalOptionsDto',
      'IrtBatchHealthListDto',
      'AdminIrtItemDto',
      'AdminIrtDto',
      'IrtConfigurationPinDto',
      'PrepareIrtRequestDto',
      'IrtRequestExecutionDto',
      'IrtRequestArtifactDto',
      'IrtRequestDto',
      'IrtRequestsDto',
      'AdminIrtBatchDto',
      'AdminIrtBatchesDto',
      'AdminAuditDto',
      'AdminAuditListDto',
      'AdminDashboardDto',
      'CreateTryoutDraftDto',
      'UpdateTryoutDraftDto',
      'AdminTryoutDraftDto',
      'AdminTryoutDraftsDto',
      'CreateDrillPackageDto',
      'UpdateDrillPackageDto',
      'AdminDrillPackageDto',
      'AdminDrillPackagesDto',
    ],
  },
];

function renderType(schema) {
  if (schema.$ref) return schema.$ref.split('/').at(-1) + (schema.nullable ? ' | null' : '');
  if (schema.allOf)
    return schema.allOf.map(renderType).join(' & ') + (schema.nullable ? ' | null' : '');
  if (schema.oneOf || schema.anyOf)
    return (
      (schema.oneOf ?? schema.anyOf).map(renderType).join(' | ') +
      (schema.nullable ? ' | null' : '')
    );
  if ('const' in schema) return JSON.stringify(schema.const);
  if (Array.isArray(schema.type))
    return schema.type.map((type) => renderType({ ...schema, type })).join(' | ');
  if (schema.type === 'null') return 'null';
  const base = schema.enum
    ? schema.enum.map((value) => JSON.stringify(value)).join(' | ')
    : schema.type === 'array'
      ? `(${renderType(schema.items)})[]`
      : schema.type === 'string'
        ? 'string'
        : schema.type === 'number' || schema.type === 'integer'
          ? 'number'
          : schema.type === 'boolean'
            ? 'boolean'
            : schema.type === 'object'
              ? renderObject(schema)
              : 'unknown';
  return schema.nullable ? `${base} | null` : base;
}

const socketSchema = JSON.parse(
  await readFile('packages/contracts/websocket/pvp-events.schema.json', 'utf8'),
);
const socketTarget = 'apps/web/src/features/pvp/generated-protocol.ts';
const socketResult = [
  '// Generated from pvp-events.schema.json. Do not edit by hand.',
  '',
  ...Object.entries(socketSchema.$defs).map(
    ([name, schema]) => `export type ${name} = ${renderType(schema)};\n`,
  ),
  `export type PvpEnvelope = ${renderType(socketSchema)};\n`,
].join('\n');
if (process.argv.includes('--check')) {
  if (
    (await readFile(socketTarget, 'utf8').catch(() => '')).replaceAll('\r\n', '\n') !== socketResult
  )
    throw new Error('PvP types are stale.');
} else await writeFile(socketTarget, socketResult);

function renderObject(schema) {
  if (!schema.properties)
    return `Record<string, ${schema.additionalProperties && typeof schema.additionalProperties === 'object' ? renderType(schema.additionalProperties) : 'unknown'}>`;
  const required = new Set(schema.required ?? []);
  return `{ ${Object.entries(schema.properties ?? {})
    .map(
      ([name, value]) =>
        `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${renderType(value)};`,
    )
    .join(' ')} }`;
}

const document = JSON.parse(await readFile(source, 'utf8'));
for (const group of groups) {
  const target = resolve(group.target);
  const lines = [
    '// Generated from packages/contracts/openapi/openapi.json. Do not edit by hand.',
    '// Run pnpm contracts:types after changing NestJS DTOs.',
    '',
  ];
  for (const name of group.names) {
    const schema = document.components?.schemas?.[name];
    if (!schema) throw new Error(`OpenAPI schema ${name} is missing.`);
    lines.push(`export type ${name} = ${renderType(schema)};`, '');
  }
  const result = lines.join('\n');
  if (process.argv.includes('--check')) {
    const current = await readFile(target, 'utf8').catch(() => '');
    if (current.replaceAll('\r\n', '\n') !== result)
      throw new Error(`${group.target} is stale. Run pnpm contracts:types.`);
  } else {
    await writeFile(target, result);
    console.log(`Generated ${target}`);
  }
}
