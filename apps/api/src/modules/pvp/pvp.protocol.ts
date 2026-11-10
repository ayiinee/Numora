import { BadRequestException } from '@nestjs/common';
import { isISO8601, isUUID } from 'class-validator';

export type PvpCommand =
  | 'room:create'
  | 'room:join'
  | 'player:ready'
  | 'match:start'
  | 'answer:submit'
  | 'match:reconnect'
  | 'room:leave'
  | 'room:cancel'
  | 'invitation:send'
  | 'invitation:respond';
export interface CommandEnvelope {
  event: PvpCommand;
  eventVersion: '1';
  requestId: string;
  sentAt: string;
  payload: Record<string, unknown>;
}
const fields: Record<PvpCommand, string[]> = {
  'room:create': ['difficulty'],
  'room:join': ['roomCode'],
  'player:ready': ['matchId'],
  'match:start': ['matchId'],
  'answer:submit': ['matchId', 'questionId', 'optionId'],
  'match:reconnect': ['matchId'],
  'room:leave': ['matchId'],
  'room:cancel': ['matchId'],
  'invitation:send': ['matchId', 'recipientStudentId'],
  'invitation:respond': ['inviteId', 'accept'],
};
/** Runtime boundary mirrored by the machine-readable WebSocket contract. */
export function validateCommand(event: PvpCommand, value: unknown): CommandEnvelope {
  const invalid = () => {
    throw new BadRequestException({
      code: 'PVP_PAYLOAD_INVALID',
      detail: 'Payload PvP tidak valid.',
    });
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 5 ||
    v.event !== event ||
    v.eventVersion !== '1' ||
    typeof v.requestId !== 'string' ||
    !isUUID(v.requestId) ||
    typeof v.sentAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT/.test(v.sentAt) ||
    !isISO8601(v.sentAt, { strict: true, strictSeparator: true }) ||
    !Number.isFinite(Date.parse(v.sentAt)) ||
    !v.payload ||
    typeof v.payload !== 'object' ||
    Array.isArray(v.payload)
  )
    return invalid();
  const payload = v.payload as Record<string, unknown>;
  const keys = fields[event];
  if (Object.keys(payload).length !== keys.length || keys.some((key) => !(key in payload)))
    return invalid();
  for (const key of keys) {
    const val = payload[key];
    if (key.endsWith('Id') && key !== 'optionId' && (typeof val !== 'string' || !isUUID(val)))
      return invalid();
    if (
      key === 'difficulty' &&
      (typeof val !== 'string' || !['easy', 'medium', 'hard'].includes(val))
    )
      return invalid();
    if (key === 'roomCode' && (typeof val !== 'string' || !/^[A-Za-z0-9]{12}$/.test(val)))
      return invalid();
    if (
      key === 'optionId' &&
      val !== null &&
      (typeof val !== 'string' || val.length < 1 || val.length > 128)
    )
      return invalid();
    if (key === 'accept' && typeof val !== 'boolean') return invalid();
  }
  return v as unknown as CommandEnvelope;
}
