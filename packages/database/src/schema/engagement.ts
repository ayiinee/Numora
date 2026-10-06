import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { assessmentAttempts, assessmentPackages, packageItems } from './assessments.js';
import { classes } from './classes.js';
import { users } from './identity.js';
import { questionVersions } from './content.js';
import { scoringPolicyVersions } from './assessments.js';

export const pvpMatchStatus = pgEnum('pvp_match_status', [
  'WAITING',
  'READY',
  'RUNNING',
  'FINISHED',
  'CANCELLED',
]);
export const pvpConnectionStatus = pgEnum('pvp_connection_status', [
  'CONNECTED',
  'DISCONNECTED',
  'FORFEIT',
]);
export const pvpInviteStatus = pgEnum('pvp_invite_status', [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
]);
export const leaderboardPeriodStatus = pgEnum('leaderboard_period_status', ['ACTIVE', 'ARCHIVED']);
export const xpSourceType = pgEnum('xp_source_type', ['DRILL', 'TRYOUT']);

export const leaderboardPeriods = pgTable(
  'leaderboard_periods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull().default('Asia/Jakarta'),
    status: leaderboardPeriodStatus('status').notNull().default('ACTIVE'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    projectedAt: timestamp('projected_at', { withTimezone: true }),
    rankPolicyVersion: text('rank_policy_version').notNull().default('legacy-competition-v0'),
  },
  (table) => [
    uniqueIndex('leaderboard_periods_starts_at_uq').on(table.startsAt),
    check('leaderboard_periods_range_ck', sql`${table.endsAt} > ${table.startsAt}`),
  ],
).enableRLS();

export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    classIdAtEvent: uuid('class_id_at_event').references(() => classes.id, {
      onDelete: 'restrict',
    }),
    sourceType: xpSourceType('source_type').notNull(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => assessmentAttempts.id, { onDelete: 'restrict' }),
    xpAmount: numeric('xp_amount', { precision: 14, scale: 6, mode: 'number' }).notNull(),
    policyCode: text('policy_code'),
    policyVersion: integer('policy_version'),
    baseXp: numeric('base_xp', { precision: 14, scale: 6, mode: 'number' }),
    bonusXp: numeric('bonus_xp', { precision: 18, scale: 12 }),
    durationSeconds: numeric('duration_seconds', { precision: 14, scale: 3 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    periodId: uuid('period_id').references(() => leaderboardPeriods.id, { onDelete: 'restrict' }),
  },
  (table) => [
    uniqueIndex('xp_ledger_attempt_uq').on(table.attemptId),
    index('xp_ledger_student_time_idx').on(table.studentId, table.occurredAt),
    index('xp_ledger_class_period_idx').on(table.classIdAtEvent, table.periodId),
    foreignKey({
      name: 'xp_ledger_attempt_student_fk',
      columns: [table.attemptId, table.studentId],
      foreignColumns: [assessmentAttempts.id, assessmentAttempts.studentId],
    }).onDelete('restrict'),
    check('xp_ledger_amount_ck', sql`${table.xpAmount} >= 0`),
  ],
).enableRLS();

export const classLeaderboardEntries = pgTable(
  'class_leaderboard_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => leaderboardPeriods.id, { onDelete: 'restrict' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    totalXp: numeric('total_xp', { precision: 18, scale: 6, mode: 'number' }).notNull().default(0),
    rank: integer('rank'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('class_leaderboard_entries_period_class_student_uq').on(
      table.periodId,
      table.classId,
      table.studentId,
    ),
    index('class_leaderboard_period_class_rank_idx').on(table.periodId, table.classId, table.rank),
    check('class_leaderboard_entries_xp_ck', sql`${table.totalXp} >= 0`),
    check('class_leaderboard_entries_rank_ck', sql`${table.rank} is null or ${table.rank} > 0`),
  ],
).enableRLS();

// Account-based activity projection, separate from class scope and PvP points.
export const globalActivityLeaderboardEntries = pgTable(
  'global_activity_leaderboard_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => leaderboardPeriods.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    totalXp: numeric('total_xp', { precision: 18, scale: 6, mode: 'number' }).notNull().default(0),
    rank: integer('rank'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('global_activity_leaderboard_period_student_uq').on(
      table.periodId,
      table.studentId,
    ),
    index('global_activity_leaderboard_period_rank_idx').on(table.periodId, table.rank),
    check('global_activity_leaderboard_xp_ck', sql`${table.totalXp} >= 0`),
    check('global_activity_leaderboard_rank_ck', sql`${table.rank} is null or ${table.rank} > 0`),
  ],
).enableRLS();

export const pvpMatches = pgTable(
  'pvp_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomCode: text('room_code').notNull(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => assessmentPackages.id, { onDelete: 'restrict' }),
    creatorStudentId: uuid('creator_student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createRequestId: uuid('create_request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    scoringPolicyVersionId: uuid('scoring_policy_version_id').references(
      () => scoringPolicyVersions.id,
      { onDelete: 'restrict' },
    ),
    difficulty: text('difficulty').notNull(),
    status: pvpMatchStatus('status').notNull().default('WAITING'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason'),
    recordEligible: boolean('record_eligible').notNull().default(false),
    scoringSnapshot: jsonb('scoring_snapshot').notNull().default({}),
    dataMode: text('data_mode').$type<'demo' | 'official' | 'legacy'>().notNull().default('legacy'),
  },
  (table) => [
    uniqueIndex('pvp_matches_room_code_uq').on(table.roomCode),
    uniqueIndex('pvp_matches_creator_request_uq').on(table.creatorStudentId, table.createRequestId),
    uniqueIndex('pvp_matches_id_package_uq').on(table.id, table.packageId),
    check(
      'pvp_matches_time_ck',
      sql`${table.endedAt} is null or ${table.endedAt} >= coalesce(${table.startedAt}, ${table.createdAt})`,
    ),
    check('pvp_matches_difficulty_ck', sql`${table.difficulty} in ('easy', 'medium', 'hard')`),
    check('pvp_matches_data_mode_ck', sql`${table.dataMode} in ('demo', 'official', 'legacy')`),
  ],
).enableRLS();

export const pvpPlayers = pgTable(
  'pvp_players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => pvpMatches.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    playerSlot: integer('player_slot').notNull(),
    ready: boolean('ready').notNull().default(false),
    connectionStatus: pvpConnectionStatus('connection_status').notNull().default('CONNECTED'),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    reconnectDeadlineAt: timestamp('reconnect_deadline_at', { withTimezone: true }),
    totalPoints: numeric('total_points', { precision: 10, scale: 2 }),
    result: text('result'),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('pvp_players_match_student_uq')
      .on(table.matchId, table.studentId)
      .where(sql`${table.leftAt} is null`),
    uniqueIndex('pvp_players_match_slot_uq')
      .on(table.matchId, table.playerSlot)
      .where(sql`${table.leftAt} is null`),
    uniqueIndex('pvp_players_id_match_uq').on(table.id, table.matchId),
    check('pvp_players_slot_ck', sql`${table.playerSlot} in (1, 2)`),
    check(
      'pvp_players_reconnect_ck',
      sql`${table.reconnectDeadlineAt} is null or (${table.disconnectedAt} is not null and ${table.reconnectDeadlineAt} >= ${table.disconnectedAt})`,
    ),
  ],
).enableRLS();

// Durable uniqueness across create/join/accept, maintained by database triggers.
export const pvpActiveRooms = pgTable(
  'pvp_active_rooms',
  {
    studentId: uuid('student_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'restrict' }),
    matchId: uuid('match_id')
      .notNull()
      .references(() => pvpMatches.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => pvpPlayers.id, { onDelete: 'restrict' }),
  },
  (table) => [index('pvp_active_rooms_match_idx').on(table.matchId)],
).enableRLS();

export const pvpMatchQuestions = pgTable(
  'pvp_match_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => pvpMatches.id, { onDelete: 'restrict' }),
    packageId: uuid('package_id').notNull(),
    packageItemId: uuid('package_item_id')
      .notNull()
      .references(() => packageItems.id, { onDelete: 'restrict' }),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    status: text('status').notNull().default('PENDING'),
  },
  (table) => [
    uniqueIndex('pvp_match_questions_match_order_uq').on(table.matchId, table.displayOrder),
    uniqueIndex('pvp_match_questions_match_item_uq').on(table.matchId, table.packageItemId),
    uniqueIndex('pvp_match_questions_id_match_uq').on(table.id, table.matchId),
    foreignKey({
      name: 'pvp_match_questions_item_version_fk',
      columns: [table.packageItemId, table.questionVersionId],
      foreignColumns: [packageItems.id, packageItems.questionVersionId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'pvp_match_questions_match_package_fk',
      columns: [table.matchId, table.packageId],
      foreignColumns: [pvpMatches.id, pvpMatches.packageId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'pvp_match_questions_package_item_scope_fk',
      columns: [table.packageItemId, table.packageId],
      foreignColumns: [packageItems.id, packageItems.packageId],
    }).onDelete('restrict'),
    check('pvp_match_questions_order_ck', sql`${table.displayOrder} > 0`),
  ],
).enableRLS();

export const pvpAnswers = pgTable(
  'pvp_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => pvpPlayers.id, { onDelete: 'restrict' }),
    matchId: uuid('match_id').notNull(),
    matchQuestionId: uuid('match_question_id')
      .notNull()
      .references(() => pvpMatchQuestions.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id'),
    answer: jsonb('answer').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    basePoints: numeric('base_points', { precision: 10, scale: 2 }).notNull().default('0'),
    speedBonus: numeric('speed_bonus', { precision: 10, scale: 2 }).notNull().default('0'),
  },
  (table) => [
    uniqueIndex('pvp_answers_player_question_uq').on(table.playerId, table.matchQuestionId),
    uniqueIndex('pvp_answers_player_request_uq').on(table.playerId, table.requestId),
    foreignKey({
      name: 'pvp_answers_player_match_fk',
      columns: [table.playerId, table.matchId],
      foreignColumns: [pvpPlayers.id, pvpPlayers.matchId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'pvp_answers_question_match_fk',
      columns: [table.matchQuestionId, table.matchId],
      foreignColumns: [pvpMatchQuestions.id, pvpMatchQuestions.matchId],
    }).onDelete('restrict'),
    check('pvp_answers_points_ck', sql`${table.basePoints} >= 0 and ${table.speedBonus} >= 0`),
  ],
).enableRLS();

export const pvpBestRecords = pgTable(
  'pvp_best_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => leaderboardPeriods.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    difficulty: text('difficulty').notNull(),
    dataMode: text('data_mode').$type<'demo' | 'official' | 'legacy'>().notNull().default('legacy'),
    matchId: uuid('match_id')
      .notNull()
      .references(() => pvpMatches.id, { onDelete: 'restrict' }),
    bestPoints: numeric('best_points', { precision: 10, scale: 2 }).notNull(),
    achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('pvp_best_records_period_student_difficulty_uq').on(
      table.periodId,
      table.studentId,
      table.difficulty,
      table.dataMode,
    ),
    check('pvp_best_records_points_ck', sql`${table.bestPoints} >= 0`),
    check(
      'pvp_best_records_data_mode_ck',
      sql`${table.dataMode} in ('demo', 'official', 'legacy')`,
    ),
  ],
).enableRLS();

export const pvpLeaderboardEntries = pgTable(
  'pvp_leaderboard_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => leaderboardPeriods.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    difficulty: text('difficulty').notNull(),
    dataMode: text('data_mode').$type<'demo' | 'official' | 'legacy'>().notNull().default('legacy'),
    bestPoints: numeric('best_points', { precision: 10, scale: 2 }).notNull(),
    rank: integer('rank'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('pvp_leaderboard_entries_period_student_difficulty_uq').on(
      table.periodId,
      table.studentId,
      table.difficulty,
      table.dataMode,
    ),
    check('pvp_leaderboard_entries_points_ck', sql`${table.bestPoints} >= 0`),
    check(
      'pvp_leaderboard_entries_data_mode_ck',
      sql`${table.dataMode} in ('demo', 'official', 'legacy')`,
    ),
    check('pvp_leaderboard_entries_rank_ck', sql`${table.rank} is null or ${table.rank} > 0`),
  ],
).enableRLS();

export const pvpInvites = pgTable(
  'pvp_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => pvpMatches.id, { onDelete: 'restrict' }),
    classIdAtInvite: uuid('class_id_at_invite')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    senderStudentId: uuid('sender_student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id'),
    recipientStudentId: uuid('recipient_student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: pvpInviteStatus('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('pvp_invites_pending_recipient_uq')
      .on(table.matchId, table.recipientStudentId)
      .where(sql`${table.status} = 'PENDING'`),
    uniqueIndex('pvp_invites_sender_request_uq').on(table.senderStudentId, table.requestId),
    index('pvp_invites_recipient_status_idx').on(table.recipientStudentId, table.status),
    check(
      'pvp_invites_distinct_students_ck',
      sql`${table.senderStudentId} <> ${table.recipientStudentId}`,
    ),
    check(
      'pvp_invites_expiry_ck',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'pvp_invites_response_ck',
      sql`${table.respondedAt} is null or ${table.respondedAt} >= ${table.createdAt}`,
    ),
  ],
).enableRLS();
