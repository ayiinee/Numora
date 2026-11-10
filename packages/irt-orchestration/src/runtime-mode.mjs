// Server-selected mode. Request payloads cannot select production authorization.
export function irtPurpose() {
  const mode = process.env.NUMORA_IRT_MODE ?? 'RESEARCH';
  if (!['RESEARCH', 'PRODUCTION'].includes(mode)) throw new Error('IRT_DELIVERY_MODE_INVALID');
  return mode === 'PRODUCTION' ? 'PRODUCTION' : 'RESEARCH_ONLY';
}
export function assertIrtEnabled(disabledCode = 'IRT_RESEARCH_DISABLED') {
  const purpose = irtPurpose();
  if (purpose === 'PRODUCTION') {
    if (
      process.env.NUMORA_IRT_PRODUCTION_ENABLED !== 'true' ||
      process.env.NUMORA_IRT_RESEARCH_ENABLED === 'true'
    )
      throw new Error('IRT_DELIVERY_PRODUCTION_DISABLED');
  } else if (process.env.NUMORA_IRT_RESEARCH_ENABLED !== 'true') throw new Error(disabledCode);
  return purpose;
}
export function assertRuntimeMode(runtime) {
  if (runtime?.purpose !== assertIrtEnabled()) throw new Error('IRT_DELIVERY_MODE_MISMATCH');
}
export async function assertIrtDatabase(sql) {
  const purpose = assertIrtEnabled();
  const [db] = await sql`SELECT current_database() AS name`;
  if (purpose === 'RESEARCH_ONLY' && !String(db?.name).startsWith('irt_research_test_'))
    throw new Error('IRT_DELIVERY_DISPOSABLE_ONLY');
  if (
    purpose === 'PRODUCTION' &&
    (!process.env.NUMORA_IRT_PRODUCTION_DATABASE ||
      db?.name !== process.env.NUMORA_IRT_PRODUCTION_DATABASE)
  )
    throw new Error('IRT_DELIVERY_DATABASE_MISMATCH');
}
