import { readFile, writeFile } from 'node:fs/promises';
const path = 'packages/contracts/websocket/pvp-events.schema.json';
const openapi = JSON.parse(await readFile('packages/contracts/openapi/openapi.json', 'utf8'));
const object = (properties) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const uuid = { type: 'string', format: 'uuid' };
const commandPayloads = {
  'room:create': object({ difficulty: { enum: ['easy', 'medium', 'hard'] } }),
  'room:join': object({ roomCode: { type: 'string', pattern: '^[A-Za-z0-9]{12}$' } }),
  'player:ready': object({ matchId: uuid }),
  'match:start': object({ matchId: uuid }),
  'answer:submit': object({
    matchId: uuid,
    questionId: uuid,
    optionId: { type: ['string', 'null'], minLength: 1, maxLength: 128 },
  }),
  'match:reconnect': object({ matchId: uuid }),
  'room:leave': object({ matchId: uuid }),
  'room:cancel': object({ matchId: uuid }),
  'invitation:send': object({ matchId: uuid, recipientStudentId: uuid }),
  'invitation:respond': object({ inviteId: uuid, accept: { type: 'boolean' } }),
};
function convert(value) {
  if (Array.isArray(value)) return value.map(convert);
  if (!value || typeof value !== 'object') return value;
  const { nullable, ...rest } = value;
  delete rest.example;
  const result = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, convert(v)]));
  if (result.$ref) result.$ref = result.$ref.replace('#/components/schemas/', '#/$defs/');
  if (result.type === 'object') result.additionalProperties = false;
  return nullable ? { anyOf: [result, { type: 'null' }] } : result;
}
const $defs = {};
for (const name of [
  'PvpSnapshotDto',
  'PvpPlayerDto',
  'StudentPeerDto',
  'PvpQuestionDto',
  'OptionDto',
])
  $defs[name] = convert(openapi.components.schemas[name]);
$defs.Problem = object({
  status: { type: 'integer' },
  code: { type: 'string' },
  detail: { type: 'string' },
});
$defs.Acknowledgement = {
  oneOf: [
    object({
      ok: { const: true },
      state: { anyOf: [{ $ref: '#/$defs/PvpSnapshotDto' }, { type: 'null' }] },
      response: { anyOf: [object({ inviteId: uuid }), { type: 'null' }] },
    }),
    object({ ok: { const: false }, error: { $ref: '#/$defs/Problem' } }),
  ],
};
const state = { $ref: '#/$defs/PvpSnapshotDto' };
const serverPayloads = Object.fromEntries(
  [
    'room:state',
    'match:started',
    'question:started',
    'match:completed',
    'match:forfeited',
    'match:cancelled',
  ].map((e) => [e, state]),
);
Object.assign(serverPayloads, {
  'question:resolved': object({ matchId: uuid, questionId: uuid }),
  'player:disconnected': object({ matchId: uuid, studentId: uuid }),
  'invitation:received': object({ inviteId: uuid }),
  'command:acknowledged': { $ref: '#/$defs/Acknowledgement' },
  'answer:acknowledged': { $ref: '#/$defs/Acknowledgement' },
  'room:error': { $ref: '#/$defs/Problem' },
});
const branches = [...Object.entries(commandPayloads), ...Object.entries(serverPayloads)].map(
  ([event, payload]) =>
    object({
      event: { const: event },
      eventVersion: { const: '1' },
      requestId: event in commandPayloads ? uuid : { anyOf: [uuid, { type: 'null' }] },
      sentAt: { type: 'string', format: 'date-time' },
      payload,
    }),
);
const result =
  JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://numora.local/contracts/pvp-events.schema.json',
      title: 'PvP WebSocket envelopes (/pvp namespace)',
      $defs,
      oneOf: branches,
    },
    null,
    2,
  ) + '\n';
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')).replaceAll('\r\n', '\n') !== result)
    throw new Error('PvP contract is stale. Run pnpm contracts:pvp.');
} else await writeFile(path, result);
